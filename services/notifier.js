async function notificarTelegram(mensagem, targetChatId = null) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;
    const finalChatId = targetChatId || defaultChatId;

    if (!botToken || !finalChatId) return;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: finalChatId,
                text: mensagem,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            })
        });
        console.log(`   📡 Transmissão enviada para ${targetChatId ? 'agente' : 'base'} (Telegram).`);
    } catch (error) {
        console.error("   ❌ Falha na transmissão via Telegram:", error);
    }
}

async function alertarLoboSolitario(riotId, telegramId = null) {
    const agente = riotId.split('#')[0];
    const msgLobo = `🐺 *[ALERTA DE LOBO SOLITÁRIO]*\n\nO agente *${agente}* foi detetado a operar sozinho nas linhas inimigas (SoloQ).\n\nResgatem este operador para uma *Party* antes que a sanidade acabe!`;
    await notificarTelegram(msgLobo);
    
    if (telegramId) {
        const dmPrivada = `> ⚠️ *[INTERFACE MECÂNICA K.A.I.O]*\n> DETETADA INFRAÇÃO TÁTICA.\n\nPrezado ${agente}, detectamos que operaste sem esquadrão. A tua Sinergia não foi incrementada. Volta à rede de rádio imediatamente.`;
        await notificarTelegram(dmPrivada, telegramId);
    }
}

async function notificarOperacao(op) {
    const agentes = op.squad.map(m => m.riotId.split('#')[0]).join(', ');
    const iconeResultado = op.result === 'VITÓRIA' ? '🟢' : (op.result === 'EMPATE' ? '🟡' : '🔴');

    const intelMessage = `🚨 *[PROTOCOLO V - INTEL]* 🚨\n\nOperação finalizada no setor *${op.map}*\n👥 *Esquadrão:* ${agentes}\n${iconeResultado} *Resultado:* ${op.result} (${op.score})\n\n[Aceder ao Terminal Principal](https://protocolov.com)`;

    await notificarTelegram(intelMessage);
}

module.exports = { notificarTelegram, alertarLoboSolitario, notificarOperacao };
