/* ============================================================
   Crafter Dashboard — app.js
   Data: GitHub raw sync-data.json (usernames nulled)
   ============================================================ */

const DATA_URL  = 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/sync-data.json';
const GEMS_URL  = 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/sync4git/gems.json';
const ROI_URL   = 'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/sync4git/roi.json';
const CD_HOURS = 24;

// ============================================================
//  TELEGRAM
// ============================================================
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

// ============================================================
//  NAV POSITION  (persisted in localStorage)
// ============================================================
const NAV_KEY     = 'nav_position';
const NAV_OPTIONS = ['left', 'right', 'top', 'bottom'];

function getNavPos() {
    const saved = localStorage.getItem(NAV_KEY);
    if (saved && NAV_OPTIONS.includes(saved)) return saved;
    // Default: left on wide screens, bottom on narrow
    return window.innerWidth <= 600 ? 'bottom' : 'left';
}

function setNavPos(pos) {
    localStorage.setItem(NAV_KEY, pos);
    document.body.dataset.nav = pos;
    // Update picker buttons
    document.querySelectorAll('.nav-picker-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.pos === pos);
    });
}

// ============================================================
//  STATE
// ============================================================
let DATA       = null;
let GEMS_DATA  = null;
let ROI_DATA   = null;
let activeGame = 0;
let activeTab  = 'cooldown';
let cdFilter   = 'all';

// ============================================================
//  LOAD DATA
// ============================================================
async function loadData() {
    setBadge('loading…', '');
    try {
        const res = await fetch(DATA_URL + '?t=' + Date.now());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        DATA = await res.json();
        const stale = (Date.now() - new Date(DATA.syncedAt)) > 3 * 3600000;
        setBadge('synced ' + timeSince(new Date(DATA.syncedAt)), stale ? 'stale' : 'fresh');
        fetch(GEMS_URL + '?t=' + Date.now()).then(r => r.json()).then(d => { GEMS_DATA = d; if (activeTab==='gems') render(); }).catch(()=>{});
        fetch(ROI_URL  + '?t=' + Date.now()).then(r => r.json()).then(d => { ROI_DATA  = d; if (activeTab==='roi')  render(); }).catch(()=>{});
        buildGameTabs();
        render();
    } catch (err) {
        setBadge('offline', '');
        el(activeTab).innerHTML = empty('Could not load data.<br><small>' + err.message + '</small>');
    }
}

document.getElementById('syncBadge').addEventListener('click', loadData);

function setBadge(text, cls) {
    const e = document.getElementById('syncBadge');
    e.textContent = text;
    e.className = 'sync-badge' + (cls ? ' ' + cls : '');
}

// ============================================================
//  GAME TABS
// ============================================================
function buildGameTabs() {
    const container = document.getElementById('gameTabs');
    container.innerHTML = '';
    if (!DATA?.games?.length) return;
    DATA.games.forEach((game, i) => {
        const btn = document.createElement('button');
        btn.className = 'game-tab' + (i === activeGame ? ' active' : '');
        btn.textContent = game.name;
        btn.onclick = () => { activeGame = i; buildGameTabs(); render(); };
        container.appendChild(btn);
    });
}

// ============================================================
//  NAV  (clicks)
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
//  RENDER DISPATCHER
// ============================================================
function render() {
    if (!DATA) return;
    const game = DATA.games?.[activeGame];
    switch (activeTab) {
        case 'cooldown':    renderCooldown(game);    break;
        case 'accounts':    renderAccounts(game);    break;
        case 'table':       renderTable(game);       break;
        case 'roi':         renderROI(game);         break;
        case 'gems':        renderGems();            break;
        case 'settings':    renderSettings();        break;
    }
}

