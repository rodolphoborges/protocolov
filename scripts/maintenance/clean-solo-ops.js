require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
    console.log('--- LIMPEZA DE OPERAÇÕES SOLO ---');

    // Buscar todas as operações
    const { data: ops, error: opsErr } = await supabase
        .from('operations')
        .select('id, mode, started_at');

    if (opsErr) throw opsErr;
    console.log(`Total de operações no banco: ${ops.length}`);

    // Para cada operação, contar membros em operation_squads
    const toDelete = [];

    for (const op of ops) {
        const { count, error } = await supabase
            .from('operation_squads')
            .select('*', { count: 'exact', head: true })
            .eq('operation_id', op.id);

        if (error) {
            console.error(`Erro ao contar squad de ${op.id}: ${error.message}`);
            continue;
        }

        // Operações com menos de 2 membros do roster são solo
        if ((count || 0) < 2) {
            toDelete.push(op.id);
        }
    }

    console.log(`Operações solo identificadas para remoção: ${toDelete.length}`);

    if (toDelete.length === 0) {
        console.log('Nada a remover.');
        return;
    }

    // Remover em lotes de 50
    const chunkSize = 50;
    for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);

        // Remover squads primeiro (FK)
        await supabase.from('operation_squads').delete().in('operation_id', chunk);

        const { error: delErr } = await supabase
            .from('operations')
            .delete()
            .in('id', chunk);

        if (delErr) {
            console.error(`Erro ao deletar lote: ${delErr.message}`);
        } else {
            console.log(`Removidas ${chunk.length} operações solo.`);
        }
    }

    console.log('✅ Limpeza concluída.');
}

run().catch(err => {
    console.error('🔥 Erro fatal:', err);
    process.exit(1);
});
