// Configuração das funções
const rolesConfig = {
    'Sentinela': { max: 2, current: 0, desc: 'Setup defensivo e controle de flanco.', players: [], waitlist: [] },
    'Iniciador': { max: 2, current: 0, desc: 'Coleta de informação e quebra de bomb.', players: [], waitlist: [] },
    'Flex': { max: 2, current: 0, desc: 'Adaptação total às necessidades da composição.', players: [], waitlist: [] },
    'Duelista': { max: 2, current: 0, desc: 'Criação de espaço e entry agressivo.', players: [], waitlist: [] },
    'Controlador': { max: 2, current: 0, desc: 'Smokes, ritmo e domínio de mapa.', players: [], waitlist: [] } 
};

// LIMITE CONFIGURÁVEL DE OPERAÇÕES NO FEED (Ex: 4, 8, ou 'Infinity' para todas)
const OPERATIONS_LIMIT = 4; 

// SEGURANÇA: Função de sanitização básica
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// SEGURANÇA: Validação de URL
function safeUrl(url, fallback) {
    if (url && typeof url === 'string' && url.startsWith('https://')) {
        return url;
    }
    return fallback;
}

async function fetchCachedData() {
    try {
        const response = await fetch('data.json?t=' + Date.now());
        if (!response.ok) throw new Error('Erro ao carregar dados.');
        
        const data = await response.json();
        
        if (data.updatedAt) {
            const date = new Date(data.updatedAt);
            const formatted = date.toLocaleDateString('pt-BR', { 
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
            });
            const footer = document.getElementById('last-updated');
            if(footer) footer.innerHTML = `Dados atualizados em: <strong>${formatted}</strong>`;
        }

        const playersData = Array.isArray(data) ? data : data.players;
        const operationsData = Array.isArray(data) ? [] : data.operations;

        playersData.forEach(player => {
            let roleRaw = player.roleRaw.toLowerCase();
            
            // Sanitiza os dados
            player.riotId = escapeHtml(player.riotId);
            player.currentRank = escapeHtml(player.currentRank);
            
            for (let role in rolesConfig) {
                const searchTerms = role === 'Controlador' ? ['controlador', 'smoker'] : [role.toLowerCase()];
                if (searchTerms.some(term => roleRaw.includes(term))) {
                    if (rolesConfig[role].current < rolesConfig[role].max) {
                        rolesConfig[role].current++;
                        rolesConfig[role].players.push(player);
                    } else if (rolesConfig[role].waitlist.length < 4) {
                        rolesConfig[role].waitlist.push(player);
                    }
                    break;
                }
            }
        });
        
        renderRoles();
        
        if (operationsData && operationsData.length > 0) {
            renderOperations(operationsData);
        }

    } catch (error) {
        console.error('Falha:', error);
        document.getElementById('roles-container').innerHTML = `
            <div class="alert alert-danger border-danger bg-transparent text-danger text-center">
                Sistema offline temporariamente. Tente recarregar.
            </div>`;
    }
}

