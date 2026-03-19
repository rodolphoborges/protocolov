const supabaseUrl = window.ProtocolConfig.supabase.url;
const supabaseAnonKey = window.ProtocolConfig.supabase.anonKey;
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const squadsConfig = window.ProtocolConfig.ui.squads;

let esquadraoWingman = []; // Fila de Reserva
let opsOffset = 0;
const OPS_PER_PAGE = window.ProtocolConfig.ui.opsPerPage;
let isFetchingOps = false;
let isSubmittingForm = false; 
let mapImages = {};

async function fetchMapData() {
    try {
        const res = await fetch('https://valorant-api.com/v1/maps');
        const data = await res.json();
        if (data && data.data) {
            data.data.forEach(m => {
                mapImages[m.displayName.toUpperCase()] = m.splash;
            });
        }
    } catch (e) { console.error("⚠️ Falha ao carregar satélite orbital de mapas:", e); }
}
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
        if (lastUpdated) {
            const diffMins = Math.floor((new Date() - lastUpdated) / 60000);
            const timeText = diffMins <= 0 ? "agora mesmo" : `há ${diffMins} min`;
            statusEl.innerHTML = `<span class="badge rounded-0 bg-dark border border-secondary text-muted px-3 py-2" style="font-family: 'Teko', sans-serif; font-size: 1.1rem; letter-spacing: 1px;">Sincronizado ${timeText}</span>`;
        } else {
            statusEl.innerHTML = `<span class="badge rounded-0 bg-dark border border-secondary text-muted px-3 py-2" style="font-family: 'Teko', sans-serif; font-size: 1.1rem; letter-spacing: 1px;">SINCRO: ${new Date().toLocaleTimeString()}</span>`;
        }
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
        
        // Busca de Sinalizadores Ativos no Radar
        const now = Date.now();
        const { data: calls } = await supabaseClient.from('active_calls')
            .select('*')
            .gt('expires_at', now)
            .order('expires_at', { ascending: false })
            .limit(1);
        
        const banner = document.getElementById('lobby-banner');
        if (calls && calls.length > 0 && banner) {
            const call = calls[0];
            document.getElementById('lobby-commander-text').innerText = `${escapeHtml(call.commander)} ESTÁ A FORMAR ESQUADRÃO`;
            
            const codeEl = document.getElementById('lobby-code-text');
            
            // NOVO: Separa a exibição. Se for código, vira um botão de Cópia Limpa.
            if (call.party_code === 'Solicite invite no Telegram') {
                codeEl.innerHTML = `<span>${escapeHtml(call.party_code)}</span>`;
            } else {
                codeEl.innerHTML = `<span class="user-select-all" style="cursor: pointer; text-decoration: underline dashed; text-underline-offset: 4px; color: #fff;" onclick="window.copyRiotId(this, '${escapeHtml(call.party_code)}')">${escapeHtml(call.party_code)} <span class="fs-6 text-muted" aria-hidden="true" style="text-decoration: none;">📋</span></span>`;
            }
            
            banner.style.display = 'block';

            // NOVO: Adicionar contador de tempo
            if (window.lobbyTimerInterval) clearInterval(window.lobbyTimerInterval);
            const timerEl = document.getElementById('lobby-timer');
            
            if (timerEl) {
                const updateTimer = () => {
                    const timeLeft = call.expires_at - Date.now();
                    if (timeLeft <= 0) {
                        clearInterval(window.lobbyTimerInterval);
                        banner.style.display = 'none';
                    } else {
                        const mins = Math.floor(timeLeft / 60000);
                        const secs = Math.floor((timeLeft % 60000) / 1000);
                        timerEl.innerText = `(${mins}m ${secs}s)`;
                    }
                };
                updateTimer();
                window.lobbyTimerInterval = setInterval(updateTimer, 1000);
            }

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
    const isReserve = isWaiting && player.unit !== 'WINGMAN'; // WINGMAN é o valor interno para APOIO
    
    if (player.unit === 'ALPHA') {
        const badgeLabel = isReserve ? 'RESERVA ALPHA' : 'ALPHA';
        unitBadge = `<span class="badge rounded-0 border border-info text-info ms-2" style="background-color: rgba(0, 140, 186, 0.1);" title="SQUAD ALPHA"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="me-1 mb-1"><path d="M12 2L2 22h20L12 2zm0 4.5l6.5 13h-13L12 6.5z"/></svg>${badgeLabel}</span>`;
    } else if (player.unit === 'OMEGA') {
        const badgeLabel = isReserve ? 'RESERVA ÔMEGA' : 'ÔMEGA';
        unitBadge = `<span class="badge rounded-0 border border-danger text-danger ms-2" style="background-color: rgba(255, 70, 85, 0.1);" title="SQUAD ÔMEGA"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="me-1 mb-1"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>${badgeLabel}</span>`;
    } else {
        unitBadge = `<span class="badge rounded-0 border border-secondary text-secondary ms-2" style="background-color: rgba(100, 116, 139, 0.1);" title="RESIDUAL: DEPÓSITO DE TORRETAS"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" class="me-1 mb-1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>TORRETA</span>`;
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
                    <div class="d-flex gap-4 mt-2 mb-2">
                        <div><div class="stat-label">Elo Atual</div><div class="stat-val d-flex align-items-center gap-2">${eloHTML}</div></div>
                        <div><div class="stat-label">Rank Máximo</div><div class="stat-val text-accent d-flex align-items-center gap-2">${peakHTML}</div></div>
                    </div>
                    <div class="d-flex gap-4 mt-2 pt-2 border-top border-secondary border-opacity-25" style="font-family: 'Teko', sans-serif; letter-spacing: 0.5px;">
                        <div>
                            <div class="text-uppercase" style="color: #b0b8b4; font-size: 0.75rem; line-height: 1;">[AGENTE MAIS JOGADO]</div>
                            <div id="intel-agent-${player.riot_id.replace(/[^a-zA-Z0-9]/g, '')}" class="text-light mt-1 d-flex align-items-center gap-1" style="font-size: 1.1rem; line-height: 1.2;">
                                <span class="spinner-grow spinner-grow-sm text-secondary" role="status" style="width: 0.6rem; height: 0.6rem;"></span> SEM DADOS
                            </div>
                        </div>
                        <div>
                            <div class="text-uppercase" style="color: #b0b8b4; font-size: 0.75rem; line-height: 1;">[TAXA DE HEADSHOT]</div>
                            <div id="intel-hs-${player.riot_id.replace(/[^a-zA-Z0-9]/g, '')}" class="text-danger mt-1" style="font-size: 1.1rem; line-height: 1.2;">
                                <span class="spinner-grow spinner-grow-sm text-secondary" role="status" style="width: 0.6rem; height: 0.6rem;"></span> --%
                            </div>
                        </div>
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

        const mapUrl = mapImages[op.map.toUpperCase()] || '';
        const bgStyle = mapUrl ? `background-image: url('${mapUrl}');` : '';

        html += `
            <a href="https://tracker.gg/valorant/match/${op.id}" target="_blank" aria-label="Ver detalhes da partida ${op.map} no Tracker.gg" class="text-decoration-none mission-row ${resultClass} p-3 p-md-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-4" style="color: inherit; display: block; ${bgStyle}">
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
            <div class="row align-items-stretch role-row mb-5">
                <div class="col-md-4 mb-4 mb-md-0 position-relative p-4" style="background-color: ${data.commanderBg}; border: 1px dashed rgba(255,255,255,0.05); overflow: hidden; min-height: 380px;">
                    <img src="${data.commanderImg}" style="position: absolute; top: 0; right: 0; width: 100%; height: 100%; object-fit: cover; object-position: center top; opacity: 0.20; pointer-events: none; filter: grayscale(80%);" alt="Comandante">
                    <div class="position-relative z-1">
                        <h3 class="role-title ${unit === 'ALPHA' ? 'text-info' : 'text-danger'}">${data.title}</h3>
                        <p class="mb-0 text-muted mt-3" style="font-size: 1.05rem; line-height: 1.4;">${data.desc}</p>
                        <div class="mt-5 border-start border-4 ${unit === 'ALPHA' ? 'border-info' : 'border-danger'} ps-3">
                            <span class="fs-4 fw-bold font-monospace text-light">${count}/5</span><br>
                            <span class="text-uppercase small text-muted">Prontidão de Combate</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-8 ps-md-4">
                    <div class="d-flex flex-column gap-2">${playersHTML}</div>
                </div>
            </div>`;
    }

    if (esquadraoWingman.length > 0) {
        let wingmanHTML = esquadraoWingman.map(p => createPlayerCardHTML(p, true, 'wingman-theme')).join('');
        fullHTML += `
            <div class="waitlist-section p-4 mb-5 position-relative" style="background-color: rgba(100, 116, 139, 0.05); border: 1px solid rgba(100, 116, 139, 0.2); background-image: radial-gradient(var(--val-gray) 1px, transparent 1px); background-size: 20px 20px; overflow: hidden;">
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 position-relative z-1">
                    <div>
                        <h3 class="role-title" style="color: #64748b;">DEPÓSITO DE TORRETAS</h3>
                        <p class="text-muted small mb-0">Unidade de suporte e prontidão. Agentes auxiliares em espera para cobertura tática e reforço dos esquadrões de elite.</p>
                    </div>
                    <span class="badge rounded-0 mt-3 mt-md-0" style="background-color: #bef33e; color: var(--val-dark); font-family: 'Inter', sans-serif; font-weight: 800;">${esquadraoWingman.length} AGENTES NA ESCUTA</span>
                </div>
                <div class="row g-3 position-relative z-1">${wingmanHTML}</div>
            </div>`;
    }

    container.innerHTML = fullHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
    await fetchMapData();
    fetchCachedData();
    setInterval(fetchCachedData, 300000); // Mantém a atualização a cada 5 minutos
    
    fetchIntelData();
    setInterval(fetchIntelData, 300000); // Atualiza métricas complexas a cada 5 mins
    
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.02 };
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

    // Fail-Safe: Se após 2 segundos alguma seção crítica ainda estiver invisível, forçar aparição
    setTimeout(() => {
        sections.forEach(s => {
            if (!s.classList.contains('is-visible')) {
                s.classList.add('is-visible');
            }
        });
    }, 2000);
    
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
                    unit: 'UNIDADE DE APOIO',
                    current_rank: 'Processando...' 
                }]);
                
                if (error) {
                    if (error.code === '23505') throw new Error("Este Riot ID já está na base!");
                    throw error;
                }
                
                // Feedback rápido e redirecionamento para o Briefing
                feedback.innerHTML = `<span class="text-success">Criptografia aceita. Redirecionando para o QG...</span>`;
                form.reset();
                
                setTimeout(() => { 
                    window.location.href = 'briefing.html'; 
                }, 1500);

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

