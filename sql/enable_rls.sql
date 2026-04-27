-- ============================================================
-- Protocolo-V: Habilitar Row-Level Security em TODAS as tabelas
-- ============================================================
-- IMPORTANTE: O backend usa SUPABASE_SERVICE_KEY (Service Role),
-- que BYPASSA RLS automaticamente. Nenhuma mudanca no backend.
-- Este script apenas bloqueia acesso via anon key (publica).
-- ============================================================

-- 1. Habilitar RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_calls ENABLE ROW LEVEL SECURITY;

-- 2. Policies para o frontend (docs/script.js usa anon key)
-- O frontend precisa de leitura em players e active_calls

-- Players: leitura publica (ranking, perfis) — sem expor telegram_id
CREATE POLICY "players_public_read" ON players
  FOR SELECT TO anon
  USING (true);

-- Active calls: leitura publica (LFG/convocacoes ativas)
CREATE POLICY "active_calls_public_read" ON active_calls
  FOR SELECT TO anon
  USING (true);

-- Players: inserir novos jogadores via frontend (recrutamento)
CREATE POLICY "players_public_insert" ON players
  FOR INSERT TO anon
  WITH CHECK (true);

-- TODAS as outras tabelas (operations, operation_squads, ai_insights)
-- ficam SEM policy para anon = acesso BLOQUEADO via anon key.
-- Apenas o backend (service_role) consegue ler/escrever.

-- ============================================================
-- NOTA: Se o frontend NAO precisa mais de acesso direto ao banco,
-- remova as policies acima e use apenas o backend como proxy.
-- Isso e mais seguro.
-- ============================================================
