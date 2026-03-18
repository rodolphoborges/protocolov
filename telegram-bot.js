require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- CONFIGURAÇÃO ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_ID = parseInt(process.env.ADMIN_TELEGRAM_ID, 10); // Lendo do arquivo .env

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
        if (!userRef || userRef.length === 0) return bot.answerCallbackQuery(query.id, { text: "Rádio não vinculado. Usa /vincular", show_alert: true });
        
        const joinerName = userRef[0].riot_id.split('#')[0];
        const rawText = query.message.text;
        
        if (rawText.includes(`- ${joinerName}`)) {
            return bot.answerCallbackQuery(query.id, { text: "Já estás neste esquadrão." });
        }
        
        const lines = rawText.split('\n');
        const listAgents = lines.filter(l => l.trim().startsWith('- '));
        if (listAgents.length >= 5) {
            return bot.answerCallbackQuery(query.id, { text: "Esquadrão já está cheio (5/5).", show_alert: true });
        }

        listAgents.push(`- ${joinerName}`);
        
        let newMd = `🚨 *[SINALIZADOR ORBITAL ZONA QUENTE]*\n\n` +
                    `> 📡 *Reforços LFG detectados:*\n` +
                    `_Agentes confirmados no esquadrão:_ ${listAgents.length}/5\n` +
                    listAgents.map(a => escapeMarkdown(a)).join('\n');
        
        if (listAgents.length >= 5) {
            bot.editMessageText(newMd + "\n\n✅ *[ESQUADRÃO FECHADO]* - Encontrem-se na base.", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        } else {
            bot.editMessageText(newMd, { 
                chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
                reply_markup: query.message.reply_markup
            });
        }
        return bot.answerCallbackQuery(query.id, { text: "O teu sinal foi emitido!" });
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
                    avisoReserva = `\n\n⚠️ *NOTA:* A vaga de *${player.role_raw}* na ${unidadeAlvo} já está ocupada por um veterano. Ficarás como *Reserva* até subires a tua Sinergia.`;
                }
            }

            await supabase.from('players').update({ unit: unidadeAlvo }).eq('riot_id', player.riot_id);
            
            let msgLore = '';
            if (unidadeAlvo === 'ALPHA') {
                msgLore = `> 🧪 *[ALPHA] Viper:* "Transferência autorizada. Bem-vindo à elite, ${safeNick}. Mantenha o silêncio e seja letal."`;
            } else if (unidadeAlvo === 'OMEGA') {
                msgLore = `> 🛰️ *[ÔMEGA] Brimstone:* "Excelente. A Unidade Ômega conta com a sua mira, ${safeNick}. Prepare-se."`;
            } else {
                msgLore = `> 🛹 *[WINGMAN] Gekko:* "Aí sim, ${safeNick}! Wingman tá felizão. Fica na reserva tática com a gente."`;
            }

            bot.sendMessage(chatId, `🔄 *[SISTEMA]* Atualização de patente processada.\n\n${msgLore}${avisoReserva}`, { parse_mode: 'Markdown' });
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
    const mensagem = `💻 *[TERMINAL VANGUARD: ONLINE]*\n_Acesso concedido. Bem-vindo à rede Protocolo V._\n\n` +
    `> *DIRETÓRIO DE JANELAS:*\n` +
    `📡 \`/convocar [cod]\` - Aciona radar LFG de reforços\n` +
    `🔄 \`/unidade\` - Solicita transferência de patente\n` +
    `📂 \`/perfil [nick]\` - Interceta dossiê de agente\n` +
    `🏆 \`/ranking\` - Classificação de Sinergia\n` +
    `🌐 \`/site\` - Intranet Oficial\n` +
    `⚙️ \`/ajuda\` - Manual de Comandos`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
});

