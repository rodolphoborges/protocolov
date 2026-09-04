const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function insertMatch() {
    console.log('=== INSERÇÃO DE OPERAÇÃO RECENTE (DUO mwzeraDaShopee & Vduart) ===\n');

    const matchId = 'c2f1981e-2c0a-4d2d-919d-faf892640c8e';
    const startedAt = 1788478200000; // 03/09/2026 ~20:30 (UTC-3)

    // 1. Verificar se a operação já existe
    const { data: existing } = await supabase
        .from('operations')
        .select('id')
        .eq('id', matchId)
        .maybeSingle();

    if (existing) {
        console.log(`ℹ️ Operação ${matchId} já está registrada no banco.`);
    } else {
        // Inserir Operação
        const { error: opErr } = await supabase.from('operations').insert([{
            id: matchId,
            map_name: 'Abyss',
            mode: 'Competitive',
            started_at: startedAt,
            score: '13-9',
            result: 'VITÓRIA',
            team_color: 'Blue'
        }]);

        if (opErr) {
            console.error('❌ Erro ao inserir operação:', opErr.message);
            process.exit(1);
        }
        console.log('✅ Operação registrada com sucesso: 13-9 VITÓRIA em Abyss');
    }

    // 2. Inserir Squad
    const squad = [
        {
            operation_id: matchId,
            riot_id: 'mwzeraDaShopee#s2s2',
            agent: 'Sova',
            agent_img: 'https://media.valorant-api.com/agents/320b2a48-4d9b-a075-30f1-1f93a9b638fa/displayicon.png',
            kda: '18/14/4',
            hs_percent: 17
        },
        {
            operation_id: matchId,
            riot_id: 'Vduart#MEE',
            agent: 'Deadlock',
            agent_img: 'https://media.valorant-api.com/agents/cc8b64c8-4b25-4ff9-6e7f-37b4da43d235/displayicon.png',
            kda: '15/13/7',
            hs_percent: 8
        }
    ];

    const { data: existingSquad } = await supabase
        .from('operation_squads')
        .select('riot_id')
        .eq('operation_id', matchId);

    const existingRiotIds = new Set((existingSquad || []).map(s => s.riot_id.toLowerCase()));
    const squadToInsert = squad.filter(s => !existingRiotIds.has(s.riot_id.toLowerCase()));

    if (squadToInsert.length > 0) {
        const { error: sqErr } = await supabase.from('operation_squads').insert(squadToInsert);
        if (sqErr) console.error('❌ Erro ao inserir squad:', sqErr.message);
        else console.log(`✅ ${squadToInsert.length} agentes registrados no esquadrão.`);
    }

    // 3. Atualizar Sinergia e Last Match dos Jogadores
    const { data: p1 } = await supabase.from('players').select('synergy_score').eq('riot_id', 'mwzeraDaShopee#s2s2').single();
    const { data: p2 } = await supabase.from('players').select('synergy_score').eq('riot_id', 'Vduart#MEE').single();

    if (p1) {
        await supabase.from('players').update({
            synergy_score: (p1.synergy_score || 0) + 2,
            last_match_id: matchId,
            updated_at: new Date().toISOString()
        }).eq('riot_id', 'mwzeraDaShopee#s2s2');
        console.log(`⚡ Sinergia de mwzeraDaShopee#s2s2 atualizada: ${(p1.synergy_score || 0) + 2}`);
    }

    if (p2) {
        await supabase.from('players').update({
            synergy_score: (p2.synergy_score || 0) + 2,
            last_match_id: matchId,
            updated_at: new Date().toISOString()
        }).eq('riot_id', 'Vduart#MEE');
        console.log(`⚡ Sinergia de Vduart#MEE atualizada: ${(p2.synergy_score || 0) + 2}`);
    }

    console.log('\n🎯 Partida mais recente sincronizada com sucesso no banco!');
}

insertMatch().catch(err => {
    console.error('❌ Falha:', err);
    process.exit(1);
});
