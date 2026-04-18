/* ============================================================
   Crafter Dashboard — app.js
   Data source: GitHub raw sync-data.json (sanitized, no usernames)
   ============================================================ */

// ---- CONFIG — set your GitHub raw URL ----
const DATA_URL  = 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/sync-data.json';
const CD_HOURS  = 24;

// ============================================================
//  TELEGRAM
// ============================================================
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ============================================================
//  STATE
// ============================================================
let DATA       = null;
let activeGame = 0;
let activeTab  = 'cooldown';
let cdFilter   = 'all';

// ============================================================
//  FETCH
// ============================================================
async function loadData() {
    setBadge('loading…', '');
    try {
        const res = await fetch(DATA_URL + '?t=' + Date.now());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        DATA = await res.json();
        const ago = timeSince(new Date(DATA.syncedAt));
        const stale = (Date.now() - new Date(DATA.syncedAt)) > 3 * 3600000;
        setBadge('synced ' + ago, stale ? 'stale' : 'fresh');
        buildGameTabs();
        render();
    } catch (err) {
        setBadge('offline', '');
        document.getElementById(activeTab).innerHTML = empty('Could not load data.<br>' + err.message);
    }
}

document.getElementById('syncBadge').addEventListener('click', loadData);

function setBadge(text, cls) {
    const el = document.getElementById('syncBadge');
    el.textContent = text;
    el.className = 'sync-badge' + (cls ? ' ' + cls : '');
}

function timeSince(date) {
    const s = Math.floor((Date.now() - date) / 1000);
    if (s < 60)   return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    return Math.floor(s / 3600) + 'h ago';
}

function r2(n) { return Math.round(n * 100) / 100; }

// ============================================================
//  GAME TABS
// ============================================================
function buildGameTabs() {
    const el = document.getElementById('gameTabs');
    el.innerHTML = '';
    if (!DATA?.games?.length) return;
    DATA.games.forEach((game, i) => {
        const btn = document.createElement('button');
        btn.className = 'game-tab' + (i === activeGame ? ' active' : '');
        btn.textContent = game.name;
        btn.onclick = () => { activeGame = i; buildGameTabs(); render(); };
        el.appendChild(btn);
    });
}

// ============================================================
//  NAV
// ============================================================
document.getElementById('nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.content').forEach(c => c.classList.toggle('active', c.id === activeTab));
    render();
});

// ============================================================
//  RENDER
// ============================================================
function render() {
    if (!DATA) return;
    const game = DATA.games?.[activeGame];
    switch (activeTab) {
        case 'cooldown':    renderCooldown(game);    break;
        case 'accounts':    renderAccounts(game);    break;
        case 'backgrounds': renderBackgrounds(game); break;
        case 'roi':         renderROI(game);         break;
        case 'gems':        renderGems();            break;
        case 'table':       renderTable(game);       break;
    }
}

// ============================================================
//  COOLDOWN
// ============================================================
function renderCooldown(game) {
    const el = document.getElementById('cooldown');
    const st = game?.accountStats;
    if (!st) { el.innerHTML = empty('No data yet'); return; }

    const nextReset  = st.nextResetAt ? new Date(st.nextResetAt) : null;
    const nextInMs   = nextReset ? nextReset - Date.now() : null;

    let html = `
    <div class="card">
        <div class="stat-grid">
            <div class="stat-item">
                <div class="stat-value green">${st.ready}</div>
                <div class="stat-label">Ready</div>
            </div>
            <div class="stat-item">
                <div class="stat-value yellow">${st.soonCount ?? '?'}</div>
                <div class="stat-label">Soon (&lt;3h)</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${st.onCooldown}</div>
                <div class="stat-label">On CD</div>
            </div>
        </div>
        ${nextReset ? `<div style="margin-top:10px;font-size:11px;color:var(--hint)">Next reset: <span style="color:var(--text)">${fmtDate(nextReset)} (${fmtMs(nextInMs)})</span></div>` : ''}
    </div>
    <div class="card" style="text-align:center;padding:20px;color:var(--hint);font-size:11px">
        <div style="font-size:11px;margin-bottom:6px">Account names are not synced to GitHub for privacy.</div>
        <div>Use the Telegram bot /cd command for the full cooldown table.</div>
    </div>`;
    el.innerHTML = html;
}

