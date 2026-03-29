const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { supabase } = require('../src/db');
const OraculoService = require('../services/oraculo-service');
const { smartFetch } = require('../services/api-client');

const TARGET_PLAYER = 'ousadia#013';

async function backfill() {
    console.log(`🚀 [BACKFILL] Iniciando varredura histórica para: ${TARGET_PLAYER}`);

    try {
        // 1. Buscar partidas competitivas no banco local (Tabela operations)
        const { data: matches, error: matchesErr } = await supabase
            .from('operations')
            .select('*')
            .eq('mode', 'Competitive')
            .order('started_at', { ascending: false });

        if (matchesErr) throw matchesErr;

        console.log(`🔍 Encontradas ${matches.length} partidas competitivas. Filtrando pendentes...`);

        for (const match of matches) {
            // Verificar se já existe insight para este player nesta partida
            const { data: existing, error: checkErr } = await supabase
                .from('ai_insights')
                .select('id')
                .eq('match_id', match.id)
                .eq('player_id', TARGET_PLAYER);
                // .single(); // Single throws if not found? Let's use simple select
            
            if (existing && existing.length > 0) {
                console.log(`   [✔] Match ${match.id.substring(0,8)} já possui insight. Pulando.`);
                continue;
            }

            console.log(`   [⏳] Match ${match.id.substring(0,8)} pendente. Recuperando squad de Henrik API...`);

            try {
                let op = null;
                // 1. Tentar recuperar dados completos da partida via Henrik API
                const res = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/match/${match.id}`, { 
                    'Authorization': process.env.HENRIK_API_KEY 
                });
                
                if (res.status === 200) {
                    const json = await res.json();
                    const matchData = Array.isArray(json.data) ? json.data[0] : (json.data?.match_data || json.data);
                    const players = Array.isArray(matchData.players) ? matchData.players : (matchData.players?.all_players || []);
                    
                    const targetMatchPlayer = players.find(p => `${p.name}#${p.tag}`.toLowerCase() === TARGET_PLAYER.toLowerCase());
                    if (targetMatchPlayer) {
                        op = {
                            id: match.id,
                            map: match.map_name,
                            mode: match.mode,
                            rawMatchData: matchData,
                            squad: [{
                                riotId: `${targetMatchPlayer.name}#${targetMatchPlayer.tag}`,
                                agent: targetMatchPlayer.character || targetMatchPlayer.agent,
                                kda: `${targetMatchPlayer.stats.kills}/${targetMatchPlayer.stats.deaths}/${targetMatchPlayer.stats.assists}`
                            }]
                        };
                    }
                } else if (res.status === 404) {
                    console.warn(`   [⚠️] Match ${match.id.substring(0,8)} não encontrada na API (404). Usando dados locais...`);
                    
                    // Fallback: Buscar dados na tabela operation_squads (Case-insensitive)
                    const { data: squadData, error: squadErr } = await supabase
                        .from('operation_squads')
                        .select('agent, kda, riot_id')
                        .eq('operation_id', match.id)
                        .ilike('riot_id', TARGET_PLAYER)
                        .limit(1);

                    if (!squadErr && squadData && squadData.length > 0) {
                        const player = squadData[0];
                        op = {
                            id: match.id,
                            map: match.map_name,
                            mode: match.mode,
                            rawMatchData: null, // Sem métricas avançadas (ADR/KAST)
                            squad: [{
                                riotId: player.riot_id,
                                agent: player.agent,
                                kda: player.kda
                            }]
                        };
                    } else {
                        console.error(`   [❌] Dados locais não encontrados para ${TARGET_PLAYER} no Match ${match.id.substring(0,8)}`);
                    }
                } else {
                    console.error(`   [❌] Erro de API: Status ${res.status}`);
                }

                if (op) {
                    // Despachar para o serviço unificado
                    await OraculoService.processMatchAnalysis(op);
                    console.log(`   [💡] Análise concluída. Aguardando cool-down...`);
                    await new Promise(r => setTimeout(r, 2000));
                }

            } catch (pErr) {
                console.error(`   [❌] Erro ao processar match ${match.id}:`, pErr.message);
            }
        }

        console.log('\n✅ [BACKFILL] Processamento concluído!');

    } catch (error) {
        console.error('\n🔥 [BACKFILL] Erro fatal:', error);
    }
}

backfill();
