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
    
    // Configurações do Painel de Operações
    ui: {
        opsPerPage: 5, // Número de operações a carregar por vez
        
        // Configuração Dinâmica dos Esquadrões de Elite
        squads: {
            'ALPHA': { 
                title: 'UNIDADE ALPHA', 
                desc: 'Sob o comando da Agente 02 - Viper. Precisão química e controle tático absoluto.', 
                commanderImg: 'https://media.valorant-api.com/agents/707eab51-4836-f488-046a-cda6bf494859/fullportrait.png',
                commanderBg: 'rgba(0, 255, 157, 0.03)',
                theme: 'alpha-theme',
                roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null } 
            },
            'OMEGA': { 
                title: 'UNIDADE ÔMEGA', 
                desc: 'Sob o comando do Agente 01 - Brimstone. Força de elite e suporte orbital pesado.', 
                commanderImg: 'https://media.valorant-api.com/agents/9f0d8ba9-4140-b941-57d3-a7ad57c6b417/fullportrait.png',
                commanderBg: 'rgba(255, 70, 85, 0.03)',
                theme: 'omega-theme',
                roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null } 
            }
        }
    }
};
