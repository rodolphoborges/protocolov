const supabaseUrl = 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseAnonKey = 'sb_publishable_EBbK4nq9kpV0VNFmOzFEqQ_2mooasVD';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// Configuração das Unidades com suporte para jogadores excedentes
const squadsConfig = {
    'ALPHA': { 
        title: 'UNIDADE ALPHA', 
        desc: 'Sob o comando da Agente 02 - Viper. Precisão química e controle tático absoluto.', 
        theme: 'alpha-theme',
        roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null },
        support: [] // Lista para membros da ALPHA que não couberam nas roles principais
    },
    'OMEGA': { 
        title: 'UNIDADE ÔMEGA', 
        desc: 'Sob o comando do Agente 01 - Brimstone. Força de elite e suporte orbital.', 
        theme: 'omega-theme',
        roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null },
        support: [] // Lista para membros da OMEGA (onde o Vituxo será alocado se a vaga estiver cheia)
    }
};

let esquadraoWingman = []; 
let opsOffset = 0;
const OPS_PER_PAGE = 5;
let isFetchingOps = false;
let isSubmittingForm = false; 

// --- UTILITÁRIOS ---
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function safeUrl(url, fallback) {
    if (url && typeof url === 'string' && url.startsWith('https://')) return url;
    return fallback;
}

// --- LÓGICA DE DADOS ---
async function fetchCachedData() {
    try {
        const { data: playersData, error: playersError } = await supabaseClient
            .from('players')
            .select('*')
            .order('synergy_score', { ascending: false });

        if (playersError) throw playersError;

        // Limpeza dos estados antes do reprocessamento
        Object.keys(squadsConfig).forEach(u => {
            Object.keys(squadsConfig[u].roles).forEach(r => squadsConfig[u].roles[r] = null);
            squadsConfig[u].support = [];
        });
        esquadraoWingman = [];

        playersData.forEach(player => {
            const unit = player.unit?.toUpperCase();
            const role = player.role_raw;

            if (unit === 'ALPHA' || unit === 'OMEGA') {
                // CORREÇÃO: Garante que o jogador permaneça na unidade do banco de dados
                if (squadsConfig[unit].roles[role] === null) {
                    squadsConfig[unit].roles[role] = player;
                } else {
                    // Se a role principal estiver ocupada, ele vai para o suporte da própria unidade
                    squadsConfig[unit].support.push(player);
                }
            } else {
                esquadraoWingman.push(player);
            }
        });

        renderSquads();
        updateLastSyncTime(playersData);
        
        // Proteção contra erro PGRST205 (Tabela matches ausente)
        try {
            opsOffset = 0;
            await fetchOperations(false);
        } catch (e) {
            console.warn("Aviso: Histórico de missões indisponível.");
        }

    } catch (err) {
        console.error("Erro Supabase:", err);
    }
}

// --- RENDERIZAÇÃO ---
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
            supportHtml = `
                <div class="mt-3 border-top border-dark pt-2">
                    <p class="text-muted small mb-1" style="font-size: 0.65rem;">RESERVAS DA UNIDADE:</p>
                    ${config.support.map(p => `
                        <div class="d-flex justify-content-between small text-white-50">
                            <span>${escapeHtml(p.riot_id)}</span>
                            <span>${p.role_raw}</span>
                        </div>
                    `).join('')}
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
        return `
            <div class="d-flex align-items-center mb-3 opacity-25">
                <div class="role-icon-placeholder me-3"></div>
                <div class="small text-muted text-uppercase">${role}: AGUARDANDO AGENTE...</div>
            </div>`;
    }
    return `
        <div class="d-flex align-items-center mb-3">
            <img src="${safeUrl(player.card_url, 'https://media.valorant-api.com/playercards/default/smallart.png')}" 
                 class="player-mini-card me-3 border border-secondary">
            <div>
                <div class="small text-info fw-bold" style="font-size:0.7rem">${role.toUpperCase()}</div>
                <div class="t-valorant text-white">${escapeHtml(player.riot_id)}</div>
                <div class="d-flex align-items-center gap-2 mt-1">
                    <img src="${player.current_rank_icon}" width="16">
                    <span class="small text-muted" style="font-size:0.8rem">${player.current_rank}</span>
                </div>
            </div>
        </div>`;
}

function renderWingman() {
    const list = document.getElementById('wingman-list');
    if (!list) return;
    list.innerHTML = esquadraoWingman.map(p => `
        <div class="col-lg-4 col-md-6 mb-3">
            <div class="card bg-dark border-secondary p-2">
                <div class="d-flex align-items-center">
                    <img src="${p.card_url}" class="wingman-thumb me-3" style="width:40px; height:40px; object-fit:cover;">
                    <div class="text-white text-truncate fw-bold small">${escapeHtml(p.riot_id)}</div>
                </div>
            </div>
        </div>`).join('');
}

// --- HISTÓRICO DE OPERAÇÕES ---
async function fetchOperations(append = false) {
    if (isFetchingOps) return;
    isFetchingOps = true;
    try {
        const { data, error } = await supabaseClient
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false })
            .range(opsOffset, opsOffset + OPS_PER_PAGE - 1);

        if (error) throw error;

        const container = document.getElementById('ops-container');
        if (!container) return;
        if (!append) container.innerHTML = '';
        
        data.forEach(m => {
            const date = new Date(m.created_at).toLocaleDateString();
            container.innerHTML += `
                <div class="op-item border-bottom border-dark py-2 text-white small">
                    <span class="text-muted">${date}</span> - <strong>${m.mapa}</strong> [${m.result}]
                </div>`;
        });
        opsOffset += OPS_PER_PAGE;
    } finally {
        isFetchingOps = false;
    }
}

function updateLastSyncTime(players) {
    const el = document.getElementById('last-updated-status');
    if (el) el.innerHTML = `<span class="badge bg-dark border border-secondary text-muted">Sincronizado: ${new Date().toLocaleTimeString()}</span>`;
}

// --- INICIALIZAÇÃO E EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    fetchCachedData();
    setInterval(fetchCachedData, 300000); // Atualiza a cada 5 min

    // Lógica do Formulário de Recrutamento
    const form = document.getElementById('recruitment-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmittingForm) return;
            isSubmittingForm = true;
            
            const riotId = document.getElementById('riotId').value.trim();
            const role = document.getElementById('role').value;
            const btn = form.querySelector('button');
            const feedback = document.getElementById('form-feedback');

            btn.disabled = true;
            btn.innerHTML = "PROCESSANDO...";

            try {
                const { error } = await supabaseClient.from('players').insert([{ 
                    riot_id: riotId, role_raw: role, unit: 'WINGMAN' 
                }]);
                if (error) throw error;
                feedback.innerHTML = `<span class="text-success">Recrutamento concluído!</span>`;
                form.reset();
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                feedback.innerHTML = `<span class="text-danger">Erro: ${err.message}</span>`;
            } finally {
                isSubmittingForm = false;
                btn.disabled = false;
                btn.innerHTML = "ALISTAR-SE";
            }
        });
    }
});
