require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
// --- CONFIGURAÇÃO ---
const { supabase, oraculo: oraculoExt } = require('./db');
const henrikApiKey = process.env.HENRIK_API_KEY ? process.env.HENRIK_API_KEY.trim() : null;
const token = process.env.TELEGRAM_BOT_TOKEN;
const rawAdminId = process.env.ADMIN_TELEGRAM_ID ? process.env.ADMIN_TELEGRAM_ID.trim() : null;
const ADMIN_ID = rawAdminId ? parseInt(rawAdminId, 10) : null; 

let bot;
if (process.env.WEBHOOK_URL) {
    bot = new TelegramBot(token);
    bot.setWebHook(`${process.env.WEBHOOK_URL}/bot${token}`);
} else {
    // Iniciar sem polling imediato, limpar rastro de webhook e depois ativar polling
    bot = new TelegramBot(token, { polling: false });
    bot.deleteWebHook().then(() => {
        bot.startPolling();
        console.log("🌐 Terminal Avançado: POLLING ATIVO e rádio limpo.");
    });
}

// Configuração do Menu de Comandos (PT-BR — Linguagem acessível)
bot.setMyCommands([
    { command: 'start', description: 'Começar — Seu primeiro passo no Protocolo V' },
    { command: 'vincular', description: 'Conectar Conta — Ligar seu nick do Valorant' },
    { command: 'convocar', description: 'Chamar Time — Avisar que quer jogar agora' },
    { command: 'unidade', description: 'Trocar Time — Mudar de esquadrão' },
    { command: 'perfil', description: 'Ver Perfil — Suas stats e evolução' },
    { command: 'ranking', description: 'Ranking — Quem joga mais com o time' },
    { command: 'analisar', description: 'Analisar Partida — Análise tática detalhada' },
    { command: 'como_funciona', description: 'Como Funciona — Métricas, regras e tiers' },
    { command: 'site', description: 'Abrir Site — Ir para protocolov.com' },
    { command: 'ajuda', description: 'Ajuda — Lista de comandos' }
]);

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*`\[\]]/g, '\\$&');
}

// --- UI DESIGN SYSTEM (K.A.I.O. & ORÁCULO) ---
const UI = {
    kaio: (title) => `🤖 *[K.A.I.O. // ${title.toUpperCase()}]*`,
    oraculo: (title) => `🧠 *[ORÁCULO-V // ${title.toUpperCase()}]*`,
    alert: (title) => `🚨 *[ALERTA // ${title.toUpperCase()}]*`,
    info: (text) => `> 📡 _${text}_`,
    divider: "━━━━━━━━━━━━━━",
    footer: () => `\n${UI.divider}\n_Protocolo V // HUB DE INTELIGÊNCIA_`
};

// --- LÓGICA DE BOTÕES (CALLBACK) ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    // INTERAÇÃO: SINALIZADOR LFG
    if (callbackData.startsWith('lfg_join_')) {
        const { data: userRef } = await supabase.from('players').select('riot_id').eq('telegram_id', query.from.id).limit(1);
        if (!userRef || userRef.length === 0) return bot.answerCallbackQuery(query.id, { text: "Rádio não vinculado. Use /vincular", show_alert: true });
        
        const joinerName = userRef[0].riot_id.split('#')[0];
        const rawText = query.message.text;
        
        if (rawText.includes(`- ${joinerName}`)) {
            return bot.answerCallbackQuery(query.id, { text: "Você já está nesse grupo." });
        }
        
        const lines = rawText.split('\n');
        const listAgents = lines.filter(l => l.trim().startsWith('- '));
        if (listAgents.length >= 5) {
            return bot.answerCallbackQuery(query.id, { text: "O grupo já está cheio (5/5).", show_alert: true });
        }

        listAgents.push(`- ${joinerName}`);
        
        let newMd = UI.alert("LFG ATIVO") + `\n\n` +
                    UI.info("Reforços solicitados:") + `\n` +
                    `Agentes no grupo: ${listAgents.length}/5\n` +
                    listAgents.map(a => escapeMarkdown(a)).join('\n');
        
        if (listAgents.length >= 5) {
            bot.editMessageText(newMd + `\n\n✅ *[GRUPO FECHADO]*\nIniciando partida.`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        } else {
            bot.editMessageText(newMd, { 
                chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
                reply_markup: query.message.reply_markup
            });
        }
        return bot.answerCallbackQuery(query.id, { text: "Confirmação enviada!" });
    }

    // TRANSFERÊNCIA DE UNIDADE FINAL
    if (callbackData.startsWith('uni_')) {
        if (callbackData === 'uni_cancel') {
            bot.editMessageText("🤖 *[K.A.I.O.]*: Operação de transferência abortada pelo agente.", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            return bot.answerCallbackQuery(query.id);
        }
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
                    avisoReserva = `\n\n⚠️ *NOTA:* A vaga na unidade ${unidadeAlvo} já está ocupada por um agente com maior sinergia. Você ficará como *Reserva*.`;
                }
            }

            await supabase.from('players').update({ unit: unidadeAlvo }).eq('riot_id', player.riot_id);
            
            let msgLore = '';
            if (unidadeAlvo === 'ALPHA') {
                msgLore = UI.kaio("TRANSFERÊNCIA") + `\n\nDesignado para o esquadrão *ALPHA*. Siga as ordens.`;
            } else if (unidadeAlvo === 'OMEGA') {
                msgLore = UI.kaio("TRANSFERÊNCIA") + `\n\nDesignado para o esquadrão *ÔMEGA*. Prepare-se.`;
            } else {
                msgLore = UI.kaio("TRANSFERÊNCIA") + `\n\nVocê agora é *RESERVA* (Wingman). Aguarde convocação.`;
            }

            bot.sendMessage(chatId, msgLore + avisoReserva + UI.footer(), { parse_mode: 'Markdown' });
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        } catch (err) {
            console.error("Erro ao processar transferência de unidade:", err);
            bot.answerCallbackQuery(query.id, { text: "Erro ao processar sua solicitação de unidade.", show_alert: true });
        }
        return;
    }

    // INTERAÇÃO: /CONVOCAR (CVX)
    if (callbackData.startsWith('cvc_')) {
        if (callbackData === 'cvc_cancel') {
            bot.editMessageText("🤖 *[K.A.I.O.]*: Protocolo de convocação cancelado. Retornando ao modo de espera.", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            return bot.answerCallbackQuery(query.id);
        }
        const partes = callbackData.split('_');
        const action = partes[1];
        const commanderName = partes[2];
        
        if (action === 'no') {
            exec_convocar(chatId, commanderName, null);
            bot.editMessageText("🤖 *[K.A.I.O.]*: Iniciando convocação sem código.", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        } else if (action === 'yes') {
            bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Digite apenas o código do grupo agora:", {
                reply_markup: { force_reply: true }
            }).then(sent => {
                bot.onReplyToMessage(chatId, sent.message_id, (msg) => {
                    exec_convocar(chatId, commanderName, msg.text);
                });
            });
            bot.editMessageText("🤖 *[K.A.I.O.]*: Aguardando código...", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        }
        bot.answerCallbackQuery(query.id);
        return;
    }
});

