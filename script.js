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

function updateLastSyncTime(playersData) {
    let lastUpdated = null;
    if(playersData) {
        playersData.forEach(p => {
            if (p.updated_at) {
                const pDate = new Date(p.updated_at);
                if (!lastUpdated || pDate > lastUpdated) lastUpdated = pDate;
            }
        });
    }
    const statusEl = document.getElementById('last-updated-status');
    if (statusEl) {
        if(lastUpdated) {
            const diffMins = Math.floor((new Date() - lastUpdated) / 60000);
            const timeText = diffMins <= 0 ? "agora mesmo" : `há ${diffMins} min`;
            statusEl.innerHTML = `<span class="badge rounded-0 bg-dark border border-secondary text-muted px-3 py-2" style="font-family: 'Teko', sans-serif; font-size: 1.1rem; letter-spacing: 1px;">Sincronizado ${timeText}</span>`;
        } else {
            statusEl.innerHTML = `<span class="badge rounded-0 bg-dark border border-secondary text-muted px-3 py-2" style="font-family: 'Teko', sans-serif; font-size: 1.1rem; letter-spacing: 1px;">SINCRO: ${new Date().toLocaleTimeString()}</span>`;
        }
    }
}

window.copyRiotId = function(btnElement, riotId) {
    if(navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(riotId).then(() => {
            btnElement.innerHTML = 'COPIADO! ✅';
            setTimeout(() => btnElement.innerHTML = `${riotId} <span class="fs-6 text-muted" aria-hidden="true">📋</span>`, 2000);
        }).catch(e => console.error('Erro ao copiar:', e));
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = riotId;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            btnElement.innerHTML = 'COPIADO! ✅';
            setTimeout(() => btnElement.innerHTML = `${riotId} <span class="fs-6 text-muted" aria-hidden="true">📋</span>`, 2000);
        } catch (err) {
            console.error('Falha ao copiar:', err);
        }
        document.body.removeChild(textArea);
    }
}

async function fetchCachedData() {
    try {
        const { data: playersData, error: playersError } = await supabaseClient
            .from('players')
            .select('*')
            .order('synergy_score', { ascending: false })
            .order('riot_id', { ascending: true });

        if (playersError) throw playersError;

        Object.values(squadsConfig).forEach(sq => {
            Object.keys(sq.roles).forEach(r => sq.roles[r] = null);
        });
        esquadraoWingman = [];

        playersData.forEach(player => {
            let roleRaw = player.role_raw.toLowerCase();
            let unit = player.unit || 'WINGMAN'; 
            
            player.riotId = escapeHtml(player.riot_id);
            player.currentRank = escapeHtml(player.current_rank || 'Pendente');
            
            let assigned = false;
            
            if (squadsConfig[unit]) {
                const rolesKeys = Object.keys(squadsConfig[unit].roles);
                for (let role of rolesKeys) {
                    const searchTerms = role === 'Controlador' ? ['controlador', 'smoker'] : [role.toLowerCase()];
                    if (searchTerms.some(term => roleRaw.includes(term))) {
                        if (squadsConfig[unit].roles[role] === null) {
                            squadsConfig[unit].roles[role] = player;
                            assigned = true;
                        }
                        break; 
                    }
                }
                if (!assigned && roleRaw.includes('flex') && squadsConfig[unit].roles['Flex'] === null) {
                    squadsConfig[unit].roles['Flex'] = player;
                    assigned = true;
                }
            }

            if (!assigned) {
                esquadraoWingman.push(player);
            }
        });
        
        renderSquads();
        updateLastSyncTime(playersData); 

        opsOffset = 0;
        await fetchOperations(false);
        
        // Busca de Sinalizadores
        const now = Date.now();
        const { data: calls } = await supabaseClient.from('active_calls')
            .select('*')
            .gt('expires_at', now)
            .order('expires_at', { ascending: false })
            .limit(1);
        
        const banner = document.getElementById('lobby-banner');
        if (calls && calls.length > 0 && banner) {
            document.getElementById('lobby-commander-text').innerText = `${escapeHtml(calls[0].commander)} ESTÁ A FORMAR ESQUADRÃO`;
            document.getElementById('lobby-code-text').innerText = escapeHtml(calls[0].party_code);
            banner.style.display = 'block';
        } else if (banner) {
            banner.style.display = 'none';
        }

    } catch (error) {
        console.error('Falha ao carregar dados:', error);
        document.getElementById('squads-container').innerHTML = `
            <div class="alert rounded-0 alert-danger border-danger text-center fw-bold" style="background-color: transparent;">
                A carregar sistema ou base de dados vazia. Tente recarregar.
            </div>`;
    }
}

