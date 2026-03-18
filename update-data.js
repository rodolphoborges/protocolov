const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const henrikApiKey = process.env.HENRIK_API_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BASE_DELAY = 4000; // Alvo Exato: 15 req/min limpas 
let currentDelay = BASE_DELAY;
const delay = ms => new Promise(res => setTimeout(res, ms));

let apiRequestsCount = 0;
let rateLimitResetTime = 0;

async function smartFetch(url, headers, retries = 3) { 
    const now = Date.now();
    if (now < rateLimitResetTime) {
        const waitTime = rateLimitResetTime - now;
        console.log(`      ⏳ Aguardando cooldown global (${Math.ceil(waitTime/1000)}s)...`);
        await delay(waitTime);
    }

    const start = Date.now();
    let response = null; 
    let error = null;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s de timeout máximo na call

    try {
        response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
        apiRequestsCount++;

        // A HenrikDev também pode retornar 403 / 503 quando há sobrecarga na Riot
        if ((response.status === 429 || response.status === 403 || response.status >= 500) && retries > 0) {
            
            // JITTER TÁTICO: Aumenta o tempo base em algo variável de 15% a 30% a cada strike
            const penaltyMultiplier = 1.15 + (Math.random() * 0.15); 
            currentDelay = Math.min(Math.floor(currentDelay * penaltyMultiplier), 6000); // Nunca ultrapassa os 6 segundos per request (cap duro)
            
            let resetInSeconds = parseInt(response.headers.get('x-ratelimit-reset')) || 30; // Pode ser falso.
            
            // Se a API pedir menos de 10s, subimos para 15s para ter a certeza absoluta. Se for muito, respeitamos.
            resetInSeconds = Math.max(resetInSeconds, 15);
            
            // Adiciona Jitter (ruído aleatório) à pausa para nunca reatar em momentos exactos e previsíveis (1 a 5 segundos de ruído)
            const jitterMs = Math.floor(Math.random() * 4000) + 1000;
            const totalWaitMs = (resetInSeconds * 1000) + jitterMs;
            
            console.log(`      ⛔ Block API (${response.status})! Radar lento: ${currentDelay}ms/req. Evadindo radiação por ${Math.ceil(totalWaitMs/1000)}s...`);
            
            rateLimitResetTime = Date.now() + totalWaitMs; 
            await delay(totalWaitMs);
             
            return await smartFetch(url, headers, retries - 1);
        }
    } catch (e) { 
        clearTimeout(timeoutId);
        error = e; 
    }
    
    const elapsed = Date.now() - start;
    const remainingDelay = Math.max(0, currentDelay - elapsed);
    if (remainingDelay > 0) {
        // MICRO-JITTER PÓS-CALL: Atrasar mais uns ms extra aleatórios para despistar algoritmos heurísticos
        const postCallJitter = Math.floor(Math.random() * 300);
        await delay(remainingDelay + postCallJitter);
    }
    
    if (error) throw error;
    return response;
}

async function notificarTelegram(mensagem) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) return;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: mensagem,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            })
        });
        console.log("   📡 Transmissão enviada para a base (Telegram).");
    } catch (error) {
        console.error("   ❌ Falha na transmissão via Telegram:", error);
    }
}

