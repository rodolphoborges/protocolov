const { supabase } = require('./db');

/**
 * PROTOCOLO-V: REUNIFICAÇÃO E ESCALONAMENTO DE ELITE (V2)
 * 
 * Este script garante que o contingente das unidades ALPHA e OMEGA esteja 
 * sempre completo (5 slots cada).
 * 
 * LÓGICA DE ESCORAGEM:
 * O escalonamento não considera apenas a skill individual (PI), mas também a 
 * MATURIDADE TÁTICA (Sinergia), valorizando quem joga junto e constrói o time.
 * 
 * Peso Sugerido: 60% Skill Individual (PI) | 40% Sinergia de Grupo
 */

async function reunificar() {
    console.log('🤖 [K.A.I.O. // REUNIFICAÇÃO E ESCALONAMENTO DE ELITE V2.0]');
    console.log('📡 Calculando Índice de Maturidade Tática (IMT)...');

    try {
        const { data: players, error } = await supabase
            .from('players')
            .select('riot_id, performance_l, synergy_score, unit');

        if (error) throw error;

        // 1. Calcular IMT e ordenar jogadores
        const rankedPlayers = players.map(p => {
            const pi = p.performance_l || 0;
            const synergy = p.synergy_score || 0;
            
            // Fórmula: PI (Individual) + Bônus de Cooperação (Sinergia)
            // Normalizando Sinergia (dividindo por 4 para equilibrar com PI médio de 100)
            const imt = (pi * 0.6) + ((synergy / 4) * 0.4);
            
            return { ...p, imt };
        }).sort((a, b) => b.imt - a.imt);

        console.log(`🔍 Total de agentes sob vigilância: ${rankedPlayers.length}`);

        const updates = [];
        const roster = { alpha: [], omega: [], wingman: [] };

        // 2. Alocação dinâmica por slots (Top 5: ALPHA, Próximos 5: OMEGA, Resto: WINGMAN)
        for (let i = 0; i < rankedPlayers.length; i++) {
            const p = rankedPlayers[i];
            let targetUnit = 'WINGMAN';

            if (i < 5) targetUnit = 'ALPHA';
            else if (i < 10) targetUnit = 'OMEGA';
            else targetUnit = 'WINGMAN';

            if (targetUnit !== p.unit) {
                console.log(`   [⚡] REARANJO: ${p.riot_id.split('#')[0]} | PI: ${p.performance_l?.toFixed(1) || 0} | SIN: ${p.synergy_score} | IMT: ${p.imt.toFixed(1)} -> ${targetUnit}`);
                
                updates.push(supabase.from('players').update({ 
                    unit: targetUnit,
                    updated_at: new Date().toISOString()
                }).eq('riot_id', p.riot_id));
            }

            if (targetUnit === 'ALPHA') roster.alpha.push(`${p.riot_id.split('#')[0]} (IMT: ${p.imt.toFixed(1)})`);
            else if (targetUnit === 'OMEGA') roster.omega.push(`${p.riot_id.split('#')[0]} (IMT: ${p.imt.toFixed(1)})`);
            else roster.wingman.push(p.riot_id.split('#')[0]);
        }

        // 3. Execução das transferências
        if (updates.length > 0) {
            console.log(`\n⏳ Sincronizando ${updates.length} portarias táticas...`);
            await Promise.all(updates);
            console.log('✅ Reestruturação do Protocolo V CONCLUÍDA com foco em SINERGIA.');
        } else {
            console.log('\n✅ Formação atual condiz com os índices de maturidade tática.');
        }

        console.log(`\n🔹 ESCALAÇÃO ESTATÍSTICA:`);
        console.log(`   🔴 [ALPHA ESCALADO]: ${roster.alpha.join(', ') || 'Vazio'}`);
        console.log(`   🔵 [OMEGA ESCALADO]: ${roster.omega.join(', ') || 'Vazio'}`);
        console.log(`   🛠️  [SUPORTE/RESERVA]: ${roster.wingman.length} agentes.`);

    } catch (err) {
        console.error('🔥 [ERROR] Falha crítica na alocação sinérgica:', err.message);
    }
}

if (require.main === module) reunificar();

module.exports = { reunificar };
