// Adicione no topo do update-data.js
const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase (Usar a SERVICE_ROLE_KEY no backend para ter permissão de escrita)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ... (toda a sua lógica atual de fetch da API do Henrik e montagem dos objetos) ...

// No final, em vez de fs.writeFileSync('data.json', ...), faça o Upsert:
console.log('Salvando dados no Supabase...');

// 1. Atualizar Jogadores
const { error: pError } = await supabase
  .from('players')
  .upsert(finalPlayersData, { onConflict: 'riot_id' });
if (pError) console.error('Erro ao salvar jogadores:', pError);

// 2. Salvar novas Operações (Partidas)
for (const op of operations) {
    // Insere a operação (ignora se já existir usando onConflict)
    const { error: opError } = await supabase
        .from('operations')
        .upsert({
            id: op.id,
            map: op.map,
            mode: op.mode,
            started_at: op.started_at,
            score: op.score,
            result: op.result,
            team_color: op.team_color
        }, { onConflict: 'id' });

    // Insere o squad daquela operação
    if (!opError) {
        const squadData = op.squad.map(m => ({
            operation_id: op.id,
            riot_id: m.riotId,
            agent: m.agent,
            agent_img: m.agentImg,
            kda: m.kda,
            hs_percent: m.hs
        }));
        
        // Evitar duplicatas limpando o squad anterior dessa partida (se for atualização)
        await supabase.from('operation_squads').delete().eq('operation_id', op.id);
        await supabase.from('operation_squads').insert(squadData);
    }
}
console.log('✅ Sincronização concluída com sucesso no banco de dados!');
