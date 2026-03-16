require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Configurações do ambiente
const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!token || !supabaseUrl || !supabaseKey) {
    console.error('🔥 ERRO: Variáveis de ambiente faltando (.env).');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Inicia o bot em modo de escuta (polling)
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Bot do Protocolo V iniciado com sucesso! Aguardando comandos...');

// Comando de boas-vindas
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMsg = `🚨 *TERMINAL PROTOCOLO V* 🚨\n\nBem-vindo, Agente.\n\nPara definir ou alterar a sua facção e atualizar o seu registo no site, utilize o comando abaixo:\n\n\`/faccao [alpha|omega|wingman] [SeuRiotID#TAG]\`\n\n*Exemplos:*\n\`/faccao alpha OUSADIA#013\`\n\`/faccao omega Jett#BR1\`\n\`/faccao wingman Noob#000\``;
    
    bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
});

// Comando para trocar de Facção
bot.onText(/\/faccao (\w+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const faccaoEscolhida = match[1].toUpperCase();
    const riotId = match[2].trim();

    const faccoesValidas = ['ALPHA', 'OMEGA', 'WINGMAN'];
    
    // Valida a facção
    if (!faccoesValidas.includes(faccaoEscolhida)) {
        return bot.sendMessage(chatId, `❌ Facção inválida. As opções autorizadas são: ALPHA, OMEGA ou WINGMAN.`);
    }

    // Valida o formato do Riot ID
    if (!/^[^#]{2,16}#[a-zA-Z0-9]{3,5}$/.test(riotId)) {
        return bot.sendMessage(chatId, `❌ Formato de Riot ID inválido. Utilize o formato Nome#TAG (Ex: OUSADIA#013).`);
    }

    try {
        // Passo 1: Verifica se o jogador já se alistou no site
        const { data: player, error: fetchError } = await supabase
            .from('players')
            .select('riot_id')
            .ilike('riot_id', riotId) // Busca ignorando maiúsculas/minúsculas
            .single();

        if (fetchError || !player) {
            return bot.sendMessage(chatId, `⚠️ O agente *${riotId}* não foi encontrado nos nossos servidores.\n\nPor favor, acesse o site [protocolov.com](https://protocolov.com) e preencha o formulário de alistamento primeiro.`, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }

        // Passo 2: Atualiza a facção no Supabase
        const { error: updateError } = await supabase
            .from('players')
            .update({ faction: faccaoEscolhida })
            .ilike('riot_id', riotId);

        if (updateError) throw updateError;

        // Passo 3: Responde com sucesso
        let icone = faccaoEscolhida === 'ALPHA' ? '🔵' : (faccaoEscolhida === 'OMEGA' ? '🔴' : '⭐');
        let msgSucesso = `${icone} *[ATUALIZAÇÃO DE REGISTRO]*\n\nO agente *${player.riot_id}* foi transferido para a força-tarefa *${faccaoEscolhida}* com sucesso!\n\nA alteração será refletida no terminal web instantaneamente.`;
        
        bot.sendMessage(chatId, msgSucesso, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('Erro ao atualizar facção:', error);
        bot.sendMessage(chatId, `🔥 Ocorreu um erro crítico ao acessar os servidores da base de dados. Tente novamente mais tarde.`);
    }
});
