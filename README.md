# Protocolo V 🎯

O **Protocolo V** é uma plataforma web leve e automatizada, desenvolvida para gerenciar o recrutamento de equipes fixas de Valorant. O foco do projeto é criar um ambiente estruturado para jogadores que procuram subir de elo na *ranqueada* e participar do torneio Premiere, fugindo da aleatoriedade da *SoloQ* e focando na evolução tática.

🌐 **Site Oficial:** [protocolov.com](https://protocolov.com)

---

## 🚀 Funcionalidades

* **Recrutamento Automatizado:** O status da *line-up* atualiza dinamicamente as vagas de cada função com base nas respostas de um formulário externo.
* **Integração Assíncrona com API:** Consulta em tempo real do Nível da Conta, Elo Atual e Rank Máximo através do Riot ID, usando processamento paralelo (`Promise.all`).
* **Geração Automática de Links:** O sistema deduz e constrói o link do Tracker.gg de forma automática a partir do Riot ID, evitando links quebrados.
* **Proteção contra Rate Limit:** Fila de processamento assíncrona nativa com *delay* para evitar bloqueios de API (Erro 429).
* **Segurança Reforçada:** Sanitização de *inputs* via manipulação segura de DOM para prevenir ataques de *Cross-Site Scripting* (XSS) via formulário.
* **UI/UX Polida:** Animações de entrada no *scroll* (Intersection Observer), design responsivo com Bootstrap 5 e Meta Tags Open Graph configuradas para compartilhamento em redes sociais.

---

## ⚙️ Estrutura Técnica e JavaScript

A aplicação foi projetada para ser **Serverless** (sem backend tradicional), rodando inteiramente no lado do cliente (Navegador) e consumindo dados como serviço.

### Fluxo de Execução do Script:
1. `fetchAndProcessData()`: Contorna o cache do navegador injetando um *timestamp* na URL. Faz o fetch do CSV, faz o *parsing* manual considerando aspas duplas, sanitiza os dados de entrada, localiza as colunas de "Função" e "Riot ID" e distribui os jogadores no objeto `rolesConfig`.
2. `renderRoles()`: Constrói a estrutura HTML principal (os blocos de funções e os *placeholders* de *loading* dos cards). Ele não chama a API diretamente; em vez disso, empilha as requisições em um array `apiCallsQueue`.
3. `processQueue(queue)`: **O Coração do Rate Limiting.** Uma função assíncrona que itera sobre a fila de jogadores e dispara as requisições para a API com um `await delay(300)` (300 milissegundos) entre cada chamada, garantindo que a API não recuse as conexões por excesso de tráfego.
4. `fetchPlayerAPI()`: Recebe o Riot ID fatiado (Nome e Tag) e dispara dois *fetches* simultâneos (`Account` e `MMR`) usando `Promise.all` para ganho de performance. Trata erros como contas privadas (403) ou jogadores sem rank (404) com *fallbacks* visuais elegantes.

---

## 🛠️ Guia de Configuração (Deploy Próprio)

Se você deseja fazer um *fork* deste projeto para a sua própria equipe, precisará configurar as duas variáveis principais no início da tag `<script>` no arquivo `index.html`:

### 1. Configurando o Banco de Dados (Google Sheets)
O sistema lê um arquivo CSV público. Para criar o seu:
1. Crie um formulário no Google Forms pedindo "Riot ID" e "Função Principal".
2. Na aba "Respostas", clique em "Vincular ao Planilhas".
3. Na planilha do Google Sheets, vá em **Arquivo > Compartilhar > Publicar na Web**.
4. Escolha publicar a **Página 1** no formato **Valores separados por vírgula (.csv)**.
5. Copie o link gerado e cole na variável `csvUrl` (linha ~244 do `index.html`).

### 2. Configurando a Chave da API (HenrikDev)
O projeto utiliza a excelente API não-oficial do [HenrikDev](https://github.com/Henrik-3/unofficial-valorant-api).
1. Acesse o Discord do desenvolvedor ou o portal da API para gerar uma chave gratuita.
2. Insira a sua chave na variável `henrikApiKey` (linha ~245 do `index.html`), mantendo o prefixo `HDEV-`.

---

## 💻 Como executar localmente

Para rodar, testar e modificar o projeto no seu ambiente de desenvolvimento:

1. Faça o clone deste repositório:
   ```bash
   git clone [https://github.com/rodolphoborges/protocolov.git](https://github.com/rodolphoborges/protocolov.git)
