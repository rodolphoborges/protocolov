/**
 * REDE DE INFORMAÇÕES DO PROTOCOLO V
 * Ficheiro Central de Configuração do Frontend
 * Edite os parâmetros abaixo para alterar o comportamento do painel.
 */

window.ProtocolConfig = {
    // Ligações à Base de Dados (Apenas Chaves Públicas/Anon)
    supabase: {
        url: 'https://gzbzfmvgwfvzjqurowku.supabase.co',
        anonKey: 'sb_publishable_EBbK4nq9kpV0VNFmOzFEqQ_2mooasVD'
    },
    // Configurações do Oráculo V (Microserviço de Análise)
    oraculo: {
        url: 'INSIRA_URL_DO_ORACULO_AQUI_SE_POSSUIR',
        anonKey: 'INSIRA_ANON_KEY_DO_ORACULO_AQUI_SE_POSSUIR'
    },
    
    // Configurações do Painel de Operações
    ui: {
        opsPerPage: 5, // Número de operações a carregar por vez
        
        // Configuração Dinâmica dos Esquadrões de Elite
        squads: {
            'ALPHA': { 
                title: 'UNIDADE ALPHA', 
                desc: 'Comandante Venenosa. Precisão tática e controle absoluto de campo.', 
                commanderImg: 'https://media.valorant-api.com/agents/707eab51-4836-f488-046a-cda6bf494859/fullportrait.png',
                commanderBg: 'rgba(0, 255, 157, 0.03)',
                theme: 'alpha-theme',
                roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null } 
            },
            'OMEGA': { 
                title: 'UNIDADE ÔMEGA', 
                desc: 'Comandante Cachorro Velho. Força de assalto e suporte pesado.', 
                commanderImg: 'https://media.valorant-api.com/agents/9f0d8ba9-4140-b941-57d3-a7ad57c6b417/fullportrait.png',
                commanderBg: 'rgba(255, 70, 85, 0.03)',
                theme: 'omega-theme',
                roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null } 
            }
        }
    }
};
