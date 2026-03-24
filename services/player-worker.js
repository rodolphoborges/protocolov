const { smartFetch } = require('./api-client');

class PlayerWorker {
    constructor(playerRecord, henrikApiKey) {
        this.player = playerRecord;
        this.apiKey = henrikApiKey;
        this.headers = { 'Authorization': henrikApiKey };
        this.playerData = null;
        this.newMatches = new Map();
        this.stats = { comp: 0, group: 0 };
    }

    async fetchAndProcess(knownMatchIds) {
        const [name, tag] = this.player.riot_id.split('#');
        const safeName = encodeURIComponent(name.trim());
        const safeTag = encodeURIComponent(tag.trim());
        const normalizedPlayerId = this.player.riot_id.toLowerCase().replace(/\s/g, '');

        console.log(`      -> A extrair dados de: ${this.player.riot_id}`);

        this.playerData = {
            ...this.player,
            api_error: false,
            updated_at: new Date().toISOString()
        };

        try {
            const listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/br/${safeName}/${safeTag}?size=20`, this.headers);

            if (listRes.status === 200) {
                const listData = await listRes.json();
                const recentCompMatches = listData.data ? listData.data.filter(m => m.metadata?.mode?.toLowerCase() === 'competitive') : [];
                const recentDmMatches = listData.data ? listData.data.filter(m => m.metadata?.mode?.toLowerCase() === 'deathmatch') : [];

                this.stats.comp = recentCompMatches.length;

                const processMatches = (matches) => {
                    for (const m of matches) {
                        const mId = m.metadata.matchid;
                        if (knownMatchIds.has(mId)) this.stats.group++;
                        else this.newMatches.set(mId, m);
                    }
                };

                processMatches(recentCompMatches);
                processMatches(recentDmMatches);

                // Update Rank/Level if possible
                const anyMatch = listData.data.find(m => m.players);
                if (anyMatch) {
                    const playersArray = Array.isArray(anyMatch.players) ? anyMatch.players : anyMatch.players.all_players;
                    const me = playersArray.find(p => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase());
                    if (me) {
                        this.playerData.level = me.level;
                        if (me.assets?.card) this.playerData.card_url = me.assets.card.small;
                        
                        // Try to get rank from last comp match
                        if (recentCompMatches.length > 0) {
                            const cp = Array.isArray(recentCompMatches[0].players) ? recentCompMatches[0].players : recentCompMatches[0].players.all_players;
                            const meComp = cp.find(p => p.name.toLowerCase() === name.toLowerCase() && p.tag.toLowerCase() === tag.toLowerCase());
                            if (meComp?.currenttier_patched) this.playerData.current_rank = meComp.currenttier_patched;
                        }
                    }
                }

                // Fallback for missing rank
                if (!this.playerData.current_rank || this.playerData.current_rank === 'Pendente') {
                    const mmrRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v2/mmr/br/${safeName}/${safeTag}`, this.headers);
                    if (mmrRes.status === 200) {
                        const mmrData = await mmrRes.json();
                        if (mmrData.data.current_data?.currenttierpatched) {
                            this.playerData.current_rank = mmrData.data.current_data.currenttierpatched;
                            this.playerData.current_rank_icon = mmrData.data.current_data.images.small;
                        }
                    }
                }

            } else {
                this.playerData.api_error = true;
                if (listRes.status === 404) this.playerData.is_ghost = true; // Marca como "fantasma" para possível remoção
            }
        } catch (err) {
            this.playerData.api_error = true;
            console.log(`      ❌ Erro em ${this.player.riot_id}:`, err.message);
        }

        return {
            playerData: this.playerData,
            newMatches: this.newMatches,
            stats: this.stats
        };
    }
}

module.exports = PlayerWorker;