// ============================================================
//  COOLDOWN
// ============================================================
function renderCooldown(game) {
    const st = game?.accountStats;
    if (!st) { el('cooldown').innerHTML = empty('No data yet'); return; }

    const accs    = game.accounts || [];
    const now     = Date.now();
    const CD_MS   = CD_HOURS * 3600000;

    // Build time-sorted list from nulled accounts (username = null)
    const rows = accs.map((a, i) => {
        const last   = new Date(a.lastCraft).getTime();
        const msLeft = (last + CD_MS) - now;
        return { index: i + 1, lastCraft: a.lastCraft, msLeft, isReady: msLeft <= 0 };
    }).sort((a, b) => a.msLeft - b.msLeft);

    const nextReset = st.nextResetAt ? new Date(st.nextResetAt) : null;

    let html = `
    <div class="card">
        <div class="stat-grid">
            <div class="stat-item">
                <div class="stat-value green">${st.ready}</div>
                <div class="stat-label">Ready</div>
            </div>
            <div class="stat-item">
                <div class="stat-value yellow">${st.soonCount ?? '?'}</div>
                <div class="stat-label">Soon &lt;3h</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${st.onCooldown}</div>
                <div class="stat-label">On CD</div>
            </div>
        </div>
        ${nextReset ? `<div style="margin-top:10px;font-size:11px;color:var(--hint)">Next reset in <span style="color:var(--text);font-weight:600">${fmtMs(nextReset - now)}</span> — ${fmtDate(nextReset)}</div>` : ''}
    </div>
    <div class="card">
        <div class="cd-filter">
            <button class="filter-btn ${cdFilter==='all'?'active':''}"     onclick="setCDFilter('all')">All (${rows.length})</button>
            <button class="filter-btn ${cdFilter==='ready'?'active':''}"   onclick="setCDFilter('ready')">Ready (${st.ready})</button>
            <button class="filter-btn ${cdFilter==='waiting'?'active':''}" onclick="setCDFilter('waiting')">Waiting (${st.onCooldown})</button>
        </div>`;

    const filtered = rows.filter(r => {
        if (cdFilter === 'ready')   return r.isReady;
        if (cdFilter === 'waiting') return !r.isReady;
        return true;
    });

    filtered.forEach(r => {
        const dot  = r.isReady ? 'ready' : r.msLeft < 3*3600000 ? 'soon' : 'waiting';
        const time = r.isReady ? 'READY' : fmtMs(r.msLeft);
        const cls  = r.isReady ? 'ready' : r.msLeft < 3*3600000 ? 'soon' : '';
        // Username is null — show account index + last craft date
        html += `<div class="cd-row">
            <div class="cd-dot ${dot}"></div>
            <div class="cd-name" style="color:var(--hint)">#${r.index} <span style="color:var(--text);font-size:10px">${r.isReady ? 'crafted '+fmtDate(new Date(r.lastCraft)) : ''}</span></div>
            <div class="cd-time ${cls}">${time}</div>
        </div>`;
    });

    html += '</div>';
    el('cooldown').innerHTML = html;
}

window.setCDFilter = pos => { cdFilter = pos; renderCooldown(DATA?.games?.[activeGame]); };

