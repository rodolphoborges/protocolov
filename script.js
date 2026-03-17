const supabaseUrl = 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseAnonKey = 'sb_publishable_EBbK4nq9kpV0VNFmOzFEqQ_2mooasVD';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// ESTRUTURA ATUALIZADA: Agora com suporte para excedentes (support: [])
const squadsConfig = {
    'ALPHA': { 
        title: 'UNIDADE ALPHA', 
        desc: 'Sob o comando da Agente 02 - Viper. Precisão química e controle tático absoluto.', 
        theme: 'alpha-theme',
        roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null },
        support: [] 
    },
    'OMEGA': { 
        title: 'UNIDADE ÔMEGA', 
        desc: 'Sob o comando do Agente 01 - Brimstone. Força de elite e suporte orbital.', 
        theme: 'omega-theme',
        roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null },
        support: []
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

        // Limpa as unidades para reprocessar
        Object.keys(squadsConfig).forEach(u => {
            Object.keys(squadsConfig[u].roles).forEach(r => squadsConfig[u].roles[r] = null);
            squadsConfig[u].support = [];
        });
        esquadraoWingman = [];

        playersData.forEach(player => {
            const unit = player.unit?.toUpperCase();
            const role = player.role_raw;

            if (unit === 'ALPHA' || unit === 'OMEGA') {
                // Se a role estiver vaga, ocupa. Se não, vai para o suporte daquela unidade específica.
                if (squadsConfig[unit].roles[role] === null) {
                    squadsConfig[unit].roles[role] = player;
                } else {
                    squadsConfig[unit].support.push(player);
                }
            } else {
                // Se for WINGMAN ou nulo, vai para a Wingman geral
                esquadraoWingman.push(player);
            }
        });

        renderSquads();
        updateLastSyncTime(playersData);
        opsOffset = 0;
        await fetchOperations(false);

    } catch (err) {
        console.error("Erro Geral:", err);
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

        // HTML para os reservas/suportes da unidade (onde o Vituxo vai aparecer se a vaga principal sumir)
        let supportHtml = '';
        if (config.support.length > 0) {
            supportHtml = `<div class="mt-3 border-top border-dark pt-2">
                <p class="text-muted small mb-1" style="letter-spacing:1px">RESERVAS OPERACIONAIS:</p>
                ${config.support.map(p => `
                    <div class="d-flex justify-content-between small text-white-50 mb-1">
                        <span>${escapeHtml(p.riot_id)}</span>
                        <span class="text-info" style="font-size: 0.7rem;">${p.role_raw.toUpperCase()}</span>
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
                <div>
                    <div class="small text-uppercase fw-bold text-muted">${role}</div>
                    <div class="text-secondary" style="font-size: 0.8rem;">ESPERANDO AGENTE...</div>
                </div>
            </div>`;
    }

    const cardImg = safeUrl(player.card_url, 'https://media.valorant-api.com/playercards/default/smallart.png');

    return `
        <div class="d-flex align-items-center mb-3">
            <img src="${cardImg}" class="player-mini-card me-3 border border-secondary" alt="Card">
            <div>
                <div class="small text-uppercase fw-bold text-info" style="font-size: 0.7rem;">${role}</div>
                <div class="t-valorant text-white" style="font-size: 1.1rem;">${escapeHtml(player.riot_id)}</div>
                <div class="d-flex align-items-center gap-2 mt-1">
                    <img src="${player.current_rank_icon}" width="16" alt="Rank">
                    <span class="small text-muted" style="font-size: 0.8rem;">${player.current_rank}</span>
                </div>
            </div>
        </div>`;
}

function renderWingman() {
    const list = document.getElementById('wingman-list');
    if (!list) return;
    list.innerHTML = '';

    esquadraoWingman.forEach(p => {
        list.innerHTML += `
            <div class="col-lg-4 col-md-6 mb-3">
                <div class="card bg-dark border-secondary hover-wingman">
                    <div class="card-body d-flex align-items-center p-2">
                        <img src="${p.card_url}" class="wingman-thumb me-3" alt="Card">
                        <div class="overflow-hidden">
                            <div class="text-white text-truncate fw-bold" style="font-size: 0.85rem;">${escapeHtml(p.riot_id)}</div>
                            <div class="text-warning small" style="font-size: 0.7rem;">UNIDADE WINGMAN</div>
                        </div>
                    </div>
                </div>
            </div>`;
    });
}

// --- HISTÓRICO DE OPERAÇÕES ---
async function fetchOperations(append = false) {
    if (isFetchingOps) return;
    isFetchingOps = true;
    
    const btn = document.getElementById('load-more-ops');
    if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

    try {
        const { data, error } = await supabaseClient
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false })
            .range(opsOffset, opsOffset + OPS_PER_PAGE - 1);

        if (error) throw error;

        const container = document.getElementById('ops-container');
        if (!append) container.innerHTML = '';

        data.forEach(match => {
            const date = new Date(match.created_at).toLocaleDateString('pt-BR');
            const statusClass = match.result === 'VITÓRIA' ? 'text-success' : 'text-danger';
            
            container.innerHTML += `
                <div class="op-item border-bottom border-dark py-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <span class="badge bg-secondary mb-2" style="font-size: 0.6rem;">ID: ${match.match_id?.substring(0,8)}</span>
                            <h5 class="t-valorant text-white mb-0">${match.mapa || 'MAPA DESCONHECIDO'}</h5>
                            <div class="small text-muted">${date} • MODO: ${match.mode || 'COMPETITIVO'}</div>
                        </div>
                        <div class="text-end">
                            <div class="fw-bold ${statusClass}">${match.result}</div>
                            <div class="text-white">${match.score || '0-0'}</div>
                        </div>
                    </div>
                </div>`;
        });

        opsOffset += OPS_PER_PAGE;
        if (data.length < OPS_PER_PAGE && btn) btn.style.display = 'none';

    } catch (err) {
        console.error("Erro Ops:", err);
    } finally {
        isFetchingOps = false;
        if (btn && btn.style.display !== 'none') btn.innerHTML = 'CARREGAR MAIS';
    }
}

// --- SINCRONIZAÇÃO ---
function updateLastSyncTime(players) {
    let last = null;
    players.forEach(p => {
        if (p.updated_at) {
            const d = new Date(p.updated_at);
            if (!last || d > last) last = d;
        }
    });

    const el = document.getElementById('last-updated-status');
    if (el && last) {
        const diff = Math.floor((new Date() - last) / 60000);
        const text = diff <= 0 ? "agora" : `há ${diff} min`;
        el.innerHTML = `<span class="badge bg-dark border border-secondary text-muted px-3 py-2">Sincronizado ${text}</span>`;
    }
}

// --- FORMULÁRIO DE RECRUTAMENTO ---
document.addEventListener('DOMContentLoaded', () => {
    fetchCachedData();
    setInterval(fetchCachedData, 300000);

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

            if (!riotId.includes('#')) {
                feedback.innerHTML = `<span class="text-warning">Formato inválido. Use Nome#TAG.</span>`;
                isSubmittingForm = false;
                return;
            }

            btn.disabled = true;
            btn.innerHTML = "A ENVIAR...";

            try {
                const { error } = await supabaseClient.from('players').insert([{ 
                    riot_id: riotId, 
                    role_raw: role, 
                    unit: 'WINGMAN',
                    current_rank: 'Processando...' 
                }]);
                
                if (error) {
                    if (error.code === '23505') throw new Error("Este Riot ID já está na base!");
                    throw error;
                }
                
                feedback.innerHTML = `<span class="text-success">Criptografia aceita. Redirecionando...</span>`;
                setTimeout(() => { window.location.href = 'briefing.html'; }, 1500);

            } catch (err) {
                feedback.innerHTML = `<span class="text-danger">${err.message}</span>`;
                isSubmittingForm = false;
                btn.disabled = false;
                btn.innerHTML = "ALISTAR-SE";
            }
        });
    }

    const loadMoreBtn = document.getElementById('load-more-ops');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => fetchOperations(true));
});
