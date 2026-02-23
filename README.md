# Protocolo V 🎯

O **Protocolo V** é uma plataforma web automatizada, desenvolvida para gerenciar o recrutamento e rastrear a performance de equipas fixas de Valorant. O foco do projeto é criar um ambiente estruturado para jogadores que procuram subir de elo na *ranqueada* e participar no torneio Premiere, focando na evolução tática e acompanhamento de sinergia.

🌐 **Site Oficial:** [protocolov.com](https://protocolov.com)

---

## 🚀 Funcionalidades

* **Recrutamento Nativo:** Formulário de inscrição integrado diretamente no site, enviando os dados instantaneamente para a base de dados.
* **Sincronização Automatizada:** O *backend* atualiza o elo, o nível e o histórico de partidas de todos os jogadores a cada 30 minutos, de forma 100% autônoma.
* **Fila de Espera Inteligente:** Separação visual automática entre titulares e reservas com base no limite de vagas por função.
* **Histórico de Operações:** Deteta automaticamente quando 2 ou mais agentes da *line-up* jogam juntos, registando o resultado (Vitória/Derrota), mapa e o KDA de cada membro do esquadrão.
* **Proteção contra Rate Limit:** O processamento de dados interage com a API do Valorant em segundo plano (via GitHub Actions), blindando o site contra bloqueios (Erro 429) e garantindo carregamento instantâneo para o utilizador.
* **Segurança e RLS:** Base de dados PostgreSQL (via Supabase) protegida por políticas de *Row Level Security*, garantindo que chaves sensíveis nunca sejam expostas no *frontend*.

---

## ⚙️ Arquitetura do Sistema

A aplicação utiliza uma arquitetura *Serverless* e Híbrida:

1. **Frontend (UI & Leitura):** HTML, CSS e Vanilla JS puro. Utiliza a biblioteca `@supabase/supabase-js` com uma chave pública (`anon key`) para ler os dados e inscrever novos jogadores.
2. **Backend (Processamento):** Um script Node.js (`update-data.js`) corre num ambiente isolado.
3. **Automação (CI/CD):** O GitHub Actions (`.github/workflows/update.yml`) executa o *backend* a cada 30 minutos.
4. **Base de Dados:** Supabase (PostgreSQL). Substitui o uso de planilhas e ficheiros JSON estáticos, permitindo integridade relacional.

---

## 🛠️ Guia de Configuração (Deploy Próprio)

Se deseja fazer um *fork* deste projeto para gerir a sua própria *line-up*, siga estes passos:

### 1. Configurar o Supabase (Base de Dados)
1. Crie um projeto gratuito no [Supabase](https://supabase.com/).
2. Vá ao **SQL Editor** e execute o script abaixo para criar as tabelas e ativar a segurança (RLS):

```sql
-- Criar tabelas
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
  api_error BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE operations (
  id TEXT PRIMARY KEY,
  map TEXT NOT NULL,
  mode TEXT,
  started_at BIGINT NOT NULL,
  score TEXT,
  result TEXT,
  team_color TEXT
);

CREATE TABLE operation_squads (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  operation_id TEXT REFERENCES operations(id) ON DELETE CASCADE,
  riot_id TEXT,
  agent TEXT,
  agent_img TEXT,
  kda TEXT,
  hs_percent INTEGER
);

-- Ativar RLS e Políticas
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura Publica" ON players FOR SELECT USING (true);
CREATE POLICY "Leitura Publica" ON operations FOR SELECT USING (true);
CREATE POLICY "Leitura Publica" ON operation_squads FOR SELECT USING (true);
CREATE POLICY "Permitir Inscricao" ON players FOR INSERT WITH CHECK (true);
