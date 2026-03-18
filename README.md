# 🎯 Protocolo V | Sistema Tático para Valorant

![Status](https://img.shields.io/badge/Status-Ativo-success?style=for-the-badge&color=ff4655)
![Stack](https://img.shields.io/badge/Stack-Node.js_|_Vanilla_JS_|_Supabase-informational?style=for-the-badge&color=0f1923)
![API](https://img.shields.io/badge/API-HenrikDev-blue?style=for-the-badge)

O **Protocolo V** não é apenas uma lista de jogadores; é um ecossistema completo de rastreamento, gamificação e recrutamento focado em jogadores de Valorant que buscam evolução tática e desejam escapar da toxicidade da *Solo Queue*. 

O sistema monitora automaticamente o desempenho dos agentes, recompensa o jogo em equipe (Sinergia) e gerencia vagas limitadas em esquadrões de elite, operando com uma estética **Brutalista Geométrica** inspirada na interface e na Lore oficial do Valorant.

---

## 🚀 Funcionalidades Principais

* 📝 **Alistamento Automatizado:** Interface web em que novos agentes se inscrevem via Riot ID, escolhendo a sua função principal.
* 🤖 **Terminal de Inteligência (Telegram Bot):** Um bot integrado que permite a vinculação de contas (`/vincular`), transferências de unidade (`/unidade`), extração de **Dossiês de Agentes** (`/perfil`) e **Convocação de Reforços (LFG)** pelo site usando o comando (`/convocar [CÓDIGO]`).
* 🚨 **Dashboard de Central de Inteligência:** Novo painel superior atualizado a cada 5 minutos via Supabase que extrai dados mortos para calcular:
  * **[INTEL] Melhor Mapa:** Qual o mapa onde os esquadrões do grupo acumulam o maior número de vitórias.
  * **[DESTAQUE DA SEMANA] MVP Tático:** O melhor KDA da comunidade nos últimos combates.
  * **[ALERTA TÁTICO] Sinal Perdido:** Detecta e exibe em um radar vermelho piscante os "Lobos Solitários" que jogam partidas Competitive sem a equipe.
* 📊 **Motor de Sincronização Furtiva (GitHub Actions):** O worker automatizado (`update-data.js`) possui um algoritmo adaptativo de *Single Request Truth*. Navega pelo *rate limit* da API HenrikDev e retém requests até que resfriem, extraindo dados vitais (KDA, HS%, Agent Info) dos últimos combates sem bloquear o servidor.
* 🐺 **Estatísticas Criptografadas por Jogador:** O Player Card de cada Agente lista nativamente a sua **Trilha de Especialidade (Agente Mais Jogado)** e a **Taxa Média de Headshot (HS%)** a partir do histórico registrado.

---

## 🎖️ Hierarquia e Imersão Tática

O design adota uma perspetiva interativa onde as tabelas de classificação e interfaces são personalizadas com recursos e media oficiais da API do Valorant. Cada Esquadrão possui um **Comandante Oficial** cujo porte e estética dão a atmosfera do painel:

* 🐍 **UNIDADE ALPHA (Elite):** Vagas restritas a líderes. O painel é dominado por ciano escuro e controlado oficialmente pelo retrato da Agente 02 (**Viper**). Especialistas em controle tático.
* 🔥 **UNIDADE ÔMEGA (Elite):** Controle de fogo de artilharia pesada guiado sob a postura do Agente 01 (**Brimstone**). Texturas vermelhas delimitam a sua interface angular.
* 🦎 **ESQUADRÃO WINGMAN (Reserva):** A zona de espera amarela/verde gerida pelo Agente 22 (**Gekko**). Qualquer Agente que perca a posição por pontuação ("Sinergia") aguarda aqui a sua vez de provar mérito de novo.
* 👁️ **DOSSIÊ "REDE DE INFORMAÇÕES":** O manual de operações do usuário (Página de Briefing) sofreu *interceptação* da inteligência do Agente **Cypher**. Suas regras de engajamento são lidas do ponto de vista deste especialista que vigia "cada um dos seus rastros de dados".

---

## 📈 Sistema de Merito & Sinergia (SN)

O recrutamento para as linhas da frente nunca é vitalício. As vagas de elite (1 por Função em cada Unit) devem ser constantemente conquistadas pelas linhas de estatísticas gamificadas:

### 1. Synergy Score (Pontos de Sinergia)
Pontos amealhados **exclusivamente a jogar Ranqueadas (Competitivo) com outros membros formados do grupo**.
* **Duos:** +1 Ponto
* **Trios:** +2 Pontos
* **Squad Fechado (4 ou 5 agentes):** +5 Pontos
* *Modificador Tático:* **Vencer = DOBRO DE PONTOS**. 

### 2. Sala de Aquecimento (Mata-Mata)
A rotina monitoriza também perfis de Treino no modo Mata-Mata. O abate (Kill) é puro mérito métrico onde o Top 3 atribui prêmios massivos de avanço de ranking semanal, incentivando a entrada a frio no combate.

---

## 🛠️ Arquitetura (Tech Stack)

Uma operação limpa alimentada por workflows modernos sem dependência num servidor Node local ativo de 24 horas para visualização de dados:

* **Frontend Brutalista:** HTML5 + Vanilla JS + CSS3 nativo (`clip-path`, animações de interface `blink`, Integração Media Oficial da Riot via Valorant-API). A comunicação backend do FrontEnd ocorre de forma assíncrona via CDN pelo **Supabase Client**.
* **Backends Autômatos:** Scripts em Node.js assíncronos que usam **GitHub Actions (`update.yml`, `reset-dm.yml`)** em infraestruturas CI/CD com Agendamento Cron para varreduras a cada 30min invisíveis aos jogadores.
* **Database Relay:** **Supabase (PostgreSQL)** contendo históricos dinâmicos de operações e cruzamento complexo de relações ativas.
* **Integrações de Vigilância:** API Externa oficial [Valorant-API (Media)](https://valorant-api.com) e API estatística bruta via [HenrikDev API](https://github.com/Henrik-3/unofficial-valorant-api).

---

## ⚙️ Implantação de Terminal

### Pré-requisitos
* Node.js v18 LTS+
* Cluster de Database [Supabase](https://supabase.com/)
* Bot API Token originado em `@BotFather` do Telegram.
* API Key aprovada da infraestrutura HenrikDev.

### 1. Clonar Registros
```bash
git clone https://github.com/seu-usuario/protocolov.git
cd protocolov
npm install
```

### 2. Encriptação Ambiental (.env)
```env
SUPABASE_URL=https://[YOUR_INSTANCE].supabase.co
SUPABASE_SERVICE_KEY=[PRIVATE_ADMIN_R/W_KEY]
HENRIK_API_KEY=[API_KEY]
TELEGRAM_BOT_TOKEN=[BOT_TOKEN]
TELEGRAM_CHAT_ID=[TELEGRAM_GROUP_ID]
ADMIN_TELEGRAM_ID=[O_SEU_ID_TELEGRAM_AQUI]
WEBHOOK_URL=[OPCIONAL_URL_DO_RENDER]
PORT=3000
```
*(As credenciais frontend `anon_key` do supabase podem ser visualizadas com segurança em `script.js` para operações Read-Only de visitantes).*

### 3. Ordens de Ligação
Para ligar a inteligência conversacional do Bot de Telegram localmente:
```bash
npm start
```

Para forçar a extração manual dos dados de rotina dos históricos de partida:
```bash
node update-data.js
```

---

## 📜 Manifesto de Sobrevivência

1. **Tolerância Zero:** Racismo, assédio verbal ou preconceito geram banimento do banco de dados na raiz do MAC e chaves associadas. O respeito precede a arma.
2. **Rádio Limpo:** Silêncio operacional. Perdeu o combate? Abateu zero inimigos? Indique o dano causado, reporte o posicionamento tático e **muta o microfone**. Desabafos bloqueiam passos no radar.
3. **Reset Psicológico:** O Tilt (desespero emocional ou fúria num jogo em desvantagem) quebra toda a premissa deste grupo. Reset na ronda, ajuste a economia e responda na bala na partida seguinte.
4. **Comandante de Campo:** Os líderes tomam a iniciativa no Lobby. Se tens mais Sinergia e as credenciais, cabe a ti recrutar esquadrões e pedir "/convocar".

---
*Morte à Solo Queue. Viva a tática e o jogo em uníssono.*
