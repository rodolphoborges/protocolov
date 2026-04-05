const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function auditSynergy() {
    console.log('--- AUDITORIA DE SINERGIA PROTOCOLO-V ---');

    // 1. Buscar todos os jogadores
    const { data: players, error: pErr } = await supabase
        .from('players')
        .select('*');
    
    if (pErr) {
        console.error('Erro ao buscar jogadores:', pErr.message);
        return;
    }

    const playerMap = new Map();
    players.forEach(p => {
        const nId = p.riot_id.toLowerCase().replace(/\s/g, '');
        playerMap.set(nId, { 
            original: p, 
            calculatedPoints: 0,
            matchesProcessed: 0
        });
    });

    // 2. Buscar todas as operações competitivas
    const { data: operations, error: opErr } = await supabase
        .from('operations')
        .select('*')
        .eq('mode', 'Competitive');
    
    if (opErr) {
        console.error('Erro ao buscar operações:', opErr.message);
        return;
    }

    console.log(`Analisando ${operations.length} operações competitivas...`);

    // 3. Buscar todos os squad members de todas as operações (com paginação)
    let squadMembers = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    console.log('Buscando membros dos esquadrões...');
    while (hasMore) {
        const { data: batch, error: sErr } = await supabase
            .from('operation_squads')
            .select('*')
            .range(from, from + pageSize - 1);
        
        if (sErr) {
            console.error('Erro ao buscar squad members:', sErr.message);
            return;
        }

        squadMembers = squadMembers.concat(batch);
        if (batch.length < pageSize) {
            hasMore = false;
        } else {
            from += pageSize;
        }
    }
    console.log(`Total de registros de squad encontrados: ${squadMembers.length}`);

    // Organizar squad members por operation_id
    const squadByOp = new Map();
    squadMembers.forEach(m => {
        if (!squadByOp.has(m.operation_id)) squadByOp.set(m.operation_id, []);
        squadByOp.get(m.operation_id).push(m);
    });

    // 4. Recalcular e Auditar
    operations.forEach(op => {
        const squad = squadByOp.get(op.id) || [];
        // Apenas membros registrados no mapa
        const registeredMembers = squad.filter(m => {
            const nId = m.riot_id.toLowerCase().replace(/\s/g, '');
            return playerMap.has(nId);
        });

        if (registeredMembers.length >= 2) {
            let basePoints = 0;
            if (registeredMembers.length === 2) basePoints = 1;
            else if (registeredMembers.length === 3) basePoints = 2;
            else if (registeredMembers.length >= 4) basePoints = 5;

            const finalPoints = (op.result === 'VITÓRIA') ? basePoints * 2 : basePoints;

            registeredMembers.forEach(m => {
                const nId = m.riot_id.toLowerCase().replace(/\s/g, '');
                const entry = playerMap.get(nId);
                entry.calculatedPoints += finalPoints;
                entry.matchesProcessed += 1;
            });
        }
    });

    // 5. Comparar resultados
    let totalDiff = 0;
    const sortedPlayers = Array.from(playerMap.values()).sort((a, b) => b.calculatedPoints - a.calculatedPoints);

    let report = '# Relatório de Auditoria de Sinergia - Protocolo-V\n\n';
    report += `Data: ${new Date().toLocaleString()}\n`;
    report += `Operações Competitivas Analisadas: ${operations.length}\n\n`;
    report += '| Status | Jogador | Sinergia Atual | Sinergia Calculada | Diferença | Partidas em Squad |\n';
    report += '| :--- | :--- | :--- | :--- | :--- | :--- |\n';

    sortedPlayers.forEach((data) => {
        const diff = data.calculatedPoints - data.original.synergy_score;
        totalDiff += Math.abs(diff);
        const status = diff === 0 ? '✅ OK' : '❌ ERRO';
        const formattedDiff = (diff > 0 ? '+' : '') + diff;
        
        report += `| ${status} | ${data.original.riot_id} | ${data.original.synergy_score} | ${data.calculatedPoints} | ${formattedDiff} | ${data.matchesProcessed} |\n`;
    });

    if (totalDiff === 0 && playerMap.size > 0) {
        report += '\n## ✅ CONCLUSÃO: Todos os pontos de sinergia estão 100% CORRETOS!\n';
    } else if (playerMap.size > 0) {
        report += `\n## ⚠️ CONCLUSÃO: Foram encontradas divergências! \n\nTotal acumulado de erro: **${totalDiff} pontos**.\n\n`;
        report += '### Possíveis causas:\n';
        report += '1. **Operações Deletadas:** Se uma operação foi removida do banco mas os pontos permaneceram nos jogadores.\n';
        report += '2. **Reset Parcial:** Se a tabela de jogadores foi resetada mas a de operações não.\n';
        report += '3. **Erro no Upsert Antigo:** Se o sistema falhou ao atualizar a pontuação incrementalmente (ex: processou a partida mas não somou os pontos).\n';
        report += '4. **Pontuação Manual:** Se alguém alterou o `synergy_score` diretamente no banco de dados.\n';
    }

    require('fs').writeFileSync('synergy_audit.md', report);
    console.log('Auditoria concluída! Veja o arquivo synergy_audit.md');
}

auditSynergy().catch(err => console.error('Erro Fatal:', err));
