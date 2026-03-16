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
    // Protege apenas os caracteres que realmente quebram o Markdown clássico
    return text.toString().replace(/[_*`\[\]]/g, '\\$&');
}

// --- LÓGICA DE BOTÕES (CALLBACK) ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    // --- RECRUTAMENTO / LOBBY ---
    if (callbackData.startsWith('sq_')) {
        let textoAtual = query.message.text;
        const partes = callbackData.split('_');
        const delayStr = partes[1];
        const expTime = parseInt(partes[2]);

        if (Date.now() > expTime) {
            bot.editMessageText("🔴 *[SISTEMA]* Janela de mobilização encerrada.", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            return bot.answerCallbackQuery(query.id);
        }

        if (textoAtual.includes(`- ${query.from.first_name}`)) {
            return bot.answerCallbackQuery(query.id, { text: "Você já está na lista de embarque, recruta!" });
        }

        textoAtual = textoAtual.replace('- (Aguardando resposta...)', '');
        if (delayStr === '0') {
            textoAtual = textoAtual.replace('🟢 Agentes a postos:', `🟢 Agentes a postos:\n- ${query.from.first_name}`);
        } else {
            textoAtual = textoAtual.replace('⏳ Em trânsito:', `⏳ Em trânsito:\n- ${query.from.first_name} (${delayStr} min)`);
        }

        textoAtual = textoAtual.replace('SINALIZADOR ORBITAL', '*SINALIZADOR ORBITAL*');
        textoAtual = textoAtual.replace('Comandante:', '*Comandante:*');
        textoAtual = textoAtual.replace('Missão:', '*Missão:*');
        textoAtual = textoAtual.replace('Ponto de Extração:', '*Ponto de Extração:*');
        textoAtual = textoAtual.replace('Agentes a postos:', '*Agentes a postos:*');
        textoAtual = textoAtual.replace('Em trânsito:', '*Em trânsito:*');

        const opts = {
            chat_id: chatId, message_id: messageId, parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🟢 Equipado e Pronto", callback_data: `sq_0_${expTime}` }, { text: "⏳ 5 min", callback_data: `sq_5_${expTime}` }],
                    [{ text: "⏳ 10 min", callback_data: `sq_10_${expTime}` }, { text: "⏳ 15 min", callback_data: `sq_15_${expTime}` }]
                ]
            }
        };

        bot.editMessageText(textoAtual, opts);
        bot.answerCallbackQuery(query.id);
    }

    // --- PERFIL DE AGENTE ---
    if (callbackData.startsWith('perfil_')) {
        const nickRaw = callbackData.replace('perfil_', '');
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `${nickRaw}%`).limit(1);
        if (data && data[0]) {
            const p = data[0];
            const safeNick = escapeMarkdown(p.riot_id);
            const msg = `💻 *[TERMINAL DA KILLJOY]*\n\n_"Dados extraídos com sucesso."_\n\n📂 *AGENTE:* ${safeNick}\n🏅 *Rank:* ${p.current_rank}\n🤝 *Sinergia:* ${p.synergy_score} pts\n🎯 *Treino:* ${p.dm_score || 0} pts\n🛡️ *Unidade:* ${p.unit}`;
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
        bot.answerCallbackQuery(query.id);
    }

    // --- SELEÇÃO INTERATIVA DE UNIDADE (PASSO 1) ---
    if (callbackData.startsWith('select_uni_')) {
        const unidade = callbackData.split('_')[2]; // ALPHA, OMEGA, WINGMAN
        
        // NOVO: .neq('unit', unidade) impede que agentes já alocados apareçam na lista
        const { data } = await supabase.from('players')
            .select('riot_id, current_rank')
            .neq('unit', unidade)
            .order('synergy_score', { ascending: false })
            .limit(30);

        if (!data || data.length === 0) {
            bot.editMessageText(`⚠️ *[SISTEMA]* Todos os agentes disponíveis já estão alocados na Unidade *${unidade}*.`, {
                chat_id: chatId, 
                message_id: messageId,
                parse_mode: 'Markdown'
            });
            return bot.answerCallbackQuery(query.id);
        }

        const botoesGrade = [];
        for (let i = 0; i < data.length; i += 2) {
            const linha = [];
            [data[i], data[i + 1]].forEach(p => {
                if (p) {
                    const rawNick = p.riot_id.split('#')[0];
                    const emoji = getRankEmoji(p.current_rank);
                    linha.push({ text: `${emoji} ${rawNick}`, callback_data: `uni_${unidade}_${rawNick}` });
                }
            });
            botoesGrade.push(linha);
        }
        
        bot.editMessageText(`🔄 *[SISTEMA]* Boa! Agora selecione na lista abaixo quem será transferido para a Unidade *${unidade}*:`, {
            chat_id: chatId, 
            message_id: messageId,
            parse_mode: 'Markdown', 
            reply_markup: { inline_keyboard: botoesGrade }
        });
        return bot.answerCallbackQuery(query.id);
    }

    // --- TRANSFERÊNCIA DE UNIDADE FINAL (PASSO 2) ---
    if (callbackData.startsWith('uni_')) {
        const partes = callbackData.split('_');
        const unidade = partes[1]; // ALPHA, OMEGA, WINGMAN
        const nickRaw = partes.slice(2).join('_');
        
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `${nickRaw}%`).limit(1);
        if (data && data[0]) {
            const player = data[0];
            await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);
            
            const safeNick = escapeMarkdown(player.riot_id);
            let msgLore = '';
            if (unidade === 'ALPHA') msgLore = `🐍 *Viper:* "Interessante... Transferência autorizada. Bem-vindo à Unidade Alpha, ${safeNick}. Seja letal, não cometa erros."`;
            else if (unidade === 'OMEGA') msgLore = `🔥 *Brimstone:* "Excelente escolha. A Unidade Ômega conta com a sua força, ${safeNick}. Mantenha a linha de frente segura."`;
            else msgLore = `🦎 *Gekko:* "Aí sim, ${safeNick}! Wingman tá felizão. Fica na reserva tática com a gente."`;

            bot.sendMessage(chatId, `🔄 *[PROTOCOLO DE TRANSFERÊNCIA]*\n\n${msgLore}`, { parse_mode: 'Markdown' });
            // Apaga os botões da mensagem anterior para evitar duplo clique
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        }
        bot.answerCallbackQuery(query.id);
    }
});

// --- COMANDOS TÁTICOS ---
bot.onText(/\/(start|ajuda|comandos)/, (msg) => {
    const texto = `🎙️ *[TRANSMISSÃO RECEBIDA]*\n\n🔥 *Brimstone na escuta.* Preste atenção, recruta. O Protocolo V exige disciplina e sinergia. Use os comandos abaixo para se comunicar com o terminal:\n\n` +
                `📢 /convocar - Chama agentes para o lobby\n` +
                `👤 /perfil - Inspeciona o dossiê de um agente\n` +
                `🏆 /ranking - Avaliação de desempenho das equipes\n` +
                `🎭 /unidade - Solicita transferência de Unidade Tática\n` +
                `🌐 /site - Acessa o QG Principal\n` +
                `❓ /ajuda - Repete esta transmissão`;
    bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown' });
});

bot.onText(/\/site/, (msg) => {
    bot.sendMessage(msg.chat.id, `🔗 *Brimstone:* "O terminal principal está online. Acesse os relatórios por aqui:"`, { 
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🖥️ Acessar QG", url: "https://protocolov.com" }]] 
        }
    });
});

bot.onText(/\/(convocar|reforco)(?:\s+([a-zA-Z0-9]{4,6}))?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const comandante = escapeMarkdown(msg.from.first_name);
    const codigo = match[2] ? match[2].toUpperCase() : null;
    const objetivo = match[3] ? escapeMarkdown(match[3].trim()) : 'Formar squad para operação tática.';
    const agora = Date.now();

    // 1. Verifica se já existe um chamado aberto e válido
    try {
        const { data: ativo } = await supabase.from('active_calls').select('*').gt('expires_at', agora).limit(1);
        
        if (ativo && ativo.length > 0) {
            const chamada = ativo[0];
            const minRestantes = Math.ceil((chamada.expires_at - agora) / 60000);
            return bot.sendMessage(chatId, `🛑 *Brimstone:* "Negativo, ${comandante}. O espaço aéreo já está ocupado. Junte-se ao esquadrão atual (Código: \`${chamada.party_code}\`) ou aguarde ${minRestantes} minutos para um novo sinalizador."`, { parse_mode: 'Markdown' });
        }
    } catch (e) {
        console.error("Erro ao checar calls:", e);
    }

    // 2. Exige o código do grupo caso o agente não tenha passado
    if (!codigo) {
        return bot.sendMessage(chatId, `⚠️ *Killjoy:* "Faltou o código do grupo! Como os agentes vão entrar no seu lobby? Use o formato: \`/convocar [CÓDIGO] [MENSAGEM]\`. Exemplo: \`/convocar NWV582 Bora Ranked\`"`, { parse_mode: 'Markdown' });
    }

    const exp = agora + (15 * 60 * 1000); // 15 minutos de validade para o lobby
    const horaF = new Date(exp - (3 * 60 * 60 * 1000)).toISOString().substr(11, 5);

    // 3. Regista o novo chamado no banco de dados para o site ler
    await supabase.from('active_calls').insert([{ commander: msg.from.first_name, party_code: codigo, expires_at: exp }]);

    const texto = `🚨 *[SINALIZADOR ORBITAL]* 🚨\n\n🔥 *Brimstone:* "Atenção agentes, ${comandante} abriu um lobby! Entrem no jogo e insiram o código abaixo para inserção imediata."\n\n🔑 *Código do Lobby:* \`${codigo}\`\n🎯 *Missão:* ${objetivo}\n⏱️ *Expira às:* ${horaF} (UTC)\n\n🟢 *Agentes a postos:*\n- ${comandante}\n\n⏳ *Em trânsito:*\n- (Aguardando resposta...)`;
    
    bot.sendMessage(chatId, texto, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🟢 Equipado e Pronto", callback_data: `sq_0_${exp}` }, { text: "⏳ 5 min", callback_data: `sq_5_${exp}` }],
                [{ text: "⏳ 10 min", callback_data: `sq_10_${exp}` }, { text: "⏳ 15 min", callback_data: `sq_15_${exp}` }]
            ]
        }
    });
});

