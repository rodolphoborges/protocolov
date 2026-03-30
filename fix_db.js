const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://gzbzfmvgwfvzjqurowku.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A');

async function checkSchema() {
    console.log('--- VERIFICANDO SCHEMA DE OPERATION_SQUADS ---');
    
    // Check constraints
    const { data: constraints, error: cErr } = await supabase.rpc('execute_sql', { 
        query: `
            SELECT conname, pg_get_constraintdef(oid) 
            FROM pg_constraint 
            WHERE conrelid = 'operation_squads'::regclass
        `
    }).catch(() => ({ data: null, error: { message: 'RPC execute_sql not available' } }));

    if (cErr) {
        // Fallback: Just try to describe the table via standard query if possible
        console.log('RPC falhou, tentando consulta direta...');
    }

    // Try to get one row to see columns
    const { data: sample, error: sErr } = await supabase.from('operation_squads').select('*').limit(1);
    if (sErr) {
        console.error('Erro ao buscar amostra:', sErr.message);
    } else {
        console.log('Colunas detectadas:', Object.keys(sample[0] || {}));
    }

    // Cleanup and Add Constraint (Attempt)
    console.log('--- TENTANDO CRIAR CONSTRAINT ÚNICA ---');
    const { error: constraintErr } = await supabase.rpc('execute_sql', {
        query: `
            -- 1. Deletar duplicatas logicamente antes de criar constraint
            DELETE FROM operation_squads a
            USING operation_squads b
            WHERE a.id < b.id 
              AND a.operation_id = b.operation_id 
              AND a.riot_id = b.riot_id;

            -- 2. Tentar adicionar constraint única
            ALTER TABLE operation_squads 
            ADD CONSTRAINT unique_op_player UNIQUE (operation_id, riot_id);
        `
    }).catch(() => ({ error: { message: 'RPC execute_sql not available' } }));

    if (constraintErr) {
        console.error('Erro ao aplicar constraint via RPC:', constraintErr.message);
    } else {
        console.log('Constraint aplicada com sucesso!');
    }
}

checkSchema();
