# Protocolo V 🎯

O **Protocolo V** é uma plataforma web leve e automatizada, desenvolvida para gerenciar o recrutamento de equipas fixas de Valorant. O foco do projeto é criar um ambiente estruturado para jogadores que procuram subir de elo na *ranqueada* e participar do torneio Premiere, fugindo da aleatoriedade da *SoloQ* e focando na evolução tática.

🌐 **Site Oficial:** [protocolov.com](https://protocolov.com)

---

## 🚀 Funcionalidades

* **Recrutamento Integrado:** Formulário nativo no site que envia a inscrição diretamente para a base de dados.
* **Carregamento Instantâneo & Dinâmico:** Utiliza o **Supabase (PostgreSQL)** para entregar os dados ao utilizador final sem tempo de espera.
* **Fila de Espera Inteligente:** Separação automática entre titulares e reservas, com tratamento visual diferenciado no Frontend.
* **Proteção contra Rate Limit & Automatização:** O processamento de dados ocorre no *backend* (via GitHub Actions) a cada 30 minutos. O robô atualiza ranks, elos e últimas partidas consultando a API, blindando o site contra bloqueios (Erro 429).
* **Segurança Reforçada:** RLS (Row Level Security) ativado no Supabase. A chave da API do Valorant e a chave Mestra do Banco de Dados estão protegidas nos *Secrets* do GitHub.

---

## ⚙️ Estrutura Técnica (Arquitetura Híbrida)

O projeto não requer um servidor Node.js a correr 24/7. Ele utiliza uma arquitetura *Serverless* eficiente:

1. **Entrada de Dados (Frontend):** O `script.js` utiliza o SDK do Supabase para enviar novas inscrições para a tabela `players`.
2. **Cron Job (GitHub Actions):** O ficheiro `update.yml` aciona o script `update-data.js` a cada 30 minutos.
3. **Processamento (Backend):** - O Node.js lê os jogadores inscritos no Supabase.
   - Consulta a API Oficial/Unofficial do Valorant (HenrikDev) para extrair os *Ranks* e Histórico de Partidas.
   - Faz um `Upsert` de volta para o Supabase mantendo tudo atualizado.
4. **Leitura Segura:** O Frontend consulta as tabelas públicas do Supabase para renderizar os cards e o histórico.

---

## 🛠️ Instalação Local

1. Clone o repositório.
2. Instale as dependências:
   ```bash
   npm install
