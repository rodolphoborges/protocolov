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

let esquadraoWingman = []; // Fila de Reserva
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
    playersData.forEach(p => {
        if (p.updated_at) {
            const pDate = new Date(p.updated_at);
            if (!lastUpdated || pDate > lastUpdated) lastUpdated = pDate;
        }
    });

    const statusEl = document.getElementById('last-updated-status');
    if (statusEl && lastUpdated) {
        const diffMins = Math.floor((new Date() - lastUpdated) / 60000);
        const timeText = diffMins <= 0 ? "agora mesmo" : `há ${diffMins} min`;
        statusEl.innerHTML = `<span class="badge rounded-0 bg-dark border border-secondary text-muted px-3 py-2" style="font-family: 'Teko', sans-serif; font-size: 1.1rem; letter-spacing: 1px;">Sincronizado ${timeText}</span>`;
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

    } catch (error) {
        console.error('Falha ao carregar dados:', error);
        document.getElementById('squads-container').innerHTML = `
            <div class="alert rounded-0 alert-danger border-danger text-center fw-bold" style="background-color: transparent;">
                A carregar sistema ou base de dados vazia. Tente recarregar.
            </div>`;
    }
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
                    
                    if (k2 !== k1) return k2 - k1; // 1. Mais Kills
                    if (d1 !== d2) return d1 - d2; // 2. Menos Deaths
                    return a2 - a1;                // 3. Mais Assists
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

