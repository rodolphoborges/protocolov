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

// Configuração do Menu de Comandos (PT-BR Valorant)
bot.setMyCommands([
    { command: 'start', description: '🤖 Inicializar Protocolo V' },
    { command: 'vincular', description: '📡 Vincular seu Riot ID' },
    { command: 'convocar', description: '🚨 Puxar fila (Avisar no site)' },
    { command: 'unidade', description: '🔄 Trocar de Esquadrão' },
    { command: 'perfil', description: '📂 Ver info de um agente' },
    { command: 'ranking', description: '🏆 Ranking de Sinergia' },
    { command: 'analisar', description: '📊 Analisar desempenho em partida' },
    { command: 'site', description: '🌐 Ir para o site do Protocolo V' },
    { command: 'ajuda', description: '⚙️ Manual do K.A.I.O.' }
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
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const startMsg = UI.kaio("SISTEMA ONLINE") + `\n\n` +
                   `Bem-vindo ao centro de comando do *Protocolo V*. Meus sensores estão ativos para gerenciar seu esquadrão e monitorar sua sinergia.\n\n` +
                   `📡 \`/vincular [Nick#Tag]\` ➔ Conectar rádio\n` +
                   `🚨 \`/convocar [Código]\` ➔ Acionar reforços\n` +
                   `🔄 \`/unidade\` ➔ Transferência de esquadrão\n` +
                   `👤 \`/perfil [Nick]\` ➔ Dossiê de agente\n` +
                   `🏆 \`/ranking\` ➔ Hierarquia de Sinergia\n\n` +
                   UI.info("Use /ajuda para o manual completo.") +
                   UI.footer();
    bot.sendMessage(chatId, startMsg, { parse_mode: 'Markdown' });
});

// --- COMANDO /VINCULAR ---
bot.onText(/^\/vincular(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const riotId = match[1] ? match[1].trim() : null;

    if (!riotId) {
        return bot.sendMessage(chatId, UI.kaio("VINCULAR RÁDIO") + "\n\n" + UI.info("Informe seu Riot ID. Ex: /vincular MeuNick#BR1"), { parse_mode: 'Markdown' });
    }

    try {
        const { data: players } = await supabase.from('players').select('*').ilike('riot_id', `%${riotId}%`).limit(1);
        
        if (!players || players.length === 0) {
            return bot.sendMessage(chatId, "❌ *[K.A.I.O.]*: Esse Riot ID não foi encontrado. Você já se alistou no site?", { parse_mode: 'Markdown' });
        }

        const player = players[0];
        if (player.telegram_id && player.telegram_id !== telegramId) {
            return bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: Esse Riot ID já está vinculado a outro usuário.", { parse_mode: 'Markdown' });
        }

        await supabase.from('players').update({ telegram_id: telegramId }).eq('riot_id', player.riot_id);
        bot.sendMessage(chatId, UI.kaio("SUCESSO") + `\n\nRádio vinculado com sucesso ao codinome *${escapeMarkdown(player.riot_id)}*.` + UI.footer(), { parse_mode: 'Markdown' });

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
        return bot.sendMessage(chatId, "🔒 *Acesso Negado:* O teu rádio não está vinculado a nenhum codinome. Usa o comando `/vincular TeuNick#TAG` primeiro.", { parse_mode: 'Markdown' });
    }

    const player = userRecord[0];

    if (!unidade) {
        return bot.sendMessage(chatId, UI.kaio("SISTEMA DE TRANSFERÊNCIA") + `\n\n` +
            `Codinome *${escapeMarkdown(player.riot_id.split('#')[0])}*, selecione o esquadrão de destino:` + UI.footer(), {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🐍 Comandante VENENOSA (ALPHA)", callback_data: `uni_ALPHA_${player.riot_id}` }],
                    [{ text: "🐺 Comandante CACHORRO VELHO (OMEGA)", callback_data: `uni_OMEGA_${player.riot_id}` }],
                    [{ text: "🛠️ DEPÓSITO DE TORRETAS (WINGMAN)", callback_data: `uni_WINGMAN_${player.riot_id}` }],
                    [{ text: "❌ ABORTAR OPERAÇÃO", callback_data: "uni_cancel" }]
                ]
            }
        });
    }
    
    if (!validas.includes(unidade)) return bot.sendMessage(chatId, "> 🛰️ *COMANDO ORBITAL:* Código de Unidade inválido. Missão abortada.", { parse_mode: 'Markdown' });

    // 2. Executar a transferência para o codinome verificado
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
        bot.sendMessage(chatId, UI.kaio("TRANSFERÊNCIA CONCLUÍDA") + `\n\nO agente *${escapeMarkdown(player.riot_id)}* foi realocado para o esquadrão *${unidade}*.${aviso}` + UI.footer(), { parse_mode: 'Markdown' });
    } catch (error) { 
        bot.sendMessage(chatId, "🔥 *Arquiteto:* Falha na sincronização.", { parse_mode: 'Markdown' }); 
    }
});