async function fetchIntelData() {
    try {
        const { data, error } = await supabaseClient
            .from('operations')
            .select(`*, operation_squads(riot_id, agent, agent_img, kda, hs_percent)`)
            .neq('mode', 'Deathmatch') 
            .order('started_at', { ascending: false })
            .limit(50); // Últimas 50 operações do clã

        if (error) throw error;
        
        let mapCounts = {};
        let mapWins = {};
        let playerStats = {}; 
        let tacticalAlerts = [];
        
        const { data: pData } = await supabaseClient.from('players').select('riot_id, lone_wolf, synergy_score, updated_at');
        if (pData) {
            pData.forEach(p => {
                if (p.lone_wolf) {
                    tacticalAlerts.push({ 
                        name: p.riot_id.split('#')[0], 
                        reason: 'SOLO QUEUE', 
                        info: 'Detectado fora do grupo' 
                    });
                } else if (p.synergy_score === 0) {
                    tacticalAlerts.push({ 
                        name: p.riot_id.split('#')[0], 
                        reason: 'ESTAGNADO', 
                        info: 'Sinergia Zero' 
                    });
                }
            });
        }

        if (data && data.length > 0) {
            data.forEach(op => {
                // Dominância de Mapas
                if (!mapCounts[op.map]) { mapCounts[op.map] = 0; mapWins[op.map] = 0; }
                mapCounts[op.map]++;
                if (op.result === 'VITÓRIA') mapWins[op.map]++;
                
                op.operation_squads.forEach(sq => {
                    const htmlId = sq.riot_id.replace(/[^a-zA-Z0-9]/g, '');
                    if (!playerStats[htmlId]) {
                        playerStats[htmlId] = { kills: 0, deaths: 0, ops: 0, hsTotal: 0, agents: {} };
                    }
                    
                    playerStats[htmlId].ops++;
                    
                    if (sq.hs_percent) playerStats[htmlId].hsTotal += sq.hs_percent;
                    
                    if (sq.kda) {
                        const [k, d] = sq.kda.split('/').map(Number);
                        playerStats[htmlId].kills += k;
                        playerStats[htmlId].deaths += d;
                    }
                    
                    if (sq.agent) {
                        if (!playerStats[htmlId].agents[sq.agent]) {
                            playerStats[htmlId].agents[sq.agent] = { count: 0, img: sq.agent_img };
                        }
                        playerStats[htmlId].agents[sq.agent].count++;
                    }
                });
            });
            
            // UI - Zonas de Domínio
            const nowTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const syncInfo = document.getElementById('intel-sync-info');
            if (syncInfo) syncInfo.innerText = `SINC: ${nowTime}`;

            let bestMap = 'N/A';
            let bestMapWinrate = 0;
            let bestMapPlays = 0;
            Object.keys(mapCounts).forEach(m => {
                if (mapCounts[m] >= 3) {
                    const wr = (mapWins[m] / mapCounts[m]) * 100;
                    if (wr > bestMapWinrate || (wr === bestMapWinrate && mapCounts[m] > bestMapPlays)) {
                        bestMapWinrate = wr;
                        bestMapPlays = mapCounts[m];
                        bestMap = m;
                    }
                }
            });
            
            const mapEl = document.getElementById('intel-map-data');
            if (mapEl) {
                if (bestMap !== 'N/A') {
                    mapEl.innerHTML = `<span class="text-light">${bestMap.toUpperCase()}</span> &mdash; <span class="${bestMapWinrate >= 50 ? 'text-success' : 'text-danger'}">${bestMapWinrate.toFixed(0)}% WINRATE</span>`;
                } else {
                    mapEl.innerHTML = `<span class="text-muted">A aguardar missões táticas...</span>`;
                }
            }

            // UI - Operador de Elite (MVP)
            let mvp = 'N/A';
            let bestKd = 0;
            Object.keys(playerStats).forEach(htmlId => {
                const ps = playerStats[htmlId];
                if (ps.ops >= 3) { 
                    const kd = ps.deaths === 0 ? ps.kills : (ps.kills / ps.deaths);
                    if (kd > bestKd) {
                        bestKd = kd;
                        mvp = htmlId; 
                    }
                }
            });
            
            const mvpEl = document.getElementById('intel-mvp-data');
            if (mvpEl) {
                if (mvp !== 'N/A') {
                    const p = pData ? pData.find(x => x.riot_id.replace(/[^a-zA-Z0-9]/g, '') === mvp) : null;
                    const displayMvp = p ? p.riot_id.split('#')[0] : mvp.toUpperCase();
                    mvpEl.innerHTML = `<span class="text-light">${displayMvp}</span> &mdash; <span class="text-warning">${bestKd.toFixed(2)} K/D</span>`;
                } else {
                    mvpEl.innerHTML = `<span class="text-muted">A aguardar combatentes...</span>`;
                }
            }
            
            // Injetar dados nos Player Cards
            Object.keys(playerStats).forEach(htmlId => {
                const ps = playerStats[htmlId];
                
                let topAgent = null;
                let topAgentCount = 0;
                let topAgentImg = '';
                Object.keys(ps.agents).forEach(a => {
                    if (ps.agents[a].count > topAgentCount) {
                        topAgentCount = ps.agents[a].count;
                        topAgent = a;
                        topAgentImg = ps.agents[a].img;
                    }
                });
                
                const agentEl = document.getElementById(`intel-agent-${htmlId}`);
                if (agentEl && topAgent) {
                    agentEl.innerHTML = `<img src="${topAgentImg}" style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--val-dark);"> ${topAgent.toUpperCase()}`;
                }
                
                const hsEl = document.getElementById(`intel-hs-${htmlId}`);
                if (hsEl && ps.ops > 0) {
                    const avgHs = (ps.hsTotal / ps.ops).toFixed(1);
                    hsEl.innerHTML = `${avgHs}%`;
                }
            });
        }
        
        // UI - Alertas Táticos
        const wolvesEl = document.getElementById('intel-wolves-data');
        if (wolvesEl) {
            if (tacticalAlerts.length > 0) {
                wolvesEl.innerHTML = `
                    <div class="row row-cols-1 row-cols-sm-2 g-2">
                        ${tacticalAlerts.map(a => `
                            <div class="col">
                                <div class="p-2 border border-secondary border-opacity-10 d-flex flex-column" style="background: rgba(255,255,255,0.02);">
                                    <span class="text-light fw-bold mb-1" style="font-size: 0.85rem;">${a.name}</span>
                                    <span class="text-danger fw-bold text-uppercase" style="font-size: 0.65rem; letter-spacing: 0.5px;">${a.reason}: ${a.info}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                wolvesEl.innerHTML = `<div class="p-3 text-center border border-secondary border-opacity-10" style="background: rgba(255,255,255,0.02);">
                    <span class="text-success blink-terminal fw-bold" style="font-size: 0.8rem;">SISTEMA OPERACIONAL: NENHUM DESVIO DETECTADO</span>
                </div>`;
            }
        }
        
    } catch (error) {
        console.error('Falha na extração de Intel:', error);
    }
}

