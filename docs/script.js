const supabaseUrl = window.ProtocolConfig.supabase.url;
const supabaseAnonKey = window.ProtocolConfig.supabase.anonKey;
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const oUrl = window.ProtocolConfig.oraculo ? window.ProtocolConfig.oraculo.url : '';
const oKey = window.ProtocolConfig.oraculo ? window.ProtocolConfig.oraculo.anonKey : '';
window.oraculoClient = (oUrl && !oUrl.includes('INSIRA_URL')) ? window.supabase.createClient(oUrl, oKey) : null;

const squadsConfig = window.ProtocolConfig.ui.squads;

let esquadraoWingman = []; // Fila de Reserva
let opsOffset = 0;
const OPS_PER_PAGE = window.ProtocolConfig.ui.opsPerPage;
let isFetchingOps = false;
let isSubmittingForm = false; 
let mapImages = {
    'ASCENT': 'https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/splash.png',
    'BIND': 'https://media.valorant-api.com/maps/2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba/splash.png',
    'HAVEN': 'https://media.valorant-api.com/maps/2bee0dc9-4ffe-519b-1cbd-7fbe763a6047/splash.png',
    'SPLIT': 'https://media.valorant-api.com/maps/d960549e-485c-e861-8d71-aa9d1aed12a2/splash.png',
    'ICEBOX': 'https://media.valorant-api.com/maps/e2ad5c54-4114-a870-9641-8ea21279579a/splash.png',
    'BREEZE': 'https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/splash.png',
    'FRACTURE': 'https://media.valorant-api.com/maps/b529448b-4d60-346e-e89e-00a4c527a405/splash.png',
    'PEARL': 'https://media.valorant-api.com/maps/fd267378-4d1d-484f-ff52-77821ed10dc2/splash.png',
    'LOTUS': 'https://media.valorant-api.com/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/splash.png',
    'SUNSET': 'https://media.valorant-api.com/maps/92584fbe-486a-b1b2-9faa-39b0f486b498/splash.png',
    'ABYSS': 'https://media.valorant-api.com/maps/224b0a95-48b9-f703-1bd8-67aca101a61f/splash.png'
};

// --- CONFIGURAÇÃO ORGANIC CMD ---
const urlParams = new URLSearchParams(window.location.search);
const organicPlayer = urlParams.get('player');
const organicMatchId = urlParams.get('matchId');

if (organicPlayer && organicMatchId) {
    console.log("🦾 [PROTOCOLO V] REDIRECIONANDO PARA MODO OTIMIZADO (analise.html)");
    window.location.href = `analise.html?player=${encodeURIComponent(organicPlayer)}&matchId=${organicMatchId}`;
}

async function fetchMapData() {
    const CACHE_KEY = 'vstats_maps_cache';
    const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 horas

    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_EXPIRATION) {
                data.forEach(m => { mapImages[m.displayName.toUpperCase()] = m.splash; });
                return;
            }
        }

        const res = await fetch('https://valorant-api.com/v1/maps');
        const json = await res.json();
        if (json && json.data) {
            json.data.forEach(m => { mapImages[m.displayName.toUpperCase()] = m.splash; });
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: json.data
            }));
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
            document.getElementById('lobby-commander-text').innerText = `${escapeHtml(call.commander).toUpperCase()} MOBILIZANDO ESQUADRÃO`;
            
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
            // NEW: Fetch analysis indicators from LOCAL Protocolo-V database
            const matchIds = data.map(op => op.id);
            let analysesData = [];
            const { data: localAnalyses, error: intelError } = await supabaseClient
                .from('ai_insights')
                .select('match_id, player_id')
                .in('match_id', matchIds);
            
            if (!intelError) analysesData = localAnalyses || [];
            
            const completedMap = {};
            if (analysesData && analysesData.length > 0) {
                analysesData.forEach(a => {
                    const matchId = a.match_id;
                    const tag = (a.player_id || "").toLowerCase();
                    if (!completedMap[matchId]) completedMap[matchId] = new Set();
                    completedMap[matchId].add(tag);
                });
            }

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
                    id: op.id, map_name: op.map_name, started_at: op.started_at, 
                    score: op.score, result: op.result, squad: sortedSquad
                };
            });
            
            renderOperations(formattedOps, append, completedMap);
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

