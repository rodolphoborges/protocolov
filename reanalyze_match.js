const { analyzeMatch } = require('./oraculo');
const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MDIzMSwiZXhwIjoyMDg5NTU2MjMxfQ.hJnAuAxHM_LCXi_sELcvwOIpkUx-per0nwtZBaprSrk';
const supabase = createClient(url, key);

const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';
const playerTag = 'Guxxtavo#easy';

async function reanalyze() {
    console.log(`Re-analyzing match ${matchId} for ${playerTag}...`);
    
    // Patch oraculo.js temporarily to log info
    // Actually, I'll just run it and see.
    
    const result = await analyzeMatch(matchId, playerTag);
    
    if (result.status === 'completed') {
        console.log('Analysis completed successfully.');
        console.log('FK:', result.report.first_bloods);
        console.log('FD:', result.report.first_deaths);
        
        // Update the database (FIXED: only metadata)
        const { data: currentJob } = await supabase
            .from('match_analysis_queue')
            .select('metadata')
            .eq('match_id', matchId)
            .eq('agente_tag', playerTag)
            .single();

        const updatedMeta = { 
            ...(currentJob?.metadata || {}), 
            analysis: result.report 
        };

        const { error } = await supabase
            .from('match_analysis_queue')
            .update({ 
                status: 'completed', 
                metadata: updatedMeta,
                processed_at: new Date().toISOString()
            })
            .eq('match_id', matchId)
            .eq('agente_tag', playerTag);
            
        if (error) {
            console.error('Error updating database:', error);
        } else {
            console.log('Database updated successfully.');
        }
    } else {
        console.error('Analysis failed:', result.error);
    }
}

reanalyze();