// O VISUAL BRUTALISTA ORIGINAL RESTAURADO:
function renderSquads() {
    const container = document.getElementById('squads-container');
    if (!container) return;
    
    // Layout lado a lado para Alpha e Ômega
    let html = '<div class="row">';

    Object.entries(squadsConfig).forEach(([id, config]) => {
        let rolesHtml = '';
        Object.entries(config.roles).forEach(([roleName, player]) => {
            rolesHtml += renderPlayerSlot(roleName, player);
        });

        html += `
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
    
    html += '</div>';

    // O container da Unidade Wingman é injetado aqui dinamicamente
    html += `
        <div class="mt-5 waitlist-section p-4 mb-5" style="background-color: rgba(190, 243, 62, 0.05); border: 1px solid rgba(190, 243, 62, 0.2);">
            <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
                <div>
                    <h3 class="role-title" style="color: #bef33e;">UNIDADE WINGMAN</h3>
                    <p class="text-muted small mb-0">Mobilização rápida via Agente 22 - Gekko. Força de suporte aguardando ordens para inserção imediata.</p>
                </div>
                <span class="badge rounded-0 mt-3 mt-md-0" style="background-color: #bef33e; color: var(--val-dark); font-family: 'Inter', sans-serif; font-weight: 800;">${esquadraoWingman.length} AGENTES NA ESCUTA</span>
            </div>
            <div class="row g-3" id="wingman-list"></div>
        </div>`;

    container.innerHTML = html;
    
    // Agora o script pode encontrar o 'wingman-list' para o preencher
    renderWingman();
}

function renderPlayerSlot(role, player) {
    if (!player) {
        return `
            <div class="d-flex align-items-center mb-3 opacity-25">
                <div class="role-icon-placeholder me-3"></div>
                <div>
                    <div class="small text-muted text-uppercase" style="font-size: 0.6rem; letter-spacing:1px;">${role}</div>
                    <div class="text-secondary small">AGUARDANDO VAGA...</div>
                </div>
            </div>`;
    }
    
    let warningBadge = player.api_error ? `<span class="badge bg-warning text-dark ms-2 rounded-0" style="font-size: 0.5rem;">⚠️ OFF</span>` : '';
    let loneWolfBadge = player.lone_wolf ? `<span class="badge ms-2 text-dark bg-secondary rounded-0" style="font-size: 0.5rem; background-color: #768079 !important;" title="Lobo Solitário">🐺</span>` : '';
    let dmBadge = player.dm_score > 0 ? `<span class="badge border border-danger text-danger ms-2 rounded-0" style="font-size: 0.5rem; background-color: rgba(255, 70, 85, 0.1);" title="Pontos DM">🎯 ${player.dm_score}</span>` : '';

    return `
        <div class="d-flex align-items-center mb-3 player-slot-hover" style="transition: transform 0.2s;">
            <img src="${safeUrl(player.card_url, 'https://media.valorant-api.com/playercards/default/smallart.png')}" class="player-mini-card me-3 border border-secondary" style="width: 48px; height: 48px; object-fit: cover;">
            <div>
                <div class="small text-info fw-bold" style="font-size:0.65rem; letter-spacing:1px;">${role.toUpperCase()}</div>
                <div class="t-valorant text-white d-flex align-items-center flex-wrap" style="font-size:1.1rem; line-height: 1;">
                    <span class="user-select-all" style="cursor: pointer;" onclick="window.copyRiotId(this, '${player.riot_id}')" title="Copiar ID">${escapeHtml(player.riot_id.split('#')[0])}</span>
                    ${dmBadge}${loneWolfBadge}${warningBadge}
                </div>
                <div class="d-flex align-items-center gap-2 mt-1">
                    <img src="${player.current_rank_icon}" width="14" onerror="this.style.display='none'">
                    <span class="small text-muted" style="font-size: 0.75rem;">${player.currentRank} (SN: ${player.synergy_score || 0})</span>
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
        const isReservaElite = p.unit !== 'WINGMAN';
        const statusLabel = isReservaElite ? `RESERVA ${p.unit}` : 'AGENTE WINGMAN';
        const badgeColor = isReservaElite ? 'var(--val-red)' : 'var(--val-gray)';
        
        let warningBadge = p.api_error ? `<span class="badge bg-warning text-dark ms-1 rounded-0" style="font-size: 0.5rem;">⚠️ OFF</span>` : '';
        let loneWolfBadge = p.lone_wolf ? `<span class="badge ms-1 text-dark bg-secondary rounded-0" style="font-size: 0.5rem; background-color: #768079 !important;" title="Lobo Solitário">🐺</span>` : '';

        return `
        <div class="col-lg-4 col-md-6 mb-3">
            <div class="card bg-dark border-secondary player-card is-waiting" style="clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);">
                <div class="card-body d-flex align-items-center p-2">
                    <img src="${safeUrl(p.card_url, '')}" class="wingman-thumb me-3" style="width: 45px; height: 45px; object-fit: cover;" onerror="this.src='https://media.valorant-api.com/playercards/default/smallart.png';">
                    <div class="overflow-hidden w-100">
                        <div class="text-white text-truncate fw-bold small d-flex align-items-center" style="letter-spacing:0.5px;">
                            <span class="user-select-all" style="cursor: pointer;" onclick="window.copyRiotId(this, '${escapeHtml(p.riot_id)}')">${escapeHtml(p.riot_id.split('#')[0])}</span>
                            ${loneWolfBadge}${warningBadge}
                        </div>
                        <div class="d-flex align-items-center gap-2 mt-1">
                             <span class="badge rounded-0" style="font-size: 0.55rem; background-color: ${badgeColor};">${statusLabel}</span>
                             <span class="text-muted text-truncate" style="font-size: 0.6rem;">${p.role_raw}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function fetchOperations(append = false) {
    if (isFetchingOps) return;
    isFetchingOps = true;

    const btn = document.getElementById('load-more-ops-btn');
    if (btn && append) {
        btn.innerHTML = 'A Decodificar...';
        btn.disabled = true;
    }

    try {
        const { data, error } = await supabaseClient
            .from('operations')
            .select(`*, operation_squads(riot_id, agent, agent_img, kda, hs_percent)`)
            .neq('mode', 'Deathmatch') 
            .order('started_at', { ascending: false })
            .range(opsOffset, opsOffset + OPS_PER_PAGE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            const formattedOps = data.map(op => {
                const sortedSquad = op.operation_squads.map(sq => ({
                    riotId: sq.riot_id, agent: sq.agent, agentImg: sq.agent_img, kda: sq.kda, hs: sq.hs_percent
                })).sort((a, b) => {
                    const [k1, d1, a1] = a.kda.split('/').map(Number);
                    const [k2, d2, a2] = b.kda.split('/').map(Number);
                    
                    if (k2 !== k1) return k2 - k1;
                    if (d1 !== d2) return d1 - d2;
                    return a2 - a1;
                });

                return {
                    id: op.id, map: op.map, started_at: op.started_at, 
                    score: op.score, result: op.result, squad: sortedSquad
                };
            });
            
            renderOperations(formattedOps, append);
            opsOffset += data.length;

            const loadMoreContainer = document.getElementById('load-more-container');
            if (data.length < OPS_PER_PAGE) {
                if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            } else {
                if (loadMoreContainer) loadMoreContainer.style.display = 'block';
            }
        } else {
            const loadMoreContainer = document.getElementById('load-more-container');
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            if (!append) renderOperations([], false);
        }

    } catch (err) {
        console.error('Falha ao carregar operações:', err);
    } finally {
        isFetchingOps = false;
        if (btn) {
            btn.innerHTML = 'CARREGAR ARQUIVOS';
            btn.disabled = false;
        }
    }
}

function renderOperations(operations, append = false) {
    const section = document.getElementById('operations-section');
    const container = document.getElementById('operations-container');
    
    if (section) section.style.display = 'block';

    if(operations.length === 0 && !append) {
        container.innerHTML = `<div class="col-12"><div class="alert rounded-0 border-secondary text-dark text-center py-4 fw-bold" style="background-color: rgba(15, 25, 35, 0.05);">Nenhuma operação conjunta detetada recentemente.</div></div>`;
        return;
    }

    let innerWrapper = document.getElementById('ops-inner-wrapper');
    if (!innerWrapper || !append) {
        container.innerHTML = `<div class="col-12 d-flex flex-column gap-3" id="ops-inner-wrapper"></div>`;
        innerWrapper = document.getElementById('ops-inner-wrapper');
    }

    let html = ''; 
    
    operations.forEach(op => { 
        let resultClass = 'mission-loss';
        let resultColor = 'text-danger';

        if (op.result === 'VITÓRIA') {
            resultClass = 'mission-win';
            resultColor = 'text-success';
        } else if (op.result === 'EMPATE') {
            resultClass = 'mission-draw';
            resultColor = 'text-warning'; 
        }
        
        const date = new Date(op.started_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let squadHTML = '<div class="d-flex flex-column flex-grow-1 ms-md-auto" style="max-width: 500px;">';
        
        op.squad.forEach((m, index) => {
            const isLast = index === op.squad.length - 1;
            const borderClass = isLast ? '' : 'border-bottom border-secondary border-opacity-25';
            
            const [kills, deaths, assists] = m.kda.split('/');
            const kdaFormatted = `<span class="text-white">${kills}</span><span class="text-secondary mx-1">/</span><span class="text-danger">${deaths}</span><span class="text-secondary mx-1">/</span><span class="text-white">${assists}</span>`;

            squadHTML += `
                <div class="d-flex align-items-center justify-content-between py-2 ${borderClass}">
                    <div class="d-flex align-items-center gap-3">
                        <img src="${safeUrl(m.agentImg, '')}" class="rounded-0 border border-secondary" style="width: 32px; height: 32px; object-fit: cover;" onerror="this.onerror=null; this.src='https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png';">
                        <span class="fw-bold text-light text-truncate text-uppercase" style="max-width: 120px; font-size: 0.95rem; letter-spacing: 1px;">${escapeHtml(m.riotId.split('#')[0])}</span>
                    </div>
                    
                    <div class="d-flex align-items-center gap-4 font-monospace text-nowrap" style="font-size: 0.9rem;">
                        <div style="width: 80px;" class="text-center bg-dark rounded-0 px-2 py-1 border border-secondary border-opacity-25" aria-label="KDA: ${kills} abates, ${deaths} mortes, ${assists} assistências">${kdaFormatted}</div>
                        <div style="width: 60px;" class="text-end" style="color: #adb5bd;" aria-label="Porcentagem de Headshots: ${m.hs}%"><span class="text-light">${m.hs}%</span> <span style="font-size:0.65rem" aria-hidden="true">HS</span></div>
                    </div>
                </div>
            `;
        });
        
        squadHTML += '</div>';

        html += `
            <a href="https://tracker.gg/valorant/match/${op.id}" target="_blank" aria-label="Ver detalhes da partida ${op.map} no Tracker.gg" class="text-decoration-none mission-row ${resultClass} p-3 p-md-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-4" style="color: inherit; display: block;">
                <div class="d-flex align-items-center gap-4" style="min-width: 220px;">
                    <div class="text-center" style="width: 80px;">
                        <div class="fs-1 fw-bold ${resultColor} lh-1" style="font-family: 'Teko', sans-serif; letter-spacing: 1px;" aria-label="Placar: ${op.score}">${escapeHtml(op.score)}</div>
                        <div class="${resultColor} text-uppercase mt-2 fw-bold" style="font-size: 0.85rem; letter-spacing: 2px; opacity: 0.9;">${escapeHtml(op.result)}</div>
                    </div>
                    <div class="border-start border-secondary border-opacity-50 ps-4">
                        <div class="fs-4 fw-bold text-white lh-1 mb-2 text-uppercase" style="letter-spacing: 1px;">${escapeHtml(op.map)}</div>
                        <div class="d-flex align-items-center gap-2 fw-bold" style="font-size: 0.85rem; color: #adb5bd;">
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
                            ${date}
                        </div>
                    </div>
                </div>
                ${squadHTML}
            </a>`;
    });
    
    if (append) {
        innerWrapper.insertAdjacentHTML('beforeend', html);
    } else {
        innerWrapper.replaceChildren();
        innerWrapper.insertAdjacentHTML('beforeend', html);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchCachedData();
    
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const sections = document.querySelectorAll('.fade-in-section');
    sections.forEach(section => observer.observe(section));
    
    const loadMoreBtn = document.getElementById('load-more-ops-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => fetchOperations(true));
    }

    const form = document.getElementById('recrutamento-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmittingForm) return; 
            isSubmittingForm = true;

            const riotId = document.getElementById('riotIdInput').value.trim();
            const role = document.getElementById('roleInput').value;
            const btn = document.getElementById('submitBtn');
            const feedback = document.getElementById('formFeedback');

            if (!/^[^#]{2,16}#[a-zA-Z0-9]{3,5}$/.test(riotId)) {
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
                
                feedback.innerHTML = `<span class="text-success">Criptografia aceita. Redirecionando para o QG...</span>`;
                form.reset();
                
                setTimeout(() => { window.location.href = 'briefing.html'; }, 1500);

            } catch (err) {
                feedback.innerHTML = `<span class="text-danger">Erro: ${err.message}</span>`;
            } finally {
                setTimeout(() => { 
                    btn.disabled = false; 
                    btn.innerHTML = "ALISTAR-SE";
                    isSubmittingForm = false;
                }, 2000);
            }
        });
    }
});
