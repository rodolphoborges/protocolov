# 🎯 Protocolo V | Sistema Tático para Valorant

![Status](https://img.shields.io/badge/Status-Ativo-success?style=for-the-badge&color=ff4655)
![Stack](https://img.shields.io/badge/Stack-Node.js_|_Vanilla_JS_|_Supabase-informational?style=for-the-badge&color=0f1923)
![API](https://img.shields.io/badge/API-HenrikDev-blue?style=for-the-badge)

O **Protocolo V** não é apenas uma lista de jogadores; é um ecossistema completo de rastreamento, gamificação e recrutamento focado em jogadores de Valorant que buscam evolução tática e desejam escapar da toxicidade da *Solo Queue*. 

O sistema monitora automaticamente o desempenho dos agentes, recompensa o jogo em equipe (Sinergia) e gerencia vagas limitadas em esquadrões de elite, operando com uma estética Brutalista Geométrica inspirada na interface nativa do Valorant.

---

## 🚀 Funcionalidades Principais

* 📝 **Alistamento Automatizado:** Interface web em que novos agentes se inscrevem via Riot ID, escolhendo a sua função principal.
* 🤖 **Bot de Comando (Telegram):** Bot integrado que permite a vinculação de contas (`/vincular`), verificação de estatísticas (`/ranking`, `/perfil`), transferência de unidade tática (`/unidade`) e emissão de alertas automáticos.
* 🚨 **Sinalizador Orbital (Matchmaking):** Os agentes podem utilizar o comando `/convocar` no Telegram para exibir um alerta de LFG global (Lobby Banner) com um código de convite no topo do site por 30 minutos.
* 📊 **Rastreamento Automático (Henrik API):** Um script autónomo (`update-data.js`) rastreia o histórico de partidas dos agentes cadastrados para calcular pontos e extrair estatísticas de combate (KDA, HS%).
* ⚔️ **Leaderboard de Treino (Mata-Mata):** Ranking dinâmico (Semanal, Mensal e Geral) que rastreia o desempenho no modo Deathmatch para incentivar o aquecimento antes das ranqueadas.
* 🐺 **Sistema Anti-SoloQ (Lobo Solitário):** Identifica e marca publicamente no site os agentes que insistem em jogar partidas competitivas sozinhos.
* 🧹 **Expurgo Automático:** Agentes que não geram pontos de sinergia nos primeiros 7 dias após o alistamento são automaticamente removidos da base de dados.

---

## 🎖️ Hierarquia e Unidades Táticas

O Protocolo é dividido em três divisões operacionais. As Unidades Alpha e Ômega possuem **vagas limitadas (1 agente por função)**. A disputa pela titularidade é resolvida automaticamente pelo sistema com base no **Synergy Score (Sinergia)**.

* 🐍 **UNIDADE ALPHA (Elite):** Sob o comando da Agente 02 (Viper). Foco em precisão química e controlo absoluto.
* 🔥 **UNIDADE ÔMEGA (Elite):** Sob o comando do Agente 01 (Brimstone). Força de elite e suporte orbital.
* 🦎 **ESQUADRÃO WINGMAN (Reserva Tática):** Sob o comando do Agente 22 (Gekko). Divisão com vagas ilimitadas. Agentes que tentam entrar na Alpha/Ômega mas possuem menos pontos que o atual titular, aguardam na Wingman ostentando a marca visual de "RESERVA".

---

## 📈 Sistema de Pontuação (Gamificação)

### 1. Synergy Score (Pontos de Sinergia)
Pontos conquistados exclusivamente a jogar Ranqueadas (Competitivo) em conjunto com outros membros do Protocolo V. O sistema organiza os titulares das unidades com base nesta pontuação.
* **Duos:** +1 Ponto
* **Trios:** +2 Pontos
* **Squad Fechado (4 ou 5 agentes):** +5 Pontos
* *Modificador Tático:* **Vitórias DOBRAM** a pontuação adquirida na operação.

### 2. Deathmatch Score (Pontos de Treino)
Monitorizados na "Sala de Treino", recompensam o desempenho no modo Mata-Mata.
* **Regra Base:** 1 Abate (Kill) = 1 Ponto.
* **Bónus de Pódio:** Top 1 (+15 pts), Top 2 (+10 pts), Top 3 (+5 pts).
* *Reset Automático:* Rotinas agendadas apagam os pontos semanais e mensais para manter a competitividade fresca.

---

## 🛠️ Arquitetura e Tecnologias (Tech Stack)

O projeto possui uma arquitetura híbrida (Frontend Estático + Backend/Workers em Node.js):

* **Frontend:** HTML5, CSS3 (variáveis de cor e `clip-path` para estilo Brutalista), JavaScript Vanilla (integração via CDN do Supabase Client).
* **Backend / Automação:** Node.js, Express (Healthcheck), `node-telegram-bot-api`.
* **CI/CD & Cron Jobs:** GitHub Actions (`update.yml`, `reset-dm.yml`) para executar a extração de dados e resets de forma invisível a cada 30 minutos.
* **Base de Dados:** Supabase (PostgreSQL) gerindo as tabelas `players`, `operations`, `operation_squads` e `active_calls`.
* **Integrações Externas:** * [HenrikDev API](https://github.com/Henrik-3/unofficial-valorant-api) (Dados de Partidas, MMR, Imagens do Valorant).
  * [Telegram Bot API](https://core.telegram.org/bots/api) (Painel de controlo e relatórios).

---

## ⚙️ Como Configurar e Instalar o Projeto

### Pré-requisitos
* Node.js v18 ou superior
* Uma conta ativa no [Supabase](https://supabase.com/)
* Um Token de Bot do Telegram (gerado via `@BotFather`)
* Uma Chave de API da HenrikDev

### 1. Clonar o Repositório e Instalar Dependências

```bash
git clone [https://github.com/seu-usuario/protocolov.git](https://github.com/seu-usuario/protocolov.git)
cd protocolov
npm install
```

### 2. Variáveis de Ambiente (.env)
Crie um ficheiro `.env` na raiz do seu servidor/máquina de desenvolvimento contendo as credenciais vitais:

```env
SUPABASE_URL=[https://sua-url-do-supabase.supabase.co](https://sua-url-do-supabase.supabase.co)
SUPABASE_SERVICE_KEY=sua_service_role_key_aqui
HENRIK_API_KEY=sua_chave_henrik_dev_aqui
TELEGRAM_BOT_TOKEN=seu_token_do_botfather
TELEGRAM_CHAT_ID=id_do_grupo_de_monitoramento_do_telegram
PORT=3000
```
*(Nota: O frontend também utiliza a `anon_key` pública do Supabase diretamente inserida no ficheiro `script.js` para operações de leitura do site e inscrição básica).*

### 3. Iniciar o Comando Central (Local ou Nuvem)
Para arrancar o Bot do Telegram e manter o sistema à escuta:

```bash
npm start
```

Para forçar a extração manual de dados de combate (Worker):

```bash
node update-data.js
```

---

## 📜 Manifesto e Regras de Engajamento

1. **Tolerância Zero:** Racismo, misoginia ou homofobia resultam em banimento absoluto e irrefutável. O respeito é inegociável.
2. **Rádio Limpo:** Comunicação tática e objetiva. Foi abatido? Passe a informação exata (dano e localização) e silencie as comunicações.
3. **Mentalidade "Next":** Tiltar não ganha rondas, destrói a moral da equipa. Perdeu a trocação? Respire. Ajustamos a estratégia e cobramos no próximo round.
4. **Iniciativa Operacional:** A Sinergia recompensa a proatividade. Utilize o canal do Telegram, feche o grupo e assuma a responsabilidade de puxar a fila.

---
*Desenvolvido para organizar, fortalecer e elevar o nível da comunidade tática do Valorant.*
