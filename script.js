const supabaseUrl = 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseAnonKey = 'sb_publishable_EBbK4nq9kpV0VNFmOzFEqQ_2mooasVD';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const rolesConfig = {
    'Sentinela': { max: 2, current: 0, desc: 'Setup defensivo e controle de flanco.', players: [], waitlist: [] },
    'Iniciador': { max: 2, current: 0, desc: 'Coleta de informação e quebra de bomb.', players: [], waitlist: [] },
    'Flex': { max: 2, current: 0, desc: 'Adaptação total às necessidades da composição.', players: [], waitlist: [] },
    'Duelista': { max: 2, current: 0, desc: 'Criação de espaço e entry agressivo.', players: [], waitlist: [] },
    'Controlador': { max: 2, current: 0, desc: 'Smokes, ritmo e domínio de mapa.', players: [], waitlist: [] } 
};

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
        statusEl.innerHTML = `<span class="badge bg-dark border border-secondary text-muted px-2 py-1">Sincronizado ${timeText}</span>`;
    }
}

async function fetchCachedData() {
    try {
        // Fetch Paralelo para carregar o site duas vezes mais rápido
        const [playersRes, opsRes] = await Promise.all([
            supabaseClient.from('players').select('*'),
            supabaseClient.from('operations')
                .select(`*, operation_squads(riot_id, agent, agent_img, kda, hs_percent)`)
                .order('started_at', { ascending: false })
                .limit(4)
        ]);

        if (playersRes.error) throw playersRes.error;

        const playersData = playersRes.data;

        Object.values(rolesConfig).forEach(role => { role.current = 0; role.players = []; role.waitlist = []; });

        playersData.forEach(player => {
            let roleRaw = player.role_raw.toLowerCase();
            player.riotId = escapeHtml(player.riot_id);
            player.currentRank = escapeHtml(player.current_rank || 'Pendente');
            
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
        updateLastSyncTime(playersData); 

        if (!opsRes.error && opsRes.data && opsRes.data.length > 0) {
            const formattedOps = opsRes.data.map(op => ({
                id: op.id, map: op.map, started_at: op.started_at, score: op.score, result: op.result,
                squad: op.operation_squads.map(sq => ({
                    riotId: sq.riot_id, agent: sq.agent, agentImg: sq.agent_img, kda: sq.kda, hs: sq.hs_percent
                }))
            }));
            renderOperations(formattedOps);
        } else if (!opsRes.error) {
            renderOperations([]);
        }

    } catch (error) {
        console.error('Falha ao carregar dados:', error);
        document.getElementById('roles-container').innerHTML = `
            <div class="alert alert-danger border-danger bg-transparent text-danger text-center">
                A carregar sistema ou base de dados vazia. Tente recarregar.
            </div>`;
    }
}

function createPlayerCardHTML(player, isWaiting = false) {
    const isWaitingClass = isWaiting ? 'is-waiting p-2' : 'p-2';
    const safeCard = safeUrl(player.card_url, 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png');
    const safeTracker = safeUrl(player.tracker_link, '#');
    const safeRankIcon = safeUrl(player.current_rank_icon, '');
    const safePeakIcon = safeUrl(player.peak_rank_icon, '');

    let warningBadge = player.api_error ? `<span class="badge bg-warning text-dark ms-2">⚠️ Desatualizado</span>` : '';

    const eloHTML = safeRankIcon ? `<img src="${safeRankIcon}" alt="${player.currentRank}" style="width: 20px; height: 20px;"> ${player.currentRank}` : player.currentRank;
    const peakHTML = safePeakIcon ? `<img src="${safePeakIcon}" alt="${player.peak_rank}" style="width: 20px; height: 20px;"> ${player.peak_rank}` : (player.peak_rank || 'Sem Rank');

    // Lógica do Sistema de Sinergia (Karma)
    const synergyPoints = player.synergy_score || 0;
    let synergyBadge = '';
    if (synergyPoints > 10) {
        synergyBadge = `<span class="badge bg-danger ms-2" title="Jogador muito ativo com a comunidade">🔥 Sinergia: ${synergyPoints}</span>`;
    } else if (synergyPoints > 0) {
        synergyBadge = `<span class="badge bg-secondary ms-2" title="Partidas jogadas em grupo">🤝 Sinergia: ${synergyPoints}</span>`;
    }

    return `
        <div class="col-md-6">
            <div class="player-card ${isWaitingClass}">
                <img src="${safeCard}" class="player-avatar" onerror="this.onerror=null; this.src='https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png';">
                <div class="flex-grow-1">
                    <div class="fw-bold text-white mb-2 d-flex align-items-center flex-wrap gap-1" style="font-size: 1rem; line-height: 1;">
                        
                        <span class="user-select-all" style="cursor: pointer;" onclick="navigator.clipboard.writeText('${player.riotId}'); this.innerHTML='Copiado! ✅'; setTimeout(() => this.innerHTML='${player.riotId} <span class=\\'fs-6 text-muted\\'>📋</span>', 2000);" title="Clique para copiar e adicionar no Valorant">
                            ${player.riotId} <span class="fs-6 text-muted">📋</span>
                        </span>
                        
                        <span class="badge bg-secondary ms-1" style="font-size: 0.6rem;">LVL ${player.level || '--'}</span>
                        ${synergyBadge}
                        ${warningBadge}
                    </div>
                    <div class="d-flex gap-4">
                        <div><div class="stat-label">Elo Atual</div><div class="stat-val d-flex align-items-center gap-2">${eloHTML}</div></div>
                        <div><div class="stat-label">Rank Máximo</div><div class="stat-val text-accent d-flex align-items-center gap-2">${peakHTML}</div></div>
                    </div>
                </div>
                <div class="ms-auto pe-2">
                    <a href="${safeTracker}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Ver no Tracker.gg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                          <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5"/>
                          <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/>
                        </svg>
                    </a>
                </div>
            </div>
        </div>`;
}

function renderOperations(operations) {
    const section = document.getElementById('operations-section');
    const container = document.getElementById('operations-container');
    
    section.style.display = 'block';

    if(operations.length === 0) {
        container.innerHTML = `<div class="col-12"><div class="alert bg-dark border-secondary text-muted text-center py-4">Nenhuma operação conjunta detetada nas últimas 10 partidas.</div></div>`;
        return;
    }

    // Criamos uma única coluna que vai empilhar as barras horizontais
    let html = '<div class="col-12 d-flex flex-column gap-3">'; 
    
    operations.forEach(op => { 
        const isWin = op.result === 'VITÓRIA';
        const resultClass = isWin ? 'mission-win' : 'mission-loss';
        const resultColor = isWin ? 'text-success' : 'text-danger';
        const date = new Date(op.started_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let squadHTML = op.squad.map(m => `
            <div class="d-flex align-items-center gap-2 bg-dark p-2 rounded border border-secondary" style="min-width: 130px;">
                <img src="${safeUrl(m.agentImg, '')}" class="rounded" style="width: 32px; height: 32px; object-fit: cover;" onerror="this.onerror=null; this.src='https://media.valorant-api.com/agents/default.png';">
                <div class="lh-1">
                    <div class="fw-bold text-white mb-1" style="font-size: 0.85rem;">${escapeHtml(m.riotId.split('#')[0])}</div>
                    <div class="text-muted" style="font-size: 0.7rem;">${escapeHtml(m.kda)} <span class="text-secondary mx-1">|</span> ${m.hs}% HS</div>
                </div>
            </div>
        `).join('');

        html += `
            <div class="mission-row ${resultClass} p-3 rounded d-flex flex-column flex-xl-row align-items-xl-center justify-content-between gap-3">
                
                <div class="d-flex align-items-center gap-4">
                    <div class="text-center" style="width: 70px;">
                        <div class="fs-4 fw-bold ${resultColor} lh-1">${escapeHtml(op.score)}</div>
                        <div class="small text-muted text-uppercase mt-1" style="font-size: 0.7rem;">${escapeHtml(op.result)}</div>
                    </div>
                    <div class="border-start border-secondary ps-4">
                        <div class="fs-5 fw-bold text-white lh-1 mb-1">${escapeHtml(op.map)}</div>
                        <div class="text-muted" style="font-size: 0.8rem;">${date}</div>
                    </div>
                </div>

                <div class="d-flex flex-wrap gap-2 justify-content-start justify-content-xl-end">
                    ${squadHTML}
                </div>

            </div>`;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function renderRoles() {
    const container = document.getElementById('roles-container');
    let fullHTML = '';

    for (const [role, data] of Object.entries(rolesConfig)) {
        const isMainFull = data.current >= data.max;
        const formattedCurrent = String(data.current).padStart(2, '0');
        const formattedMax = String(data.max).padStart(2, '0');
        const statusBadge = !isMainFull ? `<span class="slot-indicator fs-4">[ ${formattedCurrent} / ${formattedMax} ]</span>` : `<span class="slot-indicator fs-5 text-accent">/// VAGAS NA RESERVA</span>`;

        let playersHTML = data.players.map(p => createPlayerCardHTML(p, false)).join('');
        let waitlistHTML = data.waitlist.length > 0 ? `
            <div class="waitlist-section">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="waitlist-label">Fila de Reserva</span>
                    <span class="badge bg-secondary">${data.waitlist.length} na escuta</span>
                </div>
                <div class="row g-2">${data.waitlist.map(p => createPlayerCardHTML(p, true)).join('')}</div>
            </div>` : '';

        fullHTML += `
            <div class="row align-items-start role-row ${isMainFull ? 'role-full' : ''}">
                <div class="col-md-3 mb-4 mb-md-0">
                    <h3 class="role-title">${role}</h3><p class="mb-0 text-muted small">${data.desc}</p>
                </div>
                <div class="col-md-9">
                    <div class="d-flex justify-content-between align-items-center border-bottom border-secondary pb-2 mb-3">
                        <span class="text-uppercase text-muted small">Status Operacional</span>${statusBadge}
                    </div>
                    <div class="row g-3">${playersHTML}</div>${waitlistHTML}
                </div>
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
    
    const form = document.getElementById('recrutamento-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const riotId = document.getElementById('riotIdInput').value.trim();
            const role = document.getElementById('roleInput').value;
            const btn = document.getElementById('submitBtn');
            const feedback = document.getElementById('formFeedback');

            if (!/^[^#]{2,16}#[a-zA-Z0-9]{3,5}$/.test(riotId)) {
                feedback.innerHTML = `<span class="text-warning">Formato inválido. Use Nome#TAG.</span>`;
                return;
            }

            btn.disabled = true; btn.innerHTML = "Enviando...";
            try {
                const { error } = await supabaseClient.from('players').insert([{ 
                    riot_id: riotId, role_raw: role, current_rank: 'Processando...' 
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
                btn.disabled = false; btn.innerHTML = "Alistar-se";
            }
        });
    }
});
