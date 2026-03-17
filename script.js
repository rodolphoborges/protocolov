const supabaseUrl = 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseAnonKey = 'sb_publishable_EBbK4nq9kpV0VNFmOzFEqQ_2mooasVD';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const squadsConfig = {
    'ALPHA': { 
        title: 'UNIDADE ALPHA', 
        desc: 'Sob o comando da Agente 02 - Viper. Precisão química e controle tático absoluto.', 
        theme: 'alpha-theme',
        roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null },
        support: [] // ARMAZENA O EXCESSO DA UNIDADE
    },
    'OMEGA': { 
        title: 'UNIDADE ÔMEGA', 
        desc: 'Sob o comando do Agente 01 - Brimstone. Força de elite e suporte orbital.', 
        theme: 'omega-theme',
        roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null },
        support: [] // ARMAZENA O EXCESSO DA UNIDADE (EX: VITUXO)
    }
};

let esquadraoWingman = []; 
let opsOffset = 0;
const OPS_PER_PAGE = 5;
let isFetchingOps = false;
let isSubmittingForm = false; 

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function safeUrl(url, fallback) {
    if (url && typeof url === 'string' && url.startsWith('https://')) return url;
    return fallback;
}

async function fetchCachedData() {
    try {
        const { data: playersData, error: playersError } = await supabaseClient
            .from('players')
            .select('*')
            .order('synergy_score', { ascending: false });

        if (playersError) throw playersError;

        // Resetar squads
        Object.keys(squadsConfig).forEach(u => {
            Object.keys(squadsConfig[u].roles).forEach(r => squadsConfig[u].roles[r] = null);
            squadsConfig[u].support = [];
        });
        esquadraoWingman = [];

        playersData.forEach(player => {
            const unit = player.unit?.toUpperCase();
            const role = player.role_raw;

            if (unit === 'ALPHA' || unit === 'OMEGA') {
                // Se a vaga da Role está vazia, ocupa. Se não, vai para o suporte daquela unidade.
                if (squadsConfig[unit].roles[role] === null) {
                    squadsConfig[unit].roles[role] = player;
                } else {
                    squadsConfig[unit].support.push(player);
                }
            } else {
                esquadraoWingman.push(player);
            }
        });

        renderSquads();
        updateLastSyncTime(playersData);
        
        // Proteção contra o erro PGRST205 (Tabela matches não encontrada)
        try {
            opsOffset = 0;
            await fetchOperations(false);
        } catch (e) {
            console.warn("Aviso: Histórico de missões indisponível (Tabela matches ausente).");
        }

    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

function renderSquads() {
    const container = document.getElementById('squads-container');
    if (!container) return;
    container.innerHTML = '';

    Object.entries(squadsConfig).forEach(([id, config]) => {
        let rolesHtml = '';
        Object.entries(config.roles).forEach(([roleName, player]) => {
            rolesHtml += renderPlayerSlot(roleName, player);
        });

        let supportHtml = '';
        if (config.support.length > 0) {
            supportHtml = `<div class="mt-3 border-top border-dark pt-2">
                <p class="text-muted small mb-1">RESERVAS OPERACIONAIS:</p>
                ${config.support.map(p => `<div class="small text-white-50">${escapeHtml(p.riot_id)} (${p.role_raw})</div>`).join('')}
            </div>`;
        }

        container.innerHTML += `
            <div class="col-md-6 mb-4">
                <div class="card bg-black border-secondary h-100 squad-card ${config.theme}">
                    <div class="card-body">
                        <h3 class="t-valorant text-white mb-1">${config.title}</h3>
                        <p class="small text-muted mb-4">${config.desc}</p>
                        <div class="roles-grid">${rolesHtml}</div>
                        ${supportHtml}
                    </div>
                </div>
            </div>`;
    });
    renderWingman();
}

function renderPlayerSlot(role, player) {
    if (!player) {
        return `<div class="d-flex align-items-center mb-3 opacity-25">
            <div class="role-icon-placeholder me-3"></div>
            <div class="small text-muted text-uppercase">${role}: AGUARDANDO...</div>
        </div>`;
    }
    return `
        <div class="d-flex align-items-center mb-3">
            <img src="${safeUrl(player.card_url, 'https://media.valorant-api.com/playercards/default/smallart.png')}" class="player-mini-card me-3 border border-secondary">
            <div>
                <div class="small text-info fw-bold" style="font-size:0.7rem">${role.toUpperCase()}</div>
                <div class="t-valorant text-white">${escapeHtml(player.riot_id)}</div>
                <div class="d-flex align-items-center gap-2 mt-1">
                    <img src="${player.current_rank_icon}" width="16">
                    <span class="small text-muted">${player.current_rank}</span>
                </div>
            </div>
        </div>`;
}

function renderWingman() {
    const list = document.getElementById('wingman-list');
    if (!list) return;
    list.innerHTML = esquadraoWingman.map(p => `
        <div class="col-lg-4 col-md-6 mb-3">
            <div class="card bg-dark border-secondary">
                <div class="card-body d-flex align-items-center p-2">
                    <img src="${p.card_url}" class="wingman-thumb me-3">
                    <div class="text-white text-truncate fw-bold small">${escapeHtml(p.riot_id)}</div>
                </div>
            </div>
        </div>`).join('');
}

async function fetchOperations(append = false) {
    if (isFetchingOps) return;
    isFetchingOps = true;
    try {
        const { data, error } = await supabaseClient
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false })
            .range(opsOffset, opsOffset + OPS_PER_PAGE - 1);

        if (error) throw error; // Aqui ele vai cair no catch se a tabela não existir

        const container = document.getElementById('ops-container');
        if (!append) container.innerHTML = '';
        
        data.forEach(m => {
            container.innerHTML += `<div class="op-item border-bottom border-dark py-2 text-white small">
                ${new Date(m.created_at).toLocaleDateString()} - ${m.mapa} (${m.result})
            </div>`;
        });
        opsOffset += OPS_PER_PAGE;
    } catch (err) {
        console.error("Erro Ops:", err);
        throw err; // Propaga para o catch pai
    } finally {
        isFetchingOps = false;
    }
}

function updateLastSyncTime(players) {
    const el = document.getElementById('last-updated-status');
    if (el) el.innerHTML = `<span class="badge bg-dark text-muted">Sincronizado: ${new Date().toLocaleTimeString()}</span>`;
}

document.addEventListener('DOMContentLoaded', () => {
    fetchCachedData();
    // Lógica do formulário de recrutamento aqui (conforme seu original)
});
