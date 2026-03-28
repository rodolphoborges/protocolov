const { supabase, oraculo } = require('../../src/db');

async function syncQueue() {
    if (!oraculo) {
        console.error('🔥 Erro: Conexão com Oráculo V não configurada.');
        return;
    }

    console.log('📡 Sincronizando fila do Oráculo V com operações recentes...');

    // 1. Pegar as últimas 20 operações competitivas
    const { data: recentOps, error: opsError } = await supabase
        .from('operations')
        .select('id, mode, operation_squads(riot_id)')
        .eq('mode', 'Competitive')
        .order('started_at', { ascending: false })
        .limit(20);

    if (opsError) {
        console.error('❌ Erro ao buscar operações:', opsError.message);
        return;
    }

    console.log(`🔍 Verificando ${recentOps.length} operações competitivas recentes...`);

    // 2. Verificar quais já estão na fila
    const opIds = recentOps.map(op => op.id);
    const { data: existingQueue, error: queueError } = await oraculo
        .from('match_analysis_queue')
        .select('match_id')
        .in('match_id', opIds)
        .eq('agente_tag', 'AUTO');

    if (queueError) {
        console.error('❌ Erro ao buscar fila:', queueError.message);
        return;
    }

    const queuedIds = new Set(existingQueue.map(q => q.match_id));
    const missingOps = recentOps.filter(op => !queuedIds.has(op.id));

    if (missingOps.length === 0) {
        console.log('✅ Todas as operações recentes já estão na fila.');
        return;
    }

    console.log(`🚀 Adicionando ${missingOps.length} operações em falta à fila...`);

    const newEntries = [];
    missingOps.forEach(op => {
        newEntries.push({
            match_id: op.id,
            agente_tag: 'AUTO',
            status: 'pending'
        });
        if (op.operation_squads && Array.isArray(op.operation_squads)) {
            op.operation_squads.forEach(member => {
                newEntries.push({
                    match_id: op.id,
                    agente_tag: member.riot_id,
                    status: 'pending'
                });
            });
        }
    });

    const { error: insertError } = await oraculo
        .from('match_analysis_queue')
        .upsert(newEntries, { onConflict: 'match_id,agente_tag' });

    if (insertError) {
        console.error('❌ Erro ao sincronizar fila:', insertError.message);
    } else {
        console.log('✅ Sincronização concluída com sucesso!');
    }
}

syncQueue();
