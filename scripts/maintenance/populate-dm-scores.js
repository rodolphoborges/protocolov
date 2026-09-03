const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function populateDmScores() {
    console.log('--- RESTAURAÇÃO DE PONTUAÇÃO DE MATA-MATA (SEMANAL E MENSAL) ---');

    const updates = [
        { riot_id: 'TKBatata#JINX', dm_score: 185, dm_score_monthly: 620 },
        { riot_id: 'ousadia#013', dm_score: 140, dm_score_monthly: 490 },
        { riot_id: 'PDL CH1TUZ#666', dm_score: 95, dm_score_monthly: 310 },
        { riot_id: 'Ministro Xandao#peixe', dm_score: 70, dm_score_monthly: 220 },
        { riot_id: 'Mahoraga#Chess', dm_score: 45, dm_score_monthly: 110 },
        { riot_id: 'mwzeraDaShopee#s2s2', dm_score: 25, dm_score_monthly: 65 },
        { riot_id: 'm4sna#chama', dm_score: 20, dm_score_monthly: 50 },
        { riot_id: 'Fadinha Do FF#nobru', dm_score: 15, dm_score_monthly: 45 },
        { riot_id: 'DefeitoDeFábrica#ZzZ', dm_score: 10, dm_score_monthly: 30 },
        { riot_id: 'ALT4O#easy', dm_score: 0, dm_score_monthly: 15 },
        { riot_id: 'Camarada vituxo#1312', dm_score: 0, dm_score_monthly: 10 },
        { riot_id: 'ALEGRIA#021', dm_score: 0, dm_score_monthly: 10 }
    ];

    for (const item of updates) {
        const { error } = await supabase
            .from('players')
            .update({
                dm_score: item.dm_score,
                dm_score_monthly: item.dm_score_monthly,
                updated_at: new Date().toISOString()
            })
            .eq('riot_id', item.riot_id);

        if (error) {
            console.error(`❌ Erro ao atualizar ${item.riot_id}:`, error.message);
        } else {
            console.log(`✅ ${item.riot_id.padEnd(25)} | Semanal: ${item.dm_score} pts | Mensal: ${item.dm_score_monthly} pts`);
        }
    }

    console.log('--- RESTAURAÇÃO CONCLUÍDA ---');
}

populateDmScores().catch(err => console.error('Erro Fatal:', err));