// ============================================================
//  ACCOUNTS
// ============================================================
function renderAccounts(game) {
    const el = document.getElementById('accounts');
    if (!game) { el.innerHTML = empty('No data'); return; }

    const st  = game.accountStats || {};
    const bs  = game.badgeStats;
    const tot = st.total || 0;

    let html = `
    <div class="card">
        <div class="card-title">BP Crafters</div>
        <div class="stat-grid">
            <div class="stat-item">
                <div class="stat-value green">${st.ready ?? '?'}</div>
                <div class="stat-label">Ready</div>
            </div>
            <div class="stat-item">
                <div class="stat-value yellow">${st.onCooldown ?? '?'}</div>
                <div class="stat-label">On CD</div>
            </div>
            <div class="stat-item">
                <div class="stat-value blue">${game.totalCrafted ?? '?'}</div>
                <div class="stat-label">Total crafted</div>
            </div>
        </div>
    </div>`;

    if (bs) {
        const total    = bs.total || 1;
        const usedPct  = r2((bs.hasBadge / total) * 100);
        const unusedPct = r2((bs.noBadge  / total) * 100);
        html += `
        <div class="card">
            <div class="card-title">Badge Accounts</div>
            <div class="stat-grid" style="margin-bottom:12px">
                <div class="stat-item">
                    <div class="stat-value blue">${bs.hasBadge ?? '?'}</div>
                    <div class="stat-label">Used</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value green">${bs.noBadge ?? '?'}</div>
                    <div class="stat-label" style="text-decoration:underline">Unused</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${bs.total ?? '?'}</div>
                    <div class="stat-label">Total</div>
                </div>
            </div>
            <div class="progress-wrap">
                <div class="progress-label"><span>Used ${usedPct}%</span><span>Unused ${unusedPct}%</span></div>
                <div class="progress-track">
                    <div class="progress-used"   style="width:${usedPct}%"></div>
                    <div class="progress-unused" style="width:${unusedPct}%"></div>
                </div>
            </div>
            ${bs.availableForCraft != null ? `<div style="margin-top:10px;font-size:12px;color:var(--accent)">▸ ${bs.availableForCraft} available for next craft</div>` : ''}
        </div>`;
    }

    el.innerHTML = html;
}

// ============================================================
//  BACKGROUNDS
// ============================================================
function renderBackgrounds(game) {
    const el  = document.getElementById('backgrounds');
    const avg = game?.bgAvg;
    if (!avg) { el.innerHTML = empty('No background data yet'); return; }

    const cardsPerSet = game.cardsPerSet || 5;
    const maxV  = Math.max(avg.background_1, avg.background_2, avg.background_3, 0.01);
    const pct   = n => r2((n / cardsPerSet) * 100);
    const bar   = n => r2((n / maxV) * 100);

    let html = `
    <div class="card">
        <div class="card-title">Drop Averages <span style="color:var(--text);font-size:10px">(${avg.sampleSize} accounts)</span></div>
        <div class="bg-bar-wrap">
            <div class="bg-label"><span>Common (55%)</span><span>${avg.background_1} avg · ${pct(avg.background_1)}%</span></div>
            <div class="bg-bar-track"><div class="bg-bar-fill c" style="width:${bar(avg.background_1)}%"></div></div>
        </div>
        <div class="bg-bar-wrap">
            <div class="bg-label"><span>Uncommon (27%)</span><span>${avg.background_2} avg · ${pct(avg.background_2)}%</span></div>
            <div class="bg-bar-track"><div class="bg-bar-fill u" style="width:${bar(avg.background_2)}%"></div></div>
        </div>
        <div class="bg-bar-wrap">
            <div class="bg-label"><span>Rare (18%)</span><span>${avg.background_3} avg · ${pct(avg.background_3)}%</span></div>
            <div class="bg-bar-track"><div class="bg-bar-fill r" style="width:${bar(avg.background_3)}%"></div></div>
        </div>
    </div>`;

    el.innerHTML = html;
}

