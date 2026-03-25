require('dotenv').config();
const { supabase, oraculo: oraculoExt } = require('./db');
const settings = require('./settings.json');

// Modulos Refatorados
const PlayerWorker = require('./services/player-worker');
const SynergyEngine = require('./services/synergy-engine');
const { alertarLoboSolitario, notificarOperacao } = require('./services/notifier');

const henrikApiKey = process.env.HENRIK_API_KEY;
const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
    try {
        console.log('--- PROTOCOLO V: COORDINATOR ONLINE ---');
        
        // 1. Carregar Roster e Histórico
        const { data: records, error: dbError } = await supabase.from('players').select('*');
        if (dbError) throw new Error('Erro a ler jogadores do Supabase');

        const { data: opsRecords } = await supabase.from('operations').select('id').order('started_at', { ascending: false }).limit(500);
        const knownMatchIds = new Set(opsRecords ? opsRecords.map(op => op.id) : []);
        
        const rosterMap = new Set(records.map(r => r.riot_id.toLowerCase().replace(/\s/g, '')));
        const riotIdRegex = /^[^#]{2,16}#[a-zA-Z0-9]{3,5}$/;

        // 2. Processar Agentes (Workers)
        let playersWorkersResults = [];
        let allNewMatches = new Map();
        
        const BATCH_SIZE = settings.api.batch_size;
        const validPlayers = records.filter(r => r.riot_id && riotIdRegex.test(r.riot_id.trim()));

        console.log(`2. Sincronizando ${validPlayers.length} agentes em lotes de ${BATCH_SIZE}...`);

        for (let i = 0; i < validPlayers.length; i += BATCH_SIZE) {
            const batch = validPlayers.slice(i, i + BATCH_SIZE);
            console.log(`\n⏳ Lote ${Math.floor(i / BATCH_SIZE) + 1}...`);

            const results = await Promise.allSettled(batch.map(async (p) => {
                const worker = new PlayerWorker(p, henrikApiKey);
                return await worker.fetchAndProcess(knownMatchIds);
            }));

            results.forEach(res => {
                if (res.status === 'fulfilled') {
                    playersWorkersResults.push(res.value);
                    if (res.value.newMatches) {
                        res.value.newMatches.forEach((m, id) => allNewMatches.set(id, m));
                    }
                }
            });

            if (i + BATCH_SIZE < validPlayers.length) await delay(settings.api.base_delay_ms);
        }

        // 3. Processar Gamificação (Engine)
        console.log(`\n3. Processando Sinergia e Operações (${allNewMatches.size} novas partidas)...`);
        const { operations, newSynergyPoints, newDmPoints } = SynergyEngine.processMatchResults(allNewMatches, rosterMap);

        // 4. Atualizar Jogadores e Notificar Lobos
        const validResults = playersWorkersResults.filter(r => !r.playerData.is_ghost);
        const ghosts = playersWorkersResults.filter(r => r.playerData.is_ghost);

        const finalPlayersUpdate = validResults.map(res => {
            const nId = res.playerData.riot_id.toLowerCase().replace(/\s/g, '');
            const earnedPoints = newSynergyPoints[nId] || 0;
            const earnedDm = newDmPoints[nId] || 0;
            
            let isLoneWolf = res.playerData.lone_wolf;
            if (res.stats.comp > 0 && res.stats.group === 0) {
                if (!isLoneWolf) alertarLoboSolitario(res.playerData.riot_id, res.playerData.telegram_id);
                isLoneWolf = true;
            } else if (res.stats.group > 0) {
                isLoneWolf = false;
            }

            return {
                ...res.playerData,
                synergy_score: (res.playerData.synergy_score || 0) + earnedPoints,
                dm_score: (res.playerData.dm_score || 0) + earnedDm,
                dm_score_monthly: (res.playerData.dm_score_monthly || 0) + earnedDm,
                dm_score_total: (res.playerData.dm_score_total || 0) + earnedDm,
                lone_wolf: isLoneWolf
            };
        });

        const { error: pError } = await supabase.from('players').upsert(finalPlayersUpdate, { onConflict: 'riot_id' });
        if (pError) console.error('Erro ao guardar jogadores:', pError);

        // 5. Salvar Operações e Oráculo Queue
        for (const op of operations) {
            const { error: opError } = await supabase.from('operations').upsert({
                id: op.id, map: op.map, mode: op.mode, started_at: op.started_at,
                score: op.score, result: op.result, team_color: op.team_color
            }, { onConflict: 'id' });

            if (!opError && op.squad?.length > 0) {
                const squadData = op.squad.map(m => ({
                    operation_id: op.id, riot_id: m.riotId, agent: m.agent, agent_img: m.agentImg, kda: m.kda, hs_percent: m.hs
                }));
                await supabase.from('operation_squads').delete().eq('operation_id', op.id);
                await supabase.from('operation_squads').insert(squadData);

                if (op.mode.toLowerCase() === 'competitive') {
                    await notificarOperacao(op);
                    
                    // Oráculo Queue (AUTO-SCAN)
                    if (oraculoExt) {
                        await oraculoExt.from('match_analysis_queue').upsert([{
                            match_id: op.id, agente_tag: 'AUTO',
                            status: 'pending'
                        }], { onConflict: 'match_id,agente_tag' });
                    }
                }
            }
        }

        // 6. Maintenance (Purge Inativos & Protocolo Fantasma)
        console.log('4. Limpeza de Agentes Inativos...');
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('players').delete().eq('synergy_score', 0).lt('created_at', sevenDaysAgo);

        if (ghosts.length > 0) {
            console.log(`   👻 Protocolo Fantasma: Removendo ${ghosts.length} agentes inexistentes...`);
            for (const g of ghosts) {
                await supabase.from('players').delete().eq('riot_id', g.playerData.riot_id);
                console.log(`      [-] ${g.playerData.riot_id} expurgado.`);
            }
        }

        console.log('✅ Sincronização concluída com sucesso!');
        
        // 7. Oráculo Queue Health Check (Ensuring last 10 competitive ops are queued)
        if (oraculoExt) {
            const { data: recentOps } = await supabase.from('operations').select('id').eq('mode', 'Competitive').order('started_at', { ascending: false }).limit(10);
            if (recentOps && recentOps.length > 0) {
                const opIds = recentOps.map(op => op.id);
                const { data: existingQueue } = await oraculoExt.from('match_analysis_queue').select('match_id').in('match_id', opIds).eq('agente_tag', 'AUTO');
                const queuedIds = new Set(existingQueue ? existingQueue.map(q => q.match_id) : []);
                const missingOps = recentOps.filter(op => !queuedIds.has(op.id));
                if (missingOps.length > 0) {
                    console.log(`📡 Oráculo Sync: Adicionando ${missingOps.length} operações em falta à fila...`);
                    const newEntries = missingOps.map(op => ({ match_id: op.id, agente_tag: 'AUTO', status: 'pending' }));
                    await oraculoExt.from('match_analysis_queue').insert(newEntries);
                }
            }
        }

    } catch (error) {
        console.error('🔥 Erro fatal no Coordenador:', error);
        process.exit(1);
    }
}

if (require.main === module) run();

module.exports = { run };
