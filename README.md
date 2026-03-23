# 🎯 Protocolo V | Sistema Tático para Valorant

![Status](https://img.shields.io/badge/Status-Ativo-success?style=for-the-badge&color=ff4655)
![Stack](https://img.shields.io/badge/Stack-Node.js_|_Vanilla_JS_|_Supabase-informational?style=for-the-badge&color=0f1923)
![API](https://img.shields.io/badge/API-HenrikDev-blue?style=for-the-badge)

O **Protocolo V** não é apenas uma lista de jogadores; é um ecossistema completo de rastreamento, gamificação e consultoria tática com IA, focado em jogadores de Valorant que buscam evolução tática e desejam escapar da toxicidade das filas ranqueadas (*Solo Queue*). 

O sistema monitora automaticamente o desempenho dos agentes, recompensa o jogo em equipe (Sinergia), executa varreduras de partidas e gerencia vagas em esquadrões de elite. Tudo isso operando com uma estética visual **Brutalista Geométrica** fortemente inspirada na interface e na história (Lore) oficial do Valorant.

---

## 🤖 Contexto para LLMs e Agentes de IA (Arquitetura)
*Se você é uma Inteligência Artificial auxiliando na manutenção deste repositório, utilize este resumo para entender o ecossistema rapidamente:*

O Protocolo V opera através de serviços desacoplados centrados no **Supabase**:
1. **Frontend Core (`nav.js`, `style.css`)**: Injeta a navegação unificada e o design system (glassmorphism, teko-font) de forma global.
2. **Camada de Inteligência (`insights.js`)**: Mecanismo de agregação no lado do cliente que processa o histórico de partidas para gerar rankings de Sinergia, KDA e sequências (Streaks) em tempo real.
3. **Módulo Oráculo V (`oraculo.js`, `analise.html`)**: Motor analítico que transforma dados brutos em conselhos táticos e eventos narrativos (ex: First Bloods, multi-kills).
4. **Sincronizador (`update-data.js`)**: Automação via GitHub Actions para atualização de metadados estáticos dos jogadores.

---

## 🚀 Funcionalidades Principais

* 📝 **Alistamento Automatizado:** Interface web em que novos codinomes se inscrevem via Riot ID, escolhendo a sua função principal.
* 📱 **Terminal de Inteligência (K.A.I.O. Bot):** Bot integrado no Telegram focado na praticidade dos jogadores com os seguintes comandos:
  * `/vincular`: Conecta o perfil do banco com o Telegram.
  * `/unidade` e `/perfil`: Troca de esquadrão ou exibe placar de status.
  * `/convocar`: Dispara um alerta de formação de lobby para o grupo.
  * `/analisar`: Mapeia de forma autônoma quem jogou a última partida ("AUTO") e envia os dados para enfileiramento tático no centro de inteligência.
* 👁️ **Oráculo V (IA Tática):** Toda partida finalizada pode ser esmiuçada pelo Oráculo. Ele identifica erros fundamentais, sugere reposicionamentos pautados no tipo de Agente e critica a progressão da economia do jogador do Protocolo.
* 🚨 **Painel de Operações Globais (Dashboard):** Visão unificada com insights orientados a dados:
  * **[ELO] Sinergia & Karma:** Ranking de quem mais joga em grupo (SN).
  * **[ELITE] KDA / Partida:** Ranking de performance individual pura.
  * **[AVISO] Estado Operacional:** Detecção automática de *Loss Streaks* ou *Win Streaks*.

---

## 🎖️ Hierarquia e Imersão Tática

O design da plataforma adota uma perspectiva interativa, onde as tabelas de classificação são envelopadas em mídia oficial da Riot Games. Cada Esquadrão possui um **Comandante Oficial** cujo porte e estética guiam a atmosfera do painel:

* 💠 **UNIDADE ALPHA (Elite):** Vagas restritas a líderes frios e calculistas, sob o comando da **Comandante Venenosa**. O painel é dominado por tons de ciano escuro. Especialistas em controle tático do mapa.
* 🔥 **UNIDADE ÔMEGA (Elite):** Controle de fogo e artilharia bruta guiados pelo **Comandante Cachorro Velho**. Texturas textuais vermelhas delimitam sua interface angular e agressiva.
* ⚙️ **DEPÓSITO DE TORRETAS:** A reserva técnica do Protocolo. Onde codinomes auxiliam a elite enquanto forjam o seu nome nas trincheiras para uma futura ascensão ao esquadrão principal.
* 🤖 **SISTEMA K.A.I.O.:** A Inteligência Artificial de comunicação. Com uma personalidade focada na neutralidade operacional, o bot gerencia todas as credenciais fornecendo instruções claras e objetivas de campo.

---

## 📈 Sistema de Mérito & Sinergia (SN)

As vagas de elite (1 por Função em cada Unidade) devem ser constantemente mantidas através do desempenho real, não sendo posições vitalícias.

### 1. Synergy Score (Pontos de Sinergia)
Pontos acumulados **exclusivamente ao jogar o modo Competitivo com outros membros verificados do grupo**.
* **Duos:** +1 Ponto
* **Trios:** +2 Pontos
* **Squad Fechado (4 ou 5 codinomes):** +5 Pontos
* *Modificador Tático:* **Uma vitória DEDOBRA a pontuação ganha na partida**. 

### 2. Sala de Aquecimento (Mata-Mata)
A rotina também monitora os perfis no modo Mata-Mata (Deathmatch). Estar no Top 3 do Mata-Mata concede mérito na progressão semanal, reforçando o hábito inquebrável de entrar aquecido nos combates principais.

---

## ⚙️ Implantação de Terminal

### Pré-requisitos
* Node.js v18 LTS+
* Banco de dados [Supabase](https://supabase.com/) configurado com as tabelas `players` e `match_analysis_queue`.
* Bot API Token originado no `@BotFather` (Telegram).
* API Key aprovada da infraestrutura [HenrikDev](https://docs.henrikdev.xyz/).

### 1. Inicializar Terminal
```bash
git clone https://github.com/seu-usuario/protocolov.git
cd protocolov
npm install
```

### 2. Contenção Multivariável (.env)
```env
SUPABASE_URL=https://[YOUR_INSTANCE].supabase.co
SUPABASE_SERVICE_KEY=[PRIVATE_ADMIN_R/W_KEY]
HENRIK_API_KEY=[API_KEY]
TELEGRAM_BOT_TOKEN=[BOT_TOKEN]
TELEGRAM_CHAT_ID=[TELEGRAM_GROUP_ID]
ADMIN_TELEGRAM_ID=[SEU_ID_TELEGRAM]
```
*(As chaves públicas `anon_key` do Supabase para visitantes podem residir visivelmente em `script.js` e `config.js` estritos a políticas RLS de Read-Only).*

### 3. Ordem de Ignição Local
Para rodar a interface de inteligência do bot e observar as rotinas do projeto:
```bash
node telegram-bot.js
```
*Em ambientes de produção (Render, Heroku, VPS etc.), assegure-se de provisionar monitoramento ou Webhooks.*

---

## 📜 Manifesto de Sobrevivência (Regras de Conduta)

1. **Tolerância Zero:** Racismo, assédio verbal ou preconceito configuram banimento sem alerta do banco de dados na raiz do MAC, sem apelação. O respeito ao próximo precede a mira do fuzil.
2. **Rádio Limpo:** Silêncio operacional absoluto. Perdeu o combate? Abateu zero inimigos? Indique o dano causado, reporte a posição tática inimiga e **mute o microfone imediatamente**. Desabafos longos poluem os passos do radar da equipe viva.
3. **Reset Psicológico:** O Tilt (desespero ou fúria num jogo em desvantagem) quebra toda a premissa de coesão deste grupo. Respire na tela de compra, ajuste a economia coletiva e responda na bala no próximo round em silêncio mortal.
4. **Comandante de Campo:** Os líderes tomam as rédeas do Lobby de forma inquestionável. Se você tem mais Sinergia e deseja o avanço do esquadrão, utilize a chamada `/convocar` sem medo.

---
*Morte à Solo Queue. Viva a tática e o jogo em uníssono.*
---

### ⚖️ Aviso Legal (Legal Jibber Jabber)
*O Protocolo V é um projeto de código aberto construído por entusiastas de Valorant. Ele não é endossado pela Riot Games e não reflete as opiniões ou diretrizes da Riot Games ou de qualquer entidade envolvida oficialmente na produção de VALORANT. VALORANT e Riot Games representam marcas comerciais devidamente registradas de responsabilidade da Riot Games, Inc.*
