require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('🔥 ERRO: Variáveis de ambiente faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConvocar() {
    const now = Date.now();
    const expiresAt = now + (5 * 60 * 1000); // 5 minutes from now

    console.log('Inserting test call...');
    const { data, error } = await supabase.from('active_calls').insert([{
        commander: 'TEST_AGENT',
        party_code: 'TEST1234',
        expires_at: expiresAt
    }]).select();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Success:', data);
    }
}

testConvocar();
