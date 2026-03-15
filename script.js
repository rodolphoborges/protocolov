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

let opsOffset = 0;
const OPS_PER_PAGE = 5;
let isFetchingOps = false;
let isSubmittingForm = false; // Flag anti-spam de interface

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
        const { data: playersData, error: playersError } = await supabaseClient
            .from('players')
            .select('*')
            .order('synergy_score', { ascending: false })
            .order('riot_id', { ascending: true });

        if (playersError) throw playersError;

        Object.values(rolesConfig).forEach(role => { role.current = 0; role.players = []; role.waitlist = []; });

        playersData.forEach(player => {
            let roleRaw = player.role_raw.toLowerCase();
            player.riotId = escapeHtml(player.riot_id);
            player.currentRank = escapeHtml(player.current_rank || 'Pendente');
            
            let isAssigned = false;
            for (let role in rolesConfig) {
                const searchTerms = role === 'Controlador' ? ['controlador', 'smoker'] : [role.toLowerCase()];
                if (searchTerms.some(term => roleRaw.includes(term))) {
                    if (rolesConfig[role].current < rolesConfig[role].max) {
                        rolesConfig[role].current++;
                        rolesConfig[role].players.push(player);
                    } else {
                        rolesConfig[role].waitlist.push(player);
                    }
                    isAssigned = true;
                    break;
                }
            }
            
            // Fallback: Se o jogador tiver uma classe desconhecida, vai para a fila "Flex"
            if (!isAssigned) {
                rolesConfig['Flex'].waitlist.push(player);
            }
        });
        
        renderRoles();
        updateLastSyncTime(playersData); 

        opsOffset = 0;
        await fetchOperations(false);

    } catch (error) {
        console.error('Falha ao carregar dados:', error);
        document.getElementById('roles-container').innerHTML = `
            <div class="alert alert-danger border-danger bg-transparent text-danger text-center">
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
            .order('started_at', { ascending: false })
            .range(opsOffset, opsOffset + OPS_PER_PAGE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            const formattedOps = data.map(op => {
                const sortedSquad = op.operation_squads.map(sq => ({
                    riotId: sq.riot_id, agent: sq.agent, agentImg: sq.agent_img, kda: sq.kda, hs: sq.hs_percent
                })).sort((a, b) => {
                    const [k1, d1] = a.kda.split('/').map(Number);
                    const [k2, d2] = b.kda.split('/').map(Number);
                    if (k2 !== k1) return k2 - k1; 
                    return d1 - d2; 
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
            btn.innerHTML = 'Ver Mais Partidas';
            btn.disabled = false;
        }
    }
}

// Fallback robusto para Clipboard (evita rebentar sem HTTPS e permite compatibilidade)
window.copyRiotId = function(btnElement, riotId) {
    if(navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(riotId).then(() => {
            btnElement.innerHTML = 'Copiado! ✅';
            setTimeout(() => btnElement.innerHTML = `${riotId} <span class="fs-6 text-muted" aria-hidden="true">📋</span>`, 2000);
        }).catch(e => console.error('Erro ao copiar:', e));
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = riotId;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            btnElement.innerHTML = 'Copiado! ✅';
            setTimeout(() => btnElement.innerHTML = `${riotId} <span class="fs-6 text-muted" aria-hidden="true">📋</span>`, 2000);
        } catch (err) {
            console.error('Falha ao copiar:', err);
        }
        document.body.removeChild(textArea);
    }
}

function createPlayerCardHTML(player, isWaiting = false) {
    const isWaitingClass = isWaiting ? 'is-waiting p-2' : 'p-2';
    const safeCard = safeUrl(player.card_url, 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png');
    const safeTracker = safeUrl(player.tracker_link, '#');
    const safeRankIcon = safeUrl(player.current_rank_icon, '');
    const safePeakIcon = safeUrl(player.peak_rank_icon, '');

    let warningBadge = player.api_error ? `<span class="badge bg-warning text-dark ms-2">⚠️ Desatualizado</span>` : '';
    let loneWolfBadge = player.lone_wolf ? `<span class="badge ms-2 text-dark bg-secondary" style="background-color: #768079 !important;" title="Jogou as últimas ranqueadas totalmente solo.">🐺 Lobo Solitário</span>` : '';
    let opaqueClass = player.lone_wolf ? 'opaque-rank' : '';

    const eloHTML = safeRankIcon ? `<img src="${safeRankIcon}" alt="${player.currentRank}" class="${opaqueClass}" style="width: 20px; height: 20px;"> <span class="${opaqueClass}">${player.currentRank}</span>` : `<span class="${opaqueClass}">${player.currentRank}</span>`;
    const peakHTML = safePeakIcon ? `<img src="${safePeakIcon}" alt="${player.peak_rank}" class="${opaqueClass}" style="width: 20px; height: 20px;"> <span class="${opaqueClass}">${player.peak_rank}</span>` : `<span class="${opaqueClass}">${(player.peak_rank || 'Sem Rank')}</span>`;

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
                        
                        <span class="user-select-all" style="cursor: pointer;" onclick="window.copyRiotId(this, '${player.riotId}')" title="Clique para copiar e adicionar no Valorant" aria-label="Copiar ID ${player.riotId}">
                            ${player.riotId} <span class="fs-6 text-muted" aria-hidden="true">📋</span>
                        </span>
                        
                        <span class="badge bg-secondary ms-1" style="font-size: 0.6rem;">LVL ${player.level || '--'}</span>
                        ${synergyBadge}
                        ${loneWolfBadge}
                        ${warningBadge}
                    </div>
                    <div class="d-flex gap-4">
                        <div><div class="stat-label">Elo Atual</div><div class="stat-val d-flex align-items-center gap-2">${eloHTML}</div></div>
                        <div><div class="stat-label">Rank Máximo</div><div class="stat-val text-accent d-flex align-items-center gap-2">${peakHTML}</div></div>
                    </div>
                </div>
                <div class="ms-auto pe-2">
                    <a href="${safeTracker}" target="_blank" class="btn btn-sm btn-outline-secondary" title="Ver no Tracker.gg" aria-label="Ver perfil de ${player.riotId} no Tracker.gg">
                        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                          <path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.864a.5.5 0 0 0-1 0V14.5a.5.5 0 0 1-.5.5h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5"/>
                          <path fill-rule="evenodd" d="M16 .5a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0 0 1h3.793L6.146 9.146a.5.5 0 1 0 .708.708L15 1.707V5.5a.5.5 0 0 0 1 0z"/>
                        </svg>
                    </a>
                </div>
            </div>
        </div>`;
}

