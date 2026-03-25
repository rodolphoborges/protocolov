const { oraculo } = require('../../src/db');

const matchIds = [
    'e910223e-2c48-48e1-b270-35bb5001b65f',
    '25fba675-09e4-4965-a409-c936702fd5e5',
    'e2b6105f-2f5e-4a29-b00b-364449b9cdea'
];

async function requeue() {
    if (!oraculo) {
        console.error('🔥 Erro: Conexão com Oráculo V não configurada.');
        return;
    }

    console.log(`🚀 Iniciando re-enfileiramento de ${matchIds.length} partidas...`);

    const queueData = matchIds.map(id => ({
        match_id: id,
        agente_tag: 'AUTO',
        status: 'pending'
    }));

    const { data, error } = await oraculo
        .from('match_analysis_queue')
        .upsert(queueData, { onConflict: 'match_id,agente_tag' });

    if (error) {
        console.error('❌ Erro ao inserir na fila:', error.message);
    } else {
        console.log('✅ Partidas inseridas com sucesso na fila do Oráculo V!');
    }
}

requeue();
