const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSynergy() {
    console.log('--- OPERAÇÃO DE RESTAURAÇÃO DE SINERGIA PROTOCOLO-V ---');

    // 1. Buscar todos os jogadores
    const { data: players, error: pErr } = await supabase.from('players').select('*');
    if (pErr) { console.error('Erro ao buscar jogadores:', pErr.message); return; }

    const playerMap = new Map();
    players.forEach(p => {
        const nId = p.riot_id.toLowerCase().replace(/\s/g, '');
        playerMap.set(nId, { p, calculatedPoints: 0 });
    });

    // 2. Buscar todas as operações competitivas
    const { data: operations, error: opErr } = await supabase.from('operations').select('*').eq('mode', 'Competitive');
    if (opErr) { console.error('Erro ao buscar operações:', opErr.message); return; }
    console.log(`Processando ${operations.length} operações competitivas...`);

    // 3. Buscar membros dos esquadrões (com paginação)
    let squadMembers = [];
    let from = 0;
    while (true) {
        const { data: batch, error: sErr } = await supabase.from('operation_squads').select('*').range(from, from + 999);
        if (sErr) { console.error('Erro ao buscar squad members:', sErr.message); return; }
        squadMembers = squadMembers.concat(batch);
        if (batch.length < 1000) break;
        from += 1000;
    }

    const squadByOp = new Map();
    squadMembers.forEach(m => {
        if (!squadByOp.has(m.operation_id)) squadByOp.set(m.operation_id, []);
        squadByOp.get(m.operation_id).push(m);
    });

    // 4. Calcular
    operations.forEach(op => {
        const squad = squadByOp.get(op.id) || [];
        const regMembers = squad.filter(m => playerMap.has(m.riot_id.toLowerCase().replace(/\s/g, '')));

        if (regMembers.length >= 2) {
            let base = 0;
            if (regMembers.length === 2) base = 1;
            else if (regMembers.length === 3) base = 2;
            else if (regMembers.length >= 4) base = 5;
            
            // Suporte para múltiplas variações de texto de vitória
            const res = (op.result || '').toUpperCase();
            const isWin = res.includes('VITÓRIA') || res.includes('VITORIA') || res.includes('WIN');
            
            const points = isWin ? base * 2 : base;
            regMembers.forEach(m => {
                const nId = m.riot_id.toLowerCase().replace(/\s/g, '');
                playerMap.get(nId).calculatedPoints += points;
            });
        }
    });

    // 5. Atualizar o Banco
    console.log('Iniciando atualização dos jogadores...');
    const sortedEntries = Array.from(playerMap.values());
    
    for (const data of sortedEntries) {
        const diff = data.calculatedPoints - (data.p.synergy_score || 0);
        if (diff !== 0) {
            const { error: upErr } = await supabase
                .from('players')
                .update({ synergy_score: data.calculatedPoints, updated_at: new Date().toISOString() })
                .eq('riot_id', data.p.riot_id);
            
            if (upErr) console.error(`   [❌] Erro ao atualizar ${data.p.riot_id}:`, upErr.message);
            else console.log(`   [✅] ${data.p.riot_id.padEnd(20)} | Novo: ${data.calculatedPoints.toString().padStart(4)} pts | Antigo: ${(data.p.synergy_score || 0).toString().padStart(4)} pts | Diferença: ${diff > 0 ? '+' : ''}${diff}`);
        } else {
            console.log(`   [💤] ${data.p.riot_id.padEnd(20)} | Já está correto (${data.calculatedPoints} pts)`);
        }
    }

    console.log('\n--- RESTAURAÇÃO CONCLUÍDA COM SUCESSO ---');
}

fixSynergy().catch(err => console.error('Erro Fatal:', err));
