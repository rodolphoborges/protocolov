const { supabase } = require('./db');
const OraculoService = require('../services/oraculo-service');
const OraculoIntegrationService = require('../services/OraculoIntegrationService');

async function notificarOperacao(op) {
    console.log(`   [📢] Notificação: Operação ${op.id.substring(0,8)} | Mapa: ${op.map_name} | Modo: ${op.mode}`);
}

async function run() {
    console.log('--- INICIANDO COORDENADOR PROTOCOLO-V ---');
    
    try {
        // 1. Fetch de Operações Pendentes (Simulado para este exemplo)
        // No sistema real, isso viria de uma fila ou do banco.
        const { data: operations, error: opError } = await supabase
            .from('matches')
            .select('*, operation_squads(*)')
            .eq('status', 'pending');

        if (opError) throw opError;

        console.log(`1. Processando ${operations?.length || 0} operações pendentes...`);

        for (const op of operations || []) {
            console.log(`   [→] Sincronizando Match: ${op.id.substring(0,8)}...`);
            
            // 2. Atualizar status para processado
            await supabase.from('matches').update({ status: 'completed' }).eq('id', op.id);

            // 3. Notificações e Gatilhos
            if (op.is_competitive) {
                await notificarOperacao(op);
                
                // [NOVO] Gatilho de Integração Oráculo-V
                // Processa a análise tática e atualiza performance do jogador
                if (op.match_id) {
                    OraculoIntegrationService.notifyMatch(op.match_id)
                        .catch(err => console.error(`   [❌] Falha no gatilho Oráculo: ${err.message}`));
                }
            }
        }

        // ==========================================
        // 6. ORÁCULO-V: TACTICAL INTELLIGENCE BRIDGE
        // ==========================================
        console.log(`\n🧠 [INTELIGÊNCIA] Verificando pendências de análise tática...`);
        
        try {
            // Find competitive matches from the last 24h that might need analysis
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            
            const { data: recentMatches, error: matchError } = await supabase
                .from('matches')
                .select(`
                    id, 
                    map_name,
                    operation_squads (
                        riotId,
                        agent,
                        rank
                    )
                `)
                .eq('is_competitive', true)
                .gte('created_at', oneDayAgo);

            if (matchError) throw matchError;

            if (recentMatches && recentMatches.length > 0) {
                // Check which ones already have insights
                const matchIds = recentMatches.map(m => m.id);
                const { data: existingInsights, error: insightError } = await supabase
                    .from('ai_insights')
                    .select('match_id, player_id')
                    .in('match_id', matchIds);

                if (insightError) throw insightError;

                // Simple map for quick lookup
                const insightMap = new Set((existingInsights || []).map(i => `${i.match_id}-${i.player_id}`));

                for (const match of recentMatches) {
                    const squad = match.operation_squads || [];
                    
                    for (const member of squad) {
                        const key = `${match.id}-${member.riotId}`;
                        
                        if (!insightMap.has(key)) {
                            console.log(`   [⚡] Despachando análise pendente: Match ${match.id.substring(0,8)} | Agente: ${member.riotId}`);
                            
                            // Async dispatch
                            OraculoService.processMatchAnalysis(match, [member])
                                .catch(err => console.error(`   [❌] Falha no retry da análise: ${err.message}`));
                        }
                    }
                }
            } else {
                console.log(`   [✓] Nenhuma análise pendente detectada.`);
            }
        } catch (err) {
            console.error(`   [⚠️] Erro ao processar inteligência: ${err.message}`);
        }

        // 6. Maintenance (Purge Inativos)
        console.log('\n4. Limpeza de Agentes Inativos...');
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('players').delete().eq('synergy_score', 0).lt('created_at', sevenDaysAgo);

        console.log('\n✅ Sincronização concluída com sucesso!');
        console.log('5. Integridade do Oráculo V garantida via REST Bridge.');

    } catch (error) {
        console.error('\n🔥 Erro fatal no Coordenador:', error);
        process.exit(1);
    }
}

if (require.main === module) run();

module.exports = { run };