bot.onText(/\/ranking/, async (msg) => {
    const chatId = msg.chat.id;
    const { data: sinergia } = await supabase.from('players').select('riot_id, synergy_score, current_rank').order('synergy_score', { ascending: false }).limit(3);
    const { data: matamata } = await supabase.from('players').select('riot_id, dm_score, current_rank').order('dm_score', { ascending: false }).limit(3);
    
    let m = "🐍 *[INTEL DA VIPER]*\n\n_\"Não me faça perder tempo. Estes são os únicos agentes que estão mostrando algum valor no campo de batalha.\"_\n\n🤝 *ELITE DA SINERGIA*\n";
    sinergia?.forEach((p, i) => {
        const emoji = getRankEmoji(p.current_rank);
        const safeNick = escapeMarkdown(p.riot_id.split('#')[0]);
        m += `${i+1}º ${emoji} ${safeNick}: ${p.synergy_score} pts\n`;
    });
    
    m += "\n🎯 *DESTAQUES DO MATA-MATA*\n";
    matamata?.forEach((p, i) => {
        const emoji = getRankEmoji(p.current_rank);
        const safeNick = escapeMarkdown(p.riot_id.split('#')[0]);
        m += `${i+1}º ${emoji} ${safeNick}: ${p.dm_score || 0} pts\n`;
    });
    bot.sendMessage(chatId, m, { parse_mode: 'Markdown' });
});

