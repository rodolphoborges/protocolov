/**
 * Protocolo V - Sistema de Conquistas
 * Avalia métricas do jogador e concede badges táticos.
 * Stateless: computa e retorna, sem persistência extra.
 */

const ACHIEVEMENTS = [
    // ── Sinergia ─────────────────────────────────────────────────────
    {
        id: 'SQUAD_NOVICE',
        label: '🤝 AGENTE DE ESQUADRÃO',
        description: 'Jogou partidas em grupo pela primeira vez.',
        tier: 'bronze',
        check: (p) => (p.synergy_score || 0) >= 5,
    },
    {
        id: 'SQUAD_VETERAN',
        label: '⚡ VETERANO DE ESQUADRÃO',
        description: 'Acumulou 20+ pontos de sinergia com o Protocolo.',
        tier: 'silver',
        check: (p) => (p.synergy_score || 0) >= 20,
    },
    {
        id: 'SQUAD_ANCHOR',
        label: '🛡️ ÂNCORA DO PROTOCOLO',
        description: 'Pilar do time — 60+ pontos de sinergia.',
        tier: 'gold',
        check: (p) => (p.synergy_score || 0) >= 60,
    },
    // ── Treinamento (DM) ─────────────────────────────────────────────
    {
        id: 'DM_GRINDER',
        label: '🎯 AFIADOR DE MIRA',
        description: 'Dedicação ao treino: 500+ pontos de Mata-Mata.',
        tier: 'bronze',
        check: (p) => (p.dm_score_total || 0) >= 500,
    },
    {
        id: 'DM_ELITE',
        label: '🏆 DUELISTA ELITE',
        description: 'Elite do treino: 2000+ pontos de Mata-Mata.',
        tier: 'gold',
        check: (p) => (p.dm_score_total || 0) >= 2000,
    },
    // ── Performance (requer ai_insights) ────────────────────────────
    {
        id: 'FRAGGER',
        label: '💀 FRAGGER',
        description: 'Média de K/D acima de 1.3 nas últimas análises.',
        tier: 'silver',
        check: (p, insights) => {
            if (!insights || insights.length === 0) return false;
            const avg = insights.reduce((s, i) => s + (i.kd || 0), 0) / insights.length;
            return avg >= 1.3;
        },
    },
    {
        id: 'HEADHUNTER',
        label: '🩸 CAÇADOR DE CRÂNIOS',
        description: 'Taxa de headshot média acima de 25%.',
        tier: 'silver',
        check: (p, insights) => {
            if (!insights || insights.length === 0) return false;
            const valid = insights.filter(i => i.hs_percent > 0);
            if (valid.length === 0) return false;
            const avg = valid.reduce((s, i) => s + i.hs_percent, 0) / valid.length;
            return avg >= 25;
        },
    },
    {
        id: 'CARRY',
        label: '📈 CARRY',
        description: 'Índice de impacto médio acima de 130 (acima da baseline).',
        tier: 'gold',
        check: (p, insights) => {
            if (!insights || insights.length === 0) return false;
            const avg = insights.reduce((s, i) => s + (i.impact_score || 0), 0) / insights.length;
            return avg >= 130;
        },
    },
    {
        id: 'CONSISTENT',
        label: '📊 MÁQUINA CONSISTENTE',
        description: 'Performance estável nas últimas análises (baixa variância).',
        tier: 'silver',
        check: (p, insights) => {
            if (!insights || insights.length < 3) return false;
            const scores = insights.map(i => i.impact_score || 0);
            const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
            const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
            return Math.sqrt(variance) < 20 && mean >= 90;
        },
    },
];

/**
 * Computa as conquistas de um jogador.
 * @param {Object} player — linha da tabela `players`
 * @param {Array}  insights — registros de `ai_insights` do jogador (opcional)
 * @returns {Array} lista de achievements conquistados
 */
function computeAchievements(player, insights = []) {
    return ACHIEVEMENTS.filter(a => a.check(player, insights));
}

module.exports = { ACHIEVEMENTS, computeAchievements };