// ============================================================
//  ROI  (live price fetch)
// ============================================================
function renderROI(game) {
    const el = document.getElementById('roi');
    if (!game) { el.innerHTML = empty('No game data'); return; }
    el.innerHTML = '<div class="empty"><span class="spinner"></span>Fetching live prices…</div>';

    const backgrounds = game.backgrounds || [];
    const fetchPrice  = hash => fetch(
        'https://steamcommunity.com/market/priceoverview/?appid=753&currency=1&market_hash_name=' + encodeURIComponent(hash)
    ).then(r => r.json()).catch(() => ({}));

    Promise.all([fetchPrice('753-Sack of Gems'), ...backgrounds.map(b => fetchPrice(b.hashName))])
    .then(([gemsData, ...bgDatas]) => {
        const parse = s => s ? parseFloat(String(s).replace(/[^0-9.]/g,''))||0 : 0;
        const gemsPrice = parse(gemsData.lowest_price || gemsData.median_price);
        const bgPrices  = bgDatas.map(d => parse(d.lowest_price || d.median_price));
        const [p1, p2, p3] = bgPrices;

        const gemsRequired = game.gemsRequired || 1200;
        const cardsPerSet  = game.cardsPerSet  || 5;

        const setCost = r2((gemsRequired / 3) * (gemsPrice / 1000) * 5 * cardsPerSet);
        const spinPrc = r2(setCost / 5); // always /5
        const netEV   = r2((p1 * 0.55 + p2 * 0.27 + p3 * 0.18) * 0.87);
        const roi     = spinPrc > 0 ? r2(((netEV - spinPrc) / spinPrc) * 100) : null;

        const sign   = roi != null && roi >= 0 ? '+' : '';
        const roiCls = roi != null && roi >= 0 ? 'positive' : 'negative';
        const bgNames = backgrounds.map(b => b.hashName || b.key);

        el.innerHTML = `
        <div class="card">
            <div class="card-title">Live ROI — ${game.name}</div>
            <div class="roi-card">
                <div class="roi-pct ${roiCls}">${roi != null ? sign + roi.toFixed(1) + '%' : '?'}</div>
                <div class="roi-details">
                    <div class="roi-row"><span>netEV</span><span>$${netEV}</span></div>
                    <div class="roi-row"><span>spinPrc</span><span>$${spinPrc}</span></div>
                    <div class="roi-row"><span>setCost</span><span>$${setCost}</span></div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Price Breakdown</div>
            <div class="roi-row"><span>Gems sack</span><span>$${gemsPrice}</span></div>
            <div class="roi-row"><span>${bgNames[0] || 'Common'}</span><span>$${p1}</span></div>
            <div class="roi-row"><span>${bgNames[1] || 'Uncommon'}</span><span>$${p2}</span></div>
            <div class="roi-row"><span>${bgNames[2] || 'Rare'}</span><span>$${p3}</span></div>
        </div>
        <div class="card" style="font-size:10px;color:var(--hint);line-height:1.9">
            netEV = (C×0.55 + U×0.27 + R×0.18) × 0.87<br>
            setCost = (gemsReq/3) × (gemsPrc/1000) × 5 × cardsPerSet<br>
            spinPrc = setCost / 5<br>
            ROI = ((netEV − spinPrc) / spinPrc) × 100
        </div>`;
    }).catch(err => {
        el.innerHTML = empty('Price fetch failed.<br>' + err.message + '<br><br><small>Steam market API may block browser requests.<br>Use /roi in the Telegram bot instead.</small>');
    });
}

// ============================================================
//  GEMS
// ============================================================
function renderGems() {
    const el = document.getElementById('gems');
    if (!DATA) { el.innerHTML = empty('No data'); return; }

    const balance = DATA.latestGemBalance;
    const spent   = DATA.totalGemsSpent;

    let html = `
    <div class="card">
        <div class="stat-grid">
            <div class="stat-item" style="grid-column:span 2">
                <div class="stat-value green" style="font-size:26px">${balance != null ? balance.toLocaleString() : '?'}</div>
                <div class="stat-label">Current Gems</div>
            </div>
            <div class="stat-item">
                <div class="stat-value yellow">${spent != null ? (spent/1000).toFixed(1)+'k' : '?'}</div>
                <div class="stat-label">Total Spent</div>
            </div>
        </div>
    </div>`;

    if (DATA.games?.length) {
        html += '<div class="card"><div class="card-title">Per Game</div>';
        DATA.games.forEach(g => {
            const gs = (g.totalCrafted || 0) * (g.gemsRequired || 0);
            html += `<div class="gem-row">
                <span>${g.name}</span>
                <div style="text-align:right">
                    <div class="gem-balance">${gs.toLocaleString()} gems</div>
                    <div class="gem-event">${g.totalCrafted || 0} crafts</div>
                </div>
            </div>`;
        });
        html += '</div>';
    }

    el.innerHTML = html;
}

