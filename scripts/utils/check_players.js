const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPlayers() {
    const { data, error } = await supabase
        .from('players')
        .select('riot_id')
        .limit(10);

    if (error) {
        console.error("Erro:", error);
    } else {
        console.log("Riot IDs no banco (players):", data.map(p => p.riot_id).join(', '));
    }
}

checkPlayers();
