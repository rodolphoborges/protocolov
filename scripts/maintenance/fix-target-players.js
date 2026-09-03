const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPlayers() {
    console.log('--- ATUALIZANDO DADOS DOS 4 JOGADORES ALVO ---');

    const updates = [
        {
            riot_id: 'Ele joga de Tejo#blue',
            role_raw: 'Iniciador',
            unit: 'OMEGA',
            level: 290,
            card_url: 'https://media.valorant-api.com/playercards/f2e6241d-4c6f-5b6d-f871-10952e6e085c/smallart.png',
            current_rank: 'Gold 3',
            current_rank_icon: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/14/smallicon.png',
            peak_rank: 'Diamond 3',
            peak_rank_icon: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/20/smallicon.png',
            tracker_link: 'https://tracker.gg/valorant/profile/riot/Ele%20joga%20de%20Tejo%23blue/overview',
            api_error: false,
            updated_at: new Date().toISOString()
        },
        {
            riot_id: 'Ministro Xandao#peixe',
            current_rank: 'Platinum 1',
            current_rank_icon: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/15/smallicon.png',
            peak_rank: 'Platinum 2',
            peak_rank_icon: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/16/smallicon.png',
            tracker_link: 'https://tracker.gg/valorant/profile/riot/Ministro%20Xandao%23peixe/overview',
            api_error: false,
            updated_at: new Date().toISOString()
        },
        {
            riot_id: 'DefeitoDeFábrica#ZzZ',
            current_rank: 'Silver 2',
            current_rank_icon: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/10/smallicon.png',
            peak_rank: 'Gold 1',
            peak_rank_icon: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/12/smallicon.png',
            tracker_link: 'https://tracker.gg/valorant/profile/riot/DefeitoDeF%C3%A1brica%23ZzZ/overview',
            api_error: false,
            updated_at: new Date().toISOString()
        },
        {
            riot_id: 'HidanSS#5793',
            role_raw: 'Flex',
            unit: 'WINGMAN',
            level: 1,
            card_url: 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png',
            current_rank: 'Unranked',
            current_rank_icon: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png',
            peak_rank: 'Unranked',
            peak_rank_icon: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png',
            tracker_link: 'https://tracker.gg/valorant/profile/riot/HidanSS%235793/overview',
            api_error: false,
            updated_at: new Date().toISOString()
        }
    ];

    for (const p of updates) {
        const { error } = await supabase.from('players').update(p).eq('riot_id', p.riot_id);
        if (error) {
            console.error(`❌ Erro ao atualizar ${p.riot_id}:`, error.message);
        } else {
            console.log(`✅ ${p.riot_id}: Dados atualizados com sucesso!`);
        }
    }

    console.log('--- ATUALIZAÇÃO CONCLUÍDA ---');
}

fixPlayers().catch(err => console.error('Erro Fatal:', err));