function renderOperations(operations, append = false, completedMap = {}) {
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
            
            const normalizedRiotId = (m.riotId || "").toLowerCase();
            const hasAnalysis = completedMap[op.id] && completedMap[op.id].has(normalizedRiotId);
            const intelBtn = hasAnalysis 
                ? `<a href="analise.html?player=${encodeURIComponent(m.riotId)}&matchId=${op.id}" onclick="event.stopPropagation()" class="intel-mini-link" title="Análise de Missão Disponível"></a>` 
                : '';

            squadHTML += `
                <div class="d-flex flex-column py-2 ${borderClass}">
                    <div class="d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center gap-2 overflow-hidden flex-grow-1">
                            <img src="${safeUrl(m.agentImg, '')}" class="rounded-0 border border-secondary flex-shrink-0" style="width: 28px; height: 28px; object-fit: cover;" onerror="this.onerror=null; this.src='https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png';">
                            <div class="d-flex flex-row align-items-center overflow-hidden">
                                <span class="fw-bold text-light text-truncate text-uppercase" style="max-width: 80px; max-width: clamp(60px, 20vw, 120px); font-size: 0.85rem; letter-spacing: 1px;">${escapeHtml(m.riotId.split('#')[0])}</span>
                                ${intelBtn}
                            </div>
                        </div>
                        
                        <div class="d-flex align-items-center gap-2 gap-md-4 font-monospace text-nowrap" style="font-size: 0.9rem;">
                            <div class="text-start bg-dark rounded-0 px-2 py-1 border border-secondary border-opacity-25" aria-label="KDA: ${kills} abates, ${deaths} mortes, ${assists} assistências">
                                <span class="text-secondary small me-0 me-md-1">K</span><span class="text-white fw-bold me-1 me-md-2">${kills}</span>
                                <span class="text-secondary small me-0 me-md-1">D</span><span class="text-danger fw-bold me-1 me-md-2">${deaths}</span>
                                <span class="text-secondary small me-0 me-md-1">A</span><span class="text-info fw-bold">${assists}</span>
                            </div>
                            <div style="width: 50px;" class="text-end" style="color: #adb5bd;" aria-label="Porcentagem de Headshots: ${m.hs}%"><span class="text-light">${m.hs}%</span> <span style="font-size:0.65rem" aria-hidden="true">HS</span></div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        squadHTML += '</div>';

        const mapUrl = mapImages[op.map_name.toUpperCase()] || '';
        const bgOverlay = mapUrl ? `<div class="mission-bg-overlay" style="background-image: url('${mapUrl}');"></div>` : '';

        html += `
            <div onclick="window.open('https://tracker.gg/valorant/match/${op.id}', '_blank')" aria-label="Ver detalhes da partida ${op.map_name} no Tracker.gg" class="mission-row ${resultClass} p-3 p-md-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-4" style="color: inherit; cursor: pointer; background-image: url('${mapUrl}');">
                ${bgOverlay}
                <div class="d-flex align-items-center gap-4" style="min-width: 220px;">
                    <div class="text-center" style="min-width: 80px; white-space: nowrap;">
                        <div class="fs-1 fw-bold ${resultColor} lh-1" style="font-family: 'Teko', sans-serif; letter-spacing: 1px;" aria-label="Placar: ${op.score}">${escapeHtml(op.score)}</div>
                        <div class="${resultColor} text-uppercase mt-2 fw-bold" style="font-size: 0.85rem; letter-spacing: 2px; opacity: 0.9;">${escapeHtml(op.result)}</div>
                    </div>
                    <div class="border-start border-secondary border-opacity-50 ps-4">
                        <div class="fs-4 fw-bold text-white lh-1 mb-2 text-uppercase" style="letter-spacing: 1px;">${escapeHtml(op.map_name)}</div>
                        <div class="d-flex align-items-center gap-2 fw-bold" style="font-size: 0.85rem; color: #adb5bd;">
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
                            ${date}
                        </div>
                    </div>
                </div>
                ${squadHTML}
            </div>`;
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

// checkOrganicMode e renderOrganicReport foram movidos para analise.html como parte da otimização de performance.

document.addEventListener('DOMContentLoaded', async () => {
    // checkOrganicMode foi removido e a lógica de redirecionamento movida para o topo.
    await fetchMapData();
    await fetchCachedData(); // Await para garantir ordem de execução
    setInterval(fetchCachedData, 300000); // Mantém a atualização a cada 5 minutos
    
    // Inicia a Camada de Inteligência
    if (window.IntelligenceLayer && window.oraculoClient) {
        const intel = new IntelligenceLayer(window.oraculoClient);
        const renderInsights = (insights) => {
            if (!insights) return;
            
            // Render Synergy
            const synergyContainer = document.getElementById('leader-synergy');
            if (synergyContainer) {
                synergyContainer.innerHTML = insights.synergy.slice(0, 5).map((p, i) => `
                    <div class="d-flex align-items-center justify-content-between mb-3 leader-row">
                        <div class="d-flex align-items-center gap-2">
                            <span class="leader-rank fw-bold" style="width: 20px;">0${i+1}</span>
                            <span class="text-white fw-bold text-uppercase" style="font-size: 0.9rem;">${p.tag.split('#')[0]}</span>
                        </div>
                        <div class="leader-score text-info">${p.score} <span class="small opacity-50">PTS</span><br><span style="font-size: 0.55rem; opacity: 0.4; display: block; text-align: right;">ÚLTIMOS 7 DIAS</span></div>
                    </div>
                `).join('') || '<div class="text-muted small">A aguardar dados de grupo...</div>';
            }

            // Render KDA
            const kdaContainer = document.getElementById('leader-kda');
            if (kdaContainer) {
                kdaContainer.innerHTML = insights.kda.slice(0, 5).map((p, i) => `
                    <div class="d-flex align-items-center justify-content-between mb-3 leader-row" onclick="window.open('https://tracker.gg/valorant/match/${p.lastMatchId}', '_blank')" style="cursor: pointer;">
                        <div class="d-flex align-items-center gap-2">
                            <span class="leader-rank fw-bold" style="width: 20px;">0${i+1}</span>
                            <span class="text-white fw-bold text-uppercase" style="font-size: 0.9rem;">${p.tag.split('#')[0]}</span>
                        </div>
                        <div class="leader-score text-danger">${p.score} <span class="small opacity-50">MÉDIA</span><br><span style="font-size: 0.55rem; opacity: 0.6; display: block; text-align: right; color: var(--val-light);">ÚLTIMA PARTIDA</span></div>
                    </div>
                `).join('') || '<div class="text-muted small">A aguardar missões de elite...</div>';
            }

            // Render Streaks/Status
            const streaksContainer = document.getElementById('leader-streaks');
            if (streaksContainer) {
                const streakList = Object.entries(insights.streaks);
                streaksContainer.innerHTML = streakList.length > 0 ? streakList.slice(0, 5).map(([tag, type]) => `
                    <div class="d-flex align-items-center justify-content-between mb-3 leader-row">
                        <div class="d-flex align-items-center gap-2">
                            <span class="${type.includes('VITÓRIAS') ? 'text-success' : 'text-danger'} fw-bold" style="font-size: 0.9rem;">${type.includes('VITÓRIAS') ? '🔥' : '❄️'}</span>
                            <span class="text-white fw-bold text-uppercase" style="font-size: 0.9rem;">${tag.split('#')[0]}</span>
                        </div>
                        <div class="leader-score ${type.includes('VITÓRIAS') ? 'text-success' : 'text-danger'}" style="font-size: 0.7rem;">${type}</div>
                    </div>
                `).join('') : `<div class="p-3 text-center border border-secondary border-opacity-10" style="background: rgba(255,255,255,0.02);">
                    <span class="text-success blink-terminal fw-bold" style="font-size: 0.8rem;">ESTADO OPERACIONAL: NOMINAL</span>
                </div>`;
            }

            const syncInfo = document.getElementById('intel-sync-info');
            if (syncInfo) {
                syncInfo.innerText = `SINC: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            }
        };

        // Carrega do cache ou busca novo
        const cached = IntelligenceLayer.getFromCache();
        if (cached) {
            renderInsights(cached);
        }
        
        // Sempre busca novo para manter atualizado (background refresh)
        intel.refresh().then(insights => {
            renderInsights(insights);
        });

        setInterval(async () => {
            const fresh = await intel.refresh();
            renderInsights(fresh);
        }, 600000); // 10 mins
    }

    // Inicializa a extração de Intel detalhada (Mapas, MVP, Alertas)
    fetchIntelData();
    
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

            btn.disabled = true; btn.innerHTML = "A VERIFICAR...";
            try {
                // Pre-flight check: Verificar se a conta existe na API HenrikDev
                const [name, tag] = riotId.split('#');
                const verifyRes = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
                
                if (verifyRes.status === 404) {
                    throw new Error("Agente não encontrado no banco de dados da Riot. Verifique o Nick#Tag.");
                }

                if (verifyRes.status !== 200) {
                    console.warn("⚠️ Falha na pré-verificação, mas prosseguindo com alistamento manual.");
                }

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
                }, 1000);
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
            const now = new Date();
            pData.forEach(p => {
                const lastUpdated = new Date(p.updated_at);
                const diffDays = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
                const daysLeft = Math.max(0, 7 - diffDays);

                if (p.lone_wolf) {
                    const soloCount = (window.protocolInsights && window.protocolInsights.soloq.find(s => s.tag === p.riot_id))?.score || 1;
                    tacticalAlerts.push({ 
                        name: p.riot_id.split('#')[0], 
                        reason: 'SOLO QUEUE', 
                        info: `${soloCount} partidas detectadas`
                    });
                } else if (p.synergy_score === 0) {
                    tacticalAlerts.push({ 
                        name: p.riot_id.split('#')[0], 
                        reason: 'ESTAGNADO', 
                        info: `Expurgo em ${daysLeft} dias`
                    });
                }
            });
        }

        if (data && data.length > 0) {
            data.forEach(op => {
                // Dominância de Mapas
                if (!mapCounts[op.map_name]) { mapCounts[op.map_name] = 0; mapWins[op.map_name] = 0; }
                mapCounts[op.map_name]++;
                if (op.result === 'VITÓRIA') mapWins[op.map_name]++;
                
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

            let topMaps = Object.keys(mapCounts)
                .map(m => {
                    const plays = mapCounts[m];
                    const wins = mapWins[m];
                    const wr = (wins / plays) * 100;
                    return { name: m, plays, wr };
                })
                .filter(m => m.plays >= 2)
                .sort((a, b) => b.wr - a.wr || b.plays - a.plays)
                .slice(0, 3); // TOP 3 MAPAS
            
            const mapEl = document.getElementById('intel-map-data');
            if (mapEl) {
                if (topMaps.length > 0) {
                    mapEl.innerHTML = topMaps.map(m => `
                        <div class="d-flex justify-content-between mb-1">
                            <span class="text-light">${m.name.toUpperCase()}</span>
                            <span class="${m.wr >= 50 ? 'text-success' : 'text-danger'}">${m.wr.toFixed(0)}% WR</span>
                        </div>
                    `).join('');
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

