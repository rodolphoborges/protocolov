# Protocolo V 🎯

O **Protocolo V** é uma plataforma web leve e automatizada, desenvolvida para gerenciar o recrutamento de equipes fixas de Valorant. O foco do projeto é criar um ambiente estruturado para jogadores que procuram subir de elo na *ranqueada* e participar do torneio Premiere, fugindo da aleatoriedade da *SoloQ* e focando na evolução tática.

🌐 **Site Oficial:** [protocolov.com](https://protocolov.com)

---

## 🚀 Funcionalidades

* **Recrutamento Automatizado:** O status da *line-up* atualiza dinamicamente as vagas de cada função com base nas respostas de um formulário externo.
* **Carregamento Instantâneo:** Utiliza uma arquitetura de dados estáticos (`data.json`), eliminando o tempo de espera de APIs externas para o usuário final.
* **Fila de Espera Inteligente:** Separação automática entre titulares e reservas com base na ordem de inscrição, com tratamento visual diferenciado.
* **Proteção Total contra Rate Limit:** O processamento de dados ocorre no *backend* (GitHub Actions) a cada 30 minutos, blindando o site contra bloqueios de API (Erro 429), independente do número de visitantes.
* **Segurança Reforçada:** A chave da API do Valorant fica protegida nos segredos do GitHub (Secrets), não sendo exposta no código-fonte do navegador.
* **UI/UX Polida:** Animações de entrada no *scroll*, design responsivo com Bootstrap 5 e Meta Tags Open Graph configuradas.

---

## ⚙️ Estrutura Técnica

A aplicação evoluiu de um modelo *Client-Side* puro para uma arquitetura **Híbrida com Geração Estática**, mantendo-se 100% gratuita hospedada no GitHub Pages.

### Fluxo de Dados (Automação):
1. **Cron Job (GitHub Actions):** Um fluxo de trabalho (`.github/workflows/update.yml`) é acionado automaticamente a cada 30 minutos.
2. **Extração e Processamento (`update-data.js`):**
   - O script Node.js baixa o CSV do Google Sheets.
   - Identifica novos jogadores e suas funções.
   - Consulta a API do HenrikDev (MMR e Account) para cada jogador, respeitando um *delay* de segurança.
   - Consolida todas as informações (Elos, Ranks, Cards, Links) em um arquivo `data.json`.
3. **Commit Automático:** O robô salva o arquivo `data.json` atualizado no repositório.
4. **Renderização (`index.html`):** O navegador do usuário faz apenas uma única requisição leve para ler o `data.json` e renderiza a tela instantaneamente, sem depender de APIs de terceiros.

---

## 🛠️ Guia de Configuração (Deploy Próprio)

Se você deseja fazer um *fork* deste projeto para a sua própria equipe, siga estes passos para configurar a automação:

### 1. Configurando o Banco de Dados (Google Sheets)
1. Crie um formulário no Google Forms pedindo "Riot ID" e "Função Principal".
2. Na planilha de respostas, vá em **Arquivo > Compartilhar > Publicar na Web**.
3. Escolha publicar a **Página 1** no formato **CSV**.
4. Copie o link gerado e cole na variável `csvUrl` dentro do arquivo `update-data.js` (na raiz do projeto).

### 2. Configurando a Chave da API (Segurança)
O projeto utiliza a API do [HenrikDev](https://github.com/Henrik-3/unofficial-valorant-api).
1. Gere sua chave gratuita no portal do desenvolvedor da API.
2. No seu repositório GitHub, vá em **Settings > Security > Secrets and variables > Actions**.
3. Clique em **New repository secret**.
4. **Name:** `HENRIK_API_KEY`
5. **Secret:** Cole sua chave (ex: `HDEV-xe8...`).

### 3. Ativando a Automação
O arquivo `.github/workflows/update.yml` já está configurado para rodar a cada 30 minutos.
- Para testar imediatamente, vá na aba **Actions** do GitHub, selecione o fluxo "Atualiza Dados da Line-up" e clique em **Run workflow**.

---

## 💻 Como executar localmente

Para testar alterações no visual (`index.html`):

1. Clone o repositório.
2. Certifique-se de que existe um arquivo `data.json` na pasta (você pode baixá-lo do repositório principal ou rodar `node update-data.js` se tiver a chave configurada no seu `.env` local).
3. Abra o `index.html` no navegador (ou use uma extensão como *Live Server*).

---

<p align="center">
  <small>Desenvolvido para a comunidade. GLHF. 👊</small>
</p>
