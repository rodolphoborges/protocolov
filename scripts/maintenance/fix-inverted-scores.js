const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixInvertedScores() {
    console.log('=== CORREÇÃO DE PLACARES INVERTIDOS (ÚLTIMAS OPERAÇÕES) ===\n');

    // 1. Buscar todas as operações competitivas
    const { data: ops, error } = await supabase
        .from('operations')
        .select('id, score, result, team_color, map_name')
        .neq('mode', 'Deathmatch');

    if (error) {
        console.error('❌ Erro ao buscar operações:', error.message);
        process.exit(1);
    }

    console.log(`📡 Total de operações competitivas encontradas: ${ops.length}`);

    // 2. Identificar operações com placar invertido
    const toFix = [];
    for (const op of ops) {
        if (!op.score || !op.score.includes('-')) continue;
        const [s1, s2] = op.score.split('-').map(Number);
        if (isNaN(s1) || isNaN(s2) || s1 === s2) continue;

        const isInverted = (op.result === 'VITÓRIA' && s1 < s2) || (op.result === 'DERROTA' && s1 > s2);
        if (isInverted) {
            toFix.push({
                id: op.id,
                map_name: op.map_name,
                result: op.result,
                team_color: op.team_color,
                old_score: op.score,
                new_score: `${s2}-${s1}`
            });
        }
    }

    console.log(`🔍 Operações com placar invertido identificadas: ${toFix.length}\n`);

    if (toFix.length === 0) {
        console.log('✅ Todas as operações já estão com placar normalizado!');
        return;
    }

    // Exibir amostra das operações que serão corrigidas
    console.log('--- Amostra das primeiras 5 correções ---');
    toFix.slice(0, 5).forEach(item => {
        console.log(`[${item.map_name}] ${item.team_color} | ${item.result}: ${item.old_score} -> ${item.new_score}`);
    });
    console.log('----------------------------------------\n');

    // 3. Atualizar em lotes no Supabase
    let updatedCount = 0;
    const batchSize = 25;

    for (let i = 0; i < toFix.length; i += batchSize) {
        const batch = toFix.slice(i, i + batchSize);
        await Promise.all(batch.map(item => 
            supabase
                .from('operations')
                .update({ score: item.new_score })
                .eq('id', item.id)
        ));
        updatedCount += batch.length;
        process.stdout.write(`⏳ Progresso: ${updatedCount}/${toFix.length} operações corrigidas...\r`);
    }

    console.log(`\n\n✅ Sucesso: ${updatedCount} operações foram corrigidas no Supabase.`);

    // 4. Verificação Final
    const { data: verifyOps } = await supabase
        .from('operations')
        .select('id, score, result')
        .neq('mode', 'Deathmatch');

    const remainingInverted = verifyOps.filter(op => {
        if (!op.score || !op.score.includes('-')) return false;
        const [s1, s2] = op.score.split('-').map(Number);
        return (op.result === 'VITÓRIA' && s1 < s2) || (op.result === 'DERROTA' && s1 > s2);
    });

    console.log(`🎯 Verificação final: ${remainingInverted.length} operações invertidas restantes.`);
}

fixInvertedScores().catch(err => {
    console.error('❌ Falha na execução:', err);
    process.exit(1);
});
