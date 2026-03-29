const { supabase } = require('../src/db');
const axios = require('axios');

/**
 * OraculoService
 * 
 * Ponte de comunicação entre o Protocolo-V e o Motor Tático Oráculo-V.
 * Despacha briefings e guarda os resultados (insights) localmente.
 */
class OraculoService {
    constructor() {
        this.apiUrl = process.env.ORACULO_API_URL || 'http://localhost:3000';
        this.apiKey = process.env.ORACULO_API_KEY;
    }

    /**
     * Envia os dados de uma operação finalizada para análise no Oráculo.
     * @param {object} op Operação (Match) do Protocolo-V
     */
    async processMatchAnalysis(op) {
        if (!op || !op.id || !op.squad) return;

        console.log(`📡 [ORÁCULO-BRIDGE] Despachando análise para Match: ${op.id}`);

        // Processamos cada membro da squad individualmente (ou conforme definição do Oráculo)
        for (const member of op.squad) {
            try {
                const briefing = {
                    match_id: op.id,
                    player_id: member.riotId,
                    map_name: op.map || op.map_name,
                    agent_name: member.agent,
                    squad_stats: op.squad.map(s => ({
                        player_id: s.riotId,
                        agent: s.agent,
                        kda: s.kda
                    })),
                    raw_data: op // Envia o snapshot da operação
                };

                console.log(`   [→] Analisando ${member.riotId}...`);

                // Chamada à API Síncrona do Oráculo-V
                const response = await axios.post(`${this.apiUrl}/api/analyze`, briefing, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 45000 // 45 segundos de timeout para análise IA
                });

                if (response.data && response.data.insight) {
                    const insight = response.data.insight;
                    const technicalData = response.data.technical_data;
                    console.log(`   [←] Insight recebido (${insight.model_used}). Guardando localmente...`);

                    // Persistência Local no Protocolo-V
                    const { error: insError } = await supabase.from('ai_insights').upsert([{
                        match_id: op.id,
                        player_id: member.riotId,
                        insight_resumo: insight.resumo,
                        model_used: insight.model_used,
                        analysis_report: technicalData // Novo campo para relatório técnico
                    }], { onConflict: 'match_id,player_id' });

                    if (insError) console.error(`   [❌] Falha ao guardar insight no banco local: ${insError.message}`);
                }
            } catch (err) {
                console.error(`   [❌] Erro ao processar análise para ${member.riotId}:`, err.response?.data?.error || err.message);
                // No MVP não fazemos retry automático, logamos o erro para manutenção
            }
        }
    }
}

module.exports = new OraculoService();
