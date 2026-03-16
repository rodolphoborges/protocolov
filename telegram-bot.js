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
    return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// --- LÓGICA DE BOTÕES (CALLBACK) ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const clickerName = escapeMarkdown(query.from.first_name);
    const callbackData = query.data;

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

    if (callbackData.startsWith('perfil_')) {
        const nickRaw = callbackData.replace('perfil_', '');
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `${nickRaw}%`).limit(1);
        if (data && data[0]) {
            const p = data[0];
            const safeNick = escapeMarkdown(p.riot_id);
            const msg = `💻 *[TERMINAL DA KILLJOY]*\n\n_"Deixa eu dar uma olhada no registro desse aí..."_\n\n📂 *AGENTE:* ${safeNick}\n🏅 *Rank:* ${p.current_rank}\n🤝 *Sinergia:* ${p.synergy_score} pts\n🎯 *Mata-mata:* ${p.dm_score || 0} pts\n🛡️ *Unidade:* ${p.unit}`;
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
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
                `🎭 /unidade [alpha|omega|wingman] [SeuRiotID] - Solicita transferência de Unidade Tática\n` +
                `🌐 /site - Acessa o QG Principal\n` +
                `❓ /ajuda - Repete esta transmissão`;
    bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown' });
});

bot.onText(/\/site/, (msg) => {
    bot.sendMessage(msg.chat.id, `🔗 *Brimstone:* "O terminal principal está online. Acesse os relatórios por aqui:"`, { 
        inline_keyboard: [[{ text: "🖥️ Acessar QG", url: "https://protocolov.com" }]] 
    });
});

bot.onText(/\/(convocar|reforco)(.*)/, (msg, match) => {
    const comandante = escapeMarkdown(msg.from.first_name);
    const objetivo = match[2].trim() ? escapeMarkdown(match[2].trim()) : 'Formar squad para operação tática.';
    const exp = Date.now() + (10 * 60 * 1000);
    const horaF = new Date(exp - (3 * 60 * 60 * 1000)).toISOString().substr(11, 5);

    const texto = `🚨 *[SINALIZADOR ORBITAL]* 🚨\n\n🔥 *Brimstone:* "O comandante ${comandante} solicitou apoio aéreo e reforços. Quem está pronto para o salto?"\n\n🎯 *Missão:* ${objetivo}\n⏱️ *Ponto de Extração:* ${horaF} (UTC)\n\n🟢 *Agentes a postos:*\n- ${msg.from.first_name}\n\n⏳ *Em trânsito:*\n- (Aguardando resposta...)`;
    
    bot.sendMessage(msg.chat.id, texto, {
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

    if (argumento) {
        const busca = argumento.split('#')[0];
        const { data } = await supabase.from('players').select('*').ilike('riot_id', `${busca}%`).limit(1);
        if (data && data[0]) {
            const p = data[0];
            const safeNick = escapeMarkdown(p.riot_id);
            bot.sendMessage(chatId, `💻 *[TERMINAL DA KILLJOY]*\n\n_"Dados extraídos com sucesso."_\n\n📂 *AGENTE:* ${safeNick}\n🏅 *Rank:* ${p.current_rank}\n🤝 *Sinergia:* ${p.synergy_score} pts\n🎯 *Treino:* ${p.dm_score || 0} pts\n🛡️ *Unidade:* ${p.unit}`, { parse_mode: 'Markdown' });
        } else { 
            bot.sendMessage(chatId, "⚠️ *Brimstone:* Registro não encontrado. Revise as credenciais."); 
        }
    } else {
        const { data } = await supabase.from('players').select('riot_id, synergy_score, dm_score, current_rank').order('synergy_score', { ascending: false }).limit(10);
        
        const botoesGrade = [];
        if (data) {
            for (let i = 0; i < data.length; i += 2) {
                const linha = [];
                [data[i], data[i + 1]].forEach(p => {
                    if (p) {
                        const rawNick = p.riot_id.split('#')[0];
                        const safeNick = escapeMarkdown(rawNick);
                        const emoji = getRankEmoji(p.current_rank);
                        linha.push({ text: `${emoji} ${safeNick}`, callback_data: `perfil_${rawNick}` });
                    }
                });
                botoesGrade.push(linha);
            }
        }
        const menuMsg = `💻 *Killjoy:* "Acessei o banco de dados. Selecione um agente abaixo para quebrar a criptografia do dossiê:"`;
        bot.sendMessage(chatId, menuMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botoesGrade } });
    }
});

bot.onText(/\/unidade (\w+) (.+)/, async (msg, match) => {
    const unidade = match[1].toUpperCase();
    const riotId = match[2].trim();
    const validas = ['ALPHA', 'OMEGA', 'WINGMAN'];
    
    if (!validas.includes(unidade)) return bot.sendMessage(msg.chat.id, "❌ *Brimstone:* Código de Unidade inválido. Tente ALPHA, OMEGA ou WINGMAN.");

    try {
        const { data: player } = await supabase.from('players').select('riot_id').ilike('riot_id', riotId).single();
        if (!player) return bot.sendMessage(msg.chat.id, "⚠️ *Brimstone:* Não encontrei esse Riot ID nos nossos registros de recrutamento.");

        await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);
        const safeNick = escapeMarkdown(player.riot_id);
        
        let msgLore = '';
        if (unidade === 'ALPHA') {
            msgLore = `🐍 *Viper:* "Interessante... Transferência autorizada. Bem-vindo à Unidade Alpha, ${safeNick}. Seja letal, não cometa erros, ou eu mesma limpo o seu registro."`;
        } else if (unidade === 'OMEGA') {
            msgLore = `🔥 *Brimstone:* "Excelente escolha. A Unidade Ômega conta com a sua força, ${safeNick}. Mantenha a linha de frente segura e a moral alta."`;
        } else {
            msgLore = `🦎 *Gekko:* "Aí sim, ${safeNick}! Wingman tá felizão. Fica na reserva tática com a gente até a hora do show."`;
        }

        bot.sendMessage(msg.chat.id, `🔄 *[PROTOCOLO DE TRANSFERÊNCIA]*\n\n${msgLore}`, { parse_mode: 'Markdown' });
    } catch (error) { 
        bot.sendMessage(msg.chat.id, "🔥 *Killjoy:* O sistema do Supabase encontrou uma falha na sincronização."); 
    }
});

const app = express();
app.get('/', (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Terminal Ativo na Nuvem.'));
