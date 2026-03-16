require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- CONFIGURAÇÃO DO BOT E SUPABASE ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!token || !supabaseUrl || !supabaseKey) {
    console.error('🔥 ERRO: Variáveis de ambiente faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Bot do Protocolo V iniciado com sucesso!');

// --- MAPEAMENTO DE VISUAL TÁTICO ---
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

// ==========================================
// 1. LÓGICA DE BOTÕES (CALLBACK QUERIES)
// ==========================================
bot.on('callback_query', async (query) => {
    const callbackData = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const clickerName = query.from.first_name;

    try {
        // Interação com o botão de Convocar/Reforço
        if (callbackData.startsWith('sq_')) {
            let textoAtual = query.message.text;
            const partes = callbackData.split('_');
            const delayStr = partes[1];
            const expTime = parseInt(partes[2]);

            // Verifica se o recrutamento já expirou
            if (Date.now() > expTime) {
                await bot.editMessageText("🔴 *RECRUTAMENTO ENCERRADO*", { 
                    chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' 
                });
                return bot.answerCallbackQuery(query.id);
            }

            // Verifica se o agente já clicou antes
            if (textoAtual.includes(`- ${clickerName}`)) {
                return bot.answerCallbackQuery(query.id, { text: "Já estás na lista, Agente!" });
            }

            // Atualiza o texto da mensagem com o novo recruta
            textoAtual = textoAtual.replace('- (Aguardando...)', '');
            if (delayStr === '0') {
                textoAtual = textoAtual.replace('🟢 *Prontos para combate:*', `🟢 *Prontos para combate:*\n- ${clickerName}`);
            } else {
                textoAtual = textoAtual.replace('⏳ *Chegam em breve:*', `⏳ *Chegam em breve:*\n- ${clickerName} (${delayStr} min)`);
            }

            const bts = { inline_keyboard: [
                [{ text: "🟢 Pronto", callback_data: `sq_0_${expTime}` }, { text: "⏳ 5 min", callback_data: `sq_5_${expTime}` }],
                [{ text: "⏳ 10 min", callback_data: `sq_10_${expTime}` }, { text: "⏳ 15 min", callback_data: `sq_15_${expTime}` }]
            ]};

            await bot.editMessageText(textoAtual, { 
                chat_id: chatId, message_id: messageId, reply_markup: bts, parse_mode: 'Markdown' 
            });
            bot.answerCallbackQuery(query.id);
        }

        // Interação com o botão de Perfil
        if (callbackData.startsWith('perfil_')) {
            const nick = callbackData.replace('perfil_', '');
            const { data } = await supabase.from('players').select('*').ilike('riot_id', `${nick}%`).limit(1);
            if (data?.[0]) {
                const p = data[0];
                await bot.sendMessage(chatId, `📂 *AGENTE:* ${p.riot_id}\n🏅 *Rank:* ${p.current_rank}\n🤝 *Sinergia:* ${p.synergy_score} pts\n🎯 *Mata-mata:* ${p.dm_score || 0} pts`, { parse_mode: 'Markdown' });
            }
            bot.answerCallbackQuery(query.id);
        }
    } catch (err) {
        console.error("Erro nos botões:", err);
    }
});

// ==========================================
// 2. LÓGICA DE COMANDOS DE TEXTO
// ==========================================

// Apagar comandos em grupos para manter o chat limpo
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/') && msg.chat.id < 0) {
        try {
            await bot.deleteMessage(msg.chat.id, msg.message_id);
        } catch (e) {
            // Ignora o erro se o bot não for admin para apagar mensagens
        }
    }
});

// Comando: MENU / AJUDA
bot.onText(/\/(start|ajuda|comandos)/, (msg) => {
    const chatId = msg.chat.id;
    const menuMsg = `⚙️ *PAINEL DE COMANDOS:*\n\n` +
                `📢 /convocar [objetivo] - Chama agentes para o lobby\n` +
                `👤 /perfil - Lista de agentes para inspeção\n` +
                `🏆 /ranking - Destaques da Sinergia e Treino\n` +
                `🎭 /faccao [alpha|omega|wingman] [RiotID] - Mudar de Facção\n` +
                `🌐 /site - Aceder ao QG Principal\n` +
                `❓ /ajuda - Exibe esta lista`;
    bot.sendMessage(chatId, menuMsg, { parse_mode: 'Markdown' });
});

// Comando: SITE
bot.onText(/\/site/, (msg) => {
    bot.sendMessage(msg.chat.id, `🔗 Aceda ao terminal principal do Protocolo V:`, { 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "🖥️ Abrir QG", url: "https://rodolphoborges.github.io/protocolov/" }]] }
    });
});

// Comando: CONVOCAR / REFORÇO
bot.onText(/\/(convocar|reforco)(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const comandante = msg.from.first_name;
    const objetivo = match[2] ? match[2].trim() : 'Formar squad para operação.';
    const expTime = Date.now() + (10 * 60 * 1000); // 10 minutos
    
    // Calcula a hora de expiração no fuso horário (ajustando as horas)
    const dataExp = new Date(expTime);
    dataExp.setHours(dataExp.getHours() - 3); // Ajuste GMT-3 (Brasil)
    const horaF = dataExp.toISOString().substring(11, 16);

    const texto = `🚨 *SINALIZADOR TÁTICO* 🚨\n\n🗣 *Comandante:* ${comandante}\n🎯 *Objetivo:* ${objetivo}\n⏱️ *Expira às:* ${horaF}\n\n🟢 *Prontos para combate:*\n- ${comandante}\n\n⏳ *Chegam em breve:*\n- (Aguardando...)`;
    
    const bts = { inline_keyboard: [
        [{ text: "🟢 Pronto", callback_data: `sq_0_${expTime}` }, { text: "⏳ 5 min", callback_data: `sq_5_${expTime}` }],
        [{ text: "⏳ 10 min", callback_data: `sq_10_${expTime}` }, { text: "⏳ 15 min", callback_data: `sq_15_${expTime}` }]
    ]};
    
    bot.sendMessage(chatId, texto, { reply_markup: bts, parse_mode: 'Markdown' });
});

