
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkSpecificMatch() {
    const matchId = 'd610dc41-6235-4bcc-9201-3be3cf81033c';
    const playerTag = 'mwzeraDaShopee#s2s2';
    
    console.log(`--- INVESTIGANDO PARTIDA ${matchId} ---`);
    console.log(`Buscando por: ${playerTag}`);

    // 1. Verificar se existe na tabela de operações (já processada)
    const { data: op, error: opErr } = await supabase
        .from('operations')
        .select('*')
        .eq('match_id', matchId)
        .ilike('player_tag', playerTag.replace('#', '%'));
    
    if (op && op.length > 0) {
        console.log('✅ A partida JÁ EXISTE na tabela "operations".');
        console.log('Dados:', op[0]);
    } else {
        console.log('❌ A partida NÃO FOI ENCONTRADA na tabela "operations".');
    }

    // 2. Verificar se existe na fila
    const { data: queue, error: qErr } = await supabase
        .from('match_analysis_queue')
        .select('*')
        .eq('match_id', matchId)
        .ilike('player_tag', playerTag.replace('#', '%'));

    if (queue && queue.length > 0) {
        console.log('⚠️ A partida está na FILA (match_analysis_queue).');
        console.log('Status da fila:', queue[0].status);
    } else {
        console.log('❌ A partida NÃO ESTÁ na fila.');
    }

    // 3. Verificar se existe insight dela
    const { data: insight, error: iErr } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('match_id', matchId)
        .ilike('player_id', playerTag.replace('#', '%'));

    if (insight && insight.length > 0) {
        console.log('✅ INSIGHT JÁ EXISTE para esta partida.');
    } else {
        console.log('❌ Nenhum insight encontrado.');
    }
}

checkSpecificMatch();