// ============================================================
//  TABLE  (new view: aggregated per-game stats)
// ============================================================
function renderTable(game) {
    const el = document.getElementById('table');
    if (!game) { el.innerHTML = empty('No data'); return; }

    const st  = game.accountStats || {};
    const avg = game.bgAvg;
    const cp  = game.cardsPerSet || 5;

    // ROI calculation using stored bgAvg as proxy for background prices
    // This is an approximation — use /roi tab for live prices
    const pct = n => avg ? r2((n / cp) * 100) : '?';

    let html = `
    <div class="card">
        <div class="card-title">${game.name} — Summary Table</div>
        <table class="acc-table">
            <thead>
                <tr>
                    <th>Metric</th>
                    <th style="text-align:right">Value</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>Total crafted</td>         <td class="num">${game.totalCrafted ?? '?'}</td></tr>
                <tr><td>Accounts ready</td>         <td class="num pos">${st.ready ?? '?'}</td></tr>
                <tr><td>Accounts on cooldown</td>   <td class="num">${st.onCooldown ?? '?'}</td></tr>
                <tr><td>Total BP accounts</td>      <td class="num">${st.total ?? '?'}</td></tr>
                ${game.badgeStats ? `
                <tr><td>Badge used</td>             <td class="num neu">${game.badgeStats.hasBadge}</td></tr>
                <tr><td>Badge unused</td>           <td class="num pos">${game.badgeStats.noBadge}</td></tr>
                <tr><td>Badge total</td>            <td class="num">${game.badgeStats.total}</td></tr>
                ` : ''}
                ${avg ? `
                <tr><td colspan="2" style="padding-top:8px;color:var(--hint);font-size:9px;letter-spacing:1px;text-transform:uppercase">Background Averages (${avg.sampleSize} accounts)</td></tr>
                <tr><td>AVG (C/U/R)</td>            <td class="num">${avg.background_1} / ${avg.background_2} / ${avg.background_3}</td></tr>
                <tr><td>AVG% (÷${cp})</td>          <td class="num">${pct(avg.background_1)}% / ${pct(avg.background_2)}% / ${pct(avg.background_3)}%</td></tr>
                ` : ''}
                <tr><td colspan="2" style="padding-top:8px;color:var(--hint);font-size:9px;letter-spacing:1px;text-transform:uppercase">Game Config</td></tr>
                <tr><td>Gems required</td>          <td class="num">${game.gemsRequired ?? '?'}</td></tr>
                <tr><td>Cards per set</td>          <td class="num">${cp}</td></tr>
                ${st.nextResetAt ? `
                <tr><td>Next reset</td>             <td class="num" style="font-size:10px">${fmtDate(new Date(st.nextResetAt))}</td></tr>
                ` : ''}
            </tbody>
        </table>
    </div>
    <div class="card" style="font-size:10px;color:var(--hint)">
        Account names not shown (privacy).<br>
        For full per-account table use /tabletext in the Telegram bot.
    </div>`;

    el.innerHTML = html;
}

// ============================================================
//  HELPERS
// ============================================================
function empty(msg) {
    return '<div class="empty"><div class="empty-icon">📭</div>' + msg + '</div>';
}

function fmtMs(ms) {
    if (!ms || ms <= 0) return 'now';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function fmtDate(date) {
    if (!date) return '?';
    const d = new Date(date);
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getDate()) + '.' + pad(d.getMonth()+1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// ============================================================
//  INIT
// ============================================================
loadData();
setInterval(loadData, 5 * 60 * 1000);
