const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Use the same URL and service key to have master access
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('🔥 ERRO: Variáveis de ambiente SUPABASE_URL ou SUPABASE_SERVICE_KEY faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixConstraints() {
    console.log('--- 🛡️ CORRIGINDO REGRAS DE INTEGRIDADE (UNQIUE CONSTRAINTS) ---');
    
    // SQL script to add constraints if they don't exist
    const fixSql = `
        DO $$ 
        BEGIN 
            -- 1. OPERATION_SQUADS (operation_id, riot_id)
            -- Limpar duplicatas primeiro para não falhar a criação da constraint
            DELETE FROM operation_squads a
            USING operation_squads b
            WHERE a.id < b.id 
              AND a.operation_id = b.operation_id 
              AND a.riot_id = b.riot_id;
            
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_op_player_squad') THEN
                ALTER TABLE public.operation_squads 
                ADD CONSTRAINT unique_op_player_squad UNIQUE (operation_id, riot_id);
                RAISE NOTICE 'Constraint unique_op_player_squad criada.';
            END IF;

            -- 2. AI_INSIGHTS (match_id, player_id)
            DELETE FROM ai_insights a
            USING ai_insights b
            WHERE a.id < b.id 
              AND a.match_id = b.match_id 
              AND a.player_id = b.player_id;

            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_match_player_insight') THEN
                ALTER TABLE public.ai_insights 
                ADD CONSTRAINT unique_match_player_insight UNIQUE (match_id, player_id);
                RAISE NOTICE 'Constraint unique_match_player_insight criada.';
            END IF;

            -- 3. MATCH_ANALYSIS_QUEUE (match_id, player_tag)
            DELETE FROM match_analysis_queue a
            USING match_analysis_queue b
            WHERE a.id < b.id 
              AND a.match_id = b.match_id 
              AND a.player_tag = b.player_tag;

            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_queue_match_player') THEN
                ALTER TABLE public.match_analysis_queue 
                ADD CONSTRAINT unique_queue_match_player UNIQUE (match_id, player_tag);
                RAISE NOTICE 'Constraint unique_queue_match_player criada.';
            END IF;

        END $$;
    `;

    console.log('📡 Enviando comando SQL ao Supabase...');
    
    // Tentar via RPC execute_sql que costuma existir nessas configs
    const { data, error } = await supabase.rpc('execute_sql', { query: fixSql });

    if (error) {
        console.warn('⚠️ Falha ao executar via RPC execute_sql. Tentando via consulta direta...');
        console.error('Erro RPC:', error.message);
        console.log('\nSe este erro persistir, você deve rodar o SQL acima manualmente no SQL Editor do Supabase Dashboard.');
    } else {
        console.log('✅ SQL executado com sucesso e constraints verificadas!');
    }
}

fixConstraints();
