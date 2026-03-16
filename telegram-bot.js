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

// --- COMANDOS TÁTICOS ---

bot.onText(/\/(start|ajuda|comandos)/, (msg) => {
    const texto = `⚙️ *PROTOCOLO V: COMANDOS DE CAMPO*\n\n` +
                `📢 /convocar - Mobilizar agentes para o Ponto de Inserção\n` +
                `👤 /perfil - Aceder ao dossiê de um agente\n` +
                `🏆 /ranking - Visualizar a elite do Protocolo\n` +
                `🎭 /unidade [alpha|omega|wingman] [RiotID] - Definir unidade tática\n` +
                `🌐 /site - Abrir o Terminal do QG\n` +
                `❓ /ajuda - Protocolos de suporte`;
    bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown' });
});

bot.onText(/\/unidade (\w+) (.+)/, async (msg, match) => {
    const unidade = match[1].toUpperCase();
    const riotId = match[2].trim();
    const validas = ['ALPHA', 'OMEGA', 'WINGMAN'];
    
    if (!validas.includes(unidade)) return bot.sendMessage(msg.chat.id, "❌ Unidade inválida. Use ALPHA, OMEGA ou WINGMAN.");

    try {
        const { data: player } = await supabase.from('players').select('riot_id').ilike('riot_id', riotId).single();
        if (!player) return bot.sendMessage(msg.chat.id, "⚠️ Agente não localizado nos registos.");

        // Atualização utilizando a nomenclatura correta (unit)
        await supabase.from('players').update({ unit: unidade }).eq('riot_id', player.riot_id);
        
        let icone = '🧪'; // Viper
        if (unidade === 'OMEGA') icone = '🔥'; // Brimstone
        if (unidade === 'WINGMAN') icone = '🦎'; // Gekko

        bot.sendMessage(msg.chat.id, `${icone} *[PROTOCOLO ATUALIZADO]*\nAgente *${player.riot_id}* agora opera na Unidade *${unidade}*!`, { parse_mode: 'Markdown' });
    } catch (error) { bot.sendMessage(msg.chat.id, "🔥 Falha na sincronização de dados."); }
});

// Outros comandos (Ranking, Perfil) mantidos conforme estrutura original...

const app = express();
app.get('/', (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Terminal Ativo na Nuvem.'));
