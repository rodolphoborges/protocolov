const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODAyMzEsImV4cCI6MjA4OTU1NjIzMX0.aZDhgRqlvvmiGi_Zw5Q0_xFSDX-9VTYXBmAYCOfdahc';

const supabase = createClient(url, key);

async function getPrevData() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('*')
        .eq('match_id', '2e099120-308e-4b7e-b255-aba8d1dcf232')
        .single();

    if (error) {
        console.error(error);
        return;
    }

    const report = data.report || data.metadata?.analysis || {};
    console.log('Previous Match Data (2e099120):');
    console.log('Performance Index:', report.performance_index);
    console.log('ADR:', report.adr);
    console.log('KD:', report.kd);
}

getPrevData();
