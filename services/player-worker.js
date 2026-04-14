const { smartFetch } = require('./api-client');

const HENRIK = 'https://api.henrikdev.xyz/valorant';

function splitRiotId(riotId) {
    const hashIdx = riotId.lastIndexOf('#');
    if (hashIdx === -1) return [riotId.trim(), ''];
    const name = riotId.slice(0, hashIdx).trim().normalize('NFC');
    const tag = riotId.slice(hashIdx + 1).trim().normalize('NFC');
    return [name, tag];
}

function normalizeForCompare(s) {
    return (s || '').trim().normalize('NFC').toLowerCase();
}

async function fetchPlayerProfile(riotId, apiKey, region = 'br') {
    const [name, tag] = splitRiotId(riotId);
    if (!name || !tag) return { api_error: true, reason: 'invalid_riot_id' };

    const headers = { 'Authorization': apiKey };
    const encName = encodeURIComponent(name);
    const encTag = encodeURIComponent(tag);

    const profile = {};
    let anyOk = false;

    try {
        const acctRes = await smartFetch(`${HENRIK}/v1/account/${encName}/${encTag}`, headers);
        if (acctRes && acctRes.status === 200) {
            const json = await acctRes.json();
            const d = json?.data || {};
            if (d.account_level != null) profile.level = d.account_level;
            if (d.card?.small) profile.card_url = d.card.small;
            anyOk = true;
        } else if (acctRes && acctRes.status === 404) {
            return { api_error: true, is_ghost: true };
        }
    } catch (_) { /* try MMR anyway */ }

    try {
        const mmrRes = await smartFetch(`${HENRIK}/v2/mmr/${region}/${encName}/${encTag}`, headers);
        if (mmrRes && mmrRes.status === 200) {
            const json = await mmrRes.json();
            const d = json?.data || {};
            if (d.current_data?.currenttierpatched) {
                profile.current_rank = d.current_data.currenttierpatched;
                if (d.current_data.images?.small) profile.current_rank_icon = d.current_data.images.small;
            }
            if (d.highest_rank?.patched_tier) {
                profile.peak_rank = d.highest_rank.patched_tier;
            }
            if (d.highest_rank?.images?.small) {
                profile.peak_rank_icon = d.highest_rank.images.small;
            } else if (d.highest_rank?.patched_tier && d.current_data?.images?.small) {
                profile.peak_rank_icon = d.current_data.images.small;
            }
            anyOk = true;
        }
    } catch (_) { /* noop */ }

    if (!anyOk) return { api_error: true };
    profile.api_error = false;
    return profile;
}

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
        const [name, tag] = splitRiotId(this.player.riot_id);
        const safeName = encodeURIComponent(name);
        const safeTag = encodeURIComponent(tag);
        const nName = normalizeForCompare(name);
        const nTag = normalizeForCompare(tag);

        console.log(`      -> A extrair dados de: ${this.player.riot_id}`);

        this.playerData = {
            ...this.player,
            api_error: false,
            updated_at: new Date().toISOString()
        };

        try {
            const listRes = await smartFetch(`${HENRIK}/v3/matches/br/${safeName}/${safeTag}?size=20`, this.headers);

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

                const anyMatch = (listData.data || []).find(m => m.players);
                if (anyMatch) {
                    const playersArray = Array.isArray(anyMatch.players) ? anyMatch.players : anyMatch.players.all_players;
                    const me = playersArray.find(p => normalizeForCompare(p.name) === nName && normalizeForCompare(p.tag) === nTag);
                    if (me) {
                        if (me.level != null) this.playerData.level = me.level;
                        if (me.assets?.card) this.playerData.card_url = me.assets.card.small;
                    }
                }
            } else {
                this.playerData.api_error = true;
                if (listRes.status === 404) this.playerData.is_ghost = true;
            }
        } catch (err) {
            this.playerData.api_error = true;
            console.log(`      ❌ Erro em ${this.player.riot_id}:`, err.message);
        }

        const profile = await fetchPlayerProfile(this.player.riot_id, this.apiKey);
        if (!profile.api_error) {
            Object.assign(this.playerData, profile);
        } else if (profile.is_ghost) {
            this.playerData.is_ghost = true;
        }

        return {
            playerData: this.playerData,
            newMatches: this.newMatches,
            stats: this.stats
        };
    }
}

module.exports = PlayerWorker;
module.exports.fetchPlayerProfile = fetchPlayerProfile;
module.exports.splitRiotId = splitRiotId;
