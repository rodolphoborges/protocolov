require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// Configurações
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new TelegramBot(token, { polling: true });
const app = express();

// Servidor Web para manter o Render ativo
app.get('/', (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));
app.listen(process.env.PORT || 10000, () => {
    console.log('🤖 Central de Comando iniciada.');
});

// Mapeamento de Rank para Emojis
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

// Comando /start e /ajuda
bot.onText(/\/(start|ajuda|comandos)/, (msg) => {
    const texto = `⚙️ *PAINEL DE COMANDOS TÁTICOS:*\\n\\n` +
                  `📢 /convocar - Mobilizar agentes para a Zona de Inserção\\n` +
                  `👤 /perfil - Aceder ao dossiê detalhado do agente\\n` +
                  `🏆 /ranking - Visualizar elite do Protocolo\\n` +
                  `🌐 /site - Terminal Principal (QG)\\n` +
                  `❓ /ajuda - Protocolos de suporte`;
    bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown' });
});

// Comando /site
bot.onText(/\/site/, (msg) => {
    bot.sendMessage(msg.chat.id, `🔗 *Terminal de Acesso:*`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🖥️ Abrir QG Protocolo V", url: "https://rodolphoborges.github.io/protocolov/" }]]
        }
    });
});

// Comando /perfil
bot.onText(/\/perfil/, async (msg) => {
    const { data: agentes } = await supabase.from('recrutas').select('*').order('nome', { ascending: true });
    if (!agentes) return;

    const botoes = [];
    for (let i = 0; i < agentes.length; i += 2) {
        const linha = [];
        linha.push({ text: `${getRankEmoji(agentes[i].rank)} ${agentes[i].nome}`, callback_data: `perfil_${agentes[i].id}` });
        if (agentes[i + 1]) {
            linha.push({ text: `${getRankEmoji(agentes[i + 1].rank)} ${agentes[i + 1].nome}`, callback_data: `perfil_${agentes[i + 1].id}` });
        }
        botoes.push(linha);
    }

    bot.sendMessage(msg.chat.id, `🔍 *CENTRAL DE INTELIGÊNCIA*\\nSelecione um agente para visualizar o dossiê. Dados sincronizados em tempo real.`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: botoes }
    });
});

// Comando /ranking
bot.onText(/\/ranking/, async (msg) => {
    const { data: agentes } = await supabase.from('recrutas').select('*').order('sinergia', { ascending: false }).limit(5);
    
    let texto = `🏆 *ELITE DO PROTOCOLO VALORANT*\\nAgentes com maior índice de radiação e prontidão:\\n\\n`;
    agentes.forEach((a, i) => {
        texto += `${i + 1}º ${getRankEmoji(a.rank)} *${a.nome}*\\n🤝 Sinergia: ${a.sinergia} | 🎯 Treino: ${a.dm_vitorias}\\n\\n`;
    });

    bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown' });
});

// Lógica de Callback para Dossiê
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('perfil_')) {
        const id = data.split('_')[1];
        const { data: a } = await supabase.from('recrutas').select('*').eq('id', id).single();
        
        const dossie = `👤 *DOSSIÊ DO AGENTE: ${a.nome.toUpperCase()}*\\n\\n` +
                       `🔰 *Patente:* ${getRankEmoji(a.rank)} ${a.rank || 'Não Classificado'}\\n` +
                       `🤝 *Sinergia Tática:* ${a.sinergia}\\n` +
                       `🎯 *Prontidão de Combate:* ${a.dm_vitorias} vitórias em treino\\n` +
                       `📍 *Status:* Ativo no Protocolo V`;

        bot.sendMessage(chatId, dossie, { parse_mode: 'Markdown' });
    }
});

console.log('🤖 Protocolo V: Sistema de comunicação ativo.');