bot.onText(/\/(perfil|agente)(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argumento = match[2].trim();

    let dbQuery = supabase.from('players').select('riot_id, current_rank').order('synergy_score', { ascending: false }).limit(30);

    if (argumento) {
        const busca = argumento.split('#')[0];
        dbQuery = dbQuery.ilike('riot_id', `%${busca}%`);
    }

    const { data } = await dbQuery;

    if (!data || data.length === 0) {
        return bot.sendMessage(chatId, "⚠️ *Brimstone:* Registro não encontrado na base de dados. Revise as credenciais.", { parse_mode: 'Markdown' });
    }

    if (data.length === 1 && argumento) {
        const rawNick = data[0].riot_id.split('#')[0];
        return bot.emit('callback_query', {
            id: 'mock', message: msg, from: msg.from, data: `perfil_${rawNick}`
        });
    }

    const botoesGrade = [];
    for (let i = 0; i < data.length; i += 2) {
        const linha = [];
        [data[i], data[i + 1]].forEach(p => {
            if (p) {
                const rawNick = p.riot_id.split('#')[0];
                const emoji = getRankEmoji(p.current_rank);
                linha.push({ text: `${emoji} ${rawNick}`, callback_data: `perfil_${rawNick}` });
            }
        });
        botoesGrade.push(linha);
    }
    
    let menuMsg = argumento 
        ? `💻 *Killjoy:* "Encontrei vários agentes correspondentes a '${escapeMarkdown(argumento)}'. Selecione o alvo:"`
        : `💻 *Killjoy:* "Acessei o banco de dados. Selecione um agente abaixo para quebrar a criptografia do dossiê:"`;

    bot.sendMessage(chatId, menuMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botoesGrade } });
});

