require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY || process.env.ORACULO_SUPABASE_ANON_KEY;

// Fail-safe client creation
let supabase = null;
if (!supabaseUrl || !supabaseKey) {
    console.error('🔥 [CRITICAL] Supabase Main credentials missing!');
    console.error('   Check SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.');
    console.error('   System cannot continue without persistent storage.');
} else {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
    } catch (e) {
        console.error('🔥 [ERROR] Failed to initialize Supabase client:', e.message);
    }
}

let oraculo = null;
if (oraculoUrl && oraculoKey) {
    try {
        oraculo = createClient(oraculoUrl, oraculoKey);
    } catch (e) {
        console.error('⚠️ [WARNING] Failed to initialize Oráculo-V client:', e.message);
    }
}

module.exports = {
    supabase,
    oraculo,
    createClient
};
