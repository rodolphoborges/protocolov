# Protocolo V 🎯

O **Protocolo V** é uma plataforma web leve e automatizada, desenvolvida para gerir o recrutamento de equipas fixas de Valorant. O foco do projeto é criar um ambiente estruturado para jogadores que procuram subir de elo na *ranqueada* e participar no torneio Premiere, fugindo da aleatoriedade da *SoloQ* e focando na evolução tática.

🌐 **Site Oficial:** [protocolov.com](https://protocolov.com)

---

## 🚀 Funcionalidades

* **Recrutamento Automatizado:** O estado da *line-up* atualiza dinamicamente as vagas de cada função com base nas respostas de um formulário externo.
* **Integração com API do Valorant:** Consulta em tempo real do Nível da Conta, Elo Atual e Rank Máximo (Peak Rank) através do Riot ID introduzido pelo candidato.
* **Cartões de Jogador Dinâmicos:** Apresentação visual dos candidatos com a imagem do perfil (player card), ícones oficiais dos *tiers* e ligação direta para as estatísticas no Tracker.gg.
* **Segurança Reforçada:** Implementação de uma função de sanitização de *inputs* (DOM TextContent) para prevenir ataques de injeção de código (XSS) via formulário.
* **Design Temático:** Interface minimalista e limpa construída com Bootstrap 5, inspirada na identidade visual oficial do Valorant.

## 🛠️ Arquitetura e Tecnologias

A infraestrutura foi pensada para ser eficiente, de baixo custo de manutenção e sem necessidade de um servidor *backend* tradicional. O fluxo de dados funciona da seguinte forma:

1. **Entrada de Dados:** Formulário do Google (Google Forms).
2. **Base de Dados (Pseudo-DB):** Google Sheets, publicado ativamente e servido como um ficheiro `.csv`.
3. **Frontend:** HTML5, CSS3 e Vanilla JavaScript. O *script* contorna o cache através de *timestamps*, faz o *fetch* do CSV, filtra as informações vitais e injeta no DOM de forma segura.
4. **Inteligência de Dados:** Consumo assíncrono da [API não-oficial do Valorant (HenrikDev)](https://github.com/Henrik-3/unofficial-valorant-api) para cruzar os Riot IDs com as estatísticas dos servidores da Riot Games.
5. **Alojamento e DNS:** Hospedado no GitHub Pages com roteamento de domínio personalizado e certificação SSL (Let's Encrypt).

## 💻 Como executar localmente

Para correr, testar e modificar o projeto no seu ambiente de desenvolvimento:

1. Faça o clone deste repositório:
   ```bash
   git clone [https://github.com/rodolphoborges/protocolov.git](https://github.com/rodolphoborges/protocolov.git)