async function run() {
    try {
        console.log('--- PROTOCOLO V: SUPABASE SYNC ONLINE ---');
        console.log('1. A buscar inscritos e memória de operações...');
        
        const { data: records, error: dbError } = await supabase.from('players').select('*');
        if (dbError) throw new Error('Erro a ler jogadores do Supabase');

        const { data: opsRecords } = await supabase.from('operations').select('id').order('started_at', { ascending: false }).limit(500);
        const knownMatchIds = new Set(opsRecords ? opsRecords.map(op => op.id) : []);

        let playersToFetch = [];
        let rosterMap = new Set(); 
        const riotIdRegex = /^[^#]{2,16}#[a-zA-Z0-9]{3,5}$/;

        for (const record of records) {
            if (record.riot_id && riotIdRegex.test(record.riot_id.trim())) {
                playersToFetch.push({ role: record.role_raw, riotId: record.riot_id.trim(), dbRecord: record });
                rosterMap.add(record.riot_id.trim().toLowerCase().replace(/\s/g, ''));
            }
        }

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        let playerMatchStats = {}; 
        const headers = { 'Authorization': henrikApiKey };

        console.log(`2. A sincronizar API (${playersToFetch.length} agentes) em modo furtivo (sequencial)...`);
        
        for (const p of playersToFetch) {
            const [name, tag] = p.riotId.split('#');
            const safeName = encodeURIComponent(name.trim());
            const safeTag = encodeURIComponent(tag.trim());
            const normalizedPlayerId = p.riotId.toLowerCase().replace(/\s/g, '');
            
            console.log(`      -> A extrair dados de: ${p.riotId}`);
            
            playerMatchStats[normalizedPlayerId] = { comp: 0, group: 0 };

            let playerData = {
                riot_id: p.riotId, 
                role_raw: p.role,
                unit: p.dbRecord.unit || 'WINGMAN', // PRESERVA A UNIDADE TÁTICA OU DEFINE COMO WINGMAN
                synergy_score: p.dbRecord.synergy_score || 0, 
                dm_score: p.dbRecord.dm_score || 0,
                dm_score_monthly: p.dbRecord.dm_score_monthly || 0, 
                dm_score_total: p.dbRecord.dm_score_total || 0,     
                tracker_link: p.dbRecord.tracker_link || `https://tracker.gg/valorant/profile/riot/${safeName}%23${safeTag}/overview`,
                level: p.dbRecord.level,
                card_url: p.dbRecord.card_url,
                current_rank: p.dbRecord.current_rank || 'Pendente',
                peak_rank: p.dbRecord.peak_rank,
                current_rank_icon: p.dbRecord.current_rank_icon,
                peak_rank_icon: p.dbRecord.peak_rank_icon,
                lone_wolf: p.dbRecord.lone_wolf || false,
                api_error: false,
                updated_at: new Date().toISOString()
            };

            let region = 'br'; 
            let hasNewMatches = false;

            try {
                let listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=20`, headers);

                if (listRes.status === 200) {
                    const listData = await listRes.json();
                    
                    const recentCompMatches = listData.data ? listData.data.filter(m => m.metadata?.mode?.toLowerCase() === 'competitive') : [];
                    const recentDmMatches = listData.data ? listData.data.filter(m => m.metadata?.mode?.toLowerCase() === 'deathmatch') : [];
                    
                    playerMatchStats[normalizedPlayerId].comp = recentCompMatches.length;

                    if (recentCompMatches.length > 0) {
                        for (const matchCandidate of recentCompMatches) {
                            const matchId = matchCandidate.metadata.matchid;
                            if (knownMatchIds.has(matchId)) playerMatchStats[normalizedPlayerId].group++;
                            if (allMatchesMap.has(matchId) || knownMatchIds.has(matchId)) continue;
                            
                            hasNewMatches = true;
                            let bestMatch = matchCandidate;
                            if (bestMatch.players && !Array.isArray(bestMatch.players) && bestMatch.players.all_players) bestMatch.players = bestMatch.players.all_players;
                            allMatchesMap.set(matchId, bestMatch);
                        }
                    }

                    if (recentDmMatches.length > 0) {
                        for (const matchCandidate of recentDmMatches) {
                            const matchId = matchCandidate.metadata.matchid;
                            if (allMatchesMap.has(matchId) || knownMatchIds.has(matchId)) continue;
                            
                            hasNewMatches = true;
                            let bestMatch = matchCandidate;
                            if (bestMatch.players && !Array.isArray(bestMatch.players) && bestMatch.players.all_players) bestMatch.players = bestMatch.players.all_players;
                            allMatchesMap.set(matchId, bestMatch);
                        }
                    }

                } else if (listRes.status === 404) {
                    playerData.api_error = true;
                } else {
                    playerData.api_error = true;
                }

                const isMissingData = !playerData.level || !playerData.current_rank || playerData.current_rank === 'Processando...' || playerData.current_rank === 'Pendente';

                if (!playerData.api_error) {
                    if (hasNewMatches) {
                        try {
                            const allRecentObj = listData.data.find(m => m.players && m.players.all_players);
                            
                            if (allRecentObj) {
                                const me = allRecentObj.players.all_players.find(p => p.name.toLowerCase() === safeName.toLowerCase() && p.tag.toLowerCase() === safeTag.toLowerCase());
                                if (me) {
                                    playerData.level = me.level;
                                    if (me.assets && me.assets.card) {
                                        playerData.card_url = me.assets.card.small;
                                    }
                                    
                                    const lastCompObj = recentCompMatches.length > 0 ? recentCompMatches[0] : null;
                                    if (lastCompObj) {
                                        const meComp = lastCompObj.players.all_players.find(p => p.name.toLowerCase() === safeName.toLowerCase() && p.tag.toLowerCase() === safeTag.toLowerCase());
                                        if (meComp && meComp.currenttier_patched) {
                                            playerData.current_rank = meComp.currenttier_patched;
                                        }
                                    }
                                }
                            }
                            
                            if (isMissingData && (playerData.current_rank === 'Processando...' || playerData.current_rank === 'Pendente')) {
                                console.log(`      ⚠️ Rank ausente. Executando fallback para API de MMR (Custo extra)`);
                                const mmrRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${safeName}/${safeTag}`, headers);
                                if (mmrRes.status === 200) {
                                    const mmrData = await mmrRes.json();
                                    if (mmrData.data.current_data?.currenttierpatched) {
                                        playerData.current_rank = mmrData.data.current_data.currenttierpatched;
                                        playerData.current_rank_icon = mmrData.data.current_data.images.small;
                                    }
                                }
                            }
                        } catch (err) {
                            console.log(`      ⚠️ Falha ao extrair dados de Rank/Level nativos: ${err.message}`);
                        }
                        await delay(currentDelay); 
                    } else {
                        console.log(`      ⚡ Cache ativo: Nenhuma partida nova. Ignorando chamadas adicionais.`);
                        await delay(currentDelay); 
                    }
                }
            } catch (err) {
                playerData.api_error = true;
                console.log(`      ❌ Erro Crítico ao puxar partidas:`, err.message);
            }

            finalPlayersData.push(playerData);
        }

        console.log(`\n📊 ESTATÍSTICAS DA API: Realizadas ${apiRequestsCount} chamadas no total.\n`);

        console.log(`3. A processar operações conjuntas e Gamificação (Competitivo + DM)...`);
        let operations = [];
        let newSynergyPoints = {};
        let newDmPoints = {}; 

        for (const [matchId, match] of allMatchesMap) {
            if (!match.players || !Array.isArray(match.players)) continue;

            const mode = match.metadata.mode.toLowerCase();

            if (mode === 'deathmatch') {
                const myPlayersInDm = match.players.filter(player => rosterMap.has(`${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '')));
                
                if (myPlayersInDm.length > 0) {
                    const sortedLobby = [...match.players].sort((a, b) => b.stats.kills - a.stats.kills);
                    const p1 = sortedLobby[0];
                    const p2 = sortedLobby[1];
                    const p3 = sortedLobby[2];

                    myPlayersInDm.forEach(m => {
                        let nId = `${m.name}#${m.tag}`.toLowerCase().replace(/\s/g, '');
                        let points = m.stats.kills || 0; 
                        
                        if (p1 && m.name === p1.name && m.tag === p1.tag) points += 15;
                        else if (p2 && m.name === p2.name && m.tag === p2.tag) points += 10;
                        else if (p3 && m.name === p3.name && m.tag === p3.tag) points += 5;

                        newDmPoints[nId] = (newDmPoints[nId] || 0) + points;
                    });

                    operations.push({
                        id: matchId, map: match.metadata.map, mode: 'Deathmatch',
                        started_at: match.metadata.game_start * 1000, 
                        score: 'TREINO', result: 'MATA-MATA', team_color: 'N/A',
                        squad: [] 
                    });
                }
            } 
            else if (mode === 'competitive') {
                const squadMembers = match.players.filter(player => rosterMap.has(`${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '')));
                if (squadMembers.length >= 2) {
                    const teamId = squadMembers[0].team; 
                    const teamData = (match.teams && teamId) ? match.teams[teamId.toLowerCase()] : null; // CORREÇÃO: Prevenção de Remakes
                    
                    let finalResult = 'DERROTA';
                    if (match.teams) {
                        if (match.teams.blue.rounds_won === match.teams.red.rounds_won) finalResult = 'EMPATE';
                        else if (teamData && teamData.has_won) finalResult = 'VITÓRIA';
                    }

                    let basePoints = 0;
                    if (squadMembers.length === 2) basePoints = 1;
                    else if (squadMembers.length === 3) basePoints = 2;
                    else if (squadMembers.length >= 4) basePoints = 5; 

                    let earnedPoints = (finalResult === 'VITÓRIA') ? basePoints * 2 : basePoints;

                    squadMembers.forEach(m => {
                        let nId = `${m.name}#${m.tag}`.toLowerCase().replace(/\s/g, '');
                        newSynergyPoints[nId] = (newSynergyPoints[nId] || 0) + earnedPoints;
                        if(playerMatchStats[nId]) playerMatchStats[nId].group++;
                    });
                    
                    operations.push({
                        id: matchId, map: match.metadata.map, mode: match.metadata.mode,
                        started_at: match.metadata.game_start * 1000, 
                        score: match.teams ? `${match.teams.blue.rounds_won}-${match.teams.red.rounds_won}` : 'N/A',
                        result: finalResult, team_color: teamId,
                        squad: squadMembers.map(m => {
                            const hs = m.stats.headshots || 0;
                            const bs = m.stats.bodyshots || 0;
                            const ls = m.stats.legshots || 0;
                            const totalHits = hs + bs + ls;
                            const hsPercent = totalHits > 0 ? Math.round((hs / totalHits) * 100) : 0;
                            return {
                                riotId: `${m.name}#${m.tag}`, agent: m.character, agentImg: m.assets.agent.small,
                                kda: `${m.stats.kills}/${m.stats.deaths}/${m.stats.assists}`, hs: hsPercent
                            };
                        })
                    });
                }
            }
        }

        let novosLobosSolitarios = [];

        finalPlayersData = finalPlayersData.map(player => {
            let nId = player.riot_id.toLowerCase().replace(/\s/g, '');
            const earnedPoints = newSynergyPoints[nId] || 0;
            const earnedDm = newDmPoints[nId] || 0; 
            let stats = playerMatchStats[nId] || { comp: 0, group: 0 };
            
            let isLoneWolf = player.lone_wolf;
            
            if (stats.comp > 0 && stats.group === 0) {
                if (!isLoneWolf) novosLobosSolitarios.push(player.riot_id.split('#')[0]);
                isLoneWolf = true; 
            } else if (stats.group > 0) {
                isLoneWolf = false; 
            } 

            // CORREÇÃO: Adicionadas as somas para dm_score_monthly e dm_score_total
            return {
                ...player,
                synergy_score: player.synergy_score + earnedPoints,
                dm_score: player.dm_score + earnedDm,
                dm_score_monthly: player.dm_score_monthly + earnedDm,
                dm_score_total: player.dm_score_total + earnedDm,
                lone_wolf: isLoneWolf
            };
        });
        
        console.log('4. A guardar dados no Supabase e a transmitir alertas...');
        const { error: pError } = await supabase.from('players').upsert(finalPlayersData, { onConflict: 'riot_id' });
        if (pError) console.error('Erro ao guardar jogadores:', pError);

        for (const agente of novosLobosSolitarios) {
            const msgLobo = `🐺 *[ALERTA DE LOBO SOLITÁRIO]*\n\nO agente *${agente}* foi detetado a operar sozinho nas linhas inimigas (SoloQ).\n\nResgatem este operador para uma *Party* antes que a sanidade acabe!`;
            await notificarTelegram(msgLobo);
            await delay(1000); 
        }

        for (const op of operations) {
            const { error: opError } = await supabase.from('operations').upsert({
                id: op.id, map: op.map, mode: op.mode, started_at: op.started_at,
                score: op.score, result: op.result, team_color: op.team_color
            }, { onConflict: 'id' });

            if (!opError && op.squad && op.squad.length > 0) {
                const squadData = op.squad.map(m => ({
                    operation_id: op.id, riot_id: m.riotId, agent: m.agent, agent_img: m.agentImg, kda: m.kda, hs_percent: m.hs
                }));
                await supabase.from('operation_squads').delete().eq('operation_id', op.id);
                await supabase.from('operation_squads').insert(squadData);
                
                if (op.mode.toLowerCase() === 'competitive') {
                    const agentes = op.squad.map(m => m.riotId.split('#')[0]).join(', ');
                    const iconeResultado = op.result === 'VITÓRIA' ? '🟢' : (op.result === 'EMPATE' ? '🟡' : '🔴');
                    
                    const intelMessage = `🚨 *[PROTOCOLO V - INTEL]* 🚨\n\nOperação finalizada no setor *${op.map}*\n👥 *Esquadrão:* ${agentes}\n${iconeResultado} *Resultado:* ${op.result} (${op.score})\n\n[Aceder ao Terminal Principal](https://protocolov.com)`;
                    
                    await notificarTelegram(intelMessage);
                    await delay(1000);
                }
            }
        }

        console.log('5. Executando Purga de Agentes Inativos...');
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: purged, error: purgeError } = await supabase
            .from('players').delete().eq('synergy_score', 0).lt('created_at', sevenDaysAgo).select();
            
        if (purgeError) console.error('   ❌ Erro na purga:', purgeError);
        else if (purged && purged.length > 0) console.log(`   🧹 ${purged.length} recruta(s) removido(s).`);
        else console.log('   ✅ Nenhum recruta inativo para expurgar.');

        console.log('✅ Sincronização concluída com sucesso!');

    } catch (error) {
        console.error('🔥 Erro fatal:', error);
        process.exit(1);
    }
}

run();