// --- COMANDO DE TRANSFERÊNCIA DE UNIDADE ---
bot.onText(/^\/unidade(?:\s+(\w+))?(?:\s+(.*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const unidade = match[1] ? match[1].toUpperCase() : null;
    const argumento = match[2] ? match[2].trim() : null;
    const validas = ['ALPHA', 'OMEGA', 'WINGMAN'];

    // CENÁRIO 1: Recruta digitou apenas "/unidade"
    if (!unidade) {
        return bot.sendMessage(chatId, `💻 *Killjoy:* "Opa, você não especificou a unidade! Sem problema, eu facilito para você. Para qual divisão você deseja solicitar transferência?"`, {
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
    
    // CENÁRIO 2: Unidade inválida (Ex: /unidade TESTE)
    if (!validas.includes(unidade)) {
        return bot.sendMessage(chatId, "❌ *Brimstone:* Código de Unidade inválido. Tente ALPHA, OMEGA ou WINGMAN.", { parse_mode: 'Markdown' });
    }

    // CENÁRIO 3: Digitou a unidade, mas não o nome (Ex: /unidade ALPHA)
    if (!argumento) {
        // NOVO: .neq('unit', unidade) aplicado aqui também
        const { data } = await supabase.from('players')
            .select('riot_id, current_rank')
            .neq('unit', unidade)
            .order('synergy_score', { ascending: false })
            .limit(30);
            
        if (!data || data.length === 0) {
            return bot.sendMessage(chatId, `⚠️ *[SISTEMA]* Todos os agentes disponíveis já estão alocados na Unidade *${unidade}*.`, { parse_mode: 'Markdown' });
        }

        const botoesGrade = [];
        for (let i = 0; i < data.length; i += 2) {
            const linha = [];
            [data[i], data[i + 1]].forEach(p => {
                if (p) {
                    const rawNick = p.riot_id.split('#')[0];
                    const emoji = getRankEmoji(p.current_rank);
                    linha.push({ text: `${emoji} ${rawNick}`, callback_data: `uni_${unidade}_${rawNick}` });
                }
            });
            botoesGrade.push(linha);
        }
        return bot.sendMessage(chatId, `🔄 *[SISTEMA]* Selecione o agente que será transferido para a Unidade *${unidade}*:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botoesGrade } });
    }

    // CENÁRIO 4: Comando completo (Ex: /unidade ALPHA Ousadia)
    try {
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `%${argumento}%`).limit(1);
        if (!data || data.length === 0) return bot.sendMessage(chatId, "⚠️ *Brimstone:* Não encontrei esse Riot ID nos nossos registros.", { parse_mode: 'Markdown' });
        
        const player = data[0];
        await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);
        
        const safeNick = escapeMarkdown(player.riot_id);
        let msgLore = '';
        if (unidade === 'ALPHA') msgLore = `🐍 *Viper:* "Interessante... Transferência autorizada. Bem-vindo à Unidade Alpha, ${safeNick}. Seja letal, não cometa erros."`;
        else if (unidade === 'OMEGA') msgLore = `🔥 *Brimstone:* "Excelente escolha. A Unidade Ômega conta com a sua força, ${safeNick}. Mantenha a linha de frente segura."`;
        else msgLore = `🦎 *Gekko:* "Aí sim, ${safeNick}! Wingman tá felizão. Fica na reserva tática com a gente."`;

        bot.sendMessage(chatId, `🔄 *[PROTOCOLO DE TRANSFERÊNCIA]*\n\n${msgLore}`, { parse_mode: 'Markdown' });
    } catch (error) { 
        bot.sendMessage(chatId, "🔥 *Killjoy:* O sistema do Supabase encontrou uma falha na sincronização.", { parse_mode: 'Markdown' }); 
    }
});

const app = express();
app.get('/', (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Terminal Ativo na Nuvem.'));
