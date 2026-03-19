require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- CONFIGURAÇÃO ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const rawAdminId = process.env.ADMIN_TELEGRAM_ID ? process.env.ADMIN_TELEGRAM_ID.trim() : null;
const ADMIN_ID = rawAdminId ? parseInt(rawAdminId, 10) : null; 
const henrikApiKey = process.env.HENRIK_API_KEY;

if (!ADMIN_ID) {
    console.warn('⚠️ AVISO: ADMIN_TELEGRAM_ID não configurado. Comandos de administrador desabilitados.');
}

if (!token || !supabaseUrl || !supabaseKey) {
    console.error('🔥 ERRO: Variáveis de ambiente faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

let bot;
if (process.env.WEBHOOK_URL) {
    bot = new TelegramBot(token);
    bot.setWebHook(`${process.env.WEBHOOK_URL}/bot${token}`);
} else {
    bot = new TelegramBot(token, { polling: true });
}

// Configuração do Menu de Comandos (PT-BR Valorant)
bot.setMyCommands([
    { command: 'start', description: '🤖 Inicializar Protocolo V' },
    { command: 'vincular', description: '📡 Vincular seu Riot ID' },
    { command: 'convocar', description: '🚨 Puxar fila (Avisar no site)' },
    { command: 'unidade', description: '🔄 Trocar de Esquadrão' },
    { command: 'perfil', description: '📂 Ver info de um agente' },
    { command: 'ranking', description: '🏆 Ranking de Sinergia' },
    { command: 'site', description: '🌐 Ir para o site do Protocolo V' },
    { command: 'ajuda', description: '⚙️ Manual do K.A.I.O.' }
]);

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*`\[\]]/g, '\\$&');
}

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
        
        let newMd = `🚨 *[K.A.I.O.: LFG ATIVO]*\n\n` +
                    `> 📡 *Reforços solicitados:*\n` +
                    `Agentes no grupo: ${listAgents.length}/5\n` +
                    listAgents.map(a => escapeMarkdown(a)).join('\n');
        
        if (listAgents.length >= 5) {
            bot.editMessageText(newMd + "\n\n✅ *[GRUPO FECHADO]* - Iniciando partida.", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
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
                msgLore = `🤖 *[K.A.I.O.]*: Transferência para o esquadrão *ALPHA* concluída. Siga as ordens.`;
            } else if (unidadeAlvo === 'OMEGA') {
                msgLore = `🤖 *[K.A.I.O.]*: Transferência para o esquadrão *ÔMEGA* concluída. Prepare-se.`;
            } else {
                msgLore = `🤖 *[K.A.I.O.]*: Você agora é *RESERVA* (Wingman). Aguarde convocação.`;
            }

            bot.sendMessage(chatId, msgLore + avisoReserva, { parse_mode: 'Markdown' });
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        } catch (err) {
            console.error("Erro ao processar transferência de unidade:", err);
            bot.answerCallbackQuery(query.id, { text: "Erro ao processar sua solicitação de unidade.", show_alert: true });
        }
        return;
    }

    // INTERAÇÃO: /CONVOCAR (CVX)
    if (callbackData.startsWith('cvc_')) {
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
    const startMsg = `🦾 **IDENTIDADE RECONHECIDA: SISTEMA K.A.I.O ONLINE**\n\n` +
                   `Bem-vindo ao centro de comando do **Protocolo V**. Meus sensores estão prontos para gerenciar seu esquadrão e monitorar sua sinergia.\n\n` +
                   `📡 **/vincular [Nick#Tag]** ➔ Conecta seu rádio ao sistema\n` +
                   `🚨 **/convocar [Código]** ➔ Aciona reforços e avisa o QG\n` +
                   `🔄 **/unidade** ➔ Solicita transferência de esquadrão\n` +
                   `👤 **/perfil [Nick]** ➔ Acessa dossiê de um agente\n` +
                   `🏆 **/ranking** ➔ Exibe a hierarquia de Sinergia\n\n` +
                   `Use **/ajuda** para receber o manual de operações completo.\n\n` +
                   `_O Protocolo V é fã-projeto. Não afiliado à Riot Games._`;
    bot.sendMessage(chatId, startMsg, { parse_mode: 'Markdown' });
});

// --- COMANDO /VINCULAR (NOVO) ---
bot.onText(/^\/vincular(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const riotId = match[1] ? match[1].trim() : null;

    if (!riotId) {
        return bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Informe o seu Riot ID para vincular o rádio.\n\nExemplo: \`/vincular MeuNick#BR1\`", { parse_mode: 'Markdown' });
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
        bot.sendMessage(chatId, `✅ *[K.A.I.O.]*: Rádio vinculado com sucesso ao codinome *${escapeMarkdown(player.riot_id)}*.`, { parse_mode: 'Markdown' });

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
        return bot.sendMessage(chatId, `🤖 *[K.A.I.O.]*: Codinome ${escapeMarkdown(player.riot_id.split('#')[0])}, para qual esquadrão deseja transferência?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Comandante VENENOSA (ALPHA)", callback_data: `uni_ALPHA_${player.riot_id}` }],
                    [{ text: "Comandante CACHORRO VELHO (OMEGA)", callback_data: `uni_OMEGA_${player.riot_id}` }],
                    [{ text: "DEPÓSITO DE TORRETAS", callback_data: `uni_WINGMAN_${player.riot_id}` }]
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
        bot.sendMessage(chatId, `🔄 *[K.A.I.O.]*: Transferência de *${escapeMarkdown(player.riot_id)}* para o esquadrão *${unidade}* concluída.${aviso}`, { parse_mode: 'Markdown' });
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
        
        let rankMsg = `🏆 *[RELATÓRIO DE SINERGIA: TOP 10]*\n_> Extraindo banco de dados da Vanguard..._\n\n`;
        data.forEach((p, i) => {
            rankMsg += `\`[ ${String(i + 1).padStart(2, '0')} ]\` 💠 *${escapeMarkdown(p.riot_id.split('#')[0])}* ➔ ${p.synergy_score || 0} pts _(${p.unit || 'Reserva'})_\n`;
        });
        rankMsg += `\n_Ganhe pontos de sinergia fechando esquadrões com os outros codinomes._`;
        bot.sendMessage(chatId, rankMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: Erro ao acessar banco de dados do Protocolo.", { parse_mode: 'Markdown' });
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
        if (!data || data.length === 0) return bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Nenhum codinome encontrado com esse nome.", { parse_mode: 'Markdown' });
        
        const p = data[0];
        const statusLobo = p.lone_wolf ? 'Sim 🐺 (Só joga solo)' : 'Não (Joga em equipe)';
        const safeRank = p.current_rank && p.current_rank !== 'Processando...' ? p.current_rank : 'Pendente';
        
        const msgPerfil = `📂 *[INFOS DO CODINOME]*\n` +
                          `Riot ID: *${escapeMarkdown(p.riot_id)}*\n\n` +
                          `🛡️ *Esquadrão:* ${p.unit || 'Reserva'}\n` +
                          `⚔️ *Função:* ${p.role_raw || 'Não Definida'}\n` +
                          `🎖️ *Elo Atual:* ${safeRank}\n\n` +
                          `🤝 *Sinergia:* \`${p.synergy_score || 0} pts\`\n` +
                          `🎯 *Treino (DM):* \`${p.dm_score_total || p.dm_score || 0} pts\`\n` +
                          `⚠️ *Lobo Solitário:* ${statusLobo}`;
        bot.sendMessage(chatId, msgPerfil, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: Erro ao buscar perfil. Tente novamente.", { parse_mode: 'Markdown' });
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
                    [{ text: "❌ Não, puxar sem código", callback_data: `cvc_no_${commanderName}` }]
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
        const alertMsg = `🚨 *[K.A.I.O.: LFG ATIVO]*\n\nO agente *${escapeMarkdown(commanderName)}* está puxando fila e precisa de reforços.\n\nCódigo do Lobby: \`${codigoLobby}\`\n\nEsquadrão: 1/5\n- ${escapeMarkdown(commanderName)}`;
        
        bot.sendMessage(chatId, alertMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "🟢 Aceitar Convocação", callback_data: `lfg_join_${callId}` }]]
            }
        });
    } catch (err) {
        bot.sendMessage(chatId, "⚠️ *[K.A.I.O.]*: Erro ao registrar sinalizador.", { parse_mode: 'Markdown' });
    }
}