// --- COMANDO /START ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const firstName = msg.from.first_name || 'Agente';

    // Verifica se já está vinculado para personalizar a mensagem
    const { data: existingUser } = await supabase.from('players').select('riot_id').eq('telegram_id', telegramId).limit(1);
    const isLinked = existingUser && existingUser.length > 0;

    if (isLinked) {
        // Jogador que já se cadastrou — mensagem direta
        const nick = existingUser[0].riot_id.split('#')[0];
        const returnMsg = UI.kaio("BEM-VINDO DE VOLTA") + `\n\n` +
            `E aí, *${escapeMarkdown(nick)}*! Tudo pronto por aqui.\n\n` +
            `O que quer fazer?\n\n` +
            `🎮 \`/convocar\` — Chamar o time pra jogar\n` +
            `📊 \`/perfil ${escapeMarkdown(nick)}\` — Ver suas stats\n` +
            `🏆 \`/ranking\` — Ver o ranking do time\n` +
            `🔍 \`/analisar\` — Analisar uma partida\n\n` +
            UI.info("Use /ajuda pra ver todos os comandos.") +
            UI.footer();
        return bot.sendMessage(chatId, returnMsg, { parse_mode: 'Markdown' });
    }

    // Primeiro acesso — jornada de boas-vindas
    const welcomeMsg = UI.kaio("BEM-VINDO AO PROTOCOLO V") + `\n\n` +
        `Fala, *${escapeMarkdown(firstName)}*! Eu sou o *K.A.I.O.*, o assistente do Protocolo V.\n\n` +
        `Aqui a gente organiza times de Valorant, acompanha a evolução de cada jogador e analisa partidas com inteligência tática.\n\n` +
        `*Como começar:*\n\n` +
        `*1.* Se ainda não se cadastrou, acesse o site primeiro:\n` +
        `   🔗 [protocolov.com](https://protocolov.com)\n\n` +
        `*2.* Depois de se cadastrar, conecte sua conta aqui:\n` +
        `   \`/vincular SeuNick#Tag\`\n\n` +
        `*3.* Pronto! Você já pode ver seu perfil, chamar o time e acompanhar sua evolução.\n\n` +
        `Se quiser entender como funciona o sistema de pontos e análise, use:\n` +
        `   \`/como_funciona\`\n\n` +
        UI.info("Qualquer dúvida, /ajuda mostra todos os comandos.") +
        UI.footer();
    bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// --- COMANDO /VINCULAR ---
