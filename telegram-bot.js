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

// Menu Principal / Start
bot.onText(/\/(start|ajuda|comandos)/, (msg) => {
    const texto = `⚙️ *PROTOCOLO V: COMANDOS TÁTICOS*\\n\\n` +
                `📢 /convocar - Mobilizar agentes para o Ponto de Inserção\\n` +
                `👤 /perfil - Aceder ao dossiê de um agente\\n` +
                `🏆 /ranking - Visualizar a elite do Protocolo\\n` +
                `🎭 /unidade [alpha|omega] [RiotID] - Definir origem do agente\\n` +
                `🌐 /site - Abrir o Terminal do QG\\n` +
                `❓ /ajuda - Protocolos de suporte`;
    bot.sendMessage(msg.chat.id, texto, { parse_mode: 'Markdown' });
});

// Ranking de Elite
bot.onText(/\/ranking/, async (msg) => {
    try {
        const { data: topSinergia } = await supabase.from('players').select('riot_id, synergy_score, current_rank').order('synergy_score', { ascending: false }).limit(3);
        const { data: topTreino } = await supabase.from('players').select('riot_id, dm_score, current_rank').order('dm_score', { ascending: false }).limit(3);
        
        let m = `🏆 *ELITE DO PROTOCOLO VALORANT*\\n\\n🤝 *LÍDERES DE SINERGIA*\\n`;
        topSinergia?.forEach((p, i) => {
            m += `${i+1}º ${getRankEmoji(p.current_rank)} ${p.riot_id.split('#')[0]}: ${p.synergy_score} pts\\n`;
        });
        
        m += `\\n🎯 *PRONTIDÃO DE COMBATE (TREINO)*\\n`;
        topTreino?.forEach((p, i) => {
            m += `${i+1}º ${getRankEmoji(p.current_rank)} ${p.riot_id.split('#')[0]}: ${p.dm_score || 0} pts\\n`;
        });
        bot.sendMessage(msg.chat.id, m, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, "⚠️ Erro ao aceder aos servidores de inteligência.");
    }
});

// Dossiê / Perfil
bot.onText(/\/(perfil|agente)(?:\s+(.+))?/, async (msg, match) => {
    const argumento = match[2];
    try {
        if (argumento) {
            const busca = argumento.split('#')[0];
            const { data } = await supabase.from('players').select('*').ilike('riot_id', `${busca}%`).limit(1);
            if (data?.[0]) {
                const p = data[0];
                bot.sendMessage(msg.chat.id, `📂 *DOSSIÊ DO AGENTE:* ${p.riot_id}\\n🏅 *Rank:* ${getRankEmoji(p.current_rank)} ${p.current_rank}\\n🤝 *Sinergia:* ${p.synergy_score} pts\\n🎯 *Treino:* ${p.dm_score || 0} pts`, { parse_mode: 'Markdown' });
            } else { bot.sendMessage(msg.chat.id, "⚠️ Agente não localizado nos registos."); }
        } else {
            const { data } = await supabase.from('players').select('riot_id').limit(8);
            const botoes = data.map(p => [{ text: `👤 ${p.riot_id.split('#')[0]}`, callback_data: `perfil_${p.riot_id.split('#')[0]}` }]);
            bot.sendMessage(msg.chat.id, "🔍 *CENTRAL DE INTELIGÊNCIA*\\nSelecione um agente para ver o dossiê:", { reply_markup: { inline_keyboard: botoes }, parse_mode: 'Markdown' });
        }
    } catch (e) { bot.sendMessage(msg.chat.id, "⚠️ Erro na consulta de dossiês."); }
});

// Mudança de Unidade (Alpha/Omega)
bot.onText(/\/unidade (\w+) (.+)/, async (msg, match) => {
    const unidade = match[1].toUpperCase();
    const riotId = match[2].trim();
    if (!['ALPHA', 'OMEGA'].includes(unidade)) return bot.sendMessage(msg.chat.id, "❌ Unidade inválida. Use ALPHA ou OMEGA.");

    try {
        const { data: player } = await supabase.from('players').select('riot_id').ilike('riot_id', riotId).single();
        if (!player) return bot.sendMessage(msg.chat.id, "⚠️ Agente não encontrado.");

        await supabase.from('players').update({ faction: unidade }).eq('riot_id', player.riot_id);
        const icone = unidade === 'ALPHA' ? '🔵' : '🔴';
        bot.sendMessage(msg.chat.id, `${icone} *[PROTOCOLO ATUALIZADO]*\\nAgente *${player.riot_id}* agora opera na Unidade *${unidade}*!`, { parse_mode: 'Markdown' });
    } catch (error) { bot.sendMessage(msg.chat.id, "🔥 Falha na sincronização de dados."); }
});

// --- LÓGICA DO SERVIDOR (RENDER) ---
const app = express();
app.get('/', (req, res) => res.send('✅ Sistema Vital do Protocolo V: ONLINE'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Terminal Ativo na Nuvem.'));
