require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
// --- CONFIGURAÇÃO ---
const { supabase, oraculo: oraculoExt } = require('./db');
const henrikApiKey = process.env.HENRIK_API_KEY ? process.env.HENRIK_API_KEY.trim() : null;
const token = process.env.TELEGRAM_BOT_TOKEN;
const rawAdminId = process.env.ADMIN_TELEGRAM_ID ? process.env.ADMIN_TELEGRAM_ID.trim() : null;
const ADMIN_ID = rawAdminId ? parseInt(rawAdminId, 10) : null; 

// --- STARTUP VALIDATION ---
if (!token) {
    console.error('🔥 [ERROR] CRITICAL: TELEGRAM_BOT_TOKEN is missing!');
    console.error('Check your Render Environment Variables.');
}

let bot;
try {
    if (token) {
        if (process.env.WEBHOOK_URL) {
            bot = new TelegramBot(token);
            bot.setWebHook(`${process.env.WEBHOOK_URL}/bot${token}`)
               .catch(e => console.error('⚠️ [WARNING] Webhook setup failed:', e.message));
        } else {
            bot = new TelegramBot(token, { polling: false });
            bot.deleteWebHook()
                .then(() => {
                    bot.startPolling({ restart: true });
                    console.log("🌐 Terminal Avançado: POLLING ATIVO e rádio limpo.");
                })
                .catch(e => {
                    console.error('⚠️ [WARNING] deleteWebHook falhou, iniciando polling mesmo assim:', e.message);
                    bot.startPolling({ restart: true });
                });

            // Captura erros de polling para evitar morte silenciosa do bot
            bot.on('polling_error', (err) => {
                // 409 = conflito (outra instância rodando) — logar e aguardar
                if (err.code === 'ETELEGRAM' && err.message.includes('409')) {
                    console.warn('⚠️ [POLLING] Conflito 409 detectado — outra instância ativa. Aguardando...');
                } else {
                    console.error('❌ [POLLING] Erro:', err.message);
                }
            });

            bot.on('error', (err) => {
                console.error('❌ [BOT] Erro geral:', err.message);
            });
        }
    } else {
        console.warn('⚠️ [WARNING] Bot running in STANDBY mode (no token).');
    }
} catch (e) {
    console.error('🔥 [ERROR] Bot Initialization Failed:', e.message);
}

// Configuração do Menu de Comandos (PT-BR — Linguagem acessível)
if (bot) {
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
} else {
    console.warn('⚠️ [WARNING] Commands not set: Bot instance is missing.');
}

