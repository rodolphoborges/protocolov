/**
 * Protocolo V - Intelligence Layer
 * Aggregates match analysis data into global insights and leaderboards.
 */

class IntelligenceLayer {
    constructor(supabaseClient) {
        this.supabase = supabaseClient;
        this.data = null;
        this.insights = {
            synergy: [],
            kda: [],
            adr: [],
            soloq: [],
            hours: Array(24).fill(0),
            streaks: {}
        };
    }

    async refresh() {
        console.log(">>> [INTEL] Iniciando agregação de dados...");
        
        const { data, error } = await this.supabase
            .from('match_analysis_queue')
            .select('*')
            .eq('status', 'completed')
            .order('processed_at', { ascending: false });

        if (error) {
            console.error("[INTEL] Erro ao buscar dados:", error);
            return null;
        }

        this.data = data;
        this.process();
        this.saveToCache();
        return this.insights;
    }

    process() {
        const playerStats = {};

        this.data.forEach(record => {
            const tag = record.agente_tag;
            const meta = record.metadata;
            const analysis = meta.analysis || {};
            const timestamp = new Date(record.processed_at || record.created_at);
            const hour = timestamp.getHours();

            if (!playerStats[tag]) {
                playerStats[tag] = {
                    tag: tag,
                    matches: 0,
                    totalKd: 0,
                    totalAdr: 0,
                    totalPerformance: 0,
                    synergyPoints: 0,
                    soloQMatches: 0,
                    lastMatches: [],
                    lastMatchId: record.match_id // Captura o ID da partida mais recente
                };
            }

            const p = playerStats[tag];
            p.matches++;
            p.totalKd += parseFloat(analysis.kd || 0);
            p.totalAdr += parseFloat(analysis.adr || 0);
            p.totalPerformance += parseInt(analysis.performance_index || 0);
            
            // Synergy logic: group size > 1
            const groupSize = (meta.group && meta.group.length) || 1;
            if (groupSize > 1) {
                p.synergyPoints += (groupSize - 1);
            } else {
                p.soloQMatches++;
            }

            // Hour distribution
            this.insights.hours[hour]++;

            // Recent performance for streaks (last 5)
            if (p.lastMatches.length < 5) {
                p.lastMatches.push(analysis.performance_index || 0);
            }
        });

        // Convert to arrays and sort
        const players = Object.values(playerStats);

        // 1. Synergy Ranking
        this.insights.synergy = [...players]
            .filter(p => p.synergyPoints > 0)
            .sort((a, b) => b.synergyPoints - a.synergyPoints)
            .map(p => ({ tag: p.tag, score: p.synergyPoints, games: p.matches }));

        // 2. KDA Ranking (min 3 matches)
        this.insights.kda = [...players]
            .filter(p => p.matches >= 2)
            .sort((a, b) => (b.totalKd/b.matches) - (a.totalKd/a.matches))
            .map(p => ({ 
                tag: p.tag, 
                score: (p.totalKd/p.matches).toFixed(2),
                lastMatchId: p.lastMatchId
            }));

        // 3. SoloQ Ranking
        this.insights.soloq = [...players]
            .sort((a, b) => b.soloQMatches - a.soloQMatches)
            .map(p => ({ tag: p.tag, score: p.soloQMatches }));

        // 4. Streaks (Negative sequences)
        players.forEach(p => {
            const isLossStreak = p.lastMatches.length >= 3 && p.lastMatches.slice(0,3).every(v => v < 70);
            const isWinStreak = p.lastMatches.length >= 3 && p.lastMatches.slice(0,3).every(v => v > 120);
            
            if (isLossStreak) this.insights.streaks[p.tag] = 'SEQ. DERROTAS';
            if (isWinStreak) this.insights.streaks[p.tag] = 'SEQ. VITÓRIAS';
        });

        console.log(">>> [INTEL] Insights gerados com sucesso.");
    }

    saveToCache() {
        const cacheData = {
            timestamp: Date.now(),
            insights: this.insights
        };
        localStorage.setItem('protocol_v_insights', JSON.stringify(cacheData));
    }

    static getFromCache() {
        const cache = localStorage.getItem('protocol_v_insights');
        if (!cache) return null;
        
        const data = JSON.parse(cache);
        const age = Date.now() - data.timestamp;
        
        // Cache valid for 30 minutes
        if (age > 30 * 60 * 1000) return null;
        
        return data.insights;
    }
}

// Global instance if in browser
if (typeof window !== 'undefined') {
    window.IntelligenceLayer = IntelligenceLayer;
}
