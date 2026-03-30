const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://gzbzfmvgwfvzjqurowku.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A');

async function check() {
    const { data: cols, error } = await supabase.rpc('get_table_info', { table_name: 'operation_squads' });
    // If RPC doesn't exist, try getting one row
    const { data: row } = await supabase.from('operation_squads').select('*').limit(1);
    console.log('Sample row:', row);
}
check();