function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/[_*`\[\]]/g, '\\$&');
}

// --- UI DESIGN SYSTEM (K.A.I.O. & ORÁCULO) ---
const UI = {
    kaio: (title) => `🤖 *[K.A.I.O. // ${title.toUpperCase()}]*`,
    oraculo: (title) => `🧠 *[ORÁCULO-V // ${title.toUpperCase()}]*`,
    alert: (title) => `🚨 *[ALERTA // ${title.toUpperCase()}]*`,
    info: (text) => `> 💡 _${text}_`,
    divider: "━━━━━━━━━━━━━━",
    footer: () => `\n${UI.divider}\n_Protocolo V // Mentor Tático A.I._`
};

// --- HELPER: busca jogador pelo telegram_id (compatível com bigint e text) ---
async function findPlayerByTelegramId(telegramId, fields = 'riot_id') {
    const numId = parseInt(telegramId, 10);
    // Tenta como número (bigint)
    const { data: byNum, error: e1 } = await supabase.from('players').select(fields).eq('telegram_id', numId).limit(1);
    if (e1) return { data: null, error: e1 };
    if (byNum && byNum.length > 0) return { data: byNum, error: null };
    // Fallback: tenta como string (registros legados)
    const { data: byStr, error: e2 } = await supabase.from('players').select(fields).eq('telegram_id', String(telegramId)).limit(1);
    return { data: byStr, error: e2 };
}

// --- LÓGICA DE BOTÕES (CALLBACK) ---
if (bot) {
    bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    // INTERAÇÃO: SINALIZADOR LFG
    if (callbackData.startsWith('lfg_join_')) {
        const { data: userRef } = await supabase.from('players').select('riot_id').eq('telegram_id', query.from.id).limit(1);
        if (!userRef || userRef.length === 0) return bot.answerCallbackQuery(query.id, { text: "Você precisa conectar sua conta primeiro. Use /vincular", show_alert: true });
        
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
        
        let newMd = UI.alert("CONVOCAÇÃO ATIVA") + `\n\n` +
                    UI.info("Reforços em caminho:") + `\n` +
                    `Agentes confirmados: ${listAgents.length}/5\n` +
                    listAgents.map(a => escapeMarkdown(a)).join('\n');
        
        if (listAgents.length >= 5) {
            bot.editMessageText(newMd + `\n\n✅ *[EQUIPE COMPLETA]*\nBoa sorte na partida.`, { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        } else {
            bot.editMessageText(newMd, { 
                chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
                reply_markup: query.message.reply_markup
            });
        }
        return bot.answerCallbackQuery(query.id, { text: "Você foi adicionado ao grupo!" });
    }

    // TRANSFERÊNCIA DE UNIDADE FINAL
    if (callbackData.startsWith('uni_')) {
        if (callbackData === 'uni_cancel') {
            bot.editMessageText("🤖 *[K.A.I.O.]*: Tudo bem, mantivemos sua equipe atual. O que mais posso fazer por você?", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
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
                    avisoReserva = `\n\n⚠️ *NOTA:* A vaga principal no ${unidadeAlvo} já está ocupada por alguém com maior sinergia. Você ficará como *Reserva* até subir sua pontuação.`;
                }
            }

            await supabase.from('players').update({ unit: unidadeAlvo }).eq('riot_id', player.riot_id);
            
            let msgLore = '';
            if (unidadeAlvo === 'ALPHA') {
                msgLore = UI.kaio("NOVA EQUIPE") + `\n\nVocê agora faz parte do Esquadrão *ALPHA*. Sua missão é manter o alto nível.`;
            } else if (unidadeAlvo === 'OMEGA') {
                msgLore = UI.kaio("NOVA EQUIPE") + `\n\nVocê agora está no Esquadrão *ÔMEGA*. Foco total na evolução tática.`;
            } else {
                msgLore = UI.kaio("NOVA EQUIPE") + `\n\nVocê agora é *WINGMAN*. Pronto para entrar quando o time precisar.`;
            }

            bot.sendMessage(chatId, msgLore + avisoReserva + UI.footer(), { parse_mode: 'Markdown' });
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        } catch (err) {
            console.error("Erro ao processar transferência de unidade:", err);
            bot.answerCallbackQuery(query.id, { text: "Houve um erro técnico. Tente novamente.", show_alert: true });
        }
        return;
    }

    // INTERAÇÃO: /CONVOCAR (CVX)
    if (callbackData.startsWith('cvc_')) {
        if (callbackData === 'cvc_cancel') {
            bot.editMessageText("🤖 *[K.A.I.O.]*: Cancelado. Estou por aqui se precisar de outra coisa.", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            return bot.answerCallbackQuery(query.id);
        }
        const partes = callbackData.split('_');
        const action = partes[1];
        const commanderName = partes[2];
        
        if (action === 'no') {
            exec_convocar(chatId, commanderName, null);
            bot.editMessageText("🤖 *[K.A.I.O.]*: Iniciando chamada pública para o time.", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        } else if (action === 'yes') {
            bot.sendMessage(chatId, "🤖 *[K.A.I.O.]*: Perfeito, digite o código do grupo (Party Code) agora:", {
                reply_markup: { force_reply: true }
            }).then(sent => {
                bot.onReplyToMessage(chatId, sent.message_id, (msg) => {
                    exec_convocar(chatId, commanderName, msg.text);
                });
            });
            bot.editMessageText("🤖 *[K.A.I.O.]*: Aguardando seu código...", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        }
        bot.answerCallbackQuery(query.id);
        return;
    }
});

// --- COMANDO /START ---
bot.onText(/^\/start(?:@[\w_]+)?(?:\s+(.*))?/, async (msg) => {
    if (!msg.from) return;
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    if (!supabase) {
        return bot.sendMessage(chatId, UI.kaio("ERRO DE SISTEMA") + "\n\nO banco de dados não está conectado. Verifique as variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_KEY no Render.", { parse_mode: 'Markdown' });
    }

    try {
        const { data: existingUser, error: dbError } = await findPlayerByTelegramId(telegramId, 'riot_id');

        if (dbError) {
            console.error('❌ [ERRO DB] Start Query:', dbError.message);
            return bot.sendMessage(chatId, `⚠️ *[K.A.I.O.]*: Erro ao acessar o banco de dados.\n\nDetalhes: \`${dbError.message}\``, { parse_mode: 'Markdown' });
        }

        const isLinked = existingUser && existingUser.length > 0;

        if (isLinked) {
            const nick = existingUser[0].riot_id.split('#')[0];
            const returnMsg = UI.kaio("BEM-VINDO DE VOLTA") + `\n\n` +
                `Olá, *${escapeMarkdown(nick)}*! É bom te ver aqui novamente.\n\n` +
                `Como posso te ajudar hoje?\n\n` +
                `🎮 \`/convocar\` — Chamar seus amigos pra jogar\n` +
                `📊 \`/perfil\` — Ver seu status e evolução\n` +
                `🏆 \`/ranking\` — Ver os melhores do grupo\n` +
                `🔍 \`/analisar\` — Pedir análise de uma partida\n\n` +
                UI.info("Dica: Use /como_funciona para entender as métricas táticas.") +
                UI.footer();
            return bot.sendMessage(chatId, returnMsg, { parse_mode: 'Markdown' });
        }

        const welcomeMsg = UI.kaio("OLÁ, RECRUTA!") + `\n\n` +
            `Eu sou o *K.A.I.O.*, mentor tático do Protocolo V. Meu objetivo é organizar o time e acompanhar sua evolução no Valorant.\n\n` +
            `Para entrar no sistema, só preciso de um comando:\n\n` +
            `📍 *PASSO 1: CONECTAR*\n` +
            `Envie seu Riot ID para eu te cadastrar:\n` +
            `   \`/vincular SeuNick#TAG\`\n\n` +
            `📍 *PASSO 2: JOGAR EM GRUPO*\n` +
            `Use \`/convocar\` para avisar o time que você quer jogar agora.\n\n` +
            `📍 *PASSO 3: ACOMPANHAR*\n` +
            `Veja sua evolução, rank e análises táticas em:\n` +
            `🔗 [protocolov.com](https://protocolov.com)\n\n` +
            UI.info("Missão inicial: jogue 1 partida em squad para sair do DEPÓSITO DE TORRETAS.") +
            UI.footer();
        bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch (e) {
        console.error('Erro no /start:', e.message);
        bot.sendMessage(chatId, "❌ Houve uma falha ao processar o início. Tente novamente em breve.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /VINCULAR ---
bot.onText(/^\/vincular(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (!msg.from) return;
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const riotId = match[1] ? match[1].trim() : null;

    if (!supabase) {
        return bot.sendMessage(chatId, UI.kaio("ERRO DE SISTEMA") + "\n\nO banco de dados não está conectado. Configure as variáveis de ambiente.", { parse_mode: 'Markdown' });
    }

    if (!riotId) {
        return bot.sendMessage(chatId,
            UI.kaio("CONECTAR CONTA") + "\n\n" +
            `Para que eu possa sincronizar suas estatísticas, preciso do seu Nick e Tag do Valorant.\n\n` +
            `Digite o comando assim: \`/vincular Nick#TAG\`\n` +
            `Exemplo: \`/vincular Teemo#BR1\`\n\n` +
            UI.info("Importante: Use exatamente o mesmo nick que você cadastrou no site."),
            { parse_mode: 'Markdown' });
    }

    try {
        const { data: players } = await supabase.from('players').select('*').ilike('riot_id', `%${riotId}%`).limit(1);

        if (!players || players.length === 0) {
            // Agente não está no banco — tentar cadastrar via HenrikDev
            bot.sendMessage(chatId,
                UI.kaio("VERIFICANDO IDENTIDADE") + `\n\n` +
                `Agente *${escapeMarkdown(riotId)}* não está nos registros.\n` +
                `Consultando os servidores da Riot para validar sua identidade...`,
                { parse_mode: 'Markdown' });

            const [name, tag] = riotId.split('#');
            let accountData = null;
            try {
                const verifyRes = await fetch(
                    `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
                    { headers: { 'Authorization': process.env.HENRIK_API_KEY } }
                );
                if (verifyRes.status === 200) {
                    const json = await verifyRes.json();
                    accountData = json.data;
                } else if (verifyRes.status === 404) {
                    return bot.sendMessage(chatId,
                        `❌ *Nick não encontrado na Riot.*\n\n` +
                        `Verifique se "${escapeMarkdown(riotId)}" está correto (Ex: \`Jett#BR1\`).`,
                        { parse_mode: 'Markdown' });
                }
            } catch (_) { /* prossegue mesmo sem validação */ }

            const { error: insertErr } = await supabase.from('players').insert([{
                riot_id: riotId,
                role_raw: 'Flex',
                unit: 'UNIDADE DE APOIO',
                current_rank: accountData?.currenttierpatched || 'Processando...',
                level: accountData?.account_level || null,
                card_url: accountData?.card?.small || null,
                telegram_id: telegramId,
                synergy_score: 0
            }]);

            if (insertErr) {
                if (insertErr.code === '23505') {
                    return bot.sendMessage(chatId, `⚠️ Este Riot ID já existe no sistema. Tente \`/vincular\` novamente.`, { parse_mode: 'Markdown' });
                }
                return bot.sendMessage(chatId, `❌ Erro ao criar cadastro: \`${insertErr.message}\``, { parse_mode: 'Markdown' });
            }

            return bot.sendMessage(chatId,
                UI.kaio("RECRUTAMENTO APROVADO!") + `\n\n` +
                `*${escapeMarkdown(name)}*, você foi alistado e já está conectado ao sistema.\n\n` +
                `Seus dados de partida serão sincronizados automaticamente. Enquanto isso:\n\n` +
                `📊 \`/perfil\` — Ver seu status\n` +
                `🏆 \`/ranking\` — Ver os melhores do grupo\n` +
                `🎮 \`/convocar\` — Chamar o time para jogar\n\n` +
                UI.info("Missão inicial: jogue 1 partida em squad para sair do DEPÓSITO DE TORRETAS.") +
                UI.footer(),
                { parse_mode: 'Markdown' });
        }

        const player = players[0];
        if (player.telegram_id && player.telegram_id !== telegramId) {
            return bot.sendMessage(chatId, `⚠️ Este nick já está vinculado a outra pessoa. Caso seja você, peça ajuda no grupo para resetar o vínculo.`, { parse_mode: 'Markdown' });
        }

        await supabase.from('players').update({ telegram_id: telegramId }).eq('riot_id', player.riot_id);

        const nick = player.riot_id.split('#')[0];
        bot.sendMessage(chatId,
            UI.kaio("VÍNCULO ESTABELECIDO!") + `\n\n` +
            `Excelente, *${escapeMarkdown(nick)}*! Agora estamos conectados.\n\n` +
            `Eu vou te notificar por aqui sempre que:\n` +
            `• Uma nova análise de partida ficar pronta\n` +
            `• Seu time te chamar para uma partida\n` +
            `• Você subir (ou descer) de Tier de performance\n\n` +
            `Experimente ver seu perfil agora:\n` +
            `\`/perfil\`` +
            UI.footer(), { parse_mode: 'Markdown' });

    } catch (err) {
        bot.sendMessage(chatId, "❌ Houve uma falha na conexão. Tente novamente em breve.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /UNIDADE ---
bot.onText(/^\/unidade(?:@[\w_]+)?(?:\s+(\w+))?/, async (msg, match) => {
    if (!msg.from) return;
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const unidade = match[1] ? match[1].toUpperCase() : null;
    const validas = ['ALPHA', 'OMEGA', 'WINGMAN'];

    const { data: userRecord } = await findPlayerByTelegramId(telegramId, '*');

    if (!userRecord || userRecord.length === 0) {
        return bot.sendMessage(chatId, `Você precisa conectar sua conta primeiro para gerenciar sua equipe. Use: \`/vincular\``, { parse_mode: 'Markdown' });
    }

    const player = userRecord[0];
    const nick = escapeMarkdown(player.riot_id.split('#')[0]);

    if (!unidade) {
        return bot.sendMessage(chatId,
            UI.kaio("GERENCIAR EQUIPE") + `\n\n` +
            `*${nick}*, o Protocolo V é dividido em três níveis. Para qual você deseja solicitar transferência?\n\n` +
            `🔴 *Alpha* (Elite) — Foco em alto desempenho e vitórias.\n` +
            `🔵 *Omega* (Evolução) — Foco em aprendizado e subida de elo.\n` +
            `🛠️ *Wingman* (Reserva) — Jogadores eventuais ou em teste.\n\n` +
            UI.info("Lembre-se: As vagas nos esquadrões principais dependem da sua Sinergia."), {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔴 Solicitar Alpha", callback_data: `uni_ALPHA_${player.riot_id}` }],
                    [{ text: "🔵 Solicitar Omega", callback_data: `uni_OMEGA_${player.riot_id}` }],
                    [{ text: "🛠️ Ser Reserva (Wingman)", callback_data: `uni_WINGMAN_${player.riot_id}` }],
                    [{ text: "Manter Equipe Atual", callback_data: "uni_cancel" }]
                ]
            }
        });
    }

    if (!validas.includes(unidade)) return bot.sendMessage(chatId, `Equipe inválida. Escolha entre: ALPHA, OMEGA ou WINGMAN.`, { parse_mode: 'Markdown' });

    try {
        let aviso = "";
        if (unidade !== 'WINGMAN') {
            const { data: ocupante } = await supabase.from('players')
                .select('synergy_score').eq('unit', unidade).eq('role_raw', player.role_raw).neq('riot_id', player.riot_id)
                .order('synergy_score', { ascending: false }).limit(1);

            if (ocupante && ocupante.length > 0 && ocupante[0].synergy_score > player.synergy_score) {
                aviso = `\n\nComo já há um titular com mais sinergia nessa função, você entrará como *reserva* do esquadrão até sua pontuação subir.`;
            }
        }

        await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);

        const nomes = { 'ALPHA': 'Alpha', 'OMEGA': 'Omega', 'WINGMAN': 'Wingman (Reserva)' };
        bot.sendMessage(chatId,
            UI.kaio("SOLICITAÇÃO ACEITA") + `\n\n` +
            `*${nick}*, você foi movido para o esquadrão *${nomes[unidade]}*.${aviso}` +
            UI.footer(), { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, "❌ Ocorreu um erro técnico na transferência.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /RANKING ---
bot.onText(/^\/ranking(?:@[\w_]+)?(?:\s+|$)/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const { data, error } = await supabase.from('players').select('riot_id, synergy_score, unit').order('synergy_score', { ascending: false }).limit(10);
        if (error) throw error;

        let rankMsg = UI.kaio("SISTEMA DE SINERGIA") + `\n\n` +
            `O ranking abaixo mostra quem mais joga e contribui para o time. Jogar em grupo é o segredo para subir aqui.\n\n`;
        data.forEach((p, i) => {
            const pos = i + 1;
            const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `\`${String(pos).padStart(2, ' ')}.\``;
            const pts = p.synergy_score || 0;
            const nick = p.riot_id.split('#')[0];
            const team = p.unit ? ` _(${p.unit})_` : '';
            rankMsg += `${medal} *${escapeMarkdown(nick)}* — ${pts} pts${team}\n`;
        });
        rankMsg += `\n` + UI.info("Quer ganhar mais pontos? Chame o time com /convocar") + UI.footer();
        bot.sendMessage(chatId, rankMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('❌ [RANKING]', err.message);
        bot.sendMessage(chatId, "❌ Não consegui acessar os dados do ranking agora.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /PERFIL ---
bot.onText(/^\/perfil(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (!msg.from) return;
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const argument = match[1] ? match[1].trim() : null;

    let targetNick = argument;

    if (!targetNick) {
        const { data: self } = await findPlayerByTelegramId(telegramId, 'riot_id');
        if (self && self.length > 0) {
            targetNick = self[0].riot_id.split('#')[0];
        } else {
            return bot.sendMessage(chatId,
                UI.kaio("VER PERFIL") + `\n\n` +
                `Para ver o seu próprio perfil, conecte sua conta com \`/vincular\`.\n\n` +
                `Para ver o perfil de outro membro, use: \`/perfil NomeDoJogador\``,
                { parse_mode: 'Markdown' });
        }
    }

    try {
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `%${targetNick}%`).limit(1);
        if (!data || data.length === 0) return bot.sendMessage(chatId, `❌ Jogador não encontrado. Verifique se o nick está correto.`, { parse_mode: 'Markdown' });

        const p = data[0];
        const nick = p.riot_id.split('#')[0];

        // Buscar última performance index no Oráculo
        let perfIndex = null;
        if (oraculoExt) {
            const { data: lastA } = await oraculoExt.from('match_analysis_queue')
                .select('metadata')
                .eq('agente_tag', p.riot_id)
                .eq('status', 'completed')
                .order('processed_at', { ascending: false })
                .limit(1);

            if (lastA && lastA.length > 0 && lastA[0].metadata?.analysis?.performance_index) {
                perfIndex = lastA[0].metadata.analysis.performance_index;
            }
        }

        let tierText = "Aguardando Análise";
        if (perfIndex) {
            if (perfIndex >= 115) tierText = `🔴 *Alpha Tier* (${perfIndex})`;
            else if (perfIndex >= 95) tierText = `🔵 *Omega Tier* (${perfIndex})`;
            else tierText = `⚠️ *Camada de Suporte* (${perfIndex})`;
        }

        const msgPerfil = UI.kaio("FICHA TÁTICA") + `\n\n` +
            `👤 *${escapeMarkdown(nick)}*\n` +
            `🎖️ Elo: \`${p.current_rank || 'N/A'}\`\n` +
            `🏆 Esquadrão: \`${p.unit || 'A definir'}\`\n` +
            `🛡️ Função: \`${p.role_raw || 'A definir'}\`\n\n` +
            `📊 *Nível de Habilidade (PI):* ${tierText}\n` +
            `🤝 *Coeficiente de Sinergia:* ${p.synergy_score || 0} pts\n\n` +
            `🔗 [Ver Estatísticas Detalhadas na Web](https://protocolov.com/perfil.html?player=${encodeURIComponent(p.riot_id)})` +
            UI.footer();

        bot.sendMessage(chatId, msgPerfil, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Houve um erro ao gerar a ficha técnica.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /ANALISAR (Integração Oráculo V) ---
bot.onText(/^\/analisar(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (!msg.from) return;
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const matchId = match[1] ? match[1].trim() : null;

    try {
        const { data: user } = await findPlayerByTelegramId(telegramId, 'riot_id');
        if (!user || user.length === 0) {
            return bot.sendMessage(chatId, `Você precisa conectar sua conta primeiro para pedir análises. Use: \`/vincular\``, { parse_mode: 'Markdown' });
        }

        if (!matchId) return bot.sendMessage(chatId,
            UI.kaio("ANALISAR PARTIDA") + `\n\n` +
            `Para que eu possa analisar uma partida, preciso do ID dela (o código UUID).\n\n` +
            `📍 *Como conseguir o ID:*\n` +
            `Acesse seu histórico no site e clique no botão 'Copiar ID' da partida desejada.\n\n` +
            `Exemplo: \`/analisar 5525faf5-034e-4caf-b142-9d9bc8a3e897\``,
            { parse_mode: 'Markdown' });

        if (!oraculoExt) return bot.sendMessage(chatId, "⚠️ O sistema de análise está passando por manutenção. Tente novamente em alguns minutos.", { parse_mode: 'Markdown' });

        const cleanMatchId = matchId.trim().toLowerCase();

        const { data: results } = await oraculoExt.from('match_analysis_queue')
            .select('*')
            .eq('match_id', cleanMatchId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false });

        if (results && results.length > 0) {
            const agentResults = results.filter(r => r.agente_tag !== 'AUTO' && r.metadata?.analysis);
            
            if (agentResults.length > 0) {
                let msg = UI.oraculo("ANÁLISE ENCONTRADA") + `\n\nEsta partida já foi processada. Aqui estão os destaques:\n`;
                for (const r of agentResults) {
                    const analysis = r.metadata.analysis;
                    const adr = typeof analysis.adr === 'number' ? Math.round(analysis.adr) : analysis.adr;
                    const kd = typeof analysis.kd === 'number' ? analysis.kd.toFixed(2) : (analysis.target_kd ?? analysis.kd);
                    
                    msg += `\n👤 *${r.agente_tag.split('#')[0].toUpperCase()}* — PI: \`${analysis.performance_index}/100\`\n` +
                           `   \`ADR: ${adr} | K/D: ${kd}\`\n` +
                           `   [VER RELATÓRIO COMPLETO](https://protocolov.com/analise.html?player=${encodeURIComponent(r.agente_tag)}&matchId=${cleanMatchId})\n`;
                }
                msg += UI.footer();
                return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
            }
        }

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
            UI.kaio("ANÁLISE SOLICITADA") + `\n\n` +
            `Já mandei os dados para o Oráculo-V. Ele está processando sua performance agora.\n\n` +
            `Isso costuma levar de 1 a 3 minutos. Assim que terminar, eu te aviso por aqui!` +
            UI.footer(), { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "❌ Não consegui processar o pedido de análise agora. Confira se o ID está correto.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /CONVOCAR ---
bot.onText(/^\/convocar(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (!msg.from) return;
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    const rawMatch = match[1] ? match[1].trim() : null;

    try {
        const { data: user } = await findPlayerByTelegramId(telegramId, 'riot_id');
        if (!user || user.length === 0) {
            return bot.sendMessage(chatId, `Você precisa conectar sua conta primeiro para chamar o time. Use: \`/vincular\``, { parse_mode: 'Markdown' });
        }

        const commanderName = user[0].riot_id.split('#')[0];
        const now = Date.now();

        const { data: activeCalls } = await supabase.from('active_calls').select('*').gt('expires_at', now).order('expires_at', { ascending: false }).limit(1);
        if (activeCalls && activeCalls.length > 0) {
            const call = activeCalls[0];
            if (call.commander === commanderName) {
                return bot.sendMessage(chatId, `Você já tem uma convocação aberta para o código: *${call.party_code}*`, { parse_mode: 'Markdown' });
            } else {
                return bot.sendMessage(chatId, `O jogador *${escapeMarkdown(call.commander)}* já está montando um grupo agora. Vamos com ele?`, { parse_mode: 'Markdown' });
            }
        }

        if (rawMatch && rawMatch.length > 0) {
            return exec_convocar(chatId, commanderName, rawMatch);
        }

        bot.sendMessage(chatId,
            UI.kaio("CHAMAR TIME") + `\n\n` +
            `*${escapeMarkdown(commanderName)}*, bora fechar o grupo? Você já tem um código de lobby do Valorant?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "Sim, tenho o código", callback_data: `cvc_yes_${commanderName}` }],
                    [{ text: "Não, chamar mesmo assim", callback_data: `cvc_no_${commanderName}` }],
                    [{ text: "Cancelar", callback_data: "cvc_cancel" }]
                ]
            }
        });

    } catch (err) {
        bot.sendMessage(chatId, "❌ Houve um erro ao tentar criar a convocação.", { parse_mode: 'Markdown' });
    }
});

// FUNÇÃO AUXILIAR PARA EXECUTAR A CONVOCAÇÃO
async function exec_convocar(chatId, commanderName, codigoRaw) {
    const matchAlfanumerico = codigoRaw ? codigoRaw.match(/[a-zA-Z0-9]+/) : null;
    const codigoLobby = matchAlfanumerico ? matchAlfanumerico[0] : "Chamar no PV para convite";
    const now = Date.now();
    const expiresAt = now + (30 * 60 * 1000);

    try {
        const { data: insertedCall } = await supabase.from('active_calls').insert([{
            commander: commanderName,
            party_code: codigoLobby,
            expires_at: expiresAt
        }]).select();

        const callId = insertedCall && insertedCall.length > 0 ? insertedCall[0].id : 'global';
        const alertMsg = UI.alert("TIME FORMANDO") + 
            `\n\nO jogador *${escapeMarkdown(commanderName)}* quer jogar agora e precisa de reforços!\n\n` +
            `📍 Código do Lobby: \`${codigoLobby}\`\n\n` +
            `Vagas preenchidas: 1/5\n- ${escapeMarkdown(commanderName)}`;
        
        bot.sendMessage(chatId, alertMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "🟢 Estou Pronto / Entrar", callback_data: `lfg_join_${callId}` }]]
            }
        });
    } catch (err) {
        bot.sendMessage(chatId, UI.kaio("ERRO!") + "\n\nNão consegui ativar o sinalizador de grupo.", { parse_mode: 'Markdown' });
    }
}

// --- COMANDO: /papo (CHAT COM O ORÁCULO-V) ---
bot.onText(/^\/papo (.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userText = match[1];

    try {
        const loadingMsg = await bot.sendMessage(chatId, UI.kaio("SESSÃO TÁTICA ATIVA") + "\n🔌 Conectando à rede neural... Aguarde.", { parse_mode: 'Markdown' });

        // 1. Buscar contexto do jogador
        const { data: playerArr } = await findPlayerByTelegramId(msg.from.id, '*');
        const player = playerArr && playerArr.length > 0 ? playerArr[0] : null;

        if (!player) {
            return bot.editMessageText(UI.kaio("ERRO DE IDENTIDADE") + "\n\nVocê precisa estar registrado para usar o papo tático. Use `/vincular RiotID#Tag` primeiro.", {
                chat_id: chatId,
                message_id: loadingMsg.message_id,
                parse_mode: 'Markdown'
            });
        }

        // 2. Buscar último insight para contexto
        const { data: lastInsight } = await supabase
            .from('ai_insights')
            .select('impact_score, classification, analysis_report')
            .eq('player_id', player.riot_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // 3. Chamar API do Oráculo (com Timeout de 60s)
        const oraculoUrl = process.env.ORACULO_API_URL || 'http://localhost:3001';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const context = {
            player_id: player.riot_id,
            agent: lastInsight?.analysis_report?.agent || player.main_agent || 'Combatente',
            impact_score: lastInsight?.impact_score || 0,
            rank: lastInsight?.classification || 'Em Avaliação'
        };

        const response = await fetch(`${oraculoUrl}/api/chat`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': process.env.ORACULO_API_KEY || ''
            },
            signal: controller.signal,
            body: JSON.stringify({
                messages: [{ role: 'user', content: userText }],
                context
            })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
        }

        const data = await response.json();

        bot.editMessageText(UI.kaio("RESPOSTA DO MENTOR") + `\n\n${data.response}` + UI.footer(), {
            chat_id: chatId,
            message_id: loadingMsg.message_id,
            parse_mode: 'Markdown'
        });

    } catch (err) {
        console.error('❌ Erro no comando /papo:', err.message);
        bot.sendMessage(chatId, UI.kaio("FALHA DE COMUNICAÇÃO") + "\n\nO motor de análise está offline ou instável no momento." + UI.footer(), { parse_mode: 'Markdown' });
    }
});

bot.onText(/^\/papo$/, (msg) => {
    bot.sendMessage(msg.chat.id, UI.kaio("DÚVIDA TÁTICA?") + "\n\nUse `/papo [sua dúvida]` para conversar com o Oráculo sobre suas partidas ou sobre o meta do Valorant.\n\n*Exemplo:* `/papo Por que meu impacto foi baixo na última partida?`", { parse_mode: 'Markdown' });
});

// --- NOVO: COMANDO /COMO_FUNCIONA ---
bot.onText(/^\/como_funciona(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = UI.kaio("SISTEMA DE MÉTRICAS") + `\n\n` +
        `Para garantir que o time evolua, eu uso inteligência de dados para medir seu desempenho real. Entenda o que é cada coisa:\n\n` +
        `📈 *Performance Index (PI)*\n` +
        `É a sua nota geral (0 a 120+). Ela leva em conta não só kills, mas quanto impacto suas habilidades e posicionamento tiveram na partida.\n\n` +
        `🎯 *ADR & KAST*\n` +
        `_ADR_: Dano útil por rodada. _KAST_: Porcentagem de rodadas onde você ajudou (Kill, Assist, Survive ou Traded).\n\n` +
        `📉 *Holt-Winters*\n` +
        `É o algoritmo que uso para prever sua evolução. Ele identifica se você está em uma curva de crescimento ou se precisa ajustar algo no treino.\n\n` +
        `🏆 *Tiers de Desempenho*\n` +
        `• *Alpha Tier* (115+): Nível semi-pro/convergente.\n` +
        `• *Omega Tier* (95+): Desempenho sólido e consistente.\n` +
        `• *Support/Depósito*: Fase de aprendizado e suporte.\n\n` +
        `🔗 Para ver o guia visual completo, acesse:\n` +
        `[Guia do Recruta - Protocolo V](https://protocolov.com/briefing.html)` +
        UI.footer();
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
});

// --- COMANDO /AJUDA ---
bot.onText(/^\/ajuda(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = UI.kaio("MANUAL DO MENTOR") + `\n\n` +
        `Aqui estão os principais comandos para organizar sua jornada:\n\n` +
        `✅ \`/vincular\` — Conectar sua conta do jogo.\n` +
        `🎮 \`/convocar\` — Abrir chamada pra fechar um grupo.\n` +
        `🔄 \`/unidade\` — Solicitar troca de esquadrão.\n` +
        `📊 \`/perfil\` — Ver seu status e tier atual.\n` +
        `🔍 \`/analisar\` — Pedir relatório de uma partida.\n` +
        `💬 \`/papo\` — Conversar com o mentor Oráculo-V.\n` +
        `🏆 \`/ranking\` — Ver o ranking de sinergia.\n` +
        `📚 \`/como_funciona\` — Entender as métricas e regras.\n` +
        `🌐 \`/site\` — Acessar a plataforma web.\n\n` +
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
    if (!msg.from) return;
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
    if (!msg.from || msg.from.id !== ADMIN_ID) return; 

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
    if (!msg.from || msg.from.id !== ADMIN_ID) return; 

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
    if (!msg.from || msg.from.id !== ADMIN_ID) return; 

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
    if (!msg.from || msg.from.id !== ADMIN_ID) return; 

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
    if (!msg.from || msg.from.id !== ADMIN_ID) return;

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
} else {
    console.warn('⚠️ [WARNING] Bot listeners not registered: Bot instance is missing.');
}

// --- SERVIDOR EXPRESS (Camuflado) ---
const app = express();

// Rota de Monitoramento para evitar o "sono" do Render (Keep-alive)
app.get('/vanguard-health', (req, res) => {
    console.log('📡 [RADAR] Vitality pulse received.');
    res.json({ status: 'online', service: 'protocolo-v', timestamp: new Date().toISOString() });
});

// Render Health Check default route
app.get('/', (req, res) => {
    res.status(200).json({ status: 'running', bot_info: token ? 'connected' : 'standby' });
});

if (bot && process.env.WEBHOOK_URL) {
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
    // Jitter tático: Atraso aleatório inicial para evitar concorrência com tarefas agendadas em picos de 30min
    const jitter = Math.floor(Math.random() * 60000);
    console.log(`🧠 [ORÁCULO-V] Sincronizando pulso tático... (Iniciando em ${Math.ceil(jitter/1000)}s)`);
    await new Promise(r => setTimeout(r, jitter));

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
                            if (chatIdToNotify && bot) {
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
                        if (chatIdToNotify && bot) {
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
