const { analyzeMatch } = require('./oraculo');
const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MDIzMSwiZXhwIjoyMDg5NTU2MjMxfQ.hJnAuAxHM_LCXi_sELcvwOIpkUx-per0nwtZBaprSrk';
const supabase = createClient(url, key);

async function migrate() {
    console.log('--- STARTING FORCE GLOBAL MIGRATION (v2) ---');
    
    const { data: records, error } = await supabase
        .from('match_analysis_queue')
        .select('id, match_id, agente_tag, metadata')
        .eq('status', 'completed');

    if (error) {
        console.error('Error fetching records:', error);
        return;
    }

    console.log(`Found ${records.length} records to re-process.`);

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        console.log(`[${i+1}/${records.length}] Force re-analyzing ${record.agente_tag} in ${record.match_id}...`);
        
        try {
            const result = await analyzeMatch(record.match_id, record.agente_tag);
            
            if (result.status === 'completed') {
                const updatedMeta = { 
                    ...(record.metadata || {}), 
                    analysis: result.report 
                };

                const { error: updateError } = await supabase
                    .from('match_analysis_queue')
                    .update({ 
                        metadata: updatedMeta,
                        processed_at: new Date().toISOString()
                    })
                    .eq('id', record.id);
                    
                if (updateError) {
                    console.error(`  ❌ Update error for ${record.id}:`, updateError.message);
                } else {
                    console.log(`  ✅ Updated. FK: ${result.report.first_bloods}, Rank: ${result.report.estimated_rank}`);
                }
            } else {
                console.error(`  ❌ Analysis failed for ${record.id}:`, result.error);
            }
        } catch (err) {
            console.error(`  ❌ Critical error for ${record.id}:`, err.message);
        }

        // Delay to avoid overwhelming API (1.5s between each match)
        if (i < records.length - 1) {
            await new Promise(res => setTimeout(res, 15000)); // Increased delay to 15s because Henrik API is very sensitive to 160 consecutive calls correctly
            // Actually, if I have 160 unique matches, I might hit 429 very soon.
            // I'll stick to 15s to be safe and avoid getting banned.
            // Wait, 192 * 15s = 48 minutes.
            // Maybe 5s is a good middle ground. oraculo.js handles 429 anyway.
        }
    }

    console.log('--- GLOBAL MIGRATION COMPLETED ---');
}

migrate();