// --- COMANDO /AJUDA ---
bot.onText(/^\/ajuda(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = `💻 **[K.A.I.O.: MANUAL DE OPERAÇÕES TÁTICAS]**\n\n` +
        `Siga as diretrizes abaixo para garantir a eficiência da missão:\n\n` +
        `📡 **/vincular [ID]** ➔ Use seu Riot ID (Ex: \`Venenosa#BR1\`) para que eu possa rastrear seus logs.\n\n` +
        `🚨 **/convocar [Cód]** ➔ Envia um alerta de busca de grupo (LFG) para o site e para este rádio.\n\n` +
        `🔄 **/unidade** ➔ Abre o painel de transferência entre ALPHA, OMEGA ou DEPÓSITO.\n\n` +
        `👤 **/perfil [Nick]** ➔ Consulta elo, sinergia e status de um agente específico.\n\n` +
        `🏆 **/ranking** ➔ Monitora os 10 agentes com maior atividade na semana.\n\n` +
        `🌐 **/site** ➔ Acesso direto à nossa plataforma de inteligência.\n\n` +
        `_Lembre-se: Sozinho você é um alvo. Em equipe, somos o protocolo._`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
});

// --- COMANDO /SITE ---
bot.onText(/^\/site(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = `🌐 *[K.A.I.O.]*: Acesse nossa intranet para relatórios detalhados e status da line-up:\n\n🔗 [ProtocoloV.com](https://protocolov.com)`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// --- COMANDO DE DIAGNÓSTICO ---
bot.onText(/^\/meu_id(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const isAdmin = msg.from.id === ADMIN_ID;
    const rawVal = process.env.ADMIN_TELEGRAM_ID ? `"${process.env.ADMIN_TELEGRAM_ID}"` : 'undefined';
    const response = `🆔 *[K.A.I.O.: STATUS]*\n\n` +
                     `Seu ID de rádio: \`${msg.from.id}\`\n` +
                     `Status Admin: ${isAdmin ? '✅ AUTORIZADO' : '❌ NEGADO'}\n` +
                     `ID no Sistema (Processado): \`${ADMIN_ID}\`\n` +
                     `Valor Bruto no .env: \`${rawVal}\``;
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

// --- COMANDOS SECRETOS DE ADMINISTRAÇÃO ---
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
            bot.sendMessage(chatId, `🟢 *[K.A.I.O.]*: API Online. Latência: \`${ping}ms\``, { parse_mode: 'Markdown' });
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
app.listen(process.env.PORT || 3000, () => console.log(`🌐 Terminal Avançado: ${modoStr} e camuflado.`));
