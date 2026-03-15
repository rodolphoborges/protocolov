const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function run() {
    console.log('--- PROTOCOLO V: ROTINA DE MANUTENÇÃO DE DADOS ---');
    const now = new Date();
    
    // getDay() retorna 1 para Segunda-feira.
    const isMonday = now.getDay() === 1; 
    // getDate() retorna o dia do mês.
    const isFirstOfMonth = now.getDate() === 1;

    try {
        if (isMonday) {
            console.log('🔄 Iniciando Reset SEMANAL de Mata-Mata...');
            const { error } = await supabase.from('players').update({ dm_score: 0 }).neq('dm_score', 0);
            if (error) throw error;
            console.log('✅ Leaderboard Semanal zerada.');
        } else {
            console.log('⏭️ Hoje não é segunda-feira. Reset semanal ignorado.');
        }

        if (isFirstOfMonth) {
            console.log('🔄 Iniciando Reset MENSAL de Mata-Mata...');
            const { error } = await supabase.from('players').update({ dm_score_monthly: 0 }).neq('dm_score_monthly', 0);
            if (error) throw error;
            console.log('✅ Leaderboard Mensal zerada.');
        } else {
            console.log('⏭️ Hoje não é dia 1. Reset mensal ignorado.');
        }

    } catch (error) {
        console.error('🔥 Erro durante a rotina de reset:', error);
        process.exit(1);
    }
}

run();
