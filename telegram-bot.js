require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- CONFIGURAÇÃO ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!token || !supabaseUrl || !supabaseKey) {
    console.error('🔥 ERRO: Variáveis de ambiente faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new TelegramBot(token, { polling: true });

const rankEmojis = {
    'Radiante': '✨', 'Imortal': '👺', 'Ascendente': '🟢', 'Diamante': '💎',
    'Platina': '💠', 'Ouro': '🥇', 'Prata': '🥈', 'Bronze': '🥉', 'Ferro': '🧱'
};

function getRankEmoji(rank = '') {
    for (const [key, emoji] of Object.entries(rankEmojis)) {
        if (rank.includes(key)) return emoji;
    }
    return '👤';
}

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*`\[\]]/g, '\\$&');
}

// --- LÓGICA DE BOTÕES (CALLBACK) ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    // --- TRANSFERÊNCIA DE UNIDADE FINAL (PASSO 2) ---
    if (callbackData.startsWith('uni_')) {
        const partes = callbackData.split('_');
        const unidadeAlvo = partes[1]; // ALPHA, OMEGA, WINGMAN
        const nickRaw = partes.slice(2).join('_');
        
        try {
            const { data: players } = await supabase.from('players').select('*').ilike('riot_id', `${nickRaw}%`).limit(1);
            if (!players || players.length === 0) return bot.answerCallbackQuery(query.id, { text: "Agente não encontrado." });

            const player = players[0];
            const safeNick = escapeMarkdown(player.riot_id);

            // NOVO: Validação de Vaga Tática (Exceto para Wingman que é ilimitada)
            let avisoReserva = "";
            if (unidadeAlvo !== 'WINGMAN') {
                const { data: ocupante } = await supabase
                    .from('players')
                    .select('riot_id, synergy_score')
                    .eq('unit', unidadeAlvo)
                    .eq('role_raw', player.role_raw)
                    .neq('riot_id', player.riot_id)
                    .order('synergy_score', { ascending: false })
                    .limit(1);

                if (ocupante && ocupante.length > 0 && ocupante[0].synergy_score > player.synergy_score) {
                    avisoReserva = `\n\n⚠️ *NOTA:* A vaga de *${player.role_raw}* na ${unidadeAlvo} já está ocupada por um veterano. Ficarás como *Reserva* até subires a tua Sinergia.`;
                }
            }

            await supabase.from('players').update({ unit: unidadeAlvo }).eq('riot_id', player.riot_id);
            
            let msgLore = '';
            if (unidadeAlvo === 'ALPHA') msgLore = `🐍 *Viper:* "Interessante... Transferência autorizada. Bem-vindo à Unidade Alpha, ${safeNick}. Seja letal."`;
            else if (unidadeAlvo === 'OMEGA') msgLore = `🔥 *Brimstone:* "Excelente escolha. A Unidade Ômega conta com a sua força, ${safeNick}."`;
            else msgLore = `🦎 *Gekko:* "Aí sim, ${safeNick}! Wingman tá felizão. Fica na reserva tática com a gente."`;

            bot.sendMessage(chatId, `🔄 *[PROTOCOLO DE TRANSFERÊNCIA]*\n\n${msgLore}${avisoReserva}`, { parse_mode: 'Markdown' });
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        } catch (err) {
            console.error(err);
        }
        bot.answerCallbackQuery(query.id);
    }

    // [Outros callbacks como perfil_ e select_uni_ permanecem iguais ao original...]
});

// --- COMANDO DE TRANSFERÊNCIA DE UNIDADE ---
bot.onText(/^\/unidade(?:\s+(\w+))?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const unidade = match[1] ? match[1].toUpperCase() : null;
    const argumento = match[2] ? match[2].trim() : null;
    const validas = ['ALPHA', 'OMEGA', 'WINGMAN'];

    if (!unidade) {
        return bot.sendMessage(chatId, `💻 *Killjoy:* "Para qual divisão desejas solicitar transferência?"`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🐍 Transferir para ALPHA", callback_data: "select_uni_ALPHA" }],
                    [{ text: "🔥 Transferir para ÔMEGA", callback_data: "select_uni_OMEGA" }],
                    [{ text: "🦎 Voltar para WINGMAN", callback_data: "select_uni_WINGMAN" }]
                ]
            }
        });
    }
    
    if (!validas.includes(unidade)) return bot.sendMessage(chatId, "❌ *Brimstone:* Código de Unidade inválido.", { parse_mode: 'Markdown' });

    if (argumento) {
        try {
            const { data } = await supabase.from('players').select('*').ilike('riot_id', `%${argumento}%`).limit(1);
            if (!data || data.length === 0) return bot.sendMessage(chatId, "⚠️ *Brimstone:* Não encontrei esse ID.", { parse_mode: 'Markdown' });
            
            const player = data[0];
            
            // Validação de vaga também no comando direto por texto
            let aviso = "";
            if (unidade !== 'WINGMAN') {
                const { data: ocupante } = await supabase.from('players')
                    .select('synergy_score').eq('unit', unidade).eq('role_raw', player.role_raw).neq('riot_id', player.riot_id)
                    .order('synergy_score', { ascending: false }).limit(1);
                
                if (ocupante && ocupante.length > 0 && ocupante[0].synergy_score > player.synergy_score) {
                    aviso = `\n\n⚠️ *NOTA:* Vaga ocupada. Entrarás como *Reserva*.`;
                }
            }

            await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);
            bot.sendMessage(chatId, `🔄 *[SISTEMA]* Transferência de *${player.riot_id}* para *${unidade}* concluída.${aviso}`, { parse_mode: 'Markdown' });
        } catch (error) { 
            bot.sendMessage(chatId, "🔥 *Killjoy:* Falha na sincronização.", { parse_mode: 'Markdown' }); 
        }
    }
});

// [Resto dos comandos /start, /ranking, /perfil permanecem iguais...]

const app = express();
app.get('/', (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Terminal Ativo na Nuvem.'));
