const { supabase } = require('../src/db');
const axios = require('axios');
const { smartFetch } = require('./api-client');

/**
 * OraculoIntegrationService
 * 
 * Ponte de integração de Inteligência Tática Síncrona.
 * Responsável por coletar métricas avançadas (ADR, KAST, FB) e
 * sincronizar a performance do jogador (Holt Level) entre Oráculo e Protocolo.
 */
class OraculoIntegrationService {
    constructor() {
        this.apiUrl = process.env.ORACULO_API_URL || 'http://localhost:3000';
        this.apiKey = process.env.ORACULO_API_KEY;
        this.henrikKey = process.env.HENRIK_API_KEY;
        this.targetPlayer = 'ousadia#013'; // MVP Target

        // [NOVO] Dicionário Tático de Habilidades (Keywords)
        this.AGENT_KNOWLEDGE = {
            DUELIST: {
                Jett: ["Tailwind", "Cloudburst", "Updraft", "Blade Storm", "Dash", "Entry"], 
                Raze: ["Paint Shells", "Blast Pack", "Showstopper", "Boom Bot", "Satchel"],
                Reyna: ["Dismiss", "Devour", "Leer", "Empress", "Overheal"],
                Phoenix: ["Curveball", "Hot Hands", "Blaze", "Run It Back"],
                Neon: ["High Gear", "Relay Bolt", "Fast Lane", "Overdrive"],
                Iso: ["Double Tap", "Undercut", "Contingency", "Kill Zone"],
            },
            INITIATOR: {
                Sova: ["Recon Bolt", "Shock Bolt", "Owl Drone", "Hunter's Fury", "Lineup"],
                Skye: ["Guiding Light", "Trailblazer", "Regrowth", "Seekers", "Flash"],
                Gekko: ["Dizzy", "Wingman", "Mosh Pit", "Thrash", "Plant/Defuse"],
                Fade: ["Haunt", "Seize", "Prowler", "Nightfall"],
                KAYO: ["ZERO/point", "FLASH/drive", "FRAG/ment", "NULL/cmd", "Suppress"],
            },
            CONTROLLER: {
                Omen: ["Dark Cover", "Shrouded Step", "Paranoia", "From the Shadows"],
                Brimstone: ["Sky Smoke", "Stim Beacon", "Incendiary", "Orbital Strike"],
                Viper: ["Toxic Screen", "Poison Cloud", "Snake Bite", "Viper’s Pit", "Lineup"],
                Clove: ["Ruse", "Meddle", "Pick-me-up", "Not Dead Yet"],
                Astra: ["Gravity Well", "Nova Pulse", "Nebula", "Cosmic Divide"],
            },
            SENTINEL: {
                Killjoy: ["Turret", "Alarmbot", "Nanoswarm", "Lockdown"],
                Cypher: ["Trapwire", "Cyber Cage", "Spycam", "Neural Theft"],
                Sage: ["Barrier Orb", "Slow Orb", "Healing Orb", "Resurrection", "Wall"],
                Chamber: ["Headhunter", "Rendezvous", "Trademark", "Tour de Force"],
                Deadlock: ["GravNet", "Sonic Sensor", "Barrier Mesh", "Annihilation"],
            }
        };
    }