// --- COMANDO /RANKING ---
bot.onText(/^\/ranking(?:@[\w_]+)?(?:\s+|$)/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const { data, error } = await supabase.from('players').select('riot_id, synergy_score, unit').order('synergy_score', { ascending: false }).limit(10);
        if (error) throw error;
        
        let rankMsg = UI.kaio("TOP 10 SINERGIA") + `\n\n`;
        data.forEach((p, i) => {
            const pos = String(i + 1).padStart(2, '0');
            const pts = String(p.synergy_score || 0).padStart(4, ' ');
            const nick = p.riot_id.split('#')[0].toUpperCase();
            rankMsg += `\`[${pos}]\` *${escapeMarkdown(nick)}* \`➔ ${pts} pts\`\n`;
        });
        rankMsg += UI.footer();
        bot.sendMessage(chatId, rankMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, UI.kaio("ERRO") + "\n\nFalha ao extrair ranking de sinergia.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /PERFIL ---
bot.onText(/^\/perfil(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argumentoRaw = match[1] ? match[1].trim() : null;
    const argumento = argumentoRaw ? argumentoRaw.replace(/[%_]/g, '') : null;

    if (!argumento || argumento.length < 3) {
        return bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Informe quem deseja pesquisar.\n\nExemplo: \`/perfil Nick\`", { parse_mode: 'Markdown' });
    }

    try {
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `%${argumento}%`).limit(1);
        if (!data || data.length === 0) return bot.sendMessage(chatId, UI.kaio("ERRO") + "\n\nNenhum codinome encontrado nos registros.", { parse_mode: 'Markdown' });
        
        const p = data[0];
        
        // Buscar última análise se o Oráculo estiver configurado
        let perfIndex = "Sem registros";
        if (oraculoExt) {
            const { data: lastAnalysis } = await oraculoExt.from('match_analysis_queue')
                .select('metadata')
                .eq('agente_tag', p.riot_id)
                .eq('status', 'completed')
                .order('processed_at', { ascending: false })
                .limit(1);
            
            if (lastAnalysis && lastAnalysis.length > 0 && lastAnalysis[0].metadata?.analysis?.performance_index) {
                perfIndex = `${lastAnalysis[0].metadata.analysis.performance_index}/100`;
            }
        }

        const statusLobo = p.lone_wolf ? 'Sim 🐺' : 'Não (Team Player)';
        const safeRank = p.current_rank && p.current_rank !== 'Processando...' ? p.current_rank : 'Pendente';
        
        const msgPerfil = UI.kaio("DOSSIÊ DO AGENTE") + `\n\n` +
                          `👤 *Codinome:* ${escapeMarkdown(p.riot_id)}\n` +
                          `🛡️ *Esquadrão:* \`${p.unit || 'Reserva'}\`\n` +
                          `⚔️ *Função:* \`${p.role_raw || 'Não Definida'}\`\n` +
                          `🎖️ *Elo:* \`${safeRank}\`\n\n` +
                          `📊 *Performance (Última):* \`${perfIndex}\`\n` +
                          `🤝 *Sinergia:* \`${p.synergy_score || 0} pts\`\n` +
                          `🎯 *Treino (DM):* \`${p.dm_score_total || p.dm_score || 0} pts\`\n` +
                          `⚠️ *Lobo Solitário:* ${statusLobo}` + 
                          UI.footer();
                          
        bot.sendMessage(chatId, msgPerfil, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, UI.kaio("ERRO") + "\n\nFalha ao acessar banco de dados do Protocolo.", { parse_mode: 'Markdown' });
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
            return bot.sendMessage(chatId, "❌ *[K.A.I.O.]*: Você precisa vincular seu rádio primeiro. Use \`/vincular MeuNick#TAG\`.", { parse_mode: 'Markdown' });
        }

        if (!matchId) return bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Informe o ID da partida (UUID) para análise.\n\nExemplo: \`/analisar 5525faf5-034e-4caf-b142-9d9bc8a3e897\`", { parse_mode: 'Markdown' });

        if (!oraculoExt) return bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: O módulo de conexão com o Oráculo V está offline. Configure ORACULO_SUPABASE_URL no ambiente.", { parse_mode: 'Markdown' });

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
                let msg = UI.oraculo("REGISTROS RECUPERADOS") + `\n\nMissão já processada anteriormente. Resultados detectados:\n`;
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
        bot.sendMessage(chatId, UI.kaio("ORDEM RECEBIDA") + `\n\nA missão \`${matchId}\` foi enviada ao Oráculo V para varredura completa.` + UI.footer(), { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, UI.kaio("ERRO") + "\n\nFalha ao registrar pedido de análise na fila.", { parse_mode: 'Markdown' });
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
        const { data: user } = await supabase.from('players').select('riot_id').eq('telegram_id', telegramId).limit(1);
        if (!user || user.length === 0) {
            return bot.sendMessage(chatId, "❌ *[K.A.I.O.]*: Você precisa vincular seu rádio primeiro. Use \`/vincular MeuNick#TAG\`.", { parse_mode: 'Markdown' });
        }

        const commanderName = user[0].riot_id.split('#')[0];
        const now = Date.now();

        // 1. Verifica se já existe sinalizador ativo
        const { data: activeCalls } = await supabase.from('active_calls').select('*').gt('expires_at', now).order('expires_at', { ascending: false }).limit(1);
        if (activeCalls && activeCalls.length > 0) {
            const call = activeCalls[0];
            if (call.commander === commanderName) {
                return bot.sendMessage(chatId, `⚠️ *[K.A.I.O.]*: Seu sinalizador já está ativo para o código: *${call.party_code}*.`, { parse_mode: 'Markdown' });
            } else {
                return bot.sendMessage(chatId, `⚠️ *[K.A.I.O.]*: O agente *${call.commander}* já está convocando reforços. Aguarde o sinal dele expirar.`, { parse_mode: 'Markdown' });
            }
        }

        // 2. Se o usuário já passou o código no comando, pula a interação
        if (match[1] && match[1].trim().length > 0) {
            return exec_convocar(chatId, commanderName, match[1].trim());
        }

        // 3. Caso contrário, inicia interação
        bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Você tem um código de grupo (lobby) para compartilhar agora?", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✅ Sim, tenho o código", callback_data: `cvc_yes_${commanderName}` }],
                    [{ text: "❌ Não, puxar sem código", callback_data: `cvc_no_${commanderName}` }],
                    [{ text: "🚫 ABORTAR CONVOCAÇÃO", callback_data: "cvc_cancel" }]
                ]
            }
        });

    } catch (err) {
        bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: Erro ao iniciar protocolo de convocação.", { parse_mode: 'Markdown' });
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
