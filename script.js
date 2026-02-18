// Configuração das funções
const rolesConfig = {
    'Sentinela': { max: 2, current: 0, desc: 'Setup defensivo e controle de flanco.', players: [], waitlist: [] },
    'Iniciador': { max: 2, current: 0, desc: 'Coleta de informação e quebra de bomb.', players: [], waitlist: [] },
    'Flex': { max: 2, current: 0, desc: 'Adaptação total às necessidades da composição.', players: [], waitlist: [] },
    'Duelista': { max: 2, current: 0, desc: 'Criação de espaço e entry agressivo.', players: [], waitlist: [] },
    'Controlador': { max: 2, current: 0, desc: 'Smokes, ritmo e domínio de mapa.', players: [], waitlist: [] } 
};

// Busca os dados processados
async function fetchCachedData() {
    try {
        const response = await fetch('data.json?t=' + Date.now());
        if (!response.ok) throw new Error('Ficheiro data.json não encontrado ou erro de rede.');
        
        const data = await response.json();
        
        // Suporte legado e novo formato
        let playersData = Array.isArray(data) ? data : data.players;
        let operationsData = Array.isArray(data) ? [] : data.operations;

        // Processa Jogadores
        playersData.forEach(player => {
            let roleRaw = player.roleRaw.toLowerCase();
            
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
        
        // Processa Operações
        if (operationsData && operationsData.length > 0) {
            renderOperations(operationsData);
        }

    } catch (error) {
        console.error('Falha ao obter os dados:', error);
        document.getElementById('roles-container').innerHTML = `
            <div class="alert alert-danger border-danger bg-transparent text-danger text-center">
                Os dados táticos ainda estão a ser processados pelo sistema (GitHub Actions). Volte em alguns minutos.
            </div>`;
    }
}

function createPlayerCardHTML(player, isWaiting = false) {
    const isWaitingClass = isWaiting ? 'is-waiting p-2' : 'p-2';
    
    if (player.apiError) {
        return `
            <div class="col-md-6">
                <div class="player-card ${isWaitingClass} border-warning">
                    <span class="text-warning small">API Indisponível para ${player.riotId}</span>
                </div>
            </div>`;
    }

    const eloHTML = player.currentRankIcon 
        ? `<img src="${player.currentRankIcon}" alt="${player.currentRank}" style="width: 20px; height: 20px; object-fit: contain;"> ${player.currentRank}`
        : player.currentRank;

    const peakHTML = player.peakRankIcon
        ? `<img src="${player.peakRankIcon}" alt="${player.peakRank}" style="width: 20px; height: 20px; object-fit: contain;"> ${player.peakRank}`
        : player.peakRank;

    return `
        <div class="col-md-6">
            <div class="player-card ${isWaitingClass}">
                <img src="${player.card}" alt="Card" class="player-avatar">
                <div class="flex-grow-1">
                    <div class="fw-bold text-white mb-2" style="font-size: 1rem; line-height: 1;">
                        ${player.riotId} <span class="badge bg-secondary ms-1" style="font-size: 0.6rem;">LVL ${player.level}</span>
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
                    <a href="${player.trackerLink}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Tracker.gg" style="border-radius: 0;">
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

    operations.slice(0, 4).forEach(op => { 
        const resultClass = op.result === 'VITÓRIA' ? 'win' : 'loss';
        const date = new Date(op.started_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let squadHTML = op.squad.map(m => `
            <div class="squad-member">
                <img src="${m.agentImg}" class="agent-icon" title="${m.agent}">
                <span class="member-name text-truncate">${m.riotId.split('#')[0]}</span>
                <div class="member-stats text-end">
                    <div>${m.kda}</div>
                    <div class="small text-muted">${m.hs}% HS</div>
                </div>
            </div>
        `).join('');

        html += `
            <div class="col-md-6 col-lg-4">
                <div class="op-card ${resultClass}">
                    <div class="op-header">
                        <div>
                            <div class="op-map">${op.map}</div>
                            <div class="op-date">${date}</div>
                        </div>
                        <div class="op-score ${resultClass}">${op.score}</div>
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
        const isFull = data.current >= data.max;
        const formattedCurrent = String(data.current).padStart(2, '0');
        const formattedMax = String(data.max).padStart(2, '0');

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
        }

        fullHTML += `
            <div class="row align-items-start role-row ${isFull ? 'role-full' : ''}">
                <div class="col-md-3 mb-4 mb-md-0">
                    <h3 class="role-title">${role}</h3>
                    <p class="mb-0 text-muted small">${data.desc}</p>
                </div>
                <div class="col-md-9">
                    <div class="d-flex justify-content-between align-items-center border-bottom border-secondary pb-2 mb-3">
                        <span class="text-uppercase text-muted small">Operadores Alocados</span>
                        <span class="slot-indicator fs-4 ${isFull ? 'text-secondary' : ''}">
                            ${isFull ? 'FECHADO' : `[ ${formattedCurrent} / ${formattedMax} ]`}
                        </span>
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
