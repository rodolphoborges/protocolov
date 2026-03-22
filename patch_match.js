const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODAyMzEsImV4cCI6MjA4OTU1NjIzMX0.aZDhgRqlvvmiGi_Zw5Q0_xFSDX-9VTYXBmAYCOfdahc';

const supabase = createClient(url, key);

async function patchMatch() {
    const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';
    const playerTag = 'Guxxtavo#easy';

    // Fetch existing report
    const { data: job, error: fetchErr } = await supabase
        .from('match_analysis_queue')
        .select('*')
        .eq('match_id', matchId)
        .eq('agente_tag', playerTag)
        .single();

    if (fetchErr) {
        console.error('Fetch error:', fetchErr);
        return;
    }

    const report = job.report || job.metadata?.analysis;
    if (!report) {
        console.error('No report found in job');
        return;
    }

    // UPDATED HOLT DATA (Manually Calculated)
    report.holt = {
        performance_l: 97.84,
        performance_t: 5.11,
        adr_l: 132.20,
        adr_t: 8.68,
        kd_l: 0.98,
        kd_t: 0.04,
        performance_forecast: 102.95,
        adr_forecast: 140.88,
        kd_forecast: 1.02
    };

    const updatedMeta = job.metadata || {};
    updatedMeta.analysis = report;

    const { error: updateErr } = await supabase
        .from('match_analysis_queue')
        .update({ 
            metadata: updatedMeta,
            processed_at: new Date().toISOString()
        })
        .eq('id', job.id);

    if (updateErr) {
        console.error('Update error:', updateErr);
    } else {
        console.log(`✅ Successfully patched match ${matchId} with Holt data.`);
    }
}

patchMatch();
