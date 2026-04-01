# Protocolo V // Frontend (Admin Dashboard)

Este é o Painel de Controle administrativo do **Protocolo V**, desenvolvido em **React 19** com **Vite 8**. Ele fornece visibilidade operacional sobre squads, histórico de partidas e insights táticos gerados pelo Oráculo V.

## Stack Técnica
- **Core**: React 19.0.0
- **Build Tool**: Vite 8.0.0
- **Routing**: React Router 7.13
- **Icons**: Lucide React
- **Design**: Vanilla CSS (Cyberpunk/Terminal Aesthetic)
- **Data Source**: Supabase

## Setup Local

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Configure o ambiente:
   - Crie um arquivo `.env` na raiz desta pasta.
   - Adicione as chaves:
     ```env
     VITE_SUPABASE_URL=sua_url
     VITE_SUPABASE_ANON_KEY=sua_chave
     ```

3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

## Estrutura
- `src/components`: Componentes reutilizáveis (Cards, Tabelas, Gráficos).
- `src/pages`: Páginas da aplicação (Dashboard, Profile, Analysis).
- `src/services`: Clientes de API e integração com Supabase.
- `src/styles`: Tokens de design e CSS global.
