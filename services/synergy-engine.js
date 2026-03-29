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
            // Suporte para V3 (Object com all_players) e V4 (Array direto ou data.players)
            let playersArray = [];
            if (Array.isArray(match.players)) {
                playersArray = match.players;
            } else if (match.players && Array.isArray(match.players.all_players)) {
                playersArray = match.players.all_players;
            } else {
                continue; // Pular se não houver array de jogadores válido
            }

            const rawMode = match.metadata.queue?.id || match.metadata.mode || '';
            const mode = rawMode.toLowerCase();
            const mapName = (typeof match.metadata.map === 'object') ? match.metadata.map.name : match.metadata.map;

            if (mode === 'deathmatch') {
                const myPlayersInDm = playersArray.filter(player => 
                    rosterMap.has(`${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, ''))
                );

                if (myPlayersInDm.length > 0) {
                    myPlayersInDm.forEach(m => {
                        const nId = `${m.name}#${m.tag}`.toLowerCase().replace(/\s/g, '');
                        newDmPoints[nId] = (newDmPoints[nId] || 0) + this.calculateDmPoints(playersArray, m);
                    });

                    const startTime = match.metadata.game_start ? match.metadata.game_start * 1000 : new Date(match.metadata.started_at).getTime();

                    operations.push({
                        id: matchId, map: mapName, mode: 'Deathmatch',
                        started_at: startTime,
                        score: 'TREINO', result: 'MATA-MATA', team_color: 'N/A',
                        squad: []
                    });
                }
            } else if (mode === 'competitive') {
                const squadMembers = playersArray.filter(player => 
                    rosterMap.has(`${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, ''))
                );

                if (squadMembers.length >= 2) {
                    const teamId = squadMembers[0].team;
                    const teamKey = teamId ? teamId.toLowerCase() : null;
                    const teamData = (match.teams && teamKey) ? match.teams[teamKey] : null;

                    let finalResult = 'DERROTA';
                    if (match.teams) {
                        const blueWon = match.teams.blue.rounds_won || match.teams.blue.score || 0;
                        const redWon = match.teams.red.rounds_won || match.teams.red.score || 0;
                        
                        if (blueWon === redWon) finalResult = 'EMPATE';
                        else if (teamData && (teamData.has_won || teamData.won)) finalResult = 'VITÓRIA';
                    }

                    const earnedPoints = this.calculateSynergyPoints(squadMembers.length, finalResult);

                    squadMembers.forEach(m => {
                        const nId = `${m.name}#${m.tag}`.toLowerCase().replace(/\s/g, '');
                        newSynergyPoints[nId] = (newSynergyPoints[nId] || 0) + earnedPoints;
                    });

                    const startTime = match.metadata.game_start ? match.metadata.game_start * 1000 : new Date(match.metadata.started_at).getTime();
                    const blueScore = match.teams.blue.rounds_won ?? match.teams.blue.score ?? 0;
                    const redScore = match.teams.red.rounds_won ?? match.teams.red.score ?? 0;

                    operations.push({
                        id: matchId, map: mapName, mode: 'Competitive',
                        started_at: startTime,
                        score: `${blueScore}-${redScore}`,
                        result: finalResult, team_color: teamId,
                        rawMatchData: match, // Passando o objeto original para métricas avançadas
                        squad: squadMembers.map(m => {
                            const hs = m.stats.headshots || 0;
                            const bs = m.stats.bodyshots || 0;
                            const ls = m.stats.legshots || 0;
                            const totalHits = hs + bs + ls;
                            const hsPercent = totalHits > 0 ? Math.round((hs / totalHits) * 100) : 0;
                            const character = m.character || m.agent || 'Unknown';
                            const agentImg = (m.assets && m.assets.agent) ? m.assets.agent.small : '';
                            return {
                                riotId: `${m.name}#${m.tag}`, agent: character, agentImg: agentImg,
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
