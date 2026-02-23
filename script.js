// Substitua pelas suas chaves do Supabase
const supabaseUrl = 'https://gzbzfmvgwfvzjqurowku.supabase.co';
const supabaseAnonKey = 'sb_publishable_EBbK4nq9kpV0VNFmOzFEqQ_2mooasVD';

// MUDANÇA AQUI: Mudámos de 'supabase' para 'supabaseClient' para evitar conflito com a biblioteca
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

async function fetchCachedData() {
    try {
        // Busca Jogadores (usando o supabaseClient)
        const { data: playersData, error: playersError } = await supabaseClient.from('players').select('*');
        if (playersError) throw playersError;

        // Limpa os dados atuais antes de renderizar
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

        // Busca Operações (usando o supabaseClient)
        const { data: opsData, error: opsError } = await supabaseClient
            .from('operations')
            .select(`*, operation_squads(riot_id, agent, agent_img, kda, hs_percent)`)
            .order('started_at', { ascending: false })
            .limit(4);

        if (!opsError && opsData.length > 0) {
            const formattedOps = opsData.map(op => ({
                id: op.id, map: op.map, started_at: op.started_at, score: op.score, result: op.result,
                squad: op.operation_squads.map(sq => ({
                    riotId: sq.riot_id, agent: sq.agent, agentImg: sq.agent_img, kda: sq.kda, hs: sq.hs_percent
                }))
            }));
            renderOperations(formattedOps);
        }

    } catch (error) {
        console.error('Falha:', error);
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

    return `
        <div class="col-md-6">
            <div class="player-card ${isWaitingClass}">
                <img src="${safeCard}" class="player-avatar">
                <div class="flex-grow-1">
                    <div class="fw-bold text-white mb-2" style="font-size: 1rem; line-height: 1;">
                        ${player.riotId} 
                        <span class="badge bg-secondary ms-1" style="font-size: 0.6rem;">LVL ${player.level || '--'}</span>
                        ${warningBadge}
                    </div>
                    <div class="d-flex gap-4">
                        <div><div class="stat-label">Elo Atual</div><div class="stat-val d-flex align-items-center gap-2">${eloHTML}</div></div>
                        <div><div class="stat-label">Rank Máximo</div><div class="stat-val text-accent d-flex align-items-center gap-2">${peakHTML}</div></div>
                    </div>
                </div>
                <div class="ms-auto pe-2">
                    <a href="${safeTracker}" target="_blank" class="btn btn
