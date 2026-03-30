const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://gzbzfmvgwfvzjqurowku.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A');

async function cleanup() {
    console.log('--- LIMPANDO DUPLICATAS DE SQUAD ---');
    
    // Buscar todas as linhas para identificar as duplicatas logicamente
    const { data: allRows, error } = await supabase
        .from('operation_squads')
        .select('id, operation_id, riot_id');

    if (error) {
        console.error('Erro ao buscar dados:', error.message);
        return;
    }

    const seen = new Set();
    const toDelete = [];

    for (const row of allRows) {
        const key = `${row.operation_id}|${row.riot_id}`;
        if (seen.has(key)) {
            toDelete.push(row.id);
        } else {
            seen.add(key);
        }
    }

    console.log(`Encontradas ${toDelete.length} linhas duplicadas.`);

    if (toDelete.length > 0) {
        // Deletar em chunks se for muito grande
        for (let i = 0; i < toDelete.length; i += 100) {
            const chunk = toDelete.slice(i, i + 100);
            const { error: delErr } = await supabase
                .from('operation_squads')
                .delete()
                .in('id', chunk);

            if (delErr) {
                console.error(`Erro ao deletar chunk ${i}:`, delErr.message);
            } else {
                console.log(`Deletadas ${chunk.length} linhas...`);
            }
        }
    }

    console.log('--- LIMPEZA CONCLUÍDA ---');
}

cleanup();
