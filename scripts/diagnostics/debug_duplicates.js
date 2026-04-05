const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://gzbzfmvgwfvzjqurowku.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A');

async function debugDuplicates() {
    console.log('--- BUSCANDO DUPLICATAS ATUAIS ---');
    const { data: allRows, error } = await supabase.from('operation_squads').select('operation_id, riot_id, id');
    if (error) {
        console.error('Erro:', error.message);
        return;
    }

    const counts = {};
    const duplicates = [];
    allRows.forEach(row => {
        const key = `${row.operation_id}|${row.riot_id}`;
        if (counts[key]) {
            duplicates.push(row.id);
        }
        counts[key] = (counts[key] || 0) + 1;
    });

    const entries = Object.entries(counts).filter(([k,v]) => v > 1);
    console.log(`Pares (Op, Player) duplicados encontrados: ${entries.length}`);
    if (entries.length > 0) {
        console.log('Exemplos de chaves duplicadas:', entries.slice(0, 5));
    }
    console.log(`Total de IDs para deletar: ${duplicates.length}`);

    if (duplicates.length > 0) {
        const { error: delErr } = await supabase.from('operation_squads').delete().in('id', duplicates);
        if (delErr) console.error('Erro ao deletar:', delErr.message);
        else console.log('Duplicatas deletadas com sucesso.');
    }
}

debugDuplicates();
