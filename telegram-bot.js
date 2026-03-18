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
bot.onText(/^\/start(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = `🟢 *TERMINAL PROTOCOLO V ONLINE* 🟢\n\nBem-vindo ao sistema de comando tático.\n\n*Comandos Disponíveis:*\n/ajuda - Mostrar todos os comandos\n/site - Acessar o terminal web\n/unidade - Solicitar transferência de esquadrão\n/ranking - Ver o Top 10 de Sinergia\n/perfil [Nome] - Buscar o dossiê de um agente`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
});

// --- COMANDO /VINCULAR (NOVO) ---
bot.onText(/^\/vincular(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const riotId = match[1] ? match[1].trim() : null;

    if (!riotId) {
        return bot.sendMessage(chatId, "⚠️ *Killjoy:* Informa o teu Riot ID para vincular o rádio. Ex: `/vincular OUSADIA#013`", { parse_mode: 'Markdown' });
    }

    try {
        // Verifica se o agente existe
        const { data: players } = await supabase.from('players').select('*').ilike('riot_id', `%${riotId}%`).limit(1);
        
        if (!players || players.length === 0) {
            return bot.sendMessage(chatId, "⚠️ *Brimstone:* ID não encontrado. Já fizeste o alistamento no site?", { parse_mode: 'Markdown' });
        }

        const player = players[0];

        // Verifica se a conta já está vinculada a outro Telegram
        if (player.telegram_id && player.telegram_id !== telegramId) {
            return bot.sendMessage(chatId, "❌ *Cypher:* Este Riot ID já está sob o controlo de outro dispositivo de rádio.", { parse_mode: 'Markdown' });
        }

        // Atualiza a base com o telegram_id
        await supabase.from('players').update({ telegram_id: telegramId }).eq('riot_id', player.riot_id);
        bot.sendMessage(chatId, `✅ *RÁDIO VINCULADO:* Identidade confirmada como *${escapeMarkdown(player.riot_id)}*. A partir de agora, os teus comandos de transferência usarão esta identidade automaticamente.`, { parse_mode: 'Markdown' });

    } catch (err) {
        bot.sendMessage(chatId, "🔥 *Falha nos servidores do Protocolo.* Tenta novamente.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /UNIDADE (ATUALIZADO E BLINDADO) ---
bot.onText(/^\/unidade(?:@[\w_]+)?(?:\s+(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const unidade = match[1] ? match[1].toUpperCase() : null;
    const validas = ['ALPHA', 'OMEGA', 'WINGMAN'];

    // 1. Identificar quem está a dar a ordem pelo ID do Telegram
    const { data: userRecord } = await supabase.from('players').select('*').eq('telegram_id', telegramId).limit(1);

    if (!userRecord || userRecord.length === 0) {
        return bot.sendMessage(chatId, "🔒 *Acesso Negado:* O teu rádio não está vinculado a nenhum agente. Usa o comando `/vincular TeuNick#TAG` primeiro.", { parse_mode: 'Markdown' });
    }

    const player = userRecord[0];

    if (!unidade) {
        return bot.sendMessage(chatId, `💻 *Killjoy:* "Agente ${escapeMarkdown(player.riot_id.split('#')[0])}, para qual divisão desejas transferência?"`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🐍 Transferir para ALPHA", callback_data: `uni_ALPHA_${player.riot_id}` }],
                    [{ text: "🔥 Transferir para ÔMEGA", callback_data: `uni_OMEGA_${player.riot_id}` }],
                    [{ text: "🦎 Voltar para WINGMAN", callback_data: `uni_WINGMAN_${player.riot_id}` }]
                ]
            }
        });
    }
    
    if (!validas.includes(unidade)) return bot.sendMessage(chatId, "❌ *Brimstone:* Código de Unidade inválido.", { parse_mode: 'Markdown' });

    // 2. Executar a transferência para o agente verificado
    try {
        let aviso = "";
        if (unidade !== 'WINGMAN') {
            const { data: ocupante } = await supabase.from('players')
                .select('synergy_score').eq('unit', unidade).eq('role_raw', player.role_raw).neq('riot_id', player.riot_id)
                .order('synergy_score', { ascending: false }).limit(1);
            
            if (ocupante && ocupante.length > 0 && ocupante[0].synergy_score > player.synergy_score) {
                aviso = `\n\n⚠️ *NOTA:* A vaga na unidade já está ocupada. Ficarás como *Reserva*.`;
            }
        }

        await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);
        bot.sendMessage(chatId, `🔄 *[SISTEMA]* Transferência do agente *${escapeMarkdown(player.riot_id)}* para *${unidade}* concluída.${aviso}`, { parse_mode: 'Markdown' });
    } catch (error) { 
        bot.sendMessage(chatId, "🔥 *Killjoy:* Falha na sincronização.", { parse_mode: 'Markdown' }); 
    }
});

// --- COMANDO /RANKING ---
bot.onText(/^\/ranking(?:@[\w_]+)?(?:\s+|$)/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const { data, error } = await supabase.from('players').select('riot_id, synergy_score, unit').order('synergy_score', { ascending: false }).limit(10);
        if (error) throw error;
        
        let rankMsg = `🏆 *TOP 10 SINERGIA - PROTOCOLO V* 🏆\n\n`;
        data.forEach((p, i) => {
            rankMsg += `${i + 1}. *${escapeMarkdown(p.riot_id.split('#')[0])}* - ${p.synergy_score || 0} pts (${p.unit || 'Sem Unidade'})\n`;
        });
        bot.sendMessage(chatId, rankMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Erro ao acessar o banco de dados.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /PERFIL ---
bot.onText(/^\/perfil(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argumento = match[1] ? match[1].trim() : null;

    if (!argumento) return bot.sendMessage(chatId, "⚠️ Precisas de informar o nome do agente. Ex: `/perfil Ousadia`", { parse_mode: 'Markdown' });

    try {
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `%${argumento}%`).limit(1);
        if (!data || data.length === 0) return bot.sendMessage(chatId, "⚠️ Agente não encontrado nos registos do Protocolo.", { parse_mode: 'Markdown' });
        
        const p = data[0];
        const msgPerfil = `👤 *DOSSIÊ DO AGENTE*\n\n*Riot ID:* ${escapeMarkdown(p.riot_id)}\n*Unidade:* ${p.unit || 'Sem Unidade'}\n*Função:* ${p.role_raw || 'Não Definida'}\n*Rank:* ${p.current_rank || 'Sem Rank'}\n*Sinergia:* ${p.synergy_score || 0} pts\n*Treino (DM):* ${p.dm_score_total || p.dm_score || 0} pts\n*Lobo Solitário:* ${p.lone_wolf ? 'Sim 🐺' : 'Não'}`;
        
        bot.sendMessage(chatId, msgPerfil, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Erro ao extrair o dossiê.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /CONVOCAR (Sinalizador Orbital) ---
bot.onText(/^\/convocar(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    
    // Extrai a primeira sequência contendo APENAS letras e números (ignora o resto)
    const rawMatch = match[1] ? match[1].trim() : null;
    const matchAlfanumerico = rawMatch ? rawMatch.match(/[a-zA-Z0-9]+/) : null;
    const codigoLobby = matchAlfanumerico ? matchAlfanumerico[0] : "Solicite invite no Telegram";

    try {
        // Verifica se o usuário está vinculado
        const { data: user } = await supabase.from('players').select('riot_id').eq('telegram_id', telegramId).limit(1);

        if (!user || user.length === 0) {
            return bot.sendMessage(chatId, "❌ *Acesso Negado:* Vincula o teu rádio primeiro com `/vincular`.", { parse_mode: 'Markdown' });
        }

        const now = Date.now();
        const commanderName = user[0].riot_id.split('#')[0];

        // Verifica se JÁ EXISTE QUALQUER sinalizador ativo (global)
        const { data: activeCalls } = await supabase.from('active_calls')
            .select('*')
            .gt('expires_at', now)
            .order('expires_at', { ascending: false })
            .limit(1);
            
        if (activeCalls && activeCalls.length > 0) {
            const call = activeCalls[0];
            const relMins = Math.ceil((call.expires_at - now) / 60000);
            
            if (call.commander === commanderName) {
                return bot.sendMessage(chatId, `⚠️ *SINALIZADOR JÁ ATIVO:* Já tens um reforço convocado para o código *${call.party_code}*. O aviso permanecerá no ar por mais *${relMins} minutos*.`, { parse_mode: 'Markdown' });
            } else {
                return bot.sendMessage(chatId, `⚠️ *RADAR OCUPADO:* O agente *${call.commander}* já convocou reforços (Código: *${call.party_code}*). O sinalizador dele estará ativo por mais *${relMins} minutos*. Junta-te a ele ou aguarda expirarem os reforços.`, { parse_mode: 'Markdown' });
            }
        }

        const expiresAt = now + (30 * 60 * 1000); // Expira em 30 minutos

        // Insere o chamado na tabela active_calls (lida pelo script.js do site)
        await supabase.from('active_calls').insert([{
            commander: commanderName,
            party_code: codigoLobby,
            expires_at: expiresAt
        }]);

        bot.sendMessage(chatId, `🚨 *SINALIZADOR ATIVADO:* Reforços convocados para o lobby *${codigoLobby}*. O alerta aparecerá no site por 30 minutos.`, { parse_mode: 'Markdown' });

    } catch (err) {
        bot.sendMessage(chatId, "🔥 *Falha ao acionar sinalizador.*", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /AJUDA ---
bot.onText(/^\/ajuda(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = `📖 *MANUAL DE COMANDOS TÁTICOS*\n\n` +
        `🔹 */start* - Iniciar terminal\n` +
        `🔹 */ajuda* - Mostrar este manual\n` +
        `🔹 */site* - Acessar o terminal web\n` +
        `🔹 */vincular [Nick#TAG]* - Associar sua conta ao seu Telegram\n` +
        `🔹 */unidade* - Solicitar transferência de esquadrão\n` +
        `🔹 */ranking* - Visualizar o Top 10 de Sinergia\n` +
        `🔹 */perfil [Nick]* - Ver estatísticas detalhadas de um agente\n` +
        `🔹 */convocar [Código]* - Enviar sinalizador de lobby para o site`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
});

// --- COMANDO /SITE ---
bot.onText(/^\/site(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = `🌐 *ACESSO AO TERMINAL WEB*\n\nAcede à base de dados completa do Protocolo V aqui:\n[https://protocolov.com](https://protocolov.com)`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// --- SERVIDOR EXPRESS (Camuflado) ---
const app = express();
// Removemos a rota raiz "/" e criamos um endpoint que apenas o serviço de Uptime (ex: UptimeRobot) conhece
const HEALTH_SECRET = process.env.HEALTH_SECRET || 'protocolo-v-ping-123';

app.get(`/${HEALTH_SECRET}`, (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));

// Se alguém bater na raiz, não devolvemos nada (corta scanners)
app.get('/', (req, res) => res.status(404).end());

app.listen(process.env.PORT || 3000, () => console.log('🌐 Terminal Ativo e Camuflado na Nuvem.'));
