const { supabase } = require('../src/db');
const axios = require('axios');
const { smartFetch } = require('./api-client');

/**
 * OraculoService (v2.0 - Unified REST Bridge)
 * 
 * Ponte de comunicação definitiva entre o Protocolo-V e o Motor Tático Oráculo-V.
 * Centraliza o envio de métricas avançadas, lógica de IA e notificações.
 */
class OraculoService {
    constructor() {
        this.apiUrl = process.env.ORACULO_API_URL || 'http://localhost:3001';
        this.apiKey = process.env.ORACULO_API_KEY;
        this.henrikKey = process.env.HENRIK_API_KEY;
        
        // Dicionário Tático de Habilidades (Keywords para LLM)
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
     * Processa a análise de uma partida para todos os membros da squad.
     * @param {object} op Dados da operação (Match + Squad)
     */
    async processMatchAnalysis(op) {
        if (!op || !op.id || !op.squad) return;

        // console.log(`\n🧠 [ORÁCULO-V] Iniciando ponte tática | Match: ${op.id}`);
        
        // 0. Deduplicar squad para evitar processamento redundante se houver duplicatas no raw
        const uniqueMembers = [];
        const seenIds = new Set();
        for (const m of op.squad) {
            const lowId = m.riotId.toLowerCase();
            if (!seenIds.has(lowId)) {
                seenIds.add(lowId);
                uniqueMembers.push(m);
            }
        }
        op.squad = uniqueMembers;

        const results = {
            successCount: 0,
            failureCount: 0,
            errors: []
        };

        // 0. Pré-verificação de Insights Existentes (Otimização para evitar re-análise)
        const { data: existingInsights } = await supabase
            .from('ai_insights')
            .select('player_id')
            .eq('match_id', op.id);
        
        const alreadyAnalyzed = new Set(existingInsights?.map(i => i.player_id.toLowerCase()) || []);

        const analyzeMember = async (member) => {
            // Se já existe no banco, pular completamente (Idempotência)
            if (alreadyAnalyzed.has(member.riotId.toLowerCase())) {
                // console.log(`   [⏩] Análise já existe para ${member.riotId}. Pulando.`);
                results.successCount++;
                return;
            }

            let briefing = null;
            try {
                // 1. Extração de Métricas do Objeto Raw
                const rawMatch = op.rawMatchData;
                const roundsPlayed = rawMatch?.metadata?.rounds_played || 1;
                
                const allPlayers = Array.isArray(rawMatch?.players) 
                    ? rawMatch.players 
                    : (rawMatch?.players?.all_players || []);
                
                const rawPlayer = allPlayers.find(p => `${p.name}#${p.tag}` === member.riotId);
                const stats = rawPlayer?.stats || {};
                
                const k = stats.kills || 0;
                const d = stats.deaths || 0;
                const a = stats.assists || 0;
                const adr = Math.round((stats.damage_made || 0) / roundsPlayed);
                const kast = rawPlayer?.kast || 70; 
                const acs = Math.round((stats.score || 0) / roundsPlayed);

                // Resolução de Habilidades
                let abilities = [];
                for (const role in this.AGENT_KNOWLEDGE) {
                    if (this.AGENT_KNOWLEDGE[role][member.agent]) {
                        abilities = this.AGENT_KNOWLEDGE[role][member.agent];
                        break;
                    }
                }

                briefing = {
                    match_id: op.id,
                    player_id: member.riotId,
                    map_name: op.map || op.map_name,
                    agent_name: member.agent,
                    kills: k,
                    deaths: d,
                    assists: a,
                    adr: adr,
                    kast: kast,
                    acs: acs,
                    ability_context: abilities,
                    squad_stats: op.squad.map(s => ({
                        player_id: s.riotId,
                        agent: s.agent,
                        kda: s.kda
                    }))
                };

                console.log(`   [→] Despachando análise para ${member.riotId} (Fila)...`);

                // 2. Fire-and-forget com timeout curto (3s).
                // O /api/queue retorna 202 instantaneamente — o Oráculo processa em background de forma autônoma.
                // O Protocolo-V não deve bloquear aguardando análise de IA.
                try {
                    await axios.post(`${this.apiUrl}/api/queue`, briefing, {
                        headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey },
                        timeout: 3000
                    });
                    console.log(`   [✓] Briefing enfileirado para ${member.riotId}.`);
                    results.successCount++;
                } catch (err) {
                    // Oráculo offline ou lento — registrar no banco local para retry posterior
                    console.log(`   [⏳] Oráculo indisponível para ${member.riotId}. Enfileirando localmente...`);
                    await this.enqueueForLater(op.id, member.riotId, briefing);
                    // Não conta como falha do Protocolo-V — o Oráculo processará quando disponível
                    results.successCount++;
                }
        };

        // Processamento SEQUENCIAL dos membros da squad com pequeno delay (Traffic Shaping)
        const sleep = ms => new Promise(res => setTimeout(res, ms));
        
        for (const member of op.squad) {
            await analyzeMember(member);
            await sleep(200); // 200ms de respiro entre jogadores
        }
        return results;
    }

    async updatePlayerPerformance(riotId, insight) {
        let synergyDelta = (insight.rank === 'Alpha') ? 10 : (insight.rank === 'Omega' ? 2 : -5);
        
        const { data: pData } = await supabase.from('players').select('synergy_score').eq('riot_id', riotId).single();
        const currentSynergy = pData?.synergy_score || 0;

        await supabase.from('players').update({
            performance_l: insight.score,
            synergy_score: Math.max(0, currentSynergy + synergyDelta),
            updated_at: new Date().toISOString()
        }).eq('riot_id', riotId);
    }

    async sendTelegramNotification(riotId, insight, isTrashTalk = false) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        
        // Muta se o token for o padrão (não configurado)
        if (!token || token === 'your_telegram_bot_token') return;

        const telegramId = process.env.TELEGRAM_ALERT_CHAT_ID || '1104821838';
        const url = `https://api.telegram.org/bot${token}/sendMessage`;

        let message = '';
        if (isTrashTalk) {
            message = `🚨 *[ALERTA DE PESO MORTO]*\n\n` +
                      `⚠️ O agente *${riotId.split('#')[0]}* foi classificado como *DEPÓSITO DE TORRETA* (Score: ${insight.score}).\n\n` +
                      `🧠 *Insight:* "${insight.resumo || 'Sem comentários.'}"\n\n` +
                      `🌐 [Protocolo V Dashboard](https://protocolov.com)`;
        } else {
            message = `🏆 *[STATUS ALPHA DETECTADO]*\n\n` +
                      `🔥 Desempenho de elite confirmado para *${riotId.split('#')[0]}*.\n` +
                      `Impact Score: *${insight.score}*.\n\n` +
                      `A missão foi dominada com sucesso.`;
        }

        try {
            await axios.post(url, { chat_id: telegramId, text: message, parse_mode: 'Markdown' });
        } catch (e) {
            console.error(`   [❌] Erro ao enviar Telegram: ${e.message}`);
        }
    }

    async enqueueForLater(matchId, riotId, payload) {
        // Verificar se já existe na fila (Resiliente a falta de constraint única no banco)
        const { data: existing } = await supabase
            .from('match_analysis_queue')
            .select('id')
            .eq('match_id', matchId)
            .eq('player_tag', riotId)
            .limit(1);

        if (existing && existing.length > 0) {
            console.log(`       [⌛] Já existe registro na fila para ${riotId}. Ignorando duplicata.`);
            return;
        }

        await supabase.from('match_analysis_queue').insert([{
            match_id: matchId,
            player_tag: riotId,
            status: 'pending',
            metadata: payload,
            created_at: new Date().toISOString()
        }]);
    }
}

module.exports = new OraculoService();

