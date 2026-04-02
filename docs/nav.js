/**
 * Protocolo V - Global Navigation System
 * Injects a unified header and navigation into all dashboard pages.
 */

document.addEventListener('DOMContentLoaded', () => {
    injectMobileStyles();
    injectNavigation();
    initGlobalAnimations();
});

function injectMobileStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @media (max-width: 768px) {
            .global-header { 
                position: fixed !important; 
                height: 110px !important; 
                padding: 10px 0 !important; 
                display: flex !important;
                flex-direction: column !important;
                background: #0f1923 !important;
                z-index: 2000 !important;
            }
            .header-content { 
                flex-direction: column !important; 
                align-items: center !important; 
                gap: 8px !important; 
                display: flex !important; 
                padding: 0 10px !important;
                width: 100% !important;
            }
            .logo-container { 
                margin: 0 !important; 
                width: 100% !important; 
                display: flex !important; 
                justify-content: center !important;
            }
            .logo-text { 
                font-size: 1.5rem !important; 
                white-space: nowrap !important; 
                text-align: center !important;
            }
            .main-nav { 
                display: flex !important;
                flex-direction: row !important; 
                justify-content: center !important; 
                gap: 5px !important; 
                width: 100% !important;
                padding: 0 5px !important;
            }
            .nav-link { 
                font-size: 0.75rem !important; 
                padding: 6px 8px !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
                flex: 1 !important;
                text-align: center !important;
                white-space: nowrap !important;
                letter-spacing: 0px !important;
            }
            .nav-link.active {
                background: rgba(255, 70, 85, 0.1) !important;
                border-color: var(--val-red) !important;
                color: #fff !important;
            }
            .val-bg-text-massive { display: none !important; }
            .header-spacer { height: 120px !important; }
            
            /* Global Scroll Lock */
            body, html { overflow-x: hidden !important; width: 100vw !important; }
            * { box-sizing: border-box !important; }
            .container { width: 100% !important; max-width: 100% !important; padding: 0 15px !important; }
            .row { margin: 0 !important; width: 100% !important; }
        }
    `;
    document.head.appendChild(style);
}

function injectNavigation() {
    const navHTML = `
        <header class="global-header">
            <div class="header-content">
                <div class="logo-container" onclick="window.location.href='index.html'">
                    <span class="logo-text">PROTOCOLO <span class="highlight">V</span></span>
                </div>
                <nav class="main-nav">
                    <a href="index.html" class="nav-link ${isActive('index.html')}">DASHBOARD</a>
                    <a href="treino.html" class="nav-link ${isActive('treino.html')}">SALA DE TREINO</a>
                    <a href="historico.html" class="nav-link ${isActive('historico.html')}">HISTÓRICO</a>
                    <a href="briefing.html" class="nav-link ${isActive('briefing.html')}">BRIEFING</a>
                    <a href="admin.html" class="nav-link ${isActive('admin.html')}">ADMIN</a>
                </nav>
            </div>
            <div class="header-glow"></div>
        </header>
        <div id="lobby-banner">
            <div class="container">
                <div class="lobby-alert-tag">SINALIZADOR DE REFORÇOS: ATIVO</div>
                <div id="lobby-commander-text">AGENTE -- MOBILIZANDO ESQUADRÃO</div>
                <div class="lobby-code-box">
                    <span class="lobby-code-label">LOBBY:</span>
                    <span id="lobby-code-text">--</span>
                </div>
                <div id="lobby-timer">(--:--)</div>
            </div>
        </div>
    `;

    // Inject as the first child of body
    document.body.insertAdjacentHTML('afterbegin', navHTML);
    
    // Add spacer to prevent content overlap
    const spacer = document.createElement('div');
    spacer.className = 'header-spacer';
    document.body.insertBefore(spacer, document.body.firstChild.nextSibling);

    updateActiveLinks();
}

function isActive(page) {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    return current === page ? 'active' : '';
}

function updateActiveLinks() {
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
        if (isActive(link.getAttribute('href'))) {
            link.classList.add('active');
        }
    });
}

function initGlobalAnimations() {
    // Reveal animation for main content
    const containers = document.querySelectorAll('.container, .container-fluid, .main-content');
    containers.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
        
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 100 + (index * 100));
    });
}
