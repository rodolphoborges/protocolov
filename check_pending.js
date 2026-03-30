
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkQueue() {
    console.log('--- STATUS DA FILA PROTOCOLO-V ---');
    const { data: pending, error } = await supabase
        .from('match_analysis_queue')
        .select('*')
        .in('status', ['pending', 'failed'])
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao buscar fila:', error.message);
        return;
    }

    if (pending.length === 0) {
        console.log('✅ Nenhuma partida pendente ou com falha na fila.');
    } else {
        console.log(`⚠️ Encontradas ${pending.length} partidas aguardando processamento:`);
        pending.forEach(job => {
            console.log(`[${job.status.toUpperCase()}] Match: ${job.match_id} | Player: ${job.player_tag} | Criado em: ${job.created_at}`);
        });
    }

    const { data: players, error: pErr } = await supabase.from('players').select('riot_id').limit(20);
    if (!pErr) {
        console.log('\n--- AGENTES MONITORADOS ---');
        console.log(players.map(p => p.riot_id).join(', '));
    }
}

checkQueue();
