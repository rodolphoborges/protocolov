const { analyzeMatch } = require('./oraculo');
const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MDIzMSwiZXhwIjoyMDg5NTU2MjMxfQ.hJnAuAxHM_LCXi_sELcvwOIpkUx-per0nwtZBaprSrk';
const supabase = createClient(url, key);

const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';

async function reanalyzeAll() {
    const players = ['Guxxtavo#easy', 'DefeitoDeFábrica#ZzZ', 'm4sna#chama'];
    
    for (const playerTag of players) {
        console.log(`Re-analyzing match ${matchId} for ${playerTag}...`);
        const result = await analyzeMatch(matchId, playerTag);
        
        if (result.status === 'completed') {
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
                console.error(`Error updating DB for ${playerTag}:`, error);
            } else {
                console.log(`Successfully updated DB for ${playerTag}. FK: ${result.report.first_bloods}, FD: ${result.report.first_deaths}`);
            }
        } else {
            console.error(`Analysis failed for ${playerTag}:`, result.error);
        }
    }
}

reanalyzeAll();