    /**
     * Ponto de entrada para processar uma nova partida.
     */
    async notifyMatch(matchId, rawMatchData = null) {
        if (!matchId) return;

        let matchData = rawMatchData;

        // Se não tivermos o rawData, tentamos buscar via Henrik API
        if (!matchData) {
            try {
                const headers = { 'Authorization': this.henrikKey };
                const res = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/match/br/${matchId}`, headers);
                if (res.status === 200) {
                    const json = await res.json();
                    matchData = json.data;
                } else {
                    console.error(`   [❌] Falha ao buscar dados da partida ${matchId} (Status: ${res.status})`);
                    return;
                }
            } catch (err) {
                console.error(`   [❌] Erro de rede ao buscar partida ${matchId}:`, err.message);
                return;
            }
        }

        // Filtro MVP: Apenas processar se o usuário alvo estiver na partida
        // Handle V3/V4 discrepancies where data can be an array or object
        const finalMatchData = Array.isArray(matchData) ? matchData[0] : matchData;
        if (!finalMatchData) return;

        const players = Array.isArray(finalMatchData.players) 
            ? finalMatchData.players 
            : (finalMatchData.players?.all_players || []);
        
        const target = players.find(p => `${p.name}#${p.tag}` === this.targetPlayer);
        if (!target) return;

        console.log(`\n🧠 [INTEGRAÇÃO-ORÁCULO] Iniciando ponte tática para ${this.targetPlayer} | Match: ${matchId}`);

        try {
            // 1. Extração de Métricas Avançadas
            const roundsPlayed = matchData.metadata?.rounds_played || 1;
            const stats = target.stats || {};
            const agentName = target.character || target.agent;
            
            const adr = Math.round(stats.damage_made / roundsPlayed);
            const kast = target.kast || 70; 
            const firstBloods = target.behavior?.first_kills || 0;
            const clutches = target.behavior?.clutches_won || 0;
            const acs = Math.round(stats.score / roundsPlayed);

            // [NOVO] Coleta de Contexto de Habilidades (Busca em dicionário aninhado)
            let abilities = [];
            for (const role in this.AGENT_KNOWLEDGE) {
                if (this.AGENT_KNOWLEDGE[role][agentName]) {
                    abilities = this.AGENT_KNOWLEDGE[role][agentName];
                    break;
                }
            }

            const payload = {
                player_id: this.targetPlayer,
                match_id: matchId,
                agent_name: agentName,
                ability_context: abilities, // Enviado para a LLM usar como keywords
                kills: stats.kills,
                deaths: stats.deaths,
                adr: adr,
                kast: kast,
                clutches: clutches,
                first_bloods: firstBloods,
                acs: acs,
                map_name: matchData.metadata?.map?.name || matchData.metadata?.map
            };

            // 2. Chamada ao Motor Tático (Oráculo-V)
            try {
                const response = await axios.post(`${this.apiUrl}/api/analyze`, payload, {
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey
                    },
                    timeout: 60000 // 60s timeout para análise IA
                });

                if (response.data && response.status === 200) {
                    const result = response.data;
                    const insight = result.insight; // { rank, score, role, adr, kast, etc }
                    const rawAiJson = result.ai_json; // O objeto JSON gerado pela LLM para ai_insights

                    console.log(`   [←] Análise Concluída: Rank ${insight.rank} | Score: ${insight.score}`);

                    // 3. Persistir no Protocolo-V (Tabela ai_insights)
                    if (rawAiJson) {
                        const { error: aiErr } = await supabase
                            .from('ai_insights')
                            .insert([{
                                match_id: matchId,
                                player_id: this.targetPlayer,
                                insight_resumo: rawAiJson,
                                classification: insight.rank,
                                created_at: new Date().toISOString()
                            }]);
                        if (aiErr) console.error(`   [❌] Erro ao salvar ai_insights: ${aiErr.message}`);
                    }

                    // 4. Atualizar Protocolo-V (Tabela Players)
                    await this.updatePlayerPerformance(this.targetPlayer, insight);

                    // 5. Notificação via Telegram (Ousadia#013 | 1104821838)
                    if (insight.rank === 'Depósito de Torreta' && process.env.TELEGRAM_BOT_TOKEN) {
                        await this.sendTrashTalkNotification(this.targetPlayer, insight.score, rawAiJson?.resumo_tatico);
                    } else if (insight.rank === 'Alpha' && process.env.TELEGRAM_BOT_TOKEN) {
                        await this.sendAlphaNotification(this.targetPlayer, insight.score);
                    }

                }
            } catch (apiErr) {
                // RESILIÊNCIA: Oráculo Offline
                if (apiErr.code === 'ECONNREFUSED' || apiErr.code === 'ENOTFOUND') {
                    console.error(`⚠️ [ORÁCULO-OFFLINE] Motor tático indisponível. Agendando para análise posterior...`);
                    await this.enqueueForLater(matchId, this.targetPlayer, payload);
                } else {
                    throw apiErr;
                }
            }

        } catch (err) {
            console.error(`   [❌] Falha crítica na integração do Oráculo:`, err.message);
        }
    }

    /**
     * Envia uma mensagem sarcástica para o Telegram do jogador 'Depósito de Torreta'.
     */
    async sendTrashTalkNotification(riotId, score, aiComment) {
        const telegramId = '1104821838'; // ID fixo para o MVP
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        const message = `🚨 *[ALERTA DE PESO MORTO]*\n\n` +
            `⚠️ O agente *${riotId.split('#')[0]}* foi classificado como *DEPÓSITO DE TORRETA* (Score: ${score}).\n\n` +
            `🧠 *Insight do Oráculo:* "${aiComment || 'Sem comentários, apenas vergonha.'}"\n\n` +
            `🌐 Visite o site do [Protocolo V](https://protocolov.com) para ver quem realmente carregou a partida.`;

        try {
            await axios.post(url, {
                chat_id: telegramId,
                text: message,
                parse_mode: 'Markdown'
            });
            console.log(`   [📢] Telegram: Zoação enviada para ${telegramId}`);
        } catch (e) {
            console.error(`   [❌] Erro ao enviar Telegram: ${e.message}`);
        }
    }

    /**
     * Envia uma mensagem de glória para o Telegram do jogador 'Alpha'.
     */
    async sendAlphaNotification(riotId, score) {
        const telegramId = '1104821838'; // ID fixo para o MVP
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        const message = `🏆 *[STATUS ALPHA DETECTADO]*\n\n` +
            `🔥 Desempenho de elite confirmado para o agente *${riotId.split('#')[0]}*.\n` +
            `Impact Score: *${score}*.\n\n` +
            `A missão foi dominada com sucesso.`;

        try {
            await axios.post(url, {
                chat_id: telegramId,
                text: message,
                parse_mode: 'Markdown'
            });
        } catch (e) {}
    }

    /**
     * Atualiza os indicadores de performance do jogador no Protocolo-V.
     */
    async updatePlayerPerformance(riotId, insight) {
        // Mapeamento de Pontos de Sinergia
        let synergyDelta = 0;
        if (insight.rank === 'Alpha') synergyDelta = 10;
        else if (insight.rank === 'Omega') synergyDelta = 2;
        else synergyDelta = -5; // Depósito de Torreta perde pontos

        console.log(`   [⚡] Sincronizando Performance: Holt Level -> ${insight.score} | Sinergia -> ${synergyDelta >= 0 ? '+' : ''}${synergyDelta}`);

        // Busca valor atual para somar
        const { data: pData } = await supabase
            .from('players')
            .select('synergy_score')
            .eq('riot_id', riotId)
            .single();

        const currentSynergy = pData?.synergy_score || 0;

        const { error } = await supabase
            .from('players')
            .update({
                performance_l: insight.score, // Holt Level atualizado pelo Impact Score
                synergy_score: Math.max(0, currentSynergy + synergyDelta),
                updated_at: new Date().toISOString()
            })
            .eq('riot_id', riotId);

        if (error) console.error(`   [❌] Erro ao atualizar players: ${error.message}`);
    }

    /**
     * Adiciona a partida na fila de reprocessamento se o Oráculo estiver offline.
     */
    async enqueueForLater(matchId, riotId, payload) {
        const { error } = await supabase
            .from('match_analysis_queue')
            .upsert([{
                match_id: matchId,
                player_tag: riotId,
                status: 'pending',
                metadata: payload,
                created_at: new Date().toISOString()
            }], { onConflict: 'match_id,player_tag' });

        if (error) console.error(`   [❌] Erro ao enfileirar para retry: ${error.message}`);
    }
}

module.exports = new OraculoIntegrationService();
