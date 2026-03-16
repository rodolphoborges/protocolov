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

// --- MAPEAMENTO DE RANK (LORE) ---
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
            bot.editMessageText("🔴 *RECRUTAMENTO ENCERRADO*", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
            return bot.answerCallbackQuery(query.id);
        }

        if (textoAtual.includes(`- ${query.from.first_name}`)) {
            return bot.answerCallbackQuery(query.id, { text: "Já estás na lista, Agente!" });
        }

        textoAtual = textoAtual.replace('- (Aguardando...)', '');
        if (delayStr === '0') {
            textoAtual = textoAtual.replace('🟢 Prontos para combate:', `🟢 Prontos para combate:\n- ${query.from.first_name}`);
        } else {
            textoAtual = textoAtual.replace('⏳ Chegam em breve:', `⏳ Chegam em breve:\n- ${query.from.first_name} (${delayStr} min)`);
        }

        // Reconstrói as formatações Markdown que se perdem ao extrair o text puro da mensagem
        textoAtual = textoAtual.replace('SINALIZADOR TÁTICO', '*SINALIZADOR TÁTICO*');
        textoAtual = textoAtual.replace('Comandante:', '*Comandante:*');
        textoAtual = textoAtual.replace('Objetivo:', '*Objetivo:*');
        textoAtual = textoAtual.replace('Expira às:', '*Expira às:*');
        textoAtual = textoAtual.replace('Prontos para combate:', '*Prontos para combate:*');
        textoAtual = textoAtual.replace('Chegam em breve:', '*Chegam em breve:*');

        const opts = {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🟢 Pronto", callback_data: `sq_0_${expTime}` }, { text: "⏳ 5 min", callback_data: `sq_5_${expTime}` }],
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
            const msg = `📂 *AGENTE:* ${safeNick}\n🏅 *Rank:* ${p.current_rank}\n🤝 *Sinergia:* ${p.synergy_score} pts\n🎯 *Mata-mata:* ${p.dm_score || 0} pts`;
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
        bot.answerCallbackQuery(query.id);
    }
});

// --- COMANDOS TÁTICOS ---

bot.onText(/\/(start|ajuda|comandos)/, (msg) => {
    const texto = `⚙️ *PROTOCOLO V: COMANDOS DE CAMPO*\n\n` +
                `📢 /convocar - Chama agentes para o lobby\n` +
                `👤 /perfil - Inspeciona um agente\n` +
                `🏆 /ranking - Destaques da Sinergia e Treino\n` +
                `🎭 /unidade [alpha|omega|wingman] [RiotID] - Definir unidade tática\n` +
                `🌐 /site - Abrir o Terminal do QG\n` +
                `❓ /ajuda - Protocolos de suporte`;
    bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown' });
});

bot.onText(/\/site/, (msg) => {
    bot.sendMessage(msg.chat.id, `🔗 Aceda ao terminal principal do Protocolo V:`, { 
        inline_keyboard: [[{ text: "🖥️ Abrir QG", url: "https://protocolov.com" }]] 
    });
});

bot.onText(/\/(convocar|reforco)(.*)/, (msg, match) => {
    const comandante = escapeMarkdown(msg.from.first_name);
    const objetivo = match[2].trim() ? escapeMarkdown(match[2].trim()) : 'Formar squad para operação.';
    const exp = Date.now() + (10 * 60 * 1000);
    const horaF = new Date(exp - (3 * 60 * 60 * 1000)).toISOString().substr(11, 5);

    const texto = `🚨 *SINALIZADOR TÁTICO* 🚨\n\n🗣 *Comandante:* ${comandante}\n🎯 *Objetivo:* ${objetivo}\n⏱️ *Expira às:* ${horaF}\n\n🟢 *Prontos para combate:*\n- ${msg.from.first_name}\n\n⏳ *Chegam em breve:*\n- (Aguardando...)`;
    
    bot.sendMessage(msg.chat.id, texto, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🟢 Pronto", callback_data: `sq_0_${exp}` }, { text: "⏳ 5 min", callback_data: `sq_5_${exp}` }],
                [{ text: "⏳ 10 min", callback_data: `sq_10_${exp}` }, { text: "⏳ 15 min", callback_data: `sq_15_${exp}` }]
            ]
        }
    });
});

bot.onText(/\/ranking/, async (msg) => {
    const chatId = msg.chat.id;
    const { data: sinergia } = await supabase.from('players').select('riot_id, synergy_score, current_rank').order('synergy_score', { ascending: false }).limit(3);
    const { data: matamata } = await supabase.from('players').select('riot_id, dm_score, current_rank').order('dm_score', { ascending: false }).limit(3);
    
    let m = "🏆 *RELATÓRIO DE ELITE*\n\n🤝 *TOP SINERGIA*\n";
    sinergia?.forEach((p, i) => {
        const emoji = getRankEmoji(p.current_rank);
        const safeNick = escapeMarkdown(p.riot_id.split('#')[0]);
        m += `${i+1}º ${emoji} ${safeNick}: ${p.synergy_score} pts\n`;
    });
    
    m += "\n🎯 *TOP MATA-MATA*\n";
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
            bot.sendMessage(chatId, `📂 *AGENTE:* ${safeNick}\n🏅 *Rank:* ${p.current_rank}\n🤝 *Sinergia:* ${p.synergy_score} pts\n🎯 *Mata-mata:* ${p.dm_score || 0} pts`, { parse_mode: 'Markdown' });
        } else { 
            bot.sendMessage(chatId, "⚠️ Agente não encontrado."); 
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
                        linha.push({ 
                            text: `${emoji} ${safeNick} | 🤝${p.synergy_score} | 🎯${p.dm_score || 0}`, 
                            callback_data: `perfil_${rawNick}` 
                        });
                    }
                });
                botoesGrade.push(linha);
            }
        }
        const menuMsg = `🔍 *CENTRAL DE INTELIGÊNCIA*\nSelecione um agente para ver o dossiê detalhado. Dados exibidos: Rank, Sinergia (🤝) e Mata-Mata (🎯).`;
        bot.sendMessage(chatId, menuMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botoesGrade } });
    }
});

bot.onText(/\/unidade (\w+) (.+)/, async (msg, match) => {
    const unidade = match[1].toUpperCase();
    const riotId = match[2].trim();
    const validas = ['ALPHA', 'OMEGA', 'WINGMAN'];
    
    if (!validas.includes(unidade)) return bot.sendMessage(msg.chat.id, "❌ Unidade inválida. Use ALPHA, OMEGA ou WINGMAN.");

    try {
        const { data: player } = await supabase.from('players').select('riot_id').ilike('riot_id', riotId).single();
        if (!player) return bot.sendMessage(msg.chat.id, "⚠️ Agente não localizado nos registos.");

        await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);
        
        let icone = '🧪'; // Viper
        if (unidade === 'OMEGA') icone = '🔥'; // Brimstone
        if (unidade === 'WINGMAN') icone = '🦎'; // Gekko

        const safeNick = escapeMarkdown(player.riot_id);
        bot.sendMessage(msg.chat.id, `${icone} *[PROTOCOLO ATUALIZADO]*\nAgente *${safeNick}* agora opera na Unidade *${unidade}*!`, { parse_mode: 'Markdown' });
    } catch (error) { 
        bot.sendMessage(msg.chat.id, "🔥 Falha na sincronização de dados."); 
    }
});

const app = express();
app.get('/', (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Terminal Ativo na Nuvem.'));
