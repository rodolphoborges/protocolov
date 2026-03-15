# Protocolo V 🎯

O **Protocolo V** é uma plataforma web automatizada de nível *Enterprise*, desenvolvida para gerir o recrutamento, a sinergia e o treino mecânico de equipas fixas de Valorant. O projeto utiliza uma estética de *Brutalismo Geométrico* (inspirada na interface oficial da Riot Games) e um motor de dados assíncrono para garantir estabilidade e precisão.

🌐 **Site Oficial:** [protocolov.com](https://protocolov.com)

---

## 🚀 Funcionalidades Principais

* **Recrutamento Nativo:** Formulário de inscrição integrado e protegido.
* **Sincronização Autónoma (ETL):** O *backend* em Node.js atualiza o elo, nível, estatísticas e histórico de partidas de todos os jogadores a cada 30 minutos via GitHub Actions.
* **Sistema de Sinergia (Gamificação Competitiva):** O motor deteta automaticamente quando 2 ou mais agentes jogam juntos (Ranked) e recompensa-os com "Pontos de Sinergia" (vitórias dobram os pontos).
* **Sala de Treino (Mata-Mata):** Uma página dedicada (`treino.html`) com uma *Leaderboard* semanal de Deathmatch. Recompensa o esforço mecânico (1 Kill = 1 Ponto) e aplica um bónus de pódio (+15, +10, +5).
* **UI/UX Brutalista:** Design System unificado (`style.css`) com cantos cortados (*clip-paths*), alto contraste e respeito por acessibilidade (`prefers-reduced-motion`).
* **Resiliência Avançada:** Proteção contra limites de taxa da API (Erro 429), gestão inteligente de *cache* e tratamento estrito de *Timezones* (UTC).
* **Purga Automática:** Limpeza automática da base de dados (jogadores inativos ou "Lobos Solitários" são expurgados após 7 dias sem Sinergia).

---

## ⚙️ Arquitetura do Sistema (Híbrida / Serverless)

1. **Frontend (UI & Leitura):** HTML, CSS puro e Vanilla JS (`index.html`, `treino.html`, `script.js`).
2. **Backend (Processamento):** Script Node.js isolado (`update-data.js`).
3. **Automação (CI/CD):** Execução agendada a cada 30 minutos via *GitHub Actions* (`update.yml`).
4. **Base de Dados:** PostgreSQL hospedado no *Supabase*, protegido por políticas RLS.

---

## 🛠️ Guia de Configuração (Deploy Próprio)

### 1. Configurar o Supabase (Base de Dados)
1. Crie um projeto gratuito no [Supabase](https://supabase.com/).
2. Vá ao **SQL Editor** e execute o script abaixo para criar o esquema de dados e as políticas RLS:

```sql
-- 1. Criar a Tabela de Jogadores
CREATE TABLE players (
  riot_id TEXT PRIMARY KEY,
  role_raw TEXT NOT NULL,
  tracker_link TEXT,
  level INTEGER,
  card_url TEXT,
  current_rank TEXT,
  peak_rank TEXT,
  current_rank_icon TEXT,
  peak_rank_icon TEXT,
  synergy_score INTEGER DEFAULT 0,
  dm_score INTEGER DEFAULT 0, -- Sistema de Pontuação da Sala de Treino
  api_error BOOLEAN DEFAULT false,
  lone_wolf BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Criar a Tabela de Operações (Partidas)
CREATE TABLE operations (
  id TEXT PRIMARY KEY,
  map TEXT NOT NULL,
  mode TEXT,
  started_at BIGINT NOT NULL,
  score TEXT,
  result TEXT,
  team_color TEXT
);

-- 3. Criar a Tabela de Esquadrões (Estatísticas Individuais por Operação)
CREATE TABLE operation_squads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  operation_id TEXT REFERENCES operations(id) ON DELETE CASCADE,
  riot_id TEXT,
  agent TEXT,
  agent_img TEXT,
  kda TEXT,
  hs_percent INTEGER
);

-- Ativar RLS (Row Level Security)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_squads ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura (Públicas e Seguras para o Frontend)
CREATE POLICY "Leitura Publica" ON players FOR SELECT USING (true);
CREATE POLICY "Leitura Publica" ON operations FOR SELECT USING (true);
CREATE POLICY "Leitura Publica" ON operation_squads FOR SELECT USING (true);

-- AVISO DE SEGURANÇA: A política abaixo permite inscrições anónimas livres no formulário.
-- Para um ambiente em produção (Enterprise), remova esta política e utilize uma Edge Function com CAPTCHA.
-- Se estiver em testes ou a iniciar o projeto, mantenha esta política temporariamente:
CREATE POLICY "Permitir Inscricao" ON players FOR INSERT WITH CHECK (true);
