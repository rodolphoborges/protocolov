const { supabase } = require('./db');

/**
 * PROTOCOLO-V: ESCALONAMENTO TÁTICO BALANCEADO (V3)
 * 
 * Este script automatiza a realocação de agentes nos esquadrões ALPHA e OMEGA.
 * O objetivo é formar um "Mixed Composition" (Composition Balanceada) em cada 
 * união, priorizando a existência de uma peça de cada função (Duelista, 
 * Iniciador, Controlador, Sentinela e Flex) baseada no Índice de Maturidade 
 * Tática (IMT).
 * 
 * Se uma função não possuir candidatos, a vaga é preenchida pelo melhor 
 * jogador disponível, independentemente da role.
 */

async function reunificar() {
    console.log('🤖 [K.A.I.O. // ESCALONAMENTO TÁTICO V3.0 - REFORMA POSICIONAL]');
    console.log('📡 Analisando especializações para composição de esquadrão...');

    try {
        const { data: players, error } = await supabase
            .from('players')
            .select('riot_id, role_raw, performance_l, synergy_score, unit');

        if (error) throw error;

        // 1. Cálculo de IMT (Individual 60% / Sinergia 40%)
        const rankedPool = players.map(p => {
            const pi = p.performance_l || 0;
            const synergy = p.synergy_score || 0;
            const imt = (pi * 0.6) + ((synergy / 4) * 0.4);
            return { ...p, imt };
        }).sort((a, b) => b.imt - a.imt);

        const available = [...rankedPool];
        const alpha = [];
        const omega = [];
        const wingman = [];

        // Definição ideal de composição (5 slots)
        const targetRoles = ['Duelista', 'Iniciador', 'Controlador', 'Sentinela', 'Flex'];

        // --- 2. FORMAÇÃO DO ESQUADRÃO ALPHA ---
        console.log('⚡ Compondo Esquadrão ALPHA...');
        for (const role of targetRoles) {
            const idx = available.findIndex(p => p.role_raw === role);
            if (idx !== -1) {
                alpha.push(available.splice(idx, 1)[0]);
            }
        }
        // Se ainda houver vagas no ALPHA (menos de 5), completa com o melhor disponível
        while (alpha.length < 5 && available.length > 0) {
            alpha.push(available.splice(0, 1)[0]);
        }

        // --- 3. FORMAÇÃO DO ESQUADRÃO OMEGA ---
        console.log('⚡ Compondo Esquadrão OMEGA...');
        for (const role of targetRoles) {
            const idx = available.findIndex(p => p.role_raw === role);
            if (idx !== -1) {
                omega.push(available.splice(idx, 1)[0]);
            }
        }
        // Se ainda houver vagas no OMEGA, completa com o melhor disponível
        while (omega.length < 5 && available.length > 0) {
            omega.push(available.splice(0, 1)[0]);
        }

        // --- 4. DEPÓSITO DE TORRETAS ---
        wingman.push(...available);

        // --- 5. SINCRONIZAÇÃO E LOGS ---
        const updates = [];
        const processGroup = (group, unitName) => {
            group.forEach(p => {
                if (p.unit !== unitName) {
                    console.log(`   [⚡] ${p.riot_id.split('#')[0]}: ${p.unit || 'NEW'} -> ${unitName} (${p.role_raw} | IMT: ${p.imt.toFixed(1)})`);
                    updates.push(supabase.from('players').update({ 
                        unit: unitName,
                        updated_at: new Date().toISOString()
                    }).eq('riot_id', p.riot_id));
                }
            });
        };

        processGroup(alpha, 'ALPHA');
        processGroup(omega, 'OMEGA');
        processGroup(wingman, 'WINGMAN');

        if (updates.length > 0) {
            console.log(`\n⏳ Sincronizando portarias de escalonamento para 2 times completos...`);
            await Promise.all(updates);
            console.log('✅ REESTRUTURAÇÃO CONCLUÍDA: Esquadrões balanceados por função.');
        } else {
            console.log('\n✅ Formação atual segue as diretrizes de especialização tática.');
        }

        console.log(`\n🔹 ESCALAÇÃO FINAL:`);
        console.log(`   🔴 ALPHA: ${alpha.map(p => `${p.riot_id.split('#')[0]} (${p.role_raw})`).join(', ')}`);
        console.log(`   🔵 OMEGA: ${omega.map(p => `${p.riot_id.split('#')[0]} (${p.role_raw})`).join(', ')}`);
        console.log(`   🛠️  RESERVA: ${wingman.length} agentes.`);

    } catch (err) {
        console.error('🔥 [ERROR] Falha crítica na composição por roles:', err.message);
    }
}

if (require.main === module) reunificar();

module.exports = { reunificar };