bot.onText(/^\/vincular(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const riotId = match[1] ? match[1].trim() : null;

    if (!riotId) {
        return bot.sendMessage(chatId,
            UI.kaio("CONECTAR CONTA") + "\n\n" +
            `Para conectar seu Valorant aqui no Telegram, me diz seu nick completo com a tag.\n\n` +
            `Exemplo: \`/vincular SeuNick#BR1\`\n\n` +
            UI.info("O nick precisa ser o mesmo que você usou no cadastro do site."),
            { parse_mode: 'Markdown' });
    }

    try {
        const { data: players } = await supabase.from('players').select('*').ilike('riot_id', `%${riotId}%`).limit(1);

        if (!players || players.length === 0) {
            return bot.sendMessage(chatId,
                `❌ *Conta não encontrada.*\n\n` +
                `Não achei "${escapeMarkdown(riotId)}" no sistema. Verifica se:\n\n` +
                `• Você já se cadastrou no site ([protocolov.com](https://protocolov.com))\n` +
                `• O nick está escrito certinho, com a tag (ex: Nick#BR1)\n\n` +
                `Se acabou de se cadastrar, aguarda uns minutinhos pro sistema sincronizar.`,
                { parse_mode: 'Markdown', disable_web_page_preview: true });
        }

        const player = players[0];
        if (player.telegram_id && player.telegram_id !== telegramId) {
            return bot.sendMessage(chatId, `⚠️ Esse nick já está conectado a outro Telegram. Se acha que é um erro, fala com o admin do grupo.`, { parse_mode: 'Markdown' });
        }

        await supabase.from('players').update({ telegram_id: telegramId }).eq('riot_id', player.riot_id);

        const nick = player.riot_id.split('#')[0];
        bot.sendMessage(chatId,
            UI.kaio("CONTA CONECTADA") + `\n\n` +
            `Pronto, *${escapeMarkdown(nick)}*! Sua conta do Valorant está conectada ao Telegram.\n\n` +
            `A partir de agora eu vou te avisar quando:\n` +
            `• Alguém chamar o time pra jogar\n` +
            `• Sua análise de partida ficar pronta\n` +
            `• Seu desempenho mudar de tier\n\n` +
            `Quer ver como anda seu perfil? Tenta:\n` +
            `\`/perfil ${escapeMarkdown(nick)}\`` +
            UI.footer(), { parse_mode: 'Markdown' });

    } catch (err) {
        bot.sendMessage(chatId, "❌ Algo deu errado na conexão. Tenta de novo em alguns segundos.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /UNIDADE ---
bot.onText(/^\/unidade(?:@[\w_]+)?(?:\s+(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const unidade = match[1] ? match[1].toUpperCase() : null;
    const validas = ['ALPHA', 'OMEGA', 'WINGMAN'];

    const { data: userRecord } = await supabase.from('players').select('*').eq('telegram_id', telegramId).limit(1);

    if (!userRecord || userRecord.length === 0) {
        return bot.sendMessage(chatId, `Você precisa conectar sua conta primeiro.\n\nUsa: \`/vincular SeuNick#Tag\``, { parse_mode: 'Markdown' });
    }

    const player = userRecord[0];
    const nick = escapeMarkdown(player.riot_id.split('#')[0]);

    if (!unidade) {
        return bot.sendMessage(chatId,
            UI.kaio("TROCAR TIME") + `\n\n` +
            `*${nick}*, escolhe pra qual time quer ir:\n\n` +
            `🔴 *Alpha* — Time principal de elite\n` +
            `🔵 *Omega* — Time de desenvolvimento\n` +
            `🛠️ *Wingman* — Reserva / treino\n\n` +
            UI.info("Se já tiver alguém com mais sinergia na sua função, você entra como reserva."), {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔴 Alpha", callback_data: `uni_ALPHA_${player.riot_id}` }],
                    [{ text: "🔵 Omega", callback_data: `uni_OMEGA_${player.riot_id}` }],
                    [{ text: "🛠️ Wingman (Reserva)", callback_data: `uni_WINGMAN_${player.riot_id}` }],
                    [{ text: "Cancelar", callback_data: "uni_cancel" }]
                ]
            }
        });
    }

    if (!validas.includes(unidade)) return bot.sendMessage(chatId, `Time inválido. Escolha entre: ALPHA, OMEGA ou WINGMAN.`, { parse_mode: 'Markdown' });

    try {
        let aviso = "";
        if (unidade !== 'WINGMAN') {
            const { data: ocupante } = await supabase.from('players')
                .select('synergy_score').eq('unit', unidade).eq('role_raw', player.role_raw).neq('riot_id', player.riot_id)
                .order('synergy_score', { ascending: false }).limit(1);

            if (ocupante && ocupante.length > 0 && ocupante[0].synergy_score > player.synergy_score) {
                aviso = `\n\nJá tem alguém com mais sinergia nessa vaga, então por enquanto você entra como *reserva*. Continue jogando com o time pra ganhar pontos!`;
            }
        }

        await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);

        const nomes = { 'ALPHA': 'Alpha', 'OMEGA': 'Omega', 'WINGMAN': 'Wingman (Reserva)' };
        bot.sendMessage(chatId,
            UI.kaio("TROCA FEITA") + `\n\n` +
            `*${nick}*, você agora faz parte do time *${nomes[unidade]}*.${aviso}` +
            UI.footer(), { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, "❌ Algo deu errado na troca. Tenta de novo.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /RANKING ---
bot.onText(/^\/ranking(?:@[\w_]+)?(?:\s+|$)/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const { data, error } = await supabase.from('players').select('riot_id, synergy_score, unit').order('synergy_score', { ascending: false }).limit(10);
        if (error) throw error;

        let rankMsg = UI.kaio("RANKING DO TIME") + `\n\n` +
            `Quem mais joga junto ganha mais pontos de sinergia.\n` +
            `_(Pontos são ganhos jogando ranqueada com o grupo)_\n\n`;
        data.forEach((p, i) => {
            const pos = i + 1;
            const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `\`${String(pos).padStart(2, ' ')}.\``;
            const pts = p.synergy_score || 0;
            const nick = p.riot_id.split('#')[0];
            const team = p.unit ? ` _(${p.unit})_` : '';
            rankMsg += `${medal} *${escapeMarkdown(nick)}* — ${pts} pts${team}\n`;
        });
        rankMsg += `\n` + UI.info("Use /como\\_funciona pra entender como a sinergia é calculada.") + UI.footer();
        bot.sendMessage(chatId, rankMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Não consegui carregar o ranking. Tenta de novo.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /PERFIL ---
bot.onText(/^\/perfil(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const argumentoRaw = match[1] ? match[1].trim() : null;
    let argumento = argumentoRaw ? argumentoRaw.replace(/[%_]/g, '') : null;

    // Se não passou argumento, tenta mostrar o próprio perfil
    if (!argumento || argumento.length < 3) {
        const { data: self } = await supabase.from('players').select('riot_id').eq('telegram_id', telegramId).limit(1);
        if (self && self.length > 0) {
            argumento = self[0].riot_id.split('#')[0];
        } else {
            return bot.sendMessage(chatId,
                `Para ver o perfil de alguém, manda o nick:\n\n` +
                `Exemplo: \`/perfil Nick\`\n\n` +
                `Se quiser ver o seu, conecta sua conta primeiro com \`/vincular\`.`,
                { parse_mode: 'Markdown' });
        }
    }

    try {
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `%${argumento}%`).limit(1);
        if (!data || data.length === 0) return bot.sendMessage(chatId, `Não encontrei ninguém com esse nick. Confere se tá escrito certo.`, { parse_mode: 'Markdown' });

        const p = data[0];
        const nick = p.riot_id.split('#')[0];

        // Buscar última análise se o Oráculo estiver configurado
        let perfIndex = null;
        if (oraculoExt) {
            const { data: lastAnalysis } = await oraculoExt.from('match_analysis_queue')
                .select('metadata')
                .eq('agente_tag', p.riot_id)
                .eq('status', 'completed')
                .order('processed_at', { ascending: false })
                .limit(1);

            if (lastAnalysis && lastAnalysis.length > 0 && lastAnalysis[0].metadata?.analysis?.performance_index) {
                perfIndex = lastAnalysis[0].metadata.analysis.performance_index;
            }
        }

        const safeRank = p.current_rank && p.current_rank !== 'Processando...' ? p.current_rank : 'Ainda não ranqueado';
        const teamName = p.unit || 'Sem time (use /unidade)';
        const role = p.role_raw || 'Ainda não definida';
        const soloStatus = p.lone_wolf ? '🐺 Jogando solo ultimamente' : '✅ Jogando com o time';

        // Determinar tier do performance
        let tierInfo = '';
        if (perfIndex) {
            if (perfIndex >= 115) tierInfo = `🔴 *Alpha* (${perfIndex})`;
            else if (perfIndex >= 95) tierInfo = `🔵 *Omega* (${perfIndex})`;
            else tierInfo = `⚠️ *Depósito de Torreta* (${perfIndex})`;
        } else {
            tierInfo = `Sem análise ainda`;
        }

        const msgPerfil = UI.kaio("PERFIL") + `\n\n` +
            `👤 *${escapeMarkdown(nick)}*\n\n` +
            `🎖️ Elo: \`${safeRank}\`\n` +
            `⚔️ Função: \`${role}\`\n` +
            `🛡️ Time: \`${teamName}\`\n\n` +
            `📊 *Performance:* ${tierInfo}\n` +
            `🤝 *Sinergia:* ${p.synergy_score || 0} pontos\n` +
            `🎯 *Treino (DM):* ${p.dm_score_total || p.dm_score || 0} pontos\n` +
            `${soloStatus}\n\n` +
            UI.info("Use /como\\_funciona pra entender o que cada número significa.") +
            UI.footer();

        bot.sendMessage(chatId, msgPerfil, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Erro ao buscar o perfil. Tenta de novo.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /ANALISAR (Integração Oráculo V) ---
bot.onText(/^\/analisar(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const matchId = match[1] ? match[1].trim() : null;

    try {
        const { data: user } = await supabase.from('players').select('riot_id').eq('telegram_id', telegramId).limit(1);
        if (!user || user.length === 0) {
            return bot.sendMessage(chatId, `Você precisa conectar sua conta primeiro.\n\nUsa: \`/vincular SeuNick#Tag\``, { parse_mode: 'Markdown' });
        }

        if (!matchId) return bot.sendMessage(chatId,
            UI.kaio("ANALISAR PARTIDA") + `\n\n` +
            `Para analisar uma partida, eu preciso do ID dela (um código UUID).\n\n` +
            `Exemplo: \`/analisar 5525faf5-034e-4caf-b142-9d9bc8a3e897\`\n\n` +
            `Esse ID aparece no histórico de partidas do site.`,
            { parse_mode: 'Markdown' });

        if (!oraculoExt) return bot.sendMessage(chatId, "⚠️ O sistema de análise está offline no momento. Tenta mais tarde.", { parse_mode: 'Markdown' });

        // Normalização: Remover espaços e garantir formato UUID limpo
        const cleanMatchId = matchId.trim().toLowerCase();

        // 🤖 NOVO: Verifica se a partida já foi processada para retornar imediato
        const { data: results } = await oraculoExt.from('match_analysis_queue')
            .select('*')
            .eq('match_id', cleanMatchId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false });

        if (results && results.length > 0) {
            // Filtrar apenas jobs individuais (não o AUTO que é dispatcher)
            const agentResults = results.filter(r => r.agente_tag !== 'AUTO' && r.metadata?.analysis);
            
            if (agentResults.length > 0) {
                let msg = UI.oraculo("ANÁLISE PRONTA") + `\n\nEssa partida já foi analisada. Aqui estão os resultados:\n`;
                for (const r of agentResults) {
                    const analysis = r.metadata.analysis;
                    const adr = typeof analysis.adr === 'number' ? Math.round(analysis.adr) : analysis.adr;
                    const kd = typeof analysis.kd === 'number' ? analysis.kd.toFixed(2) : (analysis.target_kd ?? analysis.kd);
                    const fb = analysis.first_bloods ?? analysis.first_kills ?? 0;
                    
                    msg += `\n👤 *${r.agente_tag.split('#')[0].toUpperCase()}* (${analysis.performance_index}/100)\n` +
                           `   \`ADR: ${adr} | K/D: ${kd} | FB: ${fb}\`\n` +
                           `   [VER RELATÓRIO](https://protocolov.com/analise.html?player=${encodeURIComponent(r.agente_tag)}&matchId=${cleanMatchId})\n`;
                }
                msg += UI.footer();
                return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
        }

        // Envia o job como 'AUTO' para que o Oráculo V analise todos os agentes do Protocolo V presentes na partida
        // Usamos upsert para evitar duplicidade na fila
        const { error } = await oraculoExt.from('match_analysis_queue').upsert([{ 
            match_id: cleanMatchId, 
            agente_tag: 'AUTO', 
            status: 'pending',
            metadata: { 
                requester: user[0].riot_id,
                chat_id: chatId
            }
        }], { onConflict: 'match_id,agente_tag' });
        
        if (error) throw error;
        bot.sendMessage(chatId,
            UI.kaio("ANÁLISE EM ANDAMENTO") + `\n\n` +
            `Mandei a partida pro Oráculo V analisar. Isso leva de 30 segundos a alguns minutos.\n\n` +
            `Quando ficar pronto, você pode ver o resultado com:\n` +
            `\`/analisar ${matchId}\`` +
            UI.footer(), { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Erro ao enviar pra análise. Tenta de novo.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /CONVOCAR ---
bot.onText(/^\/convocar(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    const rawMatch = match[1] ? match[1].trim() : null;

    try {
        const { data: user } = await supabase.from('players').select('riot_id').eq('telegram_id', telegramId).limit(1);
        if (!user || user.length === 0) {
            return bot.sendMessage(chatId, `Você precisa conectar sua conta primeiro.\n\nUsa: \`/vincular SeuNick#Tag\``, { parse_mode: 'Markdown' });
        }

        const commanderName = user[0].riot_id.split('#')[0];
        const now = Date.now();

        // Verifica se já existe chamada ativa
        const { data: activeCalls } = await supabase.from('active_calls').select('*').gt('expires_at', now).order('expires_at', { ascending: false }).limit(1);
        if (activeCalls && activeCalls.length > 0) {
            const call = activeCalls[0];
            if (call.commander === commanderName) {
                return bot.sendMessage(chatId, `Você já tem uma chamada ativa com o código: *${call.party_code}*`, { parse_mode: 'Markdown' });
            } else {
                return bot.sendMessage(chatId, `*${escapeMarkdown(call.commander)}* já está chamando o time. Aguarda a chamada dele encerrar.`, { parse_mode: 'Markdown' });
            }
        }

        // Se já passou o código, executa direto
        if (rawMatch && rawMatch.length > 0) {
            return exec_convocar(chatId, commanderName, rawMatch);
        }

        // Caso contrário, pergunta
        bot.sendMessage(chatId,
            UI.kaio("CHAMAR TIME") + `\n\n` +
            `*${escapeMarkdown(commanderName)}*, bora jogar? Você tem um código de grupo pra compartilhar?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Sim, tenho o código", callback_data: `cvc_yes_${commanderName}` }],
                    [{ text: "Não, chamar sem código", callback_data: `cvc_no_${commanderName}` }],
                    [{ text: "Cancelar", callback_data: "cvc_cancel" }]
                ]
            }
        });

    } catch (err) {
        bot.sendMessage(chatId, "❌ Erro ao criar a chamada. Tenta de novo.", { parse_mode: 'Markdown' });
    }
});

// FUNÇÃO AUXILIAR PARA EXECUTAR A CONVOCAÇÃO
async function exec_convocar(chatId, commanderName, codigoRaw) {
    const matchAlfanumerico = codigoRaw ? codigoRaw.match(/[a-zA-Z0-9]+/) : null;
    const codigoLobby = matchAlfanumerico ? matchAlfanumerico[0] : "Solicite invite no PV";
    const now = Date.now();
    const expiresAt = now + (30 * 60 * 1000);

    try {
        const { data: insertedCall } = await supabase.from('active_calls').insert([{
            commander: commanderName,
            party_code: codigoLobby,
            expires_at: expiresAt
        }]).select();

        const callId = insertedCall && insertedCall.length > 0 ? insertedCall[0].id : 'global';
        const alertMsg = UI.alert("LFG ATIVO") + 
            `\n\nO agente *${escapeMarkdown(commanderName)}* está puxando fila e precisa de reforços.\n\n` +
            `Código do Lobby: \`${codigoLobby}\`\n\n` +
            `Esquadrão: 1/5\n- ${escapeMarkdown(commanderName)}`;
        
        bot.sendMessage(chatId, alertMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "🟢 Aceitar Convocação", callback_data: `lfg_join_${callId}` }]]
            }
        });
    } catch (err) {
        bot.sendMessage(chatId, UI.kaio("ERRO") + "\n\nFalha ao registrar sinalizador.", { parse_mode: 'Markdown' });
    }
}

// --- COMANDO /AJUDA ---
bot.onText(/^\/ajuda(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = UI.kaio("MANUAL DE OPERAÇÕES") + `\n\n` +
        `Siga as diretrizes abaixo para garantir a eficiência da missão:\n\n` +
        `📡 \`/vincular [ID]\` ➔ Conectar seu rádio ao sistema.\n` +
        `🚨 \`/convocar [Cód]\` ➔ Solicitar reforços (LFG).\n` +
        `🔄 \`/unidade\` ➔ Transferência entre esquadrões.\n` +
        `👤 \`/perfil [Nick]\` ➔ Dossiê completo do agente.\n` +
        `📊 \`/analisar [ID]\` ➔ Acionar Oráculo V para análise.\n` +
        `🏆 \`/ranking\` ➔ Ranking de Sinergia e atividade.\n` +
        `🌐 \`/site\` ➔ Acesso direto à nossa plataforma.\n\n` +
        UI.info("Lembre-se: Sozinho você é um alvo. Em equipe, somos o protocolo.") +
        UI.footer();
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
});

// --- COMANDO /SITE ---
bot.onText(/^\/site(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = UI.kaio("INTRANET") + `\n\nAcesse nossa plataforma para relatórios detalhados:\n\n🔗 [ProtocoloV.com](https://protocolov.com)`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// --- COMANDO DE DIAGNÓSTICO ---
bot.onText(/^\/meu_id(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const isAdmin = msg.from.id === ADMIN_ID;
    const rawVal = process.env.ADMIN_TELEGRAM_ID ? `"${process.env.ADMIN_TELEGRAM_ID}"` : 'undefined';
    const response = UI.kaio("SISTEMA STATUS") + `\n\n` +
                     `ID de rádio: \`${msg.from.id}\`\n` +
                     `Admin: ${isAdmin ? '✅ AUTORIZADO' : '❌ NEGADO'}\n` +
                     `Sincronização: \`${ADMIN_ID}\`\n` +
                     `DEBUG: \`${rawVal}\`` + UI.footer();
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

// --- COMANDOS SECRETOS DE ADMINISTRAÇÃO ---
bot.onText(/^\/reciclar(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return; 

    const chatId = msg.chat.id;
    const matchId = match[1] ? match[1].trim() : null;
    if (!matchId) return bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Informe o Match ID para reciclagem de dados.", { parse_mode: 'Markdown' });

    try {
        const { error } = await oraculoExt.from('match_analysis_queue').update({ 
            status: 'pending',
            error_message: null
        }).eq('match_id', matchId);

        if (error) throw error;
        bot.sendMessage(chatId, `♻️ *[K.A.I.O.]*: Partida \`${matchId}\` reinserida na fila do Oráculo V para reprocessamento v3.0.`, { parse_mode: 'Markdown' });
    } catch(err) {
        bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: Falha ao resetar análise.", { parse_mode: 'Markdown' });
    }
});

bot.onText(/^\/reciclar_tudo(?:@[\w_]+)?(?:\s+|$)/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return; 

    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "⏳ *[K.A.I.O.]*: Iniciando reciclagem global de dados... Aguarde confirmação.", { parse_mode: 'Markdown' });

    try {
        const { error } = await oraculoExt.from('match_analysis_queue').update({ 
            status: 'pending',
            error_message: null
        }).in('status', ['completed', 'failed']);

        if (error) throw error;
        bot.sendMessage(chatId, "♻️ *[K.A.I.O.: SUCESSO]*: Todos os relatórios foram reinseridos na fila. O Oráculo V irá reprocessar as missões em ordem cronológica.", { parse_mode: 'Markdown' });
    } catch(err) {
        bot.sendMessage(chatId, `⚠️ *[K.A.I.O.]*: Falha na purga global: ${err.message}`, { parse_mode: 'Markdown' });
    }
});

bot.onText(/^\/expurgar(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return; 

    const chatId = msg.chat.id;
    const riotId = match[1] ? match[1].trim() : null;
    if (!riotId) return bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Informe o Riot ID para remoção definitiva.", { parse_mode: 'Markdown' });

    try {
        const { error } = await supabase.from('players').delete().ilike('riot_id', `%${riotId}%`);
        if (error) throw error;
        bot.sendMessage(chatId, `💥 *[K.A.I.O.]*: Registro de *${escapeMarkdown(riotId)}* removido da base.`, { parse_mode: 'Markdown' });
    } catch(err) {
        bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: Falha ao remover registro.", { parse_mode: 'Markdown' });
    }
});

bot.onText(/^\/alerta_vermelho(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return; 

    const chatId = msg.chat.id;
    const mensagemAlert = match[1] ? match[1].trim() : null;
    if (!mensagemAlert) return bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Informe a mensagem para o alerta global.", { parse_mode: 'Markdown' });

    try {
        const { data } = await supabase.from('players').select('telegram_id').not('telegram_id', 'is', null);
        let sentCount = 0;
        
        const avisoFinal = `🚨 *[ALERTA GERAL DO PROTOCOLO V]*\n\n${escapeMarkdown(mensagemAlert)}`;

        for (const player of data) {
            try {
                await bot.sendMessage(player.telegram_id, avisoFinal, { parse_mode: 'Markdown' });
                sentCount++;
            } catch (e) { /* user blocked the bot */ }
        }
        bot.sendMessage(chatId, `✅ *[K.A.I.O.]*: Alerta enviado para ${sentCount} agentes.`, { parse_mode: 'Markdown' });
    } catch(err) {
        bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: Falha no envio global.", { parse_mode: 'Markdown' });
    }
});

bot.onText(/^\/radar(?:@[\w_]+)?(?:\s+|$)/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Testando conexão com a API...", { parse_mode: 'Markdown' });
    try {
        const start = Date.now();
        const res = await fetch('https://api.henrikdev.xyz/valorant/v1/status/br', {
            headers: { 'Authorization': henrikApiKey }
        });
        const ping = Date.now() - start;
        
        if (res.status === 200) {
            bot.sendMessage(chatId, UI.kaio("RADAR ONLINE") + `\n\n` +
                `Status: *OPERACIONAL*\n` +
                `Latência: \`${ping}ms\`\n\n` +
                UI.info("Sistemas autorizados a operar com carga total.") + UI.footer(), { parse_mode: 'Markdown' });
        } else if (res.status === 401) {
            const maskedKey = henrikApiKey ? `${henrikApiKey.slice(0, 4)}***${henrikApiKey.slice(-4)}` : 'NÃO DETECTADA';
            bot.sendMessage(chatId, `🟡 *[K.A.I.O.]*: Erro de Autenticação (401).\n\nSua chave carregada: \`${maskedKey}\`\n\nCertifique-se de que a variável \`HENRIK_API_KEY\` no Render não contém espaços e é uma chave válida da HenrikDev.`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `🟡 *[K.A.I.O.]*: API instável (Status: ${res.status}).`, { parse_mode: 'Markdown' });
        }
    } catch (err) {
        bot.sendMessage(chatId, "🔴 *[K.A.I.O.]*: API Offline ou incontactável.", { parse_mode: 'Markdown' });
    }
});

// --- SERVIDOR EXPRESS (Camuflado) ---
const app = express();

// Rota de Monitoramento para evitar o "sono" do Render (Keep-alive)
app.get('/vanguard-health', (req, res) => {
    console.log('📡 [RADAR] Pulso de vitalidade recebido. Sistema operando.');
    res.send('✅ Sistema Vital do Protocolo V: ONLINE');
});

// Se alguém bater na raiz, não devolvemos nada (corta scanners)
app.get('/', (req, res) => res.status(404).end());

if (process.env.WEBHOOK_URL) {
    app.use(express.json());
    app.post(`/bot${token}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
}

const modoStr = process.env.WEBHOOK_URL ? 'WEBHOOK ONLINE' : 'POLLING ATIVO';
app.listen(process.env.PORT || 3000, () => {
    console.log(`🌐 Terminal Avançado: ${modoStr} e camuflado.`);
    
    // Inicializa o Worker do Oráculo V se estivermos no ambiente correto
    if (process.env.HENRIK_API_KEY && process.env.NODE_ENV !== 'test') {
        console.log("🧠 [ORÁCULO-V] Protocolo de Análise Ativo. Aguardando jobs...");
        startQueueWorker();
    } else {
        console.log("⚠️ [ORÁCULO-V] Worker em standby (Ambiente de Teste ou API Key ausente).");
    }
});

// --- WORKER DE FILA DE ANÁLISE (Oráculo-V v3.0) ---
const { analyzeMatch } = require('./oraculo');

async function startQueueWorker() {
    // Loop infinito para processar a fila
    while (true) {
        try {
            if (!oraculoExt) {
                console.warn("⚠️ [ORÁCULO-V] Conexão externa não configurada. Worker abortado.");
                return;
            }

            // Busca o próximo job pendente
            const { data: job, error } = await oraculoExt
                .from('match_analysis_queue')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: true })
                .limit(1);

            if (error) {
                console.error("❌ [ORÁCULO-V] Erro ao consultar fila:", error.message);
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }

            if (job && job.length > 0) {
                const currentJob = job[0];
                
                if (currentJob.agente_tag === 'AUTO') {
                    console.log(`🤖 [ORÁCULO-V] AUTO-SCAN: Iniciando varredura na partida ${currentJob.match_id}...`);
                    try {
                        // 1. Buscar dados da partida (V4)
                        const res = await fetch(`https://api.henrikdev.xyz/valorant/v4/match/br/${currentJob.match_id}`, {
                            headers: { 'Authorization': henrikApiKey }
                        });
                        
                        if (res.status !== 200) throw new Error(`Erro API Henrik: ${res.status}`);
                        const matchData = await res.json();
                        const playersInMatch = matchData.data.players;

                        // 2. Buscar todos os agentes registrados no Protocolo V
                        const { data: dbPlayers } = await supabase.from('players').select('riot_id');
                        const pVAgentsByRiotId = new Set(dbPlayers.map(p => p.riot_id.toLowerCase().trim()));

                        // 3. Identificar quem da partida é do Protocolo V
                        const targets = playersInMatch.filter(p => {
                            const fullId = `${p.name}#${p.tag}`.toLowerCase().trim();
                            return pVAgentsByRiotId.has(fullId);
                        });

                        console.log(`📡 [ORÁCULO-V] Varredura concluída. ${targets.length} agentes encontrados.`);

                        if (targets.length > 0) {
                            // 4. Criar jobs individuais para cada agente encontrado
                            const newJobs = targets.map(t => ({
                                match_id: currentJob.match_id,
                                agente_tag: `${t.name}#${t.tag}`,
                                status: 'pending',
                                metadata: { 
                                    ...(currentJob.metadata || {}),
                                    auto_scan: true,
                                    requester: currentJob.metadata?.requester || 'AUTO'
                                }
                            }));

                            await oraculoExt.from('match_analysis_queue').upsert(newJobs, { onConflict: 'match_id,agente_tag' });
                            
                            await oraculoExt.from('match_analysis_queue').update({ 
                                status: 'completed', 
                                processed_at: new Date().toISOString(),
                                error_message: `Varredura concluída: ${targets.length} agentes identificados e enfileirados.`
                            }).eq('id', currentJob.id);
                        } else {
                            await oraculoExt.from('match_analysis_queue').update({ 
                                status: 'completed', 
                                processed_at: new Date().toISOString(),
                                error_message: "Varredura concluída: Nenhum agente do Protocolo V detectado nesta partida."
                            }).eq('id', currentJob.id);
                            
                            const chatIdToNotify = currentJob.chat_id || currentJob.metadata?.chat_id;
                            if (chatIdToNotify) {
                                bot.sendMessage(chatIdToNotify, UI.kaio("VARREDURA CONCLUÍDA") + "\n\nNenhum agente do Protocolo V foi detectado nos logs desta missão." + UI.footer(), { parse_mode: 'Markdown' });
                            }
                        }
                    } catch (scanErr) {
                        console.error("❌ [ORÁCULO-V] Erro no AUTO-SCAN:", scanErr.message);
                        await oraculoExt.from('match_analysis_queue').update({ 
                            status: 'failed', 
                            error_message: `Falha na varredura: ${scanErr.message}` 
                        }).eq('id', currentJob.id);
                    }
                } else {
                    // --- LÓGICA DE ANÁLISE INDIVIDUAL (Existente) ---
                    const targetTag = currentJob.agente_tag;
                    console.log(`🔍 [ORÁCULO-V] Analisando partida ${currentJob.match_id} para ${targetTag}...`);

                    const result = await analyzeMatch(currentJob.match_id, targetTag);

                    if (result.status === 'completed') {
                        const updatedMeta = { 
                            ...(currentJob.metadata || {}), 
                            analysis: result.report 
                        };

                        await oraculoExt.from('match_analysis_queue').update({ 
                            status: 'completed', 
                            agente_tag: targetTag,
                            metadata: updatedMeta,
                            processed_at: new Date().toISOString()
                        }).eq('id', currentJob.id);

                        console.log(`✅ [ORÁCULO-V] Partida ${currentJob.id} processada com sucesso.`);
                        
                        const chatIdToNotify = currentJob.chat_id || currentJob.metadata?.chat_id;
                        if (chatIdToNotify) {
                            const msg = UI.oraculo("MISSÃO ANALISADA") + `\n\n` +
                                `👤 *${targetTag.split('#')[0].toUpperCase()}*\n` +
                                `📊 *Index:* \`${result.report.performance_index}/100\`\n\n` +
                                `[ACESSAR RELATÓRIO COMPLETO](https://protocolov.com/analise.html?player=${encodeURIComponent(targetTag)}&matchId=${currentJob.match_id})` +
                                UI.footer();
                            bot.sendMessage(chatIdToNotify, msg, { parse_mode: 'Markdown' });
                        }
                    } else {
                        console.error(`❌ [ORÁCULO-V] Falha no JOB ${currentJob.id}:`, result.error);
                        await oraculoExt.from('match_analysis_queue').update({ 
                            status: 'failed', 
                            error_message: result.error 
                        }).eq('id', currentJob.id);
                    }
                }
            }

            // Aguarda antes da próxima verificação (5 segundos se processou, 30 se estava vazio)
            const waitTime = (job && job.length > 0) ? 5000 : 30000;
            await new Promise(r => setTimeout(r, waitTime));

        } catch (err) {
            console.error("🔥 [ORÁCULO-V] Erro crítico no worker:", err.message);
            await new Promise(r => setTimeout(r, 60000));
        }
    }
}
