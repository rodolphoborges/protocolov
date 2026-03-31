const { supabase } = require('./db');

/**
 * PROTOCOLO-V: REUNIFICAÇÃO AUTOMÁTICA DE ESQUADRÕES
 * 
 * Este script analisa os Perfomance Indices (PI) mais recentes de todos os agentes 
 * e os realoca nos esquadrões ALPHA, OMEGA ou WINGMAN (Depósito) baseado na 
 * excelência tática.
 */

async function reunificar() {
    console.log('🤖 [K.A.I.O. // REUNIFICAÇÃO TÁTICA ATIVA]');
    console.log('📡 Varrendo índices de performance histórica...');

    try {
        const { data: players, error } = await supabase
            .from('players')
            .select('riot_id, performance_l, unit');

        if (error) throw error;

        console.log(`🔍 Analisando ${players.length} agentes registrados.`);

        const updates = [];
        const logs = {
            alpha: 0,
            omega: 0,
            wingman: 0,
            unchanged: 0
        };

        for (const p of players) {
            const pi = p.performance_l || 0;
            let targetUnit = p.unit;

            // REGRAS DE ESCALONAMENTO TÁTICO
            if (pi >= 115) {
                targetUnit = 'ALPHA';
            } else if (pi >= 95) {
                targetUnit = 'OMEGA';
            } else {
                targetUnit = 'WINGMAN'; // "Depósito de Torretas" no Lore
            }

            if (targetUnit !== p.unit) {
                console.log(`   [⚡] ${p.riot_id.split('#')[0]}: ${p.unit || 'NEW'} -> ${targetUnit} (PI: ${pi.toFixed(1)})`);
                updates.push(supabase.from('players').update({ 
                    unit: targetUnit,
                    updated_at: new Date().toISOString()
                }).eq('riot_id', p.riot_id));
                
                if (targetUnit === 'ALPHA') logs.alpha++;
                else if (targetUnit === 'OMEGA') logs.omega++;
                else logs.wingman++;
            } else {
                logs.unchanged++;
            }
        }

        if (updates.length > 0) {
            console.log(`\n⏳ Sincronizando ${updates.length} alterações com o banco central...`);
            await Promise.all(updates);
            console.log('✅ Reestruturação de esquadrões CONCLUÍDA.');
        } else {
            console.log('\n✅ Todos os agentes já estão operando em suas respectivas camadas de competência.');
        }

        console.log(`\n📊 ESTATÍSTICA DO PROTOCOLO V:`);
        console.log(`   🔸 Promovidos para ALPHA: ${logs.alpha}`);
        console.log(`   🔹 Movidos para OMEGA: ${logs.omega}`);
        console.log(`   🛠️  Enviados para DEPÓSITO (WINGMAN): ${logs.wingman}`);
        console.log(`   ◽ Mantidos na posição atual: ${logs.unchanged}`);

    } catch (err) {
        console.error('🔥 [ERROR] Falha crítica na reunificação:', err.message);
    }
}

if (require.main === module) reunificar();

module.exports = { reunificar };