function createPlayerCardHTML(player, isWaiting = false) {
    const isWaitingClass = isWaiting ? 'is-waiting p-2' : 'p-2';
    
    // SEGURANÇA: Sanitiza URLs
    const safeCard = safeUrl(player.card, 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png');
    const safeTracker = safeUrl(player.trackerLink, '#');
    const safeRankIcon = safeUrl(player.currentRankIcon, '');
    const safePeakIcon = safeUrl(player.peakRankIcon, '');

    // UX: Se houver erro de API, mostra badge de aviso, mas tenta renderizar o resto
    let warningBadge = '';
    if (player.apiError) {
        warningBadge = `<span class="badge bg-warning text-dark ms-2" title="Falha na atualização recente">⚠️ Desatualizado</span>`;
    }

    // Se nem o nível temos, é porque falhou totalmente (sem cache útil)
    if (player.apiError && player.level === '--') {
        return `
            <div class="col-md-6">
                <div class="player-card ${isWaitingClass} border-warning">
                    <span class="text-warning small">API Indisponível para ${player.riotId}</span>
                </div>
            </div>`;
    }

    const eloHTML = safeRankIcon 
        ? `<img src="${safeRankIcon}" alt="${player.currentRank}" style="width: 20px; height: 20px; object-fit: contain;"> ${player.currentRank}`
        : player.currentRank;

    const peakHTML = safePeakIcon
        ? `<img src="${safePeakIcon}" alt="${player.peakRank}" style="width: 20px; height: 20px; object-fit: contain;"> ${player.peakRank}`
        : player.peakRank;

    return `
        <div class="col-md-6">
            <div class="player-card ${isWaitingClass}">
                <img src="${safeCard}" alt="Card" class="player-avatar">
                <div class="flex-grow-1">
                    <div class="fw-bold text-white mb-2" style="font-size: 1rem; line-height: 1;">
                        ${player.riotId} 
                        <span class="badge bg-secondary ms-1" style="font-size: 0.6rem;">LVL ${player.level}</span>
                        ${warningBadge}
                    </div>
                    <div class="d-flex gap-4">
                        <div>
                            <div class="stat-label">Elo Atual</div>
                            <div class="stat-val d-flex align-items-center gap-2">${eloHTML}</div>
                        </div>
                        <div>
                            <div class="stat-label">Rank Máximo</div>
                            <div class="stat-val text-accent d-flex align-items-center gap-2">${peakHTML}</div>
                        </div>
                    </div>
                </div>
                <div class="ms-auto pe-2">
                    <a href="${safeTracker}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Tracker.gg" style="border-radius: 0;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                          <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5"/>
                          <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/>
                        </svg>
                    </a>
                </div>
            </div>
        </div>
    `;
}

function renderOperations(operations) {
    const section = document.getElementById('operations-section');
    const container = document.getElementById('operations-container');
    
    section.style.display = 'block';
    let html = '';

    const limit = OPERATIONS_LIMIT > 0 ? OPERATIONS_LIMIT : operations.length;

    operations.slice(0, limit).forEach(op => { 
        const resultClass = op.result === 'VITÓRIA' ? 'win' : 'loss';
        const date = new Date(op.started_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let squadHTML = op.squad.map(m => `
            <div class="squad-member">
                <img src="${safeUrl(m.agentImg, '')}" class="agent-icon" title="${escapeHtml(m.agent)}">
                <span class="member-name text-truncate">${escapeHtml(m.riotId.split('#')[0])}</span>
                <div class="member-stats text-end">
                    <div>${escapeHtml(m.kda)}</div>
                    <div class="small text-muted">${m.hs}% HS</div>
                </div>
            </div>
        `).join('');

        html += `
            <div class="col-md-6 col-lg-4">
                <div class="op-card ${resultClass}">
                    <div class="op-header">
                        <div>
                            <div class="op-map">${escapeHtml(op.map)}</div>
                            <div class="op-date">${date}</div>
                        </div>
                        <div class="op-score ${resultClass}">${escapeHtml(op.score)}</div>
                    </div>
                    <div class="op-squad">
                        ${squadHTML}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderRoles() {
    const container = document.getElementById('roles-container');
    let fullHTML = '';

    for (const [role, data] of Object.entries(rolesConfig)) {
        const isMainFull = data.current >= data.max;
        const isWaitlistFull = data.waitlist.length >= 4; 
        const formattedCurrent = String(data.current).padStart(2, '0');
        const formattedMax = String(data.max).padStart(2, '0');

        let statusBadge = '';
        if (!isMainFull) {
            statusBadge = `<span class="slot-indicator fs-4">[ ${formattedCurrent} / ${formattedMax} ]</span>`;
        } else if (!isWaitlistFull) {
            statusBadge = `<span class="slot-indicator fs-5 text-accent" style="letter-spacing: 1px; font-weight: 600;">/// VAGAS NA RESERVA</span>`;
        } else {
            statusBadge = `<span class="slot-indicator fs-4 text-secondary text-decoration-line-through">LOTADO</span>`;
        }

        let playersHTML = data.players.map(p => createPlayerCardHTML(p, false)).join('');

        let waitlistHTML = '';
        if (data.waitlist.length > 0) {
            let waitlistCardsHTML = data.waitlist.map(p => createPlayerCardHTML(p, true)).join('');
            waitlistHTML = `
                <div class="waitlist-section">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="waitlist-label">Fila de Reserva</span>
                        <span class="badge bg-secondary">${data.waitlist.length} na escuta</span>
                    </div>
                    <div class="row g-2">
                        ${waitlistCardsHTML}
                    </div>
                </div>
            `;
        } else if (isMainFull && !isWaitlistFull) {
            waitlistHTML = `
                <div class="waitlist-section text-center py-3 opacity-50">
                    <span class="small text-uppercase text-muted fw-bold">Vagas disponíveis na Reserva</span>
                </div>
            `;
        }

        fullHTML += `
            <div class="row align-items-start role-row ${isMainFull ? 'role-full' : ''}">
                <div class="col-md-3 mb-4 mb-md-0">
                    <h3 class="role-title">${role}</h3>
                    <p class="mb-0 text-muted small">${data.desc}</p>
                </div>
                <div class="col-md-9">
                    <div class="d-flex justify-content-between align-items-center border-bottom border-secondary pb-2 mb-3">
                        <span class="text-uppercase text-muted small">Status Operacional</span>
                        ${statusBadge}
                    </div>
                    <div class="row g-3">
                        ${playersHTML}
                    </div>
                    ${waitlistHTML}
                </div>
            </div>
        `;
    }
    container.innerHTML = fullHTML;
}

// Animações de Scroll
const observerOptions = { root: null, rootMargin: '0px', threshold: 0.15 };
const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.addEventListener('DOMContentLoaded', () => {
    fetchCachedData(); 
    const sections = document.querySelectorAll('.fade-in-section');
    sections.forEach(section => observer.observe(section));
});
