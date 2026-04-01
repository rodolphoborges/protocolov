const { supabase } = require('./db');
const { smartFetch } = require('../services/api-client');
const SynergyEngine = require('../services/synergy-engine');
const OraculoService = require('../services/oraculo-service');

async function run() {
    console.log('--- INICIANDO COORDENADOR PROTOCOLO-V ---');
    
    let hasFailures = false;
    let totalFailed = 0;
    let totalSuccess = 0;

    try {
        // ... (existing roster fetch)
        const { data: roster, error: rosterErr } = await supabase
            .from('players')
            .select('*, last_match_id');
        
        if (rosterErr) throw rosterErr;
        const rosterIds = roster.map(p => p.riot_id);
        const rosterMap = new Map(roster.map(p => [p.riot_id.toLowerCase().replace(/\s/g, ''), p]));

        console.log(`1. Monitorando ${roster.length} agentes no radar...`);

        // ... (existing match fetch)
        console.log(`2. Varrendo satélites em busca de novas operações...`);
        const henrikKey = process.env.HENRIK_API_KEY;
        const matchesBatch = new Map();

        // 🌱 Pre-seed com operações já processadas para evitar redundância extrema
        const { data: recentOps } = await supabase
            .from('operations')
            .select('id')
            .order('started_at', { ascending: false })
            .limit(50);
        
        if (recentOps) {
            recentOps.forEach(op => matchesBatch.set(op.id, { processed: true }));
        }

        // Sequential agent scanning to strictly respect HenrikDev API limits (10/min)
        const playersToSync = [];

        for (const agent of roster) {
            const [name, tag] = agent.riot_id.split('#');
            try {
                const url = `https://api.henrikdev.xyz/valorant/v3/matches/br/${name}/${tag}`;
                const res = await smartFetch(url, { 'Authorization': henrikKey });
                
                if (res.status === 200) {
                    const json = await res.json();
                    const matches = json.data || [];

                    if (matches.length > 0 && agent.last_match_id === matches[0].metadata.matchid) {
                        console.log(`   [💤] ${agent.riot_id}: Sem novas operações.`);
                        continue;
                    }

                    let newOnes = 0;
                    let soloDetail = 0;
                    let squadDetail = 0;

                    matches.forEach(m => {
                        if (m.metadata && !matchesBatch.has(m.metadata.matchid)) {
                            matchesBatch.set(m.metadata.matchid, m);
                            newOnes++;

                            // Identificação rápida de Solo/Squad para o log
                            const players = m.players?.all_players || m.players || [];
                            const pVCount = players.filter(p => 
                                rosterMap.has(`${p.name}#${p.tag}`.toLowerCase().replace(/\s/g, ''))
                            ).length;
                            
                            if (pVCount > 1) squadDetail++;
                            else soloDetail++;
                        }
                    });

                    if (newOnes > 0) {
                        console.log(`   [📡] ${agent.riot_id}: ${newOnes} novas operações (${soloDetail} Solo / ${squadDetail} Grupo).`);
                        // Guardar o ID da partida mais recente para atualizar o cache depois
                        playersToSync.push({ riot_id: agent.riot_id, last_match_id: matches[0].metadata.matchid });
                    }
                }
            } catch (err) {
                console.error(`   [⚠️] Falha ao consultar histórico de ${agent.riot_id}: ${err.message}`);
            }
        }

        // 3. Processamento de Sinergia e Resultados
        console.log(`3. Calculando Sinergia e Impacto Tático (${matchesBatch.size} partidas)...`);
        const { operations, newSynergyPoints, newDmPoints } = SynergyEngine.processMatchResults(matchesBatch, rosterMap);

        // 4. Persistência de Dados (Upsert de Players e Insert de Operações)
        if (operations.length > 0) {
            const soloCount = operations.filter(op => op.isSolo).length;
            const squadCount = operations.filter(op => !op.isSolo && op.mode !== 'Deathmatch').length;
            const dmCount = operations.filter(op => op.mode === 'Deathmatch').length;

            console.log(`   [⚡] Detectadas: ${soloCount} Solo / ${squadCount} Grupo / ${dmCount} Treino.`);
            console.log(`   [⚡] Sincronizando registros no Banco Central...`);
            
            // ... (players update)
            const playersToUpdate = [];
            for (const p of roster) {
                const nId = p.riot_id.toLowerCase().replace(/\s/g, '');
                const addedSynergy = newSynergyPoints[nId] || 0;
                const addedDm = newDmPoints[nId] || 0;

                if (addedSynergy > 0 || addedDm > 0) {
                    playersToUpdate.push({
                        ...p,
                        synergy_score: p.synergy_score + addedSynergy,
                        dm_score_total: (p.dm_score_total || 0) + addedDm,
                        api_error: false,
                        updated_at: new Date().toISOString()
                    });
                }
            }

            if (playersToUpdate.length > 0) {
                const { error: upsertErr } = await supabase.from('players').upsert(playersToUpdate);
                if (upsertErr) console.error(`   [❌] Erro ao atualizar scores: ${upsertErr.message}`);
            }

            // Atualizar Cache de Last Match
            if (playersToSync.length > 0) {
                for (const p of playersToSync) {
                    await supabase.from('players').update({ 
                        last_match_id: p.last_match_id,
                        last_scan_at: new Date().toISOString()
                    }).eq('riot_id', p.riot_id);
                }
            }

            // Registro das operações e gatilho do Oráculo (Processamento em Paralelo de 2 em 2)
            const processOp = async (op) => {
                // 1. Registrar a Operação Principal
                const { error: opInsErr } = await supabase.from('operations').insert([{
                    id: op.id,
                    map_name: op.map,
                    mode: op.mode,
                    started_at: op.started_at,
                    score: op.score,
                    result: op.result,
                    team_color: op.team_color
                }]);

                // 2. Registrar os Membros do Esquadrão (Resiliente a falta de constraint única)
                if (op.squad && op.squad.length > 0) {
                    // Buscar membros já registrados para evitar duplicatas manuais
                    const { data: existingSquad } = await supabase
                        .from('operation_squads')
                        .select('riot_id')
                        .eq('operation_id', op.id);
                    
                    const existingIds = new Set(existingSquad?.map(s => s.riot_id.toLowerCase()) || []);
                    const squadRecords = op.squad
                        .filter(m => !existingIds.has(m.riotId.toLowerCase()))
                        .map(m => ({
                            operation_id: op.id,
                            riot_id: m.riotId,
                            agent: m.agent,
                            agent_img: m.agentImg,
                            kda: m.kda,
                            hs_percent: m.hs
                        }));
                    
                    if (squadRecords.length > 0) {
                        const { error: sqErr } = await supabase.from('operation_squads').insert(squadRecords);
                        if (sqErr) console.error(`   [❌] Erro ao registrar squad para ${op.id}: ${sqErr.message}`);
                    }
                }

                // 3. Gatilho de Análise IA (Apenas Competitivo)
                if (op.mode === 'Competitive') {
                    try {
                        const analysisResult = await OraculoService.processMatchAnalysis(op);
                        if (analysisResult) {
                            totalSuccess += analysisResult.successCount;
                            totalFailed += analysisResult.failureCount;
                            if (analysisResult.failureCount > 0) hasFailures = true;
                        }
                    } catch (err) {
                        console.error(`   [❌] Falha no gatilho Oráculo: ${err.message}`);
                        hasFailures = true;
                    }
                }
            };

            const opChunks = [];
            for (let i = 0; i < operations.length; i += 10) {
                opChunks.push(operations.slice(i, i + 10));
            }

            for (const chunk of opChunks) {
                await Promise.all(chunk.map(processOp));
            }
        }

        // 5. Limpeza de Agentes Inativos (Maintenance)
        console.log('\n4. Manutenção de Sistema...');
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('players').delete().eq('synergy_score', 0).lt('created_at', sevenDaysAgo);

        if (hasFailures) {
            console.error(`\n⚠️ Sincronização concluída com FALHAS PARCIAIS.`);
            console.error(`   Sucesso: ${totalSuccess} | Falha: ${totalFailed}`);
            console.error(`   Isso geralmente ocorre por Timeouts ou indisponibilidade da Bridge.`);
            process.exit(1);
        } else {
            console.log('\n✅ Sincronização concluída com sucesso!');
            console.log(`   Estatísticas: ${totalSuccess} análises processadas.`);
            console.log('5. Integridade do Oráculo V garantida via REST Bridge.');
        }

        // 6. Reunificação Tática Automática (Top 5 Alpha / Next 5 Omega)
        console.log('\n6. Executando Portaria de Escalonamento de Elite...');
        const { reunificar } = require('./auto-unidades');
        await reunificar();

    } catch (error) {
        console.error('\n🔥 Erro fatal no Coordenador:', error);
        process.exit(1);
    }
}

if (require.main === module) run();

module.exports = { run };