// --- COMANDO /VINCULAR (NOVO) ---
bot.onText(/^\/vincular(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;
    const riotId = match[1] ? match[1].trim() : null;

    if (!riotId) {
        return bot.sendMessage(chatId, "> 🤖 *[SISTEMA] Killjoy:* Informa o teu Riot ID para vincular o rádio. (Ex: `/vincular OUSADIA#013`)", { parse_mode: 'Markdown' });
    }

    try {
        const { data: players } = await supabase.from('players').select('*').ilike('riot_id', `%${riotId}%`).limit(1);
        
        if (!players || players.length === 0) {
            return bot.sendMessage(chatId, "> 🛰️ *Brimstone:* ID não encontrado no banco de dados. Já fizeste o alistamento no site?", { parse_mode: 'Markdown' });
        }

        const player = players[0];
        if (player.telegram_id && player.telegram_id !== telegramId) {
            return bot.sendMessage(chatId, "> 👁️ *Cypher:* Recusado. Este Riot ID já está sob a vigilância de outro rádio.", { parse_mode: 'Markdown' });
        }

        await supabase.from('players').update({ telegram_id: telegramId }).eq('riot_id', player.riot_id);
        bot.sendMessage(chatId, `✅ *[AUTENTICAÇÃO ACEITE]*\n> Identidade confirmada: *${escapeMarkdown(player.riot_id)}*.\n_A partir de agora, os teus comandos usarão esta credencial._`, { parse_mode: 'Markdown' });

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
        return bot.sendMessage(chatId, `> 🤖 *[SISTEMA] Killjoy:* "Agente ${escapeMarkdown(player.riot_id.split('#')[0])}, para qual divisão desejas transferência?"`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🧪 Transferir para ALPHA", callback_data: `uni_ALPHA_${player.riot_id}` }],
                    [{ text: "🛰️ Transferir para ÔMEGA", callback_data: `uni_OMEGA_${player.riot_id}` }],
                    [{ text: "🛹 Voltar para WINGMAN", callback_data: `uni_WINGMAN_${player.riot_id}` }]
                ]
            }
        });
    }
    
    if (!validas.includes(unidade)) return bot.sendMessage(chatId, "> 🛰️ *Brimstone:* Código de Unidade inválido. Missão abortada.", { parse_mode: 'Markdown' });

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
        
        let rankMsg = `🏆 *[RELATÓRIO DE SINERGIA: TOP 10]*\n_> Extraindo banco de dados da Vanguard..._\n\n`;
        data.forEach((p, i) => {
            rankMsg += `\`[ ${String(i + 1).padStart(2, '0')} ]\` 💠 *${escapeMarkdown(p.riot_id.split('#')[0])}* ➔ ${p.synergy_score || 0} pts _(${p.unit || 'Reserva'})_\n`;
        });
        rankMsg += `\n_Para constar no relatório, feche esquadrões e reporte vitórias._`;
        bot.sendMessage(chatId, rankMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "> 🤖 *[ERRO]* Falha na conexão com o banco de dados da Vanguard.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /PERFIL ---
bot.onText(/^\/perfil(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argumentoRaw = match[1] ? match[1].trim() : null;
    const argumento = argumentoRaw ? argumentoRaw.replace(/[%_]/g, '') : null;

    if (!argumento || argumento.length < 3) return bot.sendMessage(chatId, "> 👁️ *Cypher:* Preciso de um alvo válido para investigar (mínimo 3 letras). Usa o formato: `/perfil Nick`.", { parse_mode: 'Markdown' });

    try {
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `%${argumento}%`).limit(1);
        if (!data || data.length === 0) return bot.sendMessage(chatId, "> 👁️ *Cypher:* O meu espião não encontrou registos deste agente na nossa rede.", { parse_mode: 'Markdown' });
        
        const p = data[0];
        const statusLobo = p.lone_wolf ? 'Positivo 🐺 (Intervenção tática pendente)' : 'Negativo (Opera em equipa)';
        const safeRank = p.current_rank && p.current_rank !== 'Processando...' ? p.current_rank : 'Pendente...';
        
        const msgPerfil = `📂 *[DOSSIÊ INTERCETADO]*\n` +
                          `_> Alvo: ${escapeMarkdown(p.riot_id)}_\n\n` +
                          `🛡️ *Designação:* ${p.unit || 'Desconhecida'}\n` +
                          `⚔️ *Classe Tática:* ${p.role_raw || 'Não Declarada'}\n` +
                          `🎖️ *Nível de Ameaça:* ${safeRank}\n\n` +
                          `*>> STATUS OPERACIONAL <<*\n` +
                          `🔹 *Sinergia:* \`${p.synergy_score || 0} pts\`\n` +
                          `🎯 *Mata-Mata:* \`${p.dm_score_total || p.dm_score || 0} pts\`\n` +
                          `⚠️ *Aviso de Lobo Solitário:* ${statusLobo}`;
        bot.sendMessage(chatId, msgPerfil, { parse_mode: 'Markdown' });
    } catch (err) {
        bot.sendMessage(chatId, "> 🤖 *Falha de Criptografia:* Impossível extrair o dossiê neste momento.", { parse_mode: 'Markdown' });
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

        const { data: insertedCall } = await supabase.from('active_calls').insert([{
            commander: commanderName,
            party_code: codigoLobby,
            expires_at: expiresAt
        }]).select();

        const callId = insertedCall && insertedCall.length > 0 ? insertedCall[0].id : 'global';

        const alertMsg = `🚨 *[SINALIZADOR ORBITAL ZONA QUENTE]*\n\n> 📡 *Reforços LFG detectados para:* \`${codigoLobby}\`\n_Agentes confirmados no esquadrão:_ 1/5\n- ${escapeMarkdown(commanderName)}`;
        
        bot.sendMessage(chatId, alertMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🟢 Aceitar Convocação", callback_data: `lfg_join_${callId}` }]
                ]
            }
        });

    } catch (err) {
        bot.sendMessage(chatId, "> 🤖 *Erro:* Falha ao acionar sinalizador.", { parse_mode: 'Markdown' });
    }
});

