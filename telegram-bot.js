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

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*`\[\]]/g, '\\$&');
}

// --- LÓGICA DE BOTÕES (CALLBACK) ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    // TRANSFERÊNCIA DE UNIDADE FINAL
    if (callbackData.startsWith('uni_')) {
        const partes = callbackData.split('_');
        const unidadeAlvo = partes[1]; 
        const nickRaw = partes.slice(2).join('_');
        
        try {
            const { data: players } = await supabase.from('players').select('*').ilike('riot_id', `${nickRaw}%`).limit(1);
            if (!players || players.length === 0) return bot.answerCallbackQuery(query.id, { text: "Agente não encontrado." });

            const player = players[0];
            const safeNick = escapeMarkdown(player.riot_id);

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
});

// --- COMANDO /START ---
bot.onText(/^\/start/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = `🟢 *TERMINAL PROTOCOLO V ONLINE* 🟢\n\nBem-vindo ao sistema de comando tático.\n\n*Comandos Disponíveis:*\n/unidade - Solicitar transferência de esquadrão\n/ranking - Ver o Top 10 de Sinergia\n/perfil [Nome] - Buscar o dossiê de um agente`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
});

// --- COMANDO /UNIDADE ---
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
            bot.sendMessage(chatId, `🔄 *[SISTEMA]* Transferência de *${escapeMarkdown(player.riot_id)}* para *${unidade}* concluída.${aviso}`, { parse_mode: 'Markdown' });
        } catch (error) { 
            bot.sendMessage(chatId, "🔥 *Killjoy:* Falha na sincronização.", { parse_mode: 'Markdown' }); 
        }
    }
});

// --- COMANDO /RANKING ---
bot.onText(/^\/ranking/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const { data, error } = await supabase.from('players').select('riot_id, synergy_score, unit').order('synergy_score', { ascending: false }).limit(10);
        if (error) throw error;
        
        let rankMsg = `🏆 *TOP 10 SINERGIA - PROTOCOLO V* 🏆\n\n`;
        data.forEach((p, i) => {
            rankMsg += `${i + 1}. *${escapeMarkdown(p.riot_id.split('#')[0])}* - ${p.synergy_score} pts (${p.unit})\n`;
        });
        bot.sendMessage(chatId, rankMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Erro ao acessar o banco de dados.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /PERFIL ---
bot.onText(/^\/perfil(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argumento = match[1] ? match[1].trim() : null;

    if (!argumento) return bot.sendMessage(chatId, "⚠️ Precisas de informar o nome do agente. Ex: `/perfil Ousadia`", { parse_mode: 'Markdown' });

    try {
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `%${argumento}%`).limit(1);
        if (!data || data.length === 0) return bot.sendMessage(chatId, "⚠️ Agente não encontrado nos registos do Protocolo.", { parse_mode: 'Markdown' });
        
        const p = data[0];
        const msgPerfil = `👤 *DOSSIÊ DO AGENTE*\n\n*Riot ID:* ${escapeMarkdown(p.riot_id)}\n*Unidade:* ${p.unit}\n*Função:* ${p.role_raw}\n*Rank:* ${p.current_rank}\n*Sinergia:* ${p.synergy_score} pts\n*Treino (DM):* ${p.dm_score_total || p.dm_score} pts\n*Lobo Solitário:* ${p.lone_wolf ? 'Sim 🐺' : 'Não'}`;
        
        bot.sendMessage(chatId, msgPerfil, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Erro ao extrair o dossiê.", { parse_mode: 'Markdown' });
    }
});

// --- SERVIDOR EXPRESS (Mantém o bot online em alojamentos na nuvem) ---
const app = express();
app.get('/', (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Terminal Ativo na Nuvem.'));
