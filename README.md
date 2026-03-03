# Protocolo V 🎯

O **Protocolo V** é uma plataforma web automatizada, desenvolvida para gerenciar o recrutamento e rastrear a performance de equipas fixas de Valorant. O foco do projeto é criar um ambiente estruturado para jogadores que procuram subir de elo na *ranqueada* e participar no torneio Premiere, focando na evolução tática e acompanhamento de sinergia.

🌐 **Site Oficial:** [protocolov.com](https://protocolov.com)

---

## 🚀 Funcionalidades

* **Recrutamento Nativo:** Formulário de inscrição integrado diretamente no site, enviando os dados instantaneamente para a base de dados de forma segura.
* **Sincronização Automatizada:** O *backend* atualiza o elo, o nível e o histórico de partidas de todos os jogadores a cada 30 minutos, de forma 100% autónoma.
* **Fila de Espera Inteligente:** Separação visual automática entre titulares e reservas com base no limite de vagas por função tática.
* **Histórico de Operações (Partidas):** Deteta automaticamente quando 2 ou mais agentes da *line-up* jogam juntos, registando o resultado (**Vitória, Derrota ou Empate**), mapa e o KDA detalhado de cada membro do esquadrão.
* **Sistema de Sinergia (Karma):** Recompensa automática com "Pontos de Sinergia" para jogadores que puxam a fila ativamente em grupo.
* **Paginação Dinâmica (*Lazy Loading*):** O histórico de operações carrega em blocos de 5 partidas (com botão "Ver Mais"), poupando dados e mantendo a interface leve e responsiva, mesmo em telemóveis.
* **Proteção contra *Rate Limit*:** O processamento de dados interage com a API do Valorant em segundo plano com um sistema de pausas dinâmicas, blindando o site contra bloqueios (Erro 429).
* **Segurança e RLS:** Base de dados PostgreSQL (via Supabase) protegida por políticas de *Row Level Security* (RLS), garantindo que chaves sensíveis nunca sejam expostas no *frontend*.

---

## ⚙️ Arquitetura do Sistema

A aplicação utiliza uma arquitetura *Serverless* e Híbrida:

1. **Frontend (UI & Leitura):** HTML, CSS e Vanilla JS puro. Utiliza a biblioteca `@supabase/supabase-js` com uma chave pública (`anon key`) para ler os dados nativamente através de paginação e inscrever novos jogadores.
2. **Backend (Processamento):** Um script Node.js (`update-data.js`) executado num ambiente isolado, responsável por fazer o tratamento pesado e lógico dos dados.
3. **Automação (CI/CD):** O GitHub Actions (`.github/workflows/update.yml`) executa o *backend* a cada 30 minutos.
4. **Base de Dados:** Supabase (PostgreSQL). Substitui o uso de planilhas e ficheiros JSON estáticos, garantindo escalabilidade e integridade relacional.

---

## 🛠️ Guia de Configuração (Deploy Próprio)

Se deseja fazer um *fork* deste projeto para gerir a sua própria *line-up*, siga estes passos:

### 1. Configurar o Supabase (Base de Dados)
1. Crie um projeto gratuito no [Supabase](https://supabase.com/).
2. Vá ao **SQL Editor** e execute o script abaixo para criar as tabelas e ativar a segurança (RLS):

```sql
-- Criar tabelas principais
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

-- Ativar RLS e Políticas de Segurança
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura Publica" ON players FOR SELECT USING (true);
CREATE POLICY "Leitura Publica" ON operations FOR SELECT USING (true);
CREATE POLICY "Leitura Publica" ON operation_squads FOR SELECT USING (true);
CREATE POLICY "Permitir Inscricao" ON players FOR INSERT WITH CHECK (true);
```

### 2. Configurar o Frontend
1. No Supabase, vá a **Project Settings > API** e copie o **Project URL** e a **anon / public key**.
2. Abra o ficheiro `script.js` e substitua as variáveis no topo do ficheiro por estas chaves para permitir que o site leia a base de dados.

### 3. Configurar os Segredos do GitHub (Automação)
O robô precisa de permissões especiais (modo administrador) para ler a API do Valorant e gravar/atualizar todos os dados no Supabase.
1. Gere uma chave gratuita na API do [HenrikDev](https://github.com/Henrik-3/unofficial-valorant-api).
2. Vá a **Project Settings > API** no Supabase e copie a **service_role / secret key** (NUNCA partilhe esta chave publicamente nem a coloque no HTML/JS).
3. No seu repositório GitHub, vá a **Settings > Secrets and variables > Actions** e adicione:
   - `HENRIK_API_KEY`: A sua chave do HenrikDev.
   - `SUPABASE_URL`: O seu URL do Supabase.
   - `SUPABASE_SERVICE_KEY`: A sua chave secreta `service_role`.

---

## 💻 Como Executar Localmente

Para testar o visual e forçar a atualização de dados na sua máquina de desenvolvimento:

1. Clone o repositório.
2. Instale as dependências do motor de atualização:
   ```bash
   npm install
   ```
3. Crie um ficheiro `.env` na raiz (adicione ao `.gitignore`) com as suas credenciais:
   ```env
   SUPABASE_URL=sua_url_aqui
   SUPABASE_SERVICE_KEY=sua_chave_service_role_aqui
   HENRIK_API_KEY=sua_chave_da_api_aqui
   ```
4. Execute o script de sincronização manualmente para carregar o banco de dados:
   ```bash
   node --env-file=.env update-data.js
   ```
5. Abra o ficheiro `index.html` no seu navegador ou utilize a extensão *Live Server* do VS Code para visualizar a plataforma.

---

<p align="center">
  <small>Desenvolvido para a comunidade. GLHF. 👊</small>
</p>