// --- COMANDO /AJUDA ---
bot.onText(/^\/ajuda(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = `💻 *[TERMINAL VANGUARD: MANUAL]*\n\n` +
        `_> Diretório de Comandos Analíticos:_\n` +
        `📡 \`/vincular [Nick#TAG]\` - Conecta teu dispositivo.\n` +
        `🚨 \`/convocar [código]\` - Marca LFG no site.\n` +
        `🔄 \`/unidade\` - Troca de esquadrão tático.\n` +
        `📂 \`/perfil [nick]\` - Extrai dossiê de agente.\n` +
        `🏆 \`/ranking\` - Mostra os líderes em Sinergia.\n` +
        `🌐 \`/site\` - URL da plataforma base.\n` +
        `⚙️ \`/ajuda\` - Atualiza esta janela.`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown' });
});

// --- COMANDO /SITE ---
bot.onText(/^\/site(?:@[\w_]+)?(?:\s+|$)/, (msg) => {
    const chatId = msg.chat.id;
    const mensagem = `🌐 *[INTRANET PROTOCOLO V]*\n\n> Acompanhe a movimentação furtiva dos esquadrões, logs de combate e line-up atual no nosso terminal web.\n\n🔗 *Acesso direto:* [ProtocoloV.com](https://protocolov.com)\n_> 🛰️ Brimstone aprova esta ligação._`;
    bot.sendMessage(chatId, mensagem, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// --- COMANDOS SECRETOS DE ADMINISTRAÇÃO (BRIMSTONE ONLY) ---
bot.onText(/^\/expurgar(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return; 

    const chatId = msg.chat.id;
    const riotId = match[1] ? match[1].trim() : null;
    if (!riotId) return bot.sendMessage(chatId, "> 🛰️ *Brimstone:* Forneça o Riot ID exato do alvo para expurgação.", { parse_mode: 'Markdown' });

    try {
        const { error } = await supabase.from('players').delete().ilike('riot_id', `%${riotId}%`);
        if (error) throw error;
        bot.sendMessage(chatId, `> 💥 *[EXPURGO CONFIRMADO]*\nO registo do agente *${escapeMarkdown(riotId)}* foi eliminado fisicamente dos servidores da Vanguard.`, { parse_mode: 'Markdown' });
    } catch(err) {
        bot.sendMessage(chatId, "> 🤖 *Erro:* A blindagem de dados resistiu ao expurgo.", { parse_mode: 'Markdown' });
    }
});

bot.onText(/^\/alerta_vermelho(?:@[\w_]+)?(?:\s+(.*))?/, async (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return; 

    const chatId = msg.chat.id;
    const mensagemAlert = match[1] ? match[1].trim() : null;
    if (!mensagemAlert) return bot.sendMessage(chatId, "> 🛰️ *Brimstone:* O canal de emergência precisa de uma mensagem para transmitir.", { parse_mode: 'Markdown' });

    try {
        const { data } = await supabase.from('players').select('telegram_id').not('telegram_id', 'is', null);
        let sentCount = 0;
        
        const avisoFinal = `🚨 *[ALERTA DE EMERGÊNCIA DA VANGUARD]* 🚨\n\n> 🛰️ *O Comandante Brimstone transmite em canal aberto:*\n_${escapeMarkdown(mensagemAlert)}_\n\n\`[Fim da Transmissão]\``;

        for (const player of data) {
            try {
                await bot.sendMessage(player.telegram_id, avisoFinal, { parse_mode: 'Markdown' });
                sentCount++;
            } catch (e) { /* user blocked the bot */ }
        }
        bot.sendMessage(chatId, `> 🛰️ *Brimstone:* Transmissão global concluída. ${sentCount} agentes receberam a mensagem nas suas frequências blindadas.`, { parse_mode: 'Markdown' });
    } catch(err) {
        bot.sendMessage(chatId, "> 🤖 *Erro na rede de transmissão global.*", { parse_mode: 'Markdown' });
    }
});

bot.onText(/^\/radar(?:@[\w_]+)?(?:\s+|$)/, async (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "> 🛰️ *Iniciando varredura orbital na infraestrutura HenrikDev...*", { parse_mode: 'Markdown' });
    try {
        const start = Date.now();
        // node-fetch genérico não nativo no v14, mas no v18 fetch é nativo. Assumimos Node 18 (nativo).
        const res = await fetch('https://api.henrikdev.xyz/valorant/v1/status/br');
        const ping = Date.now() - start;
        
        if (res.status === 200) {
            bot.sendMessage(chatId, `> 🟢 *[RADAR ONLINE]*\n_A Vanguard está a responder na frequência correta._\nLatência do satélite: \`${ping}ms\``, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, `> 🟡 *[RADAR INSTÁVEL]*\nA API retornou código \`${res.status}\`. O sinal está poluído.`, { parse_mode: 'Markdown' });
        }
    } catch (err) {
        bot.sendMessage(chatId, "> 🔴 *[RADAR DESLIGADO]*\nA infraestrutura externa está incontactável. A Vanguard está sob ataque.", { parse_mode: 'Markdown' });
    }
});

// --- SERVIDOR EXPRESS (Camuflado) ---
const app = express();
// Removemos a rota raiz "/" e criamos um endpoint que apenas o serviço de Uptime (ex: UptimeRobot) conhece
const HEALTH_SECRET = process.env.HEALTH_SECRET || 'protocolo-v-ping-123';

app.get(`/${HEALTH_SECRET}`, (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));

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