function renderOperations(operations, append = false) {
    const section = document.getElementById('operations-section');
    const container = document.getElementById('operations-container');
    
    section.style.display = 'block';

    if(operations.length === 0 && !append) {
        container.innerHTML = `<div class="col-12"><div class="alert bg-dark border-secondary text-muted text-center py-4">Nenhuma operação conjunta detetada recentemente.</div></div>`;
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
                        <img src="${safeUrl(m.agentImg, '')}" class="rounded" style="width: 30px; height: 30px; object-fit: cover;" onerror="this.onerror=null; this.src='https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/0/smallicon.png';">
                        <span class="fw-bold text-light text-truncate" style="max-width: 120px; font-size: 0.95rem;">${escapeHtml(m.riotId.split('#')[0])}</span>
                    </div>
                    
                    <div class="d-flex align-items-center gap-4 font-monospace text-nowrap" style="font-size: 0.9rem;">
                        <div style="width: 80px;" class="text-center bg-dark rounded px-2 py-1 border border-secondary border-opacity-25" aria-label="KDA: ${kills} abates, ${deaths} mortes, ${assists} assistências">${kdaFormatted}</div>
                        <div style="width: 60px;" class="text-end" style="color: #adb5bd;" aria-label="Porcentagem de Headshots: ${m.hs}%"><span class="text-light">${m.hs}%</span> <span style="font-size:0.65rem" aria-hidden="true">HS</span></div>
                    </div>
                </div>
            `;
        });
        
        squadHTML += '</div>';

        html += `
            <a href="https://tracker.gg/valorant/match/${op.id}" target="_blank" aria-label="Ver detalhes da partida ${op.map} no Tracker.gg" class="text-decoration-none mission-row ${resultClass} p-3 p-md-4 rounded d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-4" style="color: inherit; display: block;">
                
                <div class="d-flex align-items-center gap-4" style="min-width: 220px;">
                    <div class="text-center" style="width: 80px;">
                        <div class="fs-2 fw-bold ${resultColor} lh-1" style="font-family: 'Teko', sans-serif; letter-spacing: 1px;" aria-label="Placar: ${op.score}">${escapeHtml(op.score)}</div>
                        
                        <div class="${resultColor} text-uppercase mt-2 fw-bold" style="font-size: 0.75rem; letter-spacing: 2px; opacity: 0.9;">${escapeHtml(op.result)}</div>
                    </div>
                    <div class="border-start border-secondary border-opacity-50 ps-4">
                        <div class="fs-4 fw-bold text-white lh-1 mb-2 text-uppercase" style="letter-spacing: 1px;">${escapeHtml(op.map)}</div>
                        
                        <div class="d-flex align-items-center gap-2" style="font-size: 0.85rem; color: #adb5bd;">
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
                            ${date}
                        </div>
                    </div>
                </div>

                ${squadHTML}

            </a>`;
    });
    
    // Otimizado: Usar insertAdjacentHTML evita destruir e recriar nós do DOM
    if (append) {
        innerWrapper.insertAdjacentHTML('beforeend', html);
    } else {
        innerWrapper.replaceChildren();
        innerWrapper.insertAdjacentHTML('beforeend', html);
    }
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

            btn.disabled = true; btn.innerHTML = "Enviando...";
            try {
                // NOTA: Para um nível de segurança Enterprise, não deve usar .insert com anonKey. 
                // Esta chamada deve ser feita por Edge Function num projeto em produção.
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
                setTimeout(() => { 
                    btn.disabled = false; 
                    btn.innerHTML = "Alistar-se";
                    isSubmittingForm = false;
                }, 2000);
            }
        });
    }
});
