/**
 * Protocolo V - Intelligence Layer (v4.1)
 * Aggregates match analysis data from ai_insights into global insights and leaderboards.
 *
 * [MIGRAÇÃO v4.1]: Dados agora vêm de 'ai_insights' (não mais de 'match_analysis_queue',
 * pois jobs completos são DELETADOS da fila).
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
        console.log(">>> [INTEL] Iniciando agregação de dados via ai_insights...");

        const { data, error } = await this.supabase
            .from('ai_insights')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) {
            console.error("[INTEL] Erro ao buscar dados:", error);
            return null;
        }

        if (!data || data.length === 0) {
            console.warn("[INTEL] Nenhum insight encontrado em ai_insights.");
            return this.insights;
        }

        this.data = data;
        this.process();
        this.saveToCache();
        return this.insights;
    }

    process() {
        const playerStats = {};
        let totalImpact = 0;
        let globalWins = 0;
        let globalMatches = 0;

        this.data.forEach(record => {
            const tag = record.player_id;
            if (!tag || tag === 'AUTO' || !tag.includes('#')) return;

            const report = record.analysis_report || {};
            const timestamp = new Date(record.created_at);
            const hour = timestamp.getHours();
            
            // Check for match result (Victory)
            const isVictory = (report.result || "").toUpperCase() === 'VITÓRIA';

            if (!playerStats[tag]) {
                playerStats[tag] = {
                    tag: tag,
                    matches: 0,
                    wins: 0,
                    totalKd: 0,
                    totalAdr: 0,
                    totalImpact: 0,
                    synergyPoints: 0,
                    soloQMatches: 0,
                    lastMatches: [],
                    lastMatchId: record.match_id
                };
            }

            const p = playerStats[tag];
            p.matches++;
            if (isVictory) {
                p.wins++;
                globalWins++;
            }
            globalMatches++;
            
            p.totalKd += parseFloat(report.kd || 0);
            p.totalAdr += parseFloat(report.adr || 0);
            const currentImpact = parseFloat(record.impact_score || report.impact_score || 0);
            p.totalImpact += currentImpact;
            totalImpact += currentImpact;

            // Synergy logic: Aligned with Protocolo V Manifesto
            // Duos = 1pt, Trios = 2pts, Squad (4/5) = 5pts. Wins double the points.
            const squadStats = report.squad_stats || report.squad || null;
            const groupSize = Array.isArray(squadStats) ? squadStats.length : 0;
            
            if (groupSize > 1) {
                let points = 0;
                if (groupSize === 2) points = 1;
                else if (groupSize === 3) points = 2;
                else points = 5; // 4 or 5 players

                if (isVictory) points *= 2;
                p.synergyPoints += points;
            } else {
                p.soloQMatches++;
            }

            // Hour distribution
            this.insights.hours[hour]++;

            // Recent performance for streaks (last 5)
            if (p.lastMatches.length < 5) {
                p.lastMatches.push({
                    impact: currentImpact,
                    win: isVictory
                });
            }
        });

        // Convert to arrays and sort
        const players = Object.values(playerStats);

        // Global metrics for the dashboard
        this.insights.global = {
            winRate: globalMatches > 0 ? ((globalWins / globalMatches) * 100).toFixed(1) : 0,
            avgImpact: players.length > 0 ? (totalImpact / globalMatches).toFixed(1) : 0,
            totalOps: globalMatches
        };

        // 1. Synergy Ranking (Elite Communal activity)
        this.insights.synergy = [...players]
            .filter(p => p.synergyPoints > 0)
            .sort((a, b) => b.synergyPoints - a.synergyPoints)
            .map(p => ({ tag: p.tag, score: p.synergyPoints, games: p.matches }));

        // 2. Performance Ranking (using Impact Score instead of just KD)
        this.insights.kda = [...players]
            .filter(p => p.matches >= 2)
            .sort((a, b) => (b.totalImpact/b.matches) - (a.totalImpact/a.matches))
            .map(p => ({
                tag: p.tag,
                score: (p.totalImpact/p.matches).toFixed(1),
                kd: (p.totalKd/p.matches).toFixed(2),
                lastMatchId: p.lastMatchId
            }));

        // 3. SoloQ Ranking
        this.insights.soloq = [...players]
            .sort((a, b) => b.soloQMatches - a.soloQMatches)
            .map(p => ({ tag: p.tag, score: p.soloQMatches }));

        // 4. Operational Streaks (Win/Performance combination)
        players.forEach(p => {
            let winStreak = 0;
            let performanceStreak = 0;

            for (let i = 0; i < p.lastMatches.length; i++) {
                const m = p.lastMatches[i];
                if (m.win) winStreak++;
                else break;
            }

            for (let i = 0; i < p.lastMatches.length; i++) {
                const m = p.lastMatches[i];
                if (m.impact >= 115) performanceStreak++;
                else break;
            }

            if (winStreak >= 2) {
                this.insights.streaks[p.tag] = `${winStreak} VITÓRIAS SEGUIDAS`;
            } else if (performanceStreak >= 2) {
                this.insights.streaks[p.tag] = `${performanceStreak} MISSÕES ALTA PERF.`;
            }
        });

        console.log(`>>> [INTEL] Insights v4.2 gerados: ${players.length} agentes processados.`);
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
