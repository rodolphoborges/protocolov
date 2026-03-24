class SynergyEngine {
    static calculateSynergyPoints(squadLength, result) {
        let basePoints = 0;
        if (squadLength === 2) basePoints = 1;
        else if (squadLength === 3) basePoints = 2;
        else if (squadLength >= 4) basePoints = 5;

        return (result === 'VITÓRIA') ? basePoints * 2 : basePoints;
    }

    static calculateDmPoints(lobby, player) {
        const sortedLobby = [...lobby].sort((a, b) => b.stats.kills - a.stats.kills);
        const p1 = sortedLobby[0];
        const p2 = sortedLobby[1];
        const p3 = sortedLobby[2];

        let points = player.stats.kills || 0;

        if (p1 && player.name === p1.name && player.tag === p1.tag) points += 15;
        else if (p2 && player.name === p2.name && player.tag === p2.tag) points += 10;
        else if (p3 && player.name === p3.name && player.tag === p3.tag) points += 5;

        return points;
    }

    static processMatchResults(matches, rosterMap) {
        const operations = [];
        const newSynergyPoints = {};
        const newDmPoints = {};

        for (const [matchId, match] of matches) {
            if (!match.players || !Array.isArray(match.players)) continue;

            const mode = match.metadata.mode.toLowerCase();

            if (mode === 'deathmatch') {
                const myPlayersInDm = match.players.filter(player => 
                    rosterMap.has(`${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, ''))
                );

                if (myPlayersInDm.length > 0) {
                    myPlayersInDm.forEach(m => {
                        const nId = `${m.name}#${m.tag}`.toLowerCase().replace(/\s/g, '');
                        newDmPoints[nId] = (newDmPoints[nId] || 0) + this.calculateDmPoints(match.players, m);
                    });

                    operations.push({
                        id: matchId, map: match.metadata.map, mode: 'Deathmatch',
                        started_at: match.metadata.game_start * 1000,
                        score: 'TREINO', result: 'MATA-MATA', team_color: 'N/A',
                        squad: []
                    });
                }
            } else if (mode === 'competitive') {
                const squadMembers = match.players.filter(player => 
                    rosterMap.has(`${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, ''))
                );

                if (squadMembers.length >= 2) {
                    const teamId = squadMembers[0].team;
                    const teamData = (match.teams && teamId) ? match.teams[teamId.toLowerCase()] : null;

                    let finalResult = 'DERROTA';
                    if (match.teams) {
                        if (match.teams.blue.rounds_won === match.teams.red.rounds_won) finalResult = 'EMPATE';
                        else if (teamData && teamData.has_won) finalResult = 'VITÓRIA';
                    }

                    const earnedPoints = this.calculateSynergyPoints(squadMembers.length, finalResult);

                    squadMembers.forEach(m => {
                        const nId = `${m.name}#${m.tag}`.toLowerCase().replace(/\s/g, '');
                        newSynergyPoints[nId] = (newSynergyPoints[nId] || 0) + earnedPoints;
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

        return { operations, newSynergyPoints, newDmPoints };
    }
}

module.exports = SynergyEngine;
