const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODAyMzEsImV4cCI6MjA4OTU1NjIzMX0.aZDhgRqlvvmiGi_Zw5Q0_xFSDX-9VTYXBmAYCOfdahc';

const supabase = createClient(url, key);

async function checkHistory() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('id, match_id, created_at, status')
        .eq('agente_tag', 'Guxxtavo#easy')
        .order('created_at', { ascending: false });

    console.log(JSON.stringify(data, null, 2));
}

checkHistory();
