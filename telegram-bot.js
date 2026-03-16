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

// --- COMANDOS DO BOT ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMsg = `🚨 *TERMINAL PROTOCOLO V* 🚨\n\nBem-vindo, Agente.\n\nPara definir a sua facção:\n\`/faccao [alpha|omega|wingman] [SeuRiotID#TAG]\``;
    bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

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
           // Passo 1: Busca o jogador para descobrir como está escrito exatamente no banco
           const { data: player, error: fetchError } = await supabase
               .from('players').select('riot_id').ilike('riot_id', riotId).single();

           if (fetchError || !player) {
               return bot.sendMessage(chatId, `⚠️ Agente *${riotId}* não encontrado. Cadastre-se no site primeiro.`, { parse_mode: 'Markdown' });
           }

           // Passo 2: Atualiza usando o ID exato (com .eq) e exige confirmação (.select)
           const { data: updatedData, error: updateError } = await supabase
               .from('players')
               .update({ faction: faccaoEscolhida })
               .eq('riot_id', player.riot_id)
               .select();

           if (updateError) throw updateError;

           // Se não atualizou nenhuma linha, é problema de chave/permissão
           if (!updatedData || updatedData.length === 0) {
               console.error("Falha silenciosa no Supabase: 0 linhas afetadas.");
               return bot.sendMessage(chatId, `❌ Erro de permissão ao gravar no banco. Verifique a sua SUPABASE_SERVICE_KEY no Render.`);
           }

           let icone = faccaoEscolhida === 'ALPHA' ? '🔵' : (faccaoEscolhida === 'OMEGA' ? '🔴' : '⭐');
           bot.sendMessage(chatId, `${icone} *[ATUALIZAÇÃO]*\nAgente *${player.riot_id}* transferido para *${faccaoEscolhida}*!`, { parse_mode: 'Markdown' });

       } catch (error) {
           console.error("Erro no catch:", error);
           bot.sendMessage(chatId, `🔥 Erro crítico ao acessar os servidores.`);
       }
});

// --- O TRUQUE PARA O RENDER (WEB SERVER) ---
const app = express();
app.get('/', (req, res) => {
    res.send('✅ Sistema Vital do Bot Protocolo V: ONLINE');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Servidor Web camuflado rodando na porta ${PORT}`);
});
