const { analyzeMatch } = require('./oraculo');
const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODAyMzEsImV4cCI6MjA4OTU1NjIzMX0.aZDhgRqlvvmiGi_Zw5Q0_xFSDX-9VTYXBmAYCOfdahc';

const supabase = createClient(url, key);

async function reanalyzeMatches(matchIds, playerTag) {
    for (const matchId of matchIds) {
        console.log(`\n--- RE-ANALYSING MATCH: ${matchId} ---`);
        const result = await analyzeMatch(matchId, playerTag);
        
        if (result.status === 'completed') {
            console.log('✅ Analysis completed. Updating Supabase...');
            
            // Replicate the metadata update as done in telegram-bot.js
            const { error } = await supabase
                .from('match_analysis_queue')
                .update({ 
                    metadata: { analysis: result.report },
                    processed_at: new Date().toISOString()
                })
                .eq('match_id', matchId)
                .eq('agente_tag', playerTag);
                
            if (error) {
                console.error(`❌ Error updating Supabase for ${matchId}:`, error);
            } else {
                console.log(`✅ Supabase updated for ${matchId}`);
            }
        } else {
            console.error(`❌ Analysis failed for ${matchId}:`, result.error);
        }
    }
}

const matches = [
    '25259f33-8437-4f1f-90f4-43727ac8eb28', // ID 47
    '2e099120-308e-4b7e-b255-aba8d1dcf232', // ID 48
    '2c7944be-f3c4-4429-a0fa-8d3604acd7a7'  // ID 198
];

const player = 'Guxxtavo#easy';

reanalyzeMatches(matches, player);
