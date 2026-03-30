/**
 * scripts/maintenance/reset_and_reprocess_last20.js
 *
 * Apaga todas as análises das últimas 20 partidas das "Últimas Operações"
 * e as re-enfileira para reprocessamento pelo worker do Oráculo-V.
 *
 * O que este script faz:
 *  1. Busca as últimas 20 operações (tabela `operations`) com seus membros (`operation_squads`)
 *  2. Deleta `ai_insights` no banco do Protocolo-V
 *  3. Deleta `ai_insights` no banco do Oráculo-V
 *  4. Deleta `match_stats` no banco do Oráculo-V
 *  5. Remove arquivos JSON de análise locais em `oraculo-v/analyses/`
 *  6. Re-insere na `match_analysis_queue` do Protocolo-V com status `pending`
 *
 * Após rodar: inicie o worker com `npm run worker` no diretório `oraculo-v/`
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { supabase, oraculo } = require('../../src/db');
const fs = require('fs');

const ANALYSES_DIR = path.join(__dirname, '../../../oraculo-v/analyses');

async function run() {
    console.log('🔍 [RESET] Buscando as últimas 20 operações...');

    // 1. Buscar últimas 20 operações com membros da squad
    const { data: operations, error: opsErr } = await supabase
        .from('operations')
        .select('id, map_name, mode, started_at, operation_squads(riot_id, agent)')
        .order('started_at', { ascending: false })
        .limit(20);

    if (opsErr) {
        console.error('❌ Erro ao buscar operações:', opsErr.message);
        process.exit(1);
    }

    if (!operations || operations.length === 0) {
        console.log('⚠️ Nenhuma operação encontrada.');
        return;
    }

    console.log(`✅ ${operations.length} operações encontradas.`);

    const matchIds = operations.map(op => op.id);

    // Montar lista de pares (match_id, player_tag) para re-enfileiramento
    const playerMatchPairs = [];
    for (const op of operations) {
        const members = op.operation_squads || [];
        for (const member of members) {
            if (member.riot_id) {
                playerMatchPairs.push({ match_id: op.id, player_tag: member.riot_id });
            }
        }
    }

    console.log(`\n📋 Total de combinações jogador+partida: ${playerMatchPairs.length}`);
    console.log('   Match IDs:', matchIds.map(id => id.substring(0, 8)).join(', '));

    // 2. Deletar ai_insights no Protocolo-V
    console.log('\n🗑️  [1/4] Deletando ai_insights no Protocolo-V...');
    const { error: aiProtErr } = await supabase
        .from('ai_insights')
        .delete()
        .in('match_id', matchIds);

    if (aiProtErr) {
        console.error('   ⚠️ Aviso (Protocolo ai_insights):', aiProtErr.message);
    } else {
        console.log('   ✅ ai_insights (Protocolo) removidos.');
    }

    // 3. Deletar ai_insights no Oráculo-V
    if (oraculo) {
        console.log('🗑️  [2/4] Deletando ai_insights no Oráculo-V...');
        const { error: aiOracErr } = await oraculo
            .from('ai_insights')
            .delete()
            .in('match_id', matchIds);

        if (aiOracErr) {
            console.error('   ⚠️ Aviso (Oráculo ai_insights):', aiOracErr.message);
        } else {
            console.log('   ✅ ai_insights (Oráculo) removidos.');
        }

        // 4. Deletar match_stats no Oráculo-V
        console.log('🗑️  [3/4] Deletando match_stats no Oráculo-V...');
        const { error: statsErr } = await oraculo
            .from('match_stats')
            .delete()
            .in('match_id', matchIds);

        if (statsErr) {
            console.error('   ⚠️ Aviso (match_stats):', statsErr.message);
        } else {
            console.log('   ✅ match_stats removidos.');
        }
    } else {
        console.warn('⚠️ Conexão com Oráculo-V não disponível — pulando limpeza de ai_insights e match_stats do Oráculo.');
    }

    // 5. Remover arquivos JSON locais de análise
    console.log('🗑️  [4/4] Removendo arquivos de análise locais...');
    let filesRemoved = 0;

    if (fs.existsSync(ANALYSES_DIR)) {
        const allFiles = fs.readdirSync(ANALYSES_DIR);
        for (const matchId of matchIds) {
            const related = allFiles.filter(f => f.includes(matchId));
            for (const file of related) {
                try {
                    fs.unlinkSync(path.join(ANALYSES_DIR, file));
                    filesRemoved++;
                } catch (e) {
                    console.warn(`   ⚠️ Falha ao remover ${file}: ${e.message}`);
                }
            }
        }
        console.log(`   ✅ ${filesRemoved} arquivo(s) local(is) removido(s).`);
    } else {
        console.log('   ℹ️ Diretório de análises não encontrado, pulando.');
    }

    // 6. Limpar entradas antigas da fila e re-enfileirar
    console.log('\n🔄 [RE-FILA] Resetando entradas da match_analysis_queue...');

    // Remover entradas existentes para esses matches
    const { error: delQueueErr } = await supabase
        .from('match_analysis_queue')
        .delete()
        .in('match_id', matchIds);

    if (delQueueErr) {
        console.error('   ⚠️ Aviso ao limpar fila existente:', delQueueErr.message);
    }

    // Inserir novos jobs pendentes
    if (playerMatchPairs.length > 0) {
        const jobs = playerMatchPairs.map(pair => ({
            match_id: pair.match_id,
            player_tag: pair.player_tag,
            status: 'pending',
            created_at: new Date().toISOString()
        }));

        const chunkSize = 50;
        let totalInserted = 0;

        for (let i = 0; i < jobs.length; i += chunkSize) {
            const chunk = jobs.slice(i, i + chunkSize);
            const { error: insertErr } = await supabase
                .from('match_analysis_queue')
                .insert(chunk);

            if (insertErr) {
                console.error(`   ❌ Erro ao inserir lote ${i / chunkSize + 1}:`, insertErr.message);
            } else {
                totalInserted += chunk.length;
            }
        }

        console.log(`   ✅ ${totalInserted} jobs inseridos na fila com status 'pending'.`);
    } else {
        console.warn('   ⚠️ Nenhum membro de squad encontrado — nenhum job enfileirado.');
        console.warn('      Verifique se a tabela operation_squads possui dados para essas operações.');
    }

    console.log('\n🏆 [CONCLUÍDO] Reset das últimas 20 operações finalizado!');
    console.log('🚀 Inicie o worker para processar as análises:');
    console.log('   cd oraculo-v && npm run worker');
}

run().catch(err => {
    console.error('\n🔥 Erro fatal:', err.message || err);
    process.exit(1);
});
