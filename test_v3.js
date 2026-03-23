const { analyzeMatch } = require('./oraculo');

async function test() {
    const matchId = '5938b37b-527b-4ef6-bede-4c431ae7b427';
    const playerTag = 'OzWiX#4384';
    
    console.log(`🧪 Testando análise V3 para ${playerTag} na partida ${matchId}...`);
    
    try {
        const result = await analyzeMatch(matchId, playerTag);
        if (result.status === 'completed') {
            console.log("✅ Análise concluída com sucesso!");
            console.log("   Performance Index:", result.report.performance_index);
            console.log("   ADR:", result.report.adr);
            console.log("   K/D:", result.report.kd);
            console.log("   Conselho:", result.report.conselho_kaio);
            console.log("   Rounds analisados:", result.report.rounds.length);
        } else {
            console.error("❌ Falha na análise:", result.error);
        }
    } catch (err) {
        console.error("🔥 Erro inesperado:", err);
    }
}

test();