function createPlayerCardHTML(player, isWaiting = false, themeClass = '') {
    const safeCard = safeUrl(player.card_url, 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png');
    const safeTracker = safeUrl(player.tracker_link, '#');
    const safeRankIcon = safeUrl(player.current_rank_icon, '');
    const safePeakIcon = safeUrl(player.peak_rank_icon, '');

    let warningBadge = player.api_error ? `<span class="badge bg-warning text-dark ms-2 rounded-0">⚠️ OFF</span>` : '';
    let loneWolfBadge = player.lone_wolf ? `<span class="badge ms-2 text-dark bg-secondary rounded-0" style="background-color: #768079 !important;" title="Jogou as últimas ranqueadas totalmente solo.">🐺 LOBO</span>` : '';
    let dmBadge = player.dm_score > 0 ? `<span class="badge border border-danger text-danger ms-2 rounded-0" style="background-color: rgba(255, 70, 85, 0.1);" title="Pontos de Treino (Mata-Mata)">🎯 ${player.dm_score}</span>` : '';
    let opaqueClass = player.lone_wolf ? 'opaque-rank' : '';

    let unitBadge = '';
    if (player.unit === 'ALPHA') {
        unitBadge = `<span class="badge rounded-0 border border-info text-info ms-2" style="background-color: rgba(0, 140, 186, 0.1);" title="SQUAD ALPHA"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="me-1 mb-1"><path d="M12 2L2 22h20L12 2zm0 4.5l6.5 13h-13L12 6.5z"/></svg>ALPHA</span>`;
    } else if (player.unit === 'OMEGA') {
        unitBadge = `<span class="badge rounded-0 border border-danger text-danger ms-2" style="background-color: rgba(255, 70, 85, 0.1);" title="SQUAD ÔMEGA"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="me-1 mb-1"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>ÔMEGA</span>`;
    } else {
        unitBadge = `<span class="badge rounded-0 border border-warning text-warning ms-2" style="background-color: rgba(255, 206, 86, 0.1);" title="ESQUADRÃO WINGMAN"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="me-1 mb-1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>WINGMAN</span>`;
    }

    const eloHTML = safeRankIcon ? `<img src="${safeRankIcon}" alt="${player.currentRank}" class="${opaqueClass}" style="width: 20px; height: 20px;"> <span class="${opaqueClass}">${player.currentRank}</span>` : `<span class="${opaqueClass}">${player.currentRank}</span>`;
    const peakHTML = safePeakIcon ? `<img src="${safePeakIcon}" alt="${player.peak_rank}" class="${opaqueClass}" style="width: 20px; height: 20px;"> <span class="${opaqueClass}">${player.peak_rank}</span>` : `<span class="${opaqueClass}">${(player.peak_rank || 'Sem Rank')}</span>`;

    const synergyPoints = player.synergy_score || 0;
    let synergyBadge = '';
    if (synergyPoints > 10) {
        synergyBadge = `<span class="badge bg-danger ms-2 rounded-0" title="Jogador muito ativo com a comunidade">🔥 SN: ${synergyPoints}</span>`;
    } else if (synergyPoints > 0) {
        synergyBadge = `<span class="badge bg-secondary ms-2 rounded-0" title="Partidas jogadas em grupo">🤝 SN: ${synergyPoints}</span>`;
    }

    const wrapperStart = isWaiting ? '<div class="col-md-6">' : '<div>';
    const wrapperEnd = isWaiting ? '</div>' : '</div>';

    return `
        ${wrapperStart}
            <div class="player-card ${isWaiting ? 'is-waiting' : ''} ${themeClass}">
                <img src="${safeCard}" class="player-avatar" onerror="this.onerror=null; this.src='https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png';">
                <div class="flex-grow-1">
                    <div class="fw-bold text-white mb-2 d-flex align-items-center flex-wrap gap-1" style="font-size: 1rem; line-height: 1;">
                        <span class="user-select-all text-uppercase" style="cursor: pointer; letter-spacing: 0.5px;" onclick="window.copyRiotId(this, '${player.riotId}')" title="Clique para copiar e adicionar no Valorant" aria-label="Copiar ID ${player.riotId}">
                            ${player.riotId} <span class="fs-6 text-muted" aria-hidden="true">📋</span>
                        </span>
                        <span class="badge bg-secondary ms-1 rounded-0" style="font-size: 0.6rem;">LVL ${player.level || '--'}</span>
                        ${unitBadge}
                        ${synergyBadge}
                        ${dmBadge}
                        ${loneWolfBadge}
                        ${warningBadge}
                    </div>
                    <div class="d-flex gap-4 mt-2">
                        <div><div class="stat-label">Elo Atual</div><div class="stat-val d-flex align-items-center gap-2">${eloHTML}</div></div>
                        <div><div class="stat-label">Rank Máximo</div><div class="stat-val text-accent d-flex align-items-center gap-2">${peakHTML}</div></div>
                    </div>
                </div>
                <div class="ms-auto pe-2">
                    <a href="${safeTracker}" target="_blank" class="btn btn-sm btn-outline-secondary rounded-0 border-0" title="Ver no Tracker.gg" aria-label="Ver perfil de ${player.riotId} no Tracker.gg">
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="var(--val-gray)" viewBox="0 0 16 16">
                          <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5"/>
                          <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/>
                        </svg>
                    </a>
                </div>
            </div>
        ${wrapperEnd}`;
}

function renderOperations(operations, append = false) {
    const section = document.getElementById('operations-section');
    const container = document.getElementById('operations-container');
    
    section.style.display = 'block';

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

function renderSquads() {
    const container = document.getElementById('squads-container');
    let fullHTML = '';

    for (const [unit, data] of Object.entries(squadsConfig)) {
        let playersHTML = '';
        let count = 0;
        
        for (const [role, player] of Object.entries(data.roles)) {
            if (player) {
                playersHTML += `<div class="mb-3"><span class="badge bg-dark border border-secondary mb-1">${role}</span>${createPlayerCardHTML(player, false, data.theme)}</div>`;
                count++;
            } else {
                playersHTML += `<div class="mb-3"><span class="badge bg-dark border border-secondary mb-1 text-muted">${role}</span>
                                <div class="player-card opaque-rank d-flex align-items-center justify-content-center" style="height: 94px; border: 1px dashed var(--val-gray);">
                                    <span class="text-muted fw-bold">VAGA DISPONÍVEL</span>
                                </div></div>`;
            }
        }

        fullHTML += `
            <div class="row align-items-start role-row mb-5">
                <div class="col-md-4 mb-4 mb-md-0">
                    <h3 class="role-title ${unit === 'ALPHA' ? 'text-info' : 'text-danger'}">${data.title}</h3>
                    <p class="mb-0 text-muted small mt-2" style="max-width: 90%;">${data.desc}</p>
                    <div class="mt-4 border-start border-4 ${unit === 'ALPHA' ? 'border-info' : 'border-danger'} ps-3">
                        <span class="fs-4 fw-bold font-monospace">${count}/5</span><br>
                        <span class="text-uppercase small text-muted">Prontidão de Combate</span>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="d-flex flex-column gap-2">${playersHTML}</div>
                </div>
            </div>`;
    }

    if (esquadraoWingman.length > 0) {
        let wingmanHTML = esquadraoWingman.map(p => createPlayerCardHTML(p, true, 'wingman-theme')).join('');
        fullHTML += `
            <div class="waitlist-section p-4 mb-5" style="background-color: rgba(190, 243, 62, 0.05); border: 1px solid rgba(190, 243, 62, 0.2);">
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
                    <div>
                        <h3 class="role-title" style="color: #bef33e;">UNIDADE WINGMAN</h3>
                        <p class="text-muted small mb-0">Mobilização rápida via Agente 22 - Gekko. Força de suporte aguardando ordens para inserção imediata.</p>
                    </div>
                    <span class="badge rounded-0 mt-3 mt-md-0" style="background-color: #bef33e; color: var(--val-dark); font-family: 'Inter', sans-serif; font-weight: 800;">${esquadraoWingman.length} AGENTES NA ESCUTA</span>
                </div>
                <div class="row g-3">${wingmanHTML}</div>
            </div>`;
}

    container.innerHTML = fullHTML;
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
        loadMoreBtn.addEventListener('click', () => {
            fetchOperations(true);
        });
    }

    const form = document.getElementById('recrutamento-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isSubmittingForm) return; 
            isSubmittingForm = true;

            const riotId = document.getElementById('riotIdInput').value.trim();
            
            const role = document.getElementById('roleInput').value;
          //  const unit = document.getElementById('unitInput').value;
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
                feedback.innerHTML = `<span class="text-success">Inscrição recebida! Aguarde a atualização (até 30m).</span>`;
                form.reset();
                fetchCachedData();
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
