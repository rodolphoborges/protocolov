const supabaseUrl = 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseAnonKey = 'sb_publishable_EBbK4nq9kpV0VNFmOzFEqQ_2mooasVD';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const squadsConfig = {
    'ALPHA': { 
        title: 'UNIDADE ALPHA', 
        desc: 'Sob o comando da Agente 02 - Viper. Precisão química e controle tático absoluto.', 
        theme: 'alpha-theme',
        roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null } 
    },
    'OMEGA': { 
        title: 'UNIDADE ÔMEGA', 
        desc: 'Sob o comando do Agente 01 - Brimstone. Força de elite e suporte orbital.', 
        theme: 'omega-theme',
        roles: { 'Controlador': null, 'Duelista': null, 'Iniciador': null, 'Sentinela': null, 'Flex': null } 
    }
};

let esquadraoWingman = []; // Fila de Reserva e Agentes Excedentes
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
            .order('synergy_score', { ascending: false }); // Prioridade por Sinergia

        if (playersError) throw playersError;

        // Resetar estruturas para nova renderização
        Object.keys(squadsConfig).forEach(u => {
            Object.keys(squadsConfig[u].roles).forEach(r => squadsConfig[u].roles[r] = null);
        });
        esquadraoWingman = [];

        playersData.forEach(player => {
            const unit = player.unit?.toUpperCase();
            const role = player.role_raw;

            // Lógica de Alocação Tática: Apenas 1 por função nas unidades de elite
            if ((unit === 'ALPHA' || unit === 'OMEGA') && squadsConfig[unit].roles[role] === null) {
                squadsConfig[unit].roles[role] = player;
            } else {
                // Se a vaga estiver ocupada ou for unidade Wingman, vai para a lista geral de reserva
                esquadraoWingman.push(player);
            }
        });

        renderSquads();
        updateLastSyncTime();
        
    } catch (err) {
        console.error("Erro ao processar dados táticos:", err);
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

        container.innerHTML += `
            <div class="col-md-6 mb-4">
                <div class="card bg-black border-secondary h-100 squad-card ${config.theme}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <h3 class="t-valorant text-white">${config.title}</h3>
                            <span class="badge bg-dark border border-secondary text-muted" style="font-size:0.6rem">STATUS: ATIVO</span>
                        </div>
                        <p class="small text-muted mb-4" style="font-size: 0.85rem; height: 40px;">${config.desc}</p>
                        <div class="roles-grid">${rolesHtml}</div>
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
                    <div class="small text-muted text-uppercase" style="font-size: 0.6rem; letter-spacing:1px;">${role}</div>
                    <div class="text-secondary small">AGUARDANDO...</div>
                </div>
            </div>`;
    }
    return `
        <div class="d-flex align-items-center mb-3">
            <img src="${safeUrl(player.card_url, 'https://media.valorant-api.com/playercards/default/smallart.png')}" class="player-mini-card me-3 border border-secondary">
            <div>
                <div class="small text-info fw-bold" style="font-size:0.65rem; letter-spacing:1px;">${role.toUpperCase()}</div>
                <div class="t-valorant text-white" style="font-size:1.1rem">${escapeHtml(player.riot_id.split('#')[0])}</div>
                <div class="d-flex align-items-center gap-2 mt-1">
                    <img src="${player.current_rank_icon}" width="14" onerror="this.style.display='none'">
                    <span class="small text-muted" style="font-size: 0.75rem;">${player.current_rank}</span>
                </div>
            </div>
        </div>`;
}

function renderWingman() {
    const list = document.getElementById('wingman-list');
    if (!list) return;

    if (esquadraoWingman.length === 0) {
        list.innerHTML = '<div class="col-12 text-center text-muted py-4">Nenhum agente na reserva orbital.</div>';
        return;
    }

    list.innerHTML = esquadraoWingman.map(p => {
        // CORREÇÃO VISUAL: Identifica agentes que estão na Wingman mas pertencem a outra unidade
        const isReservaElite = p.unit !== 'WINGMAN';
        const statusLabel = isReservaElite ? `RESERVA ${p.unit}` : 'AGENTE WINGMAN';
        const badgeColor = isReservaElite ? 'var(--val-red)' : 'var(--val-gray)';

        return `
        <div class="col-lg-4 col-md-6 mb-3">
            <div class="card bg-dark border-secondary player-card is-waiting">
                <div class="card-body d-flex align-items-center p-2">
                    <img src="${safeUrl(p.card_url, '')}" class="wingman-thumb me-3" style="width: 45px; height: 45px; border-radius: 2px;">
                    <div class="overflow-hidden">
                        <div class="text-white text-truncate fw-bold small" style="letter-spacing:0.5px;">${escapeHtml(p.riot_id)}</div>
                        <div class="d-flex align-items-center gap-2">
                             <span class="badge rounded-0" style="font-size: 0.55rem; background-color: ${badgeColor};">${statusLabel}</span>
                             <span class="text-muted" style="font-size: 0.6rem;">${p.role_raw}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function updateLastSyncTime() {
    const el = document.getElementById('last-updated-status');
    if (el) el.innerHTML = `<span class="badge bg-dark text-muted px-3 py-2 border border-secondary">SINCRO: ${new Date().toLocaleTimeString()}</span>`;
}

// Inicialização e Eventos
document.addEventListener('DOMContentLoaded', () => {
    fetchCachedData();
    setInterval(fetchCachedData, 300000); // 5 min

    const form = document.getElementById('recruitment-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmittingForm) return;
            isSubmittingForm = true;

            const btn = form.querySelector('button');
            const riotId = document.getElementById('riotId').value.trim();
            const role = document.getElementById('role').value;
            const feedback = document.getElementById('form-feedback');

            if (!riotId.includes('#')) {
                feedback.innerHTML = `<span class="text-warning">Formato inválido. Use Nome#TAG.</span>`;
                isSubmittingForm = false;
                return;
            }

            btn.disabled = true; btn.innerHTML = "A ENVIAR...";
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
                feedback.innerHTML = `<span class="text-danger">Erro: ${err.message}</span>`;
            } finally {
                setTimeout(() => { 
                    btn.disabled = false; btn.innerHTML = "ALISTAR-SE";
                    isSubmittingForm = false;
                }, 2000);
            }
        });
    }
});
