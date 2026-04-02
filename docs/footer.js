/**
 * Protocolo V — Global Footer
 * Injetado em todas as páginas. Links sociais controlados via config.js.
 * String vazia = link oculto automaticamente.
 */

document.addEventListener('DOMContentLoaded', () => {
    injectFooter();
});

function injectFooter() {
    const s = (window.ProtocolConfig && window.ProtocolConfig.social) || {};

    const LINKS = [
        {
            key: 'telegram',
            label: 'TELEGRAM',
            url: s.telegram,
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294.26.006.549-.1.868-.32 2.179-1.471 3.304-2.214 3.374-2.23.05-.012.12-.026.166.016.047.041.042.12.037.141-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8.154 8.154 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629.093.06.183.125.27.187.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.426 1.426 0 0 0-.013-.315.337.337 0 0 0-.114-.217.526.526 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09z"/>
            </svg>`
        },
        {
            key: 'youtube',
            label: 'YOUTUBE',
            url: s.youtube,
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.007 2.007 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.007 2.007 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31.4 31.4 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.007 2.007 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A99.788 99.788 0 0 1 7.858 2h.193zM6.4 5.209v4.818l4.157-2.408L6.4 5.209z"/>
            </svg>`
        },
        {
            key: 'instagram',
            label: 'INSTAGRAM',
            url: s.instagram,
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.917 3.917 0 0 0-1.417.923A3.927 3.927 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.916 3.916 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.926 3.926 0 0 0-.923-1.417A3.911 3.911 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0H8zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599.28.28.453.546.598.92.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.47 2.47 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.478 2.478 0 0 1-.92-.598 2.48 2.48 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233 0-2.136.008-2.388.046-3.231.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92.28-.28.546-.453.92-.598.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045v.002zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92zm-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217zm0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334z"/>
            </svg>`
        },
        {
            key: 'tiktok',
            label: 'TIKTOK',
            url: s.tiktok,
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3V0z"/>
            </svg>`
        },
        {
            key: 'twitter',
            label: 'TWITTER / X',
            url: s.twitter,
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"/>
            </svg>`
        },
        {
            key: 'email',
            label: 'CONTATO',
            url: s.email ? `mailto:${s.email}` : '',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4Zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1H2Zm13 2.383-4.708 2.825L15 11.105V5.383Zm-.034 6.876-5.64-3.471L8 9.583l-1.326-.795-5.64 3.47A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.741ZM1 11.105l4.708-2.897L1 5.383v5.722Z"/>
            </svg>`
        },
    ];

    // Apenas links com URL preenchida
    const active = LINKS.filter(l => l.url);
    if (!active.length) return; // nenhum link configurado — não injeta footer

    const linksHTML = active.map(l => `
        <a href="${l.url}" target="${l.key === 'email' ? '_self' : '_blank'}" rel="noopener noreferrer"
           class="pv-social-link" aria-label="${l.label}">
            ${l.icon}
            <span>${l.label}</span>
        </a>
    `).join('');

    const footerHTML = `
        <style>
            .pv-footer {
                border-top: 1px solid rgba(255,255,255,0.06);
                padding: 40px 0 30px;
                margin-top: 40px;
            }
            .pv-footer-inner {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
            }
            .pv-social-row {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 12px;
            }
            .pv-social-link {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 8px 18px;
                border: 1px solid rgba(255,255,255,0.08);
                color: var(--val-gray, #768079);
                text-decoration: none;
                font-family: 'Teko', sans-serif;
                font-size: 1rem;
                letter-spacing: 2px;
                text-transform: uppercase;
                transition: border-color 0.2s, color 0.2s, background 0.2s;
                background: transparent;
            }
            .pv-social-link:hover {
                border-color: var(--val-red, #ff4655);
                color: var(--val-red, #ff4655);
                background: rgba(255,70,85,0.05);
            }
            .pv-footer-disclaimer {
                font-size: 0.55rem;
                letter-spacing: 1px;
                opacity: 0.4;
                color: var(--val-gray, #768079);
                text-align: center;
                max-width: 600px;
                line-height: 1.6;
            }
            .pv-footer-brand {
                font-family: 'Teko', sans-serif;
                font-size: 1rem;
                letter-spacing: 3px;
                opacity: 0.3;
                color: var(--val-light, #ece8e1);
            }
            .pv-footer-brand span { color: var(--val-red, #ff4655); opacity: 1; }
        </style>

        <footer class="pv-footer">
            <div class="pv-footer-inner">
                <div class="pv-social-row">
                    ${linksHTML}
                </div>
                <div class="pv-footer-brand">PROTOCOLO <span>V</span></div>
                <p class="pv-footer-disclaimer">
                    O Protocolo V é um projeto feito por fãs. Não é endossado pela Riot Games e não reflete as visões ou opiniões da Riot Games ou de qualquer pessoa oficialmente envolvida na produção ou gerenciamento do VALORANT. VALORANT e Riot Games são marcas comerciais ou marcas registradas da Riot Games, Inc.
                </p>
            </div>
        </footer>
    `;

    document.body.insertAdjacentHTML('beforeend', footerHTML);
}
