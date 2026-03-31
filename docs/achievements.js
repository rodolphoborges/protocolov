/**
 * Protocolo V - Sistema de Conquistas (Frontend)
 * Computa e renderiza badges de conquista nos cards de jogador.
 *
 * Dependências: window.oraculoClient (Supabase do Oráculo V, pode ser null)
 */

(function () {
    'use strict';

    const TIER_COLORS = {
        bronze: { border: '#cd7f32', bg: 'rgba(205,127,50,0.12)', text: '#cd7f32' },
        silver: { border: '#9e9e9e', bg: 'rgba(158,158,158,0.12)', text: '#c0c0c0' },
        gold:   { border: '#f0a500', bg: 'rgba(240,165,0,0.12)',   text: '#f0c000' },
    };

    const ACHIEVEMENT_DEFS = [
        // ── Sinergia ────────────────────────────────────────────
        {
            id: 'SQUAD_NOVICE',
            label: '🤝 AGENTE DE ESQUADRÃO',
            description: 'Jogou em grupo pelo menos uma vez.',
            tier: 'bronze',
            check: (p) => (p.synergy_score || 0) >= 5,
        },
        {
            id: 'SQUAD_VETERAN',
            label: '⚡ VETERANO DE ESQUADRÃO',
            description: '20+ pontos de sinergia com o Protocolo.',
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
        // ── Treinamento (DM) ─────────────────────────────────────
        {
            id: 'DM_GRINDER',
            label: '🎯 AFIADOR DE MIRA',
            description: '500+ pontos de Mata-Mata.',
            tier: 'bronze',
            check: (p) => (p.dm_score_total || 0) >= 500,
        },
        {
            id: 'DM_ELITE',
            label: '🏆 DUELISTA ELITE',
            description: '2000+ pontos de Mata-Mata.',
            tier: 'gold',
            check: (p) => (p.dm_score_total || 0) >= 2000,
        },
        // ── AI Insights (async) ──────────────────────────────────
        {
            id: 'FRAGGER',
            label: '💀 FRAGGER',
            description: 'Média de K/D ≥ 1.3 nas análises recentes.',
            tier: 'silver',
            check: (p, ins) => {
                const valid = (ins || []).filter(i => i.kd > 0);
                if (valid.length === 0) return false;
                return valid.reduce((s, i) => s + i.kd, 0) / valid.length >= 1.3;
            },
        },
        {
            id: 'HEADHUNTER',
            label: '🩸 CAÇADOR DE CRÂNIOS',
            description: 'Taxa de headshot média ≥ 25%.',
            tier: 'silver',
            check: (p, ins) => {
                const valid = (ins || []).filter(i => i.hs_percent > 0);
                if (valid.length === 0) return false;
                return valid.reduce((s, i) => s + i.hs_percent, 0) / valid.length >= 25;
            },
        },
        {
            id: 'CARRY',
            label: '📈 CARRY',
            description: 'Índice de impacto médio ≥ 130.',
            tier: 'gold',
            check: (p, ins) => {
                if (!ins || ins.length === 0) return false;
                return ins.reduce((s, i) => s + (i.impact_score || 0), 0) / ins.length >= 130;
            },
        },
        {
            id: 'CONSISTENT',
            label: '📊 MÁQUINA CONSISTENTE',
            description: 'Performance estável (baixa variância, 3+ análises).',
            tier: 'silver',
            check: (p, ins) => {
                if (!ins || ins.length < 3) return false;
                const scores = ins.map(i => i.impact_score || 0);
                const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
                const std = Math.sqrt(scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length);
                return std < 20 && mean >= 90;
            },
        },
    ];

    function buildBadgeHTML(achievement) {
        const c = TIER_COLORS[achievement.tier] || TIER_COLORS.bronze;
        return `<span class="achievement-badge" title="${achievement.description}" style="
            display: inline-flex; align-items: center;
            border: 1px solid ${c.border};
            background: ${c.bg};
            color: ${c.text};
            font-size: 0.6rem;
            letter-spacing: 1px;
            padding: 2px 8px;
            border-radius: 2px;
            font-family: 'Teko', sans-serif;
            line-height: 1.6;
            white-space: nowrap;
            cursor: default;
        ">${achievement.label}</span>`;
    }

    /**
     * Injeta o container de conquistas num card de jogador.
     * @param {string} riotId — ex: "OUSADIA#013"
     * @param {Object} player — dados do jogador já carregados
     */
    async function renderAchievementsForPlayer(riotId, player) {
        const safeId = riotId.replace(/[^a-zA-Z0-9]/g, '');
        const containerId = `achievements-${safeId}`;
        const container = document.getElementById(containerId);
        if (!container) return;

        // Conquistas imediatas (baseadas no player object)
        const staticAchievements = ACHIEVEMENT_DEFS
            .filter(a => !['FRAGGER', 'HEADHUNTER', 'CARRY', 'CONSISTENT'].includes(a.id))
            .filter(a => a.check(player));

        // Render imediato com conquistas estáticas
        if (staticAchievements.length > 0) {
            container.innerHTML = staticAchievements.map(buildBadgeHTML).join(' ');
        }

        // Conquistas AI (v4.1: Buscamos no Protocolo-V Main DB, onde o Oráculo sincroniza os dados)
        const db = window.supabaseClient || window.oraculoClient; 
        if (!db) return;

        try {
            // Busca os últimos 10 insights do agente
            const { data: insights } = await db
                .from('ai_insights')
                .select('impact_score, kd, hs_percent')
                .eq('player_id', riotId) // Usa o ID exato (Nick#Tag)
                .order('created_at', { ascending: false })
                .limit(10);

            if (!insights || insights.length === 0) return;

            const aiAchievements = ACHIEVEMENT_DEFS
                .filter(a => ['FRAGGER', 'HEADHUNTER', 'CARRY', 'CONSISTENT'].includes(a.id))
                .filter(a => a.check(player, insights));

            const allAchievements = [...staticAchievements, ...aiAchievements];

            if (allAchievements.length === 0) {
                container.innerHTML = '';
                return;
            }
            container.innerHTML = allAchievements.map(buildBadgeHTML).join(' ');
        } catch (e) {
            // silently ignore — achievements are non-critical
        }
    }

    window.AchievementsSystem = {
        /**
         * Cria o HTML do container de conquistas (inserido no card pelo script.js).
         * @param {string} riotId
         * @returns {string} HTML do container vazio
         */
        createContainer(riotId) {
            const safeId = riotId.replace(/[^a-zA-Z0-9]/g, '');
            return `<div id="achievements-${safeId}" class="achievements-row" style="
                display: flex; flex-wrap: wrap; gap: 4px;
                margin-top: 6px; min-height: 20px;
            "></div>`;
        },

        /**
         * Carrega e renderiza conquistas de forma assíncrona após o card estar no DOM.
         */
        load(riotId, player) {
            renderAchievementsForPlayer(riotId, player);
        },
    };
})();