// ============================================================
//  ACCOUNTS
// ============================================================
function renderAccounts(game) {
    if (!game) { el('accounts').innerHTML = empty('No data'); return; }

    const st  = game.accountStats || {};
    const bs  = game.badgeStats;
    const avg = game.bgAvg;
    const tot = bs?.total || 1;
    const cp  = game.cardsPerSet || 5;

    let html = `
    <div class="card">
        <div class="card-title">BP Crafters</div>
        <div class="stat-grid">
            <div class="stat-item"><div class="stat-value green">${st.ready ?? '?'}</div><div class="stat-label">Ready</div></div>
            <div class="stat-item"><div class="stat-value yellow">${st.onCooldown ?? '?'}</div><div class="stat-label">On CD</div></div>
            <div class="stat-item"><div class="stat-value blue">${game.totalCrafted ?? '?'}</div><div class="stat-label">Crafted</div></div>
        </div>
    </div>`;

    if (bs) {
        const usedPct   = r2((bs.hasBadge / tot) * 100);
        const unusedPct = r2((bs.noBadge  / tot) * 100);
        html += `
        <div class="card">
            <div class="card-title">Badge Accounts</div>
            <div class="stat-grid" style="margin-bottom:12px">
                <div class="stat-item"><div class="stat-value blue">${bs.hasBadge ?? '?'}</div><div class="stat-label">Used/Private</div></div>
                <div class="stat-item"><div class="stat-value green">${bs.noBadge ?? '?'}</div><div class="stat-label"><strong>Unused</strong></div></div>
                <div class="stat-item"><div class="stat-value">${bs.total ?? '?'}</div><div class="stat-label">Total</div></div>
            </div>
            <div class="progress-wrap">
                <div class="progress-label"><span>Used ${usedPct}%</span><span>Unused ${unusedPct}%</span></div>
                <div class="progress-track">
                    <div class="progress-used" style="width:${usedPct}%"></div>
                    <div class="progress-unused" style="width:${unusedPct}%"></div>
                </div>
            </div>
            ${bs.fullyUsed != null ? `<div style="margin-top:8px;font-size:11px;color:var(--hint)">All-game badge: <strong>${bs.fullyUsed}</strong></div>` : ''}
            ${bs.checkedAt ? `<div style="font-size:10px;color:var(--hint)">Last checked: ${bs.checkedAt.slice(0,10)}</div>` : ''}
        </div>`;
    }

    if (avg) {
        const maxV = Math.max(avg.background_1, avg.background_2, avg.background_3, 0.01);
        const pct  = n => r2((n / cp) * 100);
        const bar  = n => r2((n / maxV) * 100);
        html += `
        <div class="card">
            <div class="card-title">Background Drops <span style="font-size:10px;color:var(--text)">(${avg.sampleSize} accounts)</span></div>
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
    }

    el('accounts').innerHTML = html;
}



function renderTable(game) {
    if (!game) { el('table').innerHTML = empty('No data'); return; }
    const st  = game.accountStats || {};
    const avg = game.bgAvg;
    const cp  = game.cardsPerSet || 5;
    const pct = n => r2((n / cp) * 100);

    el('table').innerHTML = `
    <div class="card">
        <div class="card-title">${game.name} — Summary</div>
        <table class="acc-table">
            <thead><tr><th>Metric</th><th style="text-align:right">Value</th></tr></thead>
            <tbody>
                <tr><td>Total crafted</td>      <td class="num">${game.totalCrafted ?? '?'}</td></tr>
                <tr><td>Ready</td>              <td class="num pos">${st.ready ?? '?'}</td></tr>
                <tr><td>On cooldown</td>        <td class="num yellow">${st.onCooldown ?? '?'}</td></tr>
                <tr><td>Total BP accounts</td>  <td class="num">${st.total ?? '?'}</td></tr>
                ${game.badgeStats ? `
                <tr><td colspan="2" style="padding-top:8px;color:var(--hint);font-size:9px;letter-spacing:1px;text-transform:uppercase">Badge</td></tr>
                <tr><td>Used</td>               <td class="num">${game.badgeStats.hasBadge}</td></tr>
                <tr><td style="text-decoration:underline">Unused</td><td class="num pos">${game.badgeStats.noBadge}</td></tr>
                <tr><td>Total</td>              <td class="num">${game.badgeStats.total}</td></tr>
                ` : ''}
                ${avg ? `
                <tr><td colspan="2" style="padding-top:8px;color:var(--hint);font-size:9px;letter-spacing:1px;text-transform:uppercase">Backgrounds (${avg.sampleSize} accounts)</td></tr>
                <tr><td>AVG C/U/R</td>          <td class="num">${avg.background_1} / ${avg.background_2} / ${avg.background_3}</td></tr>
                <tr><td>AVG% (÷${cp})</td>      <td class="num">${pct(avg.background_1)}% / ${pct(avg.background_2)}% / ${pct(avg.background_3)}%</td></tr>
                ` : ''}
                <tr><td colspan="2" style="padding-top:8px;color:var(--hint);font-size:9px;letter-spacing:1px;text-transform:uppercase">Config</td></tr>
                <tr><td>Gems required</td>      <td class="num">${game.gemsRequired ?? '?'}</td></tr>
                <tr><td>Cards per set</td>      <td class="num">${cp}</td></tr>
                ${st.nextResetAt ? `<tr><td>Next reset</td><td class="num" style="font-size:10px">${fmtDate(new Date(st.nextResetAt))}</td></tr>` : ''}
                <tr><td>Synced at</td>          <td class="num" style="font-size:10px">${DATA?.syncedAt ? fmtDate(new Date(DATA.syncedAt)) : '?'}</td></tr>
            </tbody>
        </table>
    </div>`;
}

// ============================================================
//  ROI
// ============================================================
function renderROI(game) {
    if (!game) { el('roi').innerHTML = empty('No game data'); return; }

    const roiFromFile = ROI_DATA?.games?.find(g => g.appID === game.appID);
    const roiData = roiFromFile || DATA?.roi?.[game.appID];
    if (!roiData) {
        el('roi').innerHTML = empty('No ROI data yet.<br><strong>Run node sync-push.js</strong> to fetch prices.<br><small>ROI is calculated server-side during sync.</small>');
        return;
    }

    const { roi, netEV, spinPrc, setCost, gemsPrice, bgPrices, fetchedAt } = roiData;
    const [p1, p2, p3] = bgPrices || [0,0,0];
    const sign   = roi != null && roi >= 0 ? '+' : '';
    const roiCls = roi != null && roi >= 0 ? 'positive' : 'negative';
    const bgs    = game.backgrounds || [];
    const ago    = fetchedAt ? timeSince(new Date(fetchedAt)) : '?';

    el('roi').innerHTML = `
    <div class="card">
        <div class="card-title">ROI — ${game.name} <span style="font-size:9px;color:var(--hint)">fetched ${ago}</span></div>
        <div class="roi-card">
            <div class="roi-pct ${roiCls}">${roi != null ? sign + roi.toFixed(1) + '%' : '?'}</div>
            <div class="roi-details">
                <div class="roi-row"><span>netEV</span><strong>$${netEV}</strong></div>
                <div class="roi-row"><span>spinPrc</span><strong>$${spinPrc}</strong></div>
                <div class="roi-row"><span>setCost</span><strong>$${setCost}</strong></div>
            </div>
        </div>
    </div>
    <div class="card">
        <div class="card-title">Price Breakdown</div>
        <div class="roi-row"><span>Gems sack</span><strong>$${gemsPrice}</strong></div>
        <div class="roi-row"><span>${bgs[0]?.hashName || 'Common'}</span><strong>$${p1}</strong></div>
        <div class="roi-row"><span>${bgs[1]?.hashName || 'Uncommon'}</span><strong>$${p2}</strong></div>
        <div class="roi-row"><span>${bgs[2]?.hashName || 'Rare'}</span><strong>$${p3}</strong></div>
    </div>
    <div class="card" style="font-size:10px;color:var(--hint);line-height:1.9">
        netEV = (C×0.55 + U×0.27 + R×0.18) × 0.87<br>
        setCost = (gemsReq/3) × (gemsPrc/1000) × 5 × cardsPerSet<br>
        spinPrc = setCost / 5 · ROI = ((netEV − spinPrc) / spinPrc) × 100
    </div>`;
}

function renderGems() {
    const e  = el('gems');
    const gd = GEMS_DATA;
    const game = DATA?.games?.[activeGame];
    const gameGems = gd?.combinedGames?.find(g => g.appID === game?.appID);

    let html = '';

    const balance = gd?.latestGemBalance ?? DATA?.latestGemBalance;
    const spent   = gd?.totalGemsSpent   ?? DATA?.totalGemsSpent;

    html += '<div class="card"><div class="stat-grid">' +
        '<div class="stat-item" style="grid-column:span 2"><div class="stat-value green" style="font-size:24px">' + (balance != null ? balance.toLocaleString() : '?') + '</div><div class="stat-label">Gems in holder</div></div>' +
        '<div class="stat-item"><div class="stat-value yellow">' + (spent != null ? (spent/1000).toFixed(1)+'k' : '?') + '</div><div class="stat-label">Total spent</div></div>' +
        '</div></div>';

    // Combined card inventory (-c -b -e style)
    if (gameGems) {
        const cp = gameGems.cardsPerSet || 5;
        const cardList = Object.entries(gameGems.cardCounts || {});
        const maxSets = gameGems.setsAvailable || 1;
        html += '<div class="card"><div class="card-title">' + gameGems.name + ' — combined</div>' +
            '<div class="roi-row"><span>Sets available</span><strong>' + gameGems.setsAvailable + '</strong></div>' +
            '<div class="roi-row"><span>Booster packs</span><strong>' + gameGems.totalBoosters + '</strong></div>';
        if (cardList.length) {
            html += '<div style="margin-top:10px">';
            cardList.forEach(([name, count]) => {
                const sets = Math.floor(count / cp);
                const fill = Math.min(100, (sets / Math.max(maxSets, 1)) * 100);
                html += '<div class="bg-bar-wrap"><div class="bg-label"><span>' + name + '</span><span>' + count + ' (' + sets + ' sets)</span></div>' +
                    '<div class="bg-bar-track"><div class="bg-bar-fill c" style="width:' + fill.toFixed(0) + '%"></div></div></div>';
            });
            html += '</div>';
        }
        html += '</div>';
    } else {
        html += '<div class="card" style="color:var(--hint);font-size:11px">Card data not loaded yet.<br>Run /cards in Telegram bot first, then sync.</div>';
    }

    // Per-account (-a account -b -e style)
    if (gd?.accounts?.length) {
        const controlled = gd.accounts.filter(a => a.have_control);
        const observed   = gd.accounts.filter(a => !a.have_control);
        const appID      = String(game?.appID || '');
        const cp         = game?.cardsPerSet || 5;

        const accRow = (acc) => {
            const cards = acc.cardsByGame?.[appID] || {};
            const counts = Object.values(cards);
            const sets = counts.length ? Math.min(...counts.map(c => Math.floor(c/cp))) : 0;
            const tag = !acc.have_control ? ' <span style="color:var(--hint);font-size:9px">observed</span>' : '';
            return '<div class="cd-row"><div class="cd-name"><strong>' + acc.label + '</strong>' + tag + '</div>' +
                '<div class="cd-time ' + (acc.fetched ? 'ready' : '') + '">' +
                (acc.fetched ? sets + ' sets · ' + (acc.boosterPacks||0) + ' bp' : 'no data') + '</div></div>';
        };

        html += '<div class="card"><div class="card-title">Per holder account</div>';
        controlled.forEach(a => { html += accRow(a); });
        if (observed.length) {
            html += '<div style="margin-top:8px;font-size:9px;color:var(--hint);letter-spacing:1px;text-transform:uppercase;padding:4px 0">Observed only</div>';
            observed.forEach(a => { html += accRow(a); });
        }
        html += '</div>';
    }

    // Gems spent per game
    if (DATA?.games?.length) {
        html += '<div class="card"><div class="card-title">Gems spent per game</div>';
        DATA.games.forEach(g => {
            const gs  = (g.totalCrafted||0) * (g.gemsRequired||0);
            const acc = g.accountStats?.total || 0;
            const per = (acc > 0 && gs > 0) ? r2(gs/acc) : null;
            html += '<div class="gem-row"><div><strong>' + g.name + '</strong>' +
                '<div class="gem-event">' + (g.totalCrafted||0) + ' crafts · ' + acc + ' accounts</div>' +
                (per ? '<div class="gem-event">~' + per.toLocaleString() + ' gems/account</div>' : '') +
                '</div><div style="text-align:right"><div class="gem-balance">' + gs.toLocaleString() + '</div></div></div>';
        });
        html += '</div>';
    }

    e.innerHTML = html;
}

// ============================================================
//  SETTINGS  (nav position picker + info)
// ============================================================
function renderSettings() {
    const current = document.body.dataset.nav || 'left';
    const labels  = { left: '⬅ Left', right: '➡ Right', top: '⬆ Top', bottom: '⬇ Bottom' };

    let html = `
    <div class="card">
        <div class="card-title">Navigation Bar Position</div>
        <div class="nav-picker" id="navPicker">
            ${NAV_OPTIONS.map(p => `<button class="nav-picker-btn${p===current?' active':''}" data-pos="${p}" onclick="applyNavPos('${p}')">${labels[p]}</button>`).join('')}
        </div>
        <div style="margin-top:10px;font-size:10px;color:var(--hint)">
            Saved automatically. On narrow screens left/right switch to bottom.
        </div>
    </div>
    <div class="card">
        <div class="card-title">Data</div>
        <div class="roi-row"><span>Synced at</span><span style="font-size:10px">${DATA?.syncedAt ? fmtDate(new Date(DATA.syncedAt)) : '?'}</span></div>
        <div class="roi-row"><span>Games</span><span>${DATA?.games?.length ?? '?'}</span></div>
        <div class="roi-row"><span>Account names</span><span style="color:var(--hint)">hidden (privacy)</span></div>
        <div style="margin-top:10px">
            <button class="filter-btn" onclick="loadData()" style="width:100%;text-align:center">🔄 Refresh data</button>
        </div>
    </div>`;

    el('settings').innerHTML = html;
}

window.applyNavPos = function(pos) {
    setNavPos(pos);
    renderSettings(); // re-render to update picker
};

// ============================================================
//  HELPERS
// ============================================================
function el(id) { return document.getElementById(id); }
function r2(n)  { return Math.round(n * 100) / 100; }
function empty(msg) { return '<div class="empty"><div class="empty-icon">📭</div>' + msg + '</div>'; }

function fmtMs(ms) {
    if (!ms || ms <= 0) return 'now';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function fmtDate(date) {
    if (!date) return '?';
    const d   = new Date(date);
    const pad = n => String(n).padStart(2, '0');
    return pad(d.getDate()) + '.' + pad(d.getMonth()+1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function timeSince(date) {
    const s = Math.floor((Date.now() - date) / 1000);
    if (s < 60)   return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    return Math.floor(s/3600) + 'h ago';
}

// ============================================================
//  INIT
// ============================================================
setNavPos(getNavPos());
loadData();
setInterval(loadData, 5 * 60 * 1000);