// Comando: RANKING
bot.onText(/\/ranking/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const { data: sinergia } = await supabase.from('players').select('riot_id, synergy_score, current_rank').order('synergy_score', { ascending: false }).limit(3);
        const { data: matamata } = await supabase.from('players').select('riot_id, dm_score, current_rank').order('dm_score', { ascending: false }).limit(3);
        
        let m = "🏆 *RELATÓRIO DE ELITE*\n\n🤝 *TOP SINERGIA*\n";
        sinergia?.forEach((p, i) => {
            const emoji = getRankEmoji(p.current_rank);
            m += `${i+1}º ${emoji} ${p.riot_id.split('#')[0]}: ${p.synergy_score} pts\n`;
        });
        
        m += "\n🎯 *TOP MATA-MATA*\n";
        matamata?.forEach((p, i) => {
            const emoji = getRankEmoji(p.current_rank);
            m += `${i+1}º ${emoji} ${p.riot_id.split('#')[0]}: ${p.dm_score || 0} pts\n`;
        });
        bot.sendMessage(chatId, m, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(chatId, "⚠️ Falha ao acessar os arquivos do banco de dados.");
    }
});

// Comando: PERFIL / AGENTE
bot.onText(/\/(perfil|agente)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const argumento = match[2];

    try {
        if (argumento) {
            const busca = argumento.split('#')[0];
            const { data } = await supabase.from('players').select('*').ilike('riot_id', `${busca}%`).limit(1);
            if (data?.[0]) {
                const p = data[0];
                bot.sendMessage(chatId, `📂 *AGENTE:* ${p.riot_id}\n🏅 *Rank:* ${p.current_rank}\n🤝 *Sinergia:* ${p.synergy_score} pts\n🎯 *Mata-mata:* ${p.dm_score || 0} pts`, { parse_mode: 'Markdown' });
            } else { 
                bot.sendMessage(chatId, "⚠️ Agente não encontrado."); 
            }
        } else {
            const { data } = await supabase.from('players')
                .select('riot_id, synergy_score, dm_score, current_rank')
                .order('synergy_score', { ascending: false })
                .limit(10);
            
            const botoesGrade = [];
            if (data) {
                for (let i = 0; i < data.length; i += 2) {
                    const linha = [];
                    [data[i], data[i + 1]].forEach(p => {
                        if (p) {
                            const nick = p.riot_id.split('#')[0];
                            const emoji = getRankEmoji(p.current_rank);
                            linha.push({ 
                                text: `${emoji} ${nick} | 🤝${p.synergy_score} | 🎯${p.dm_score || 0}`, 
                                callback_data: `perfil_${nick}` 
                            });
                        }
                    });
                    botoesGrade.push(linha);
                }
            }
            const menuMsg = `🔍 *CENTRAL DE INTELIGÊNCIA*\nSelecione um agente para ver o dossiê detalhado.`;
            bot.sendMessage(chatId, menuMsg, { reply_markup: { inline_keyboard: botoesGrade }, parse_mode: 'Markdown' });
        }
    } catch (e) {
        bot.sendMessage(chatId, "⚠️ Erro ao procurar perfis.");
    }
});

// Comando: FACÇÃO (Mantido e Seguro)
bot.onText(/\/faccao (\w+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const faccaoEscolhida = match[1].toUpperCase();
    const riotId = match[2].trim();
    const faccoesValidas = ['ALPHA', 'OMEGA', 'WINGMAN'];
    
    if (!faccoesValidas.includes(faccaoEscolhida)) {
        return bot.sendMessage(chatId, `❌ Facção inválida. Use ALPHA, OMEGA ou WINGMAN.`);
    }
    if (!/^[^#]{2,16}#[a-zA-Z0-9]{3,5}$/.test(riotId)) {
        return bot.sendMessage(chatId, `❌ Formato inválido. Use Nome#TAG.`);
    }

    try {
        const { data: player, error: fetchError } = await supabase.from('players').select('riot_id').ilike('riot_id', riotId).single();
        if (fetchError || !player) {
            return bot.sendMessage(chatId, `⚠️ Agente *${riotId}* não encontrado. Cadastre-se no site primeiro.`, { parse_mode: 'Markdown' });
        }

        const { data: updatedData, error: updateError } = await supabase.from('players').update({ faction: faccaoEscolhida }).eq('riot_id', player.riot_id).select();
        if (updateError || !updatedData || updatedData.length === 0) {
            throw new Error("Falha na atualização");
        }

        let icone = faccaoEscolhida === 'ALPHA' ? '🔵' : (faccaoEscolhida === 'OMEGA' ? '🔴' : '⭐');
        bot.sendMessage(chatId, `${icone} *[ATUALIZAÇÃO]*\nAgente *${player.riot_id}* transferido para *${faccaoEscolhida}*!`, { parse_mode: 'Markdown' });
    } catch (error) {
        bot.sendMessage(chatId, `🔥 Erro crítico ao atualizar facção.`);
    }
});

// ==========================================
// 3. TRUQUE DO SERVIDOR WEB (RENDER)
// ==========================================
const app = express();
app.get('/', (req, res) => {
    res.send('✅ Sistema Vital do Bot Protocolo V: ONLINE');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Servidor Web camuflado a correr na porta ${PORT}`);
});
