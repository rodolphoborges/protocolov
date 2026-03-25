require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY || process.env.ORACULO_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('🔥 ERRO: Variáveis de ambiente do Supabase (Main) faltando.');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const oraculo = (oraculoUrl && oraculoKey) ? createClient(oraculoUrl, oraculoKey) : null;

module.exports = {
    supabase,
    oraculo,
    createClient // Export specifically in case new clients are needed
};
