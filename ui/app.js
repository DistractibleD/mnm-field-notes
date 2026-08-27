// ---------------------------------------------------------------------------
// Host bridge: talks to the PowerShell host when running inside WebView2.
// Falls back to console logging when opened as a plain page (e.g. for UI
// preview in a regular browser) so the UI is still usable without a host.
// ---------------------------------------------------------------------------
const hasHost = !!(window.chrome && window.chrome.webview);

const hostMessageHandlers = [];
function onHostMessage(fn) { hostMessageHandlers.push(fn); }
function deliverFromHost(data) { hostMessageHandlers.forEach(fn => fn(data)); }

function sendToHost(msg) {
  if (hasHost) {
    window.chrome.webview.postMessage(msg);
  } else {
    console.log('[mock host] received:', msg);
    mockHostRespond(msg);
  }
}

if (hasHost) {
  window.chrome.webview.addEventListener('message', (e) => {
    deliverFromHost(e.data);
  });
}

// Dev-only stand-in for the PowerShell host, used only when this page is
// opened in a plain browser for UI iteration (never runs inside the real
// WebView2 app, where `hasHost` is true and this is skipped entirely).
let mockSessionCounter = 0;
const mockProfiles = { profiles: [], lastUsed: null }; // start empty to exercise the first-run modal
function mockHostRespond(msg) {
  setTimeout(() => {
    if (msg.type === 'ready') {
      deliverFromHost({
        type: 'wikiData',
        monsters: [
          { name: 'a corrupted outrider', named: false, locations: ['Night Harbor'], areas: [], drops: [] },
          { name: 'a smuggler', named: false, locations: ['Night Harbor'], areas: [], drops: [] },
          { name: 'Onis the Elder', named: true, locations: ['Shaded Dunes'], areas: ['Sunken Ruins'], drops: ["Onis's Signet", 'Elder Ashira Hide'] },
          { name: 'Night Terror', named: true, locations: ['Night Harbor'], areas: ['Necropolis'], drops: ["Night Terror's Wing"] },
        ],
        items: [{ name: 'Ashira War Tooth' }, { name: 'Corroded Bronze Chain Boots' }],
        nodes: [
          { name: 'Lionleaf', tradeskill: 'Herbalism', locations: ['Vale of Zintar', 'Evershade Weald'], results: ['Lionleaf Bloom', 'Plant Fiber'] },
          { name: 'Ghost Poppy', tradeskill: 'Herbalism', locations: ['Evershade Weald'], results: ['Ghost Poppy Petal'] },
          { name: 'Copper Vein', tradeskill: 'Mining', locations: ['Shaded Dunes (West Ridge, East Ridge)', 'Sungreet Strand'], results: ['Copper Ore', 'Rough Stone'], minSkill: 1, trivialSkill: 50, note: 'Trivial skill might be lower - needs testing to confirm.' },
          { name: 'Limestone Deposit', tradeskill: 'Mining', locations: ['Shaded Dunes'], results: ['Limestone', 'Rough Stone'], minSkill: 40, trivialSkill: 75 },
          { name: 'Old Oak', tradeskill: 'Lumberjacking', locations: ['Evershade Weald', 'Vale of Zintar'], results: ['Oak Log', 'Tree Sap'], minSkill: 1, trivialSkill: 40 },
          { name: 'Whitefish', tradeskill: 'Fishing', locations: ['Night Harbor, near the docks', 'Shaded Dunes'] },
          { name: 'Grouper', tradeskill: 'Fishing', locations: ['Night Harbor', 'Sungreet Strand'] },
          { name: 'Basa', tradeskill: 'Fishing', locations: ['Shaded Dunes'] },
          { name: 'Old Boot', tradeskill: 'Fishing', locations: ['Night Harbor'], note: 'A junk drop.' },
        ],
        recipes: [
          { name: 'Cooked Ashira Meat', tradeskill: 'Cooking' }, { name: 'Stuffed Peppers', tradeskill: 'Cooking' },
          { name: 'Copper Ingot', tradeskill: 'Smelting' },
        ],
        factions: ['Bends Garrison', 'Citizens of Night Harbor', 'Orcs', 'Pyrmos Mercenaries', 'Steel Talons', 'Ten Hooks', 'Vermahn\'s Brood'],
        zones: ['Night Harbor', 'Shaded Dunes', 'Sungreet Strand', 'Vale of Zintar', 'Evershade Weald'],
        pageUrl: 'https://distractibled.github.io/DistractibleD-MonstersAndMemories-Wiki/',
      });
      deliverFromHost({ type: 'profiles', profiles: mockProfiles.profiles, lastUsed: mockProfiles.lastUsed });
      deliverFromHost({ type: 'updateInfo', currentVersion: '0.1', buildDate: '2026-08-25', latestVersion: '0.2', url: 'https://github.com/DistractibleD/mnm-field-notes/releases/latest', available: true, error: null });
      deliverFromHost({
        type: 'fishRarity',
        data: {
          'Night Harbor': { totalAttempts: 87, fish: { 'Whitefish': 40, 'Grouper': 25, 'Old Boot': 8 } },
          'Shaded Dunes': { totalAttempts: 6, fish: { 'Basa': 2 } }, // deliberately below MIN_RARITY_ATTEMPTS
        },
      });
      deliverFromHost({
        type: 'sharedFishRarity',
        data: {
          'Night Harbor': { totalAttempts: 30, fish: { 'Whitefish': 12, 'Grouper': 6 } },
        },
      });
      deliverFromHost({
        type: 'combatLevelRange',
        data: {
          'Night Harbor': { min: 3, max: 9, count: 14 },
        },
      });
    } else if (msg.type === 'checkForUpdates') {
      deliverFromHost({ type: 'updateInfo', currentVersion: '0.1', buildDate: '2026-08-25', latestVersion: '0.2', url: 'https://github.com/DistractibleD/mnm-field-notes/releases/latest', available: true, error: null, manual: true });
    } else if (msg.type === 'openUrl') {
      console.log('[mock host] would open URL', msg.url);
    } else if (msg.type === 'setProfile') {
      if (!mockProfiles.profiles.includes(msg.name)) mockProfiles.profiles.push(msg.name);
      mockProfiles.lastUsed = msg.name;
      console.log('[mock host] profile set to', msg.name);
    } else if (msg.type === 'startSession') {
      mockSessionCounter++;
      deliverFromHost({ type: 'sessionStarted', sessionId: 'mock-' + mockSessionCounter });
    } else if (msg.type === 'endSession') {
      deliverFromHost({ type: 'sessionEnded', exportFileName: 'mock-session.txt', entryCount: 1 });
    } else if (msg.type === 'startKeyCapture') {
      deliverFromHost({ type: 'keyCaptured', label: 'Ctrl+4', vkCode: 0x34, ctrl: true, alt: false, shift: false });
    } else if (msg.type === 'startKeyCounting') {
      console.log('[mock host] would start counting key', msg);
      setTimeout(() => deliverFromHost({ type: 'keyCounted' }), 400);
    } else if (msg.type === 'stopKeyCounting') {
      console.log('[mock host] would stop counting key');
    } else if (msg.type === 'submitExport') {
      console.log('[mock host] would POST export to the wiki Worker:', msg.fileName);
      deliverFromHost({ type: 'submitExportResult', ok: true, error: null, fileName: msg.fileName });
    }
  }, 50);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const wikiData = { monsters: [], items: [], nodes: [], recipes: [], factions: [], zones: [], pageUrl: '' };

const session = {
  id: null,
  type: 'combat',
  loggedBy: '',
  startedAt: null,
};

// roster: Map of target name -> { entries: [ {con, playerLevel, coin, items, named, factionChanges, loggedAt} ] }
const roster = new Map();
let activeTarget = null;

// ---------------------------------------------------------------------------
// Combat landing info (2026-08-27) - browsable without a session: pick a
// zone, see how many named monsters the wiki knows about there, expand for
// a compact list with their drops/sub-area (data-tip, same pattern used
// elsewhere). Own state, not tied to roster/session - this is browsing, not
// logging (Combat's roster has no zone concept of its own; zone is only
// ever entered per-kill in the detail form).
// ---------------------------------------------------------------------------
let combatLandingZone = '';
let combatNamedListExpanded = false;
let combatRegularListExpanded = false;

// Combat has no pre-start/active split of its own (unlike Fishing/Gathering)
// - this is the equivalent for it: the roster+detail ".layout" only shows
// once a session actually exists, so the tab is just the landing info until
// then. Called from the tab-click handler and sessionStarted/sessionEnded.
function updateCombatSessionVisibility() {
  const running = !!session.id;
  document.getElementById('combat-no-session-msg').style.display = running ? 'none' : '';
  document.getElementById('combat-session-layout').style.display = running ? '' : 'none';
}

function renderCombatLandingInfo() {
  const pickerEl = document.getElementById('combat-landing-zone-picker');
  if (!pickerEl) return;
  pickerEl.innerHTML = checklistDropdownHTML('combat-landing-zone', combatLandingZone ? combatLandingZone : 'Select zone', wikiData.zones, { multi: false, selected: combatLandingZone ? [combatLandingZone] : [] });
  const landingZoneCtrl = setupChecklistDropdown('combat-landing-zone', { multi: false, onChange: () => {
    combatLandingZone = landingZoneCtrl.getValue();
    combatNamedListExpanded = false;
    combatRegularListExpanded = false;
    renderCombatLevelRange();
    renderCombatNamedInfo();
    renderCombatRegularInfo();
  } });
  renderCombatLevelRange();
  renderCombatNamedInfo();
  renderCombatRegularInfo();
}

// Empirical level range for the picked zone (backlog #6) - an ESTIMATE from
// this app's own logged kills, not a wiki figure (no monster in the wiki has
// a numeric level field, checked - 0/660). MIN_LEVEL_RANGE_KILLS gates the
// whole zone, same reasoning as Fishing's MIN_RARITY_ATTEMPTS: a couple of
// kills makes any "range" too noisy to show with a straight face.
const MIN_LEVEL_RANGE_KILLS = 5;
function renderCombatLevelRange() {
  const el = document.getElementById('combat-landing-level-range');
  if (!el) return;
  if (!combatLandingZone) { el.innerHTML = ''; return; }
  const range = combatLevelRangeBaseline[combatLandingZone];
  const count = range ? range.count : 0;
  if (count < MIN_LEVEL_RANGE_KILLS) {
    el.innerHTML = `<p class="landing-info-empty">Not enough logged kills yet to guess a level range here (${count} so far, want at least ${MIN_LEVEL_RANGE_KILLS}).</p>`;
    return;
  }
  const label = range.min === range.max ? `Level ${range.min}` : `Levels ${range.min}&ndash;${range.max}`;
  el.innerHTML = `<p style="font-size:13px; color:var(--text-secondary); text-align:center; margin:10px 0 0;" data-tip="An estimate from this app's own logged kills, not a wiki figure - the wiki has no numeric level field on any monster.">${label}, from ${range.count} logged kills here</p>`;
}

function renderCombatNamedInfo() {
  const el = document.getElementById('combat-landing-named');
  if (!el) return;
  if (!combatLandingZone) {
    el.innerHTML = `<p class="landing-info-empty">Pick a zone to see which named monsters live there.</p>`;
    return;
  }
  const named = wikiData.monsters.filter(m => m.named && (m.locations || []).some(loc => locationMatchesZone(loc, combatLandingZone)));
  if (named.length === 0) {
    el.innerHTML = `<p class="landing-info-empty">No named monsters known in ${escapeHtml(combatLandingZone)} yet, per the wiki.</p>`;
    return;
  }
  const toggleLabel = combatNamedListExpanded
    ? 'Hide the list ▲'
    : `${named.length} named monster${named.length === 1 ? '' : 's'} known here ▼`;
  let body = '';
  if (combatNamedListExpanded) {
    // Search filters existing buttons via the same .filtered-out class the
    // checklist dropdown uses, not a full re-render on every keystroke -
    // rebuilding innerHTML on 'input' would steal focus out of the search
    // box after every character typed.
    const itemsHtml = named.map(m => {
      const tipParts = [];
      if (m.areas && m.areas.length) tipParts.push(`Found in: ${m.areas.join(', ')}`);
      if (m.drops && m.drops.length) tipParts.push(`Drops: ${m.drops.join(', ')}`);
      const tip = tipParts.length ? ` data-tip="${escapeHtml(tipParts.join(' — '))}"` : '';
      return `<span class="fish-pick-btn" style="cursor:default; display:inline-block; margin:3px;" data-search="${escapeHtml(m.name.toLowerCase())}"${tip}>${escapeHtml(m.name)}</span>`;
    }).join('');
    const wikiLink = wikiData.pageUrl
      ? `<a href="#" id="combat-named-wiki-link" style="font-size:11px; color:var(--accent); white-space:nowrap; flex-shrink:0;">View on wiki ↗</a>`
      : '';
    body = `
      <div class="landing-info-box">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
          <input type="text" id="combat-named-search" class="checklist-search" placeholder="Search…" autocomplete="off" style="flex:1; margin:0;" />
          ${wikiLink}
        </div>
        <div id="combat-named-list">${itemsHtml}</div>
      </div>
    `;
  }
  el.innerHTML = `<button class="mini-btn" id="combat-named-toggle" style="margin-top:10px;">${toggleLabel}</button>${body}`;
  document.getElementById('combat-named-toggle').addEventListener('click', () => {
    combatNamedListExpanded = !combatNamedListExpanded;
    renderCombatNamedInfo();
    if (combatNamedListExpanded) {
      const searchInput = document.getElementById('combat-named-search');
      if (searchInput) searchInput.focus();
    }
  });
  const searchInput = document.getElementById('combat-named-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      document.querySelectorAll('#combat-named-list [data-search]').forEach(item => {
        item.classList.toggle('filtered-out', !(!q || item.dataset.search.includes(q)));
      });
    });
  }
  const wikiLinkEl = document.getElementById('combat-named-wiki-link');
  if (wikiLinkEl) {
    wikiLinkEl.addEventListener('click', e => {
      e.preventDefault();
      sendToHost({ type: 'openUrl', url: wikiData.pageUrl + '#monsters-named/' + encodeURIComponent(combatLandingZone) });
    });
  }
}

// Regular (non-named) monsters - same collapsible list/search/wiki-link
// pattern as renderCombatNamedInfo() above, just named:false and the wiki's
// parallel "monsters-regular" hash (confirmed against the wiki's own
// goToMonster()/renderMonstersPage() routing, same as the named one).
function renderCombatRegularInfo() {
  const el = document.getElementById('combat-landing-regular');
  if (!el) return;
  if (!combatLandingZone) { el.innerHTML = ''; return; }
  const regular = wikiData.monsters.filter(m => !m.named && (m.locations || []).some(loc => locationMatchesZone(loc, combatLandingZone)));
  if (regular.length === 0) {
    el.innerHTML = `<p class="landing-info-empty">No regular monsters known in ${escapeHtml(combatLandingZone)} yet, per the wiki.</p>`;
    return;
  }
  const toggleLabel = combatRegularListExpanded
    ? 'Hide the list ▲'
    : `${regular.length} regular monster${regular.length === 1 ? '' : 's'} known here ▼`;
  let body = '';
  if (combatRegularListExpanded) {
    const itemsHtml = regular.map(m => {
      const tipParts = [];
      if (m.areas && m.areas.length) tipParts.push(`Found in: ${m.areas.join(', ')}`);
      if (m.drops && m.drops.length) tipParts.push(`Drops: ${m.drops.join(', ')}`);
      const tip = tipParts.length ? ` data-tip="${escapeHtml(tipParts.join(' — '))}"` : '';
      return `<span class="fish-pick-btn" style="cursor:default; display:inline-block; margin:3px;" data-search="${escapeHtml(m.name.toLowerCase())}"${tip}>${escapeHtml(m.name)}</span>`;
    }).join('');
    const wikiLink = wikiData.pageUrl
      ? `<a href="#" id="combat-regular-wiki-link" style="font-size:11px; color:var(--accent); white-space:nowrap; flex-shrink:0;">View on wiki ↗</a>`
      : '';
    body = `
      <div class="landing-info-box">
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
          <input type="text" id="combat-regular-search" class="checklist-search" placeholder="Search…" autocomplete="off" style="flex:1; margin:0;" />
          ${wikiLink}
        </div>
        <div id="combat-regular-list">${itemsHtml}</div>
      </div>
    `;
  }
  el.innerHTML = `<button class="mini-btn" id="combat-regular-toggle" style="margin-top:10px;">${toggleLabel}</button>${body}`;
  document.getElementById('combat-regular-toggle').addEventListener('click', () => {
    combatRegularListExpanded = !combatRegularListExpanded;
    renderCombatRegularInfo();
    if (combatRegularListExpanded) {
      const searchInput = document.getElementById('combat-regular-search');
      if (searchInput) searchInput.focus();
    }
  });
  const searchInput = document.getElementById('combat-regular-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      document.querySelectorAll('#combat-regular-list [data-search]').forEach(item => {
        item.classList.toggle('filtered-out', !(!q || item.dataset.search.includes(q)));
      });
    });
  }
  const wikiLinkEl = document.getElementById('combat-regular-wiki-link');
  if (wikiLinkEl) {
    wikiLinkEl.addEventListener('click', e => {
      e.preventDefault();
      sendToHost({ type: 'openUrl', url: wikiData.pageUrl + '#monsters-regular/' + encodeURIComponent(combatLandingZone) });
    });
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function findMonster(name) {
  const n = name.trim().toLowerCase();
  return wikiData.monsters.find(m => (m.name || '').toLowerCase() === n);
}
function findItem(name) {
  const n = name.trim().toLowerCase();
  return wikiData.items.find(i => (i.name || '').toLowerCase() === n);
}
function fmtCoin(c) {
  const parts = [];
  if (c.platinum) parts.push(c.platinum + 'p');
  if (c.gold) parts.push(c.gold + 'g');
  if (c.silver) parts.push(c.silver + 's');
  if (c.copper) parts.push(c.copper + 'c');
  return parts.length ? parts.join(' ') : '0c';
}
function sumCoin(entries) {
  const t = { platinum: 0, gold: 0, silver: 0, copper: 0 };
  entries.forEach(e => {
    t.platinum += e.coin.platinum || 0;
    t.gold += e.coin.gold || 0;
    t.silver += e.coin.silver || 0;
    t.copper += e.coin.copper || 0;
  });
  return t;
}

// ---------------------------------------------------------------------------
// Checklist dropdown: toggle button + a small-font, 2-column checkbox panel
// with a live search box - the standard app-wide pattern (2026-08-24) for
// any "pick any number from a known list" control, started from the wiki's
// own "search by stat/buff" filter and generalized here on request. Use this
// (not a plain <select>) for any future multi-pick list worth searching.
// ---------------------------------------------------------------------------
// `multi` (default true) gives checkboxes + a count badge, for "pick any
// number" cases like the faction dropdowns. Pass `{ multi: false }` for
// "pick exactly one" cases (e.g. Zone) - radio inputs instead, picking an
// option closes the panel immediately and updates the toggle's own label to
// show the current pick, same as a native <select> would.
function checklistDropdownHTML(idPrefix, label, options, config) {
  config = config || {};
  const multi = config.multi !== false;
  const selected = config.selected || [];
  const inputType = multi ? 'checkbox' : 'radio';
  const nameAttr = multi ? '' : ` name="${idPrefix}-radio"`;
  const optionsHTML = options.map(opt =>
    `<label class="checklist-option"><input type="${inputType}"${nameAttr} value="${escapeHtml(opt)}"${selected.includes(opt) ? ' checked' : ''}><span>${escapeHtml(opt)}</span></label>`
  ).join('');
  const tipAttr = config.tip ? ` data-tip="${escapeHtml(config.tip)}"` : '';
  return `
    <div class="checklist-dropdown" id="${idPrefix}-dropdown">
      <button type="button" class="checklist-toggle" id="${idPrefix}-toggle"${tipAttr}>
        <span id="${idPrefix}-toggle-label">${escapeHtml(label)}</span>
        <span class="checklist-count" id="${idPrefix}-count"></span>
        <span class="checklist-caret">&#9662;</span>
      </button>
      <div class="checklist-panel" id="${idPrefix}-panel">
        <input type="text" class="checklist-search" id="${idPrefix}-search" placeholder="Search&hellip;" autocomplete="off" />
        ${multi ? `<div class="checklist-panel-head">
          <span>Check any that apply</span>
          <a href="#" class="checklist-clear" id="${idPrefix}-clear">Clear</a>
        </div>` : ''}
        <div class="checklist-grid" id="${idPrefix}-grid">${optionsHTML}</div>
      </div>
    </div>`;
}

let checklistDropdownGlobalCloseSetup = false;
function ensureChecklistDropdownGlobalClose() {
  if (checklistDropdownGlobalCloseSetup) return;
  checklistDropdownGlobalCloseSetup = true;
  document.addEventListener('click', e => {
    document.querySelectorAll('.checklist-dropdown.open').forEach(d => {
      if (!d.contains(e.target)) d.classList.remove('open');
    });
  });
}

// ---------------------------------------------------------------------------
// App-wide tooltips - add data-tip="explanation" to any element and it gets
// a small themed popup on hover/focus, no per-element wiring needed. Runs
// once at load; delegated on document (mouseover/mouseout, focusin/focusout)
// so it keeps working for elements that get replaced by innerHTML rebuilds
// (fish-pick-grid buttons, roster rows, etc.) without re-registering anything.
// ---------------------------------------------------------------------------
(function setupTooltips() {
  const tip = document.createElement('div');
  tip.id = 'app-tooltip';
  document.body.appendChild(tip);
  let showTimer = null;

  function place(target) {
    const r = target.getBoundingClientRect();
    tip.classList.add('visible');
    const tipRect = tip.getBoundingClientRect();
    let left = r.left + (r.width - tipRect.width) / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = r.top - tipRect.height - 8;
    if (top < 8) top = r.bottom + 8; // no room above - show below instead
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function show(target) {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    tip.textContent = text;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => place(target), 300);
  }
  function hide() {
    clearTimeout(showTimer);
    tip.classList.remove('visible');
  }

  document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (t) show(t); });
  document.addEventListener('mouseout', e => { const t = e.target.closest('[data-tip]'); if (t) hide(); });
  document.addEventListener('focusin', e => { const t = e.target.closest('[data-tip]'); if (t) show(t); });
  document.addEventListener('focusout', e => { const t = e.target.closest('[data-tip]'); if (t) hide(); });
})();

// ---------------------------------------------------------------------------
// "I am old" theme toggle (2026-08-27) - a fun easter egg, not a real theme
// system: one alternate look (Windows 98), on/off, remembered per browser
// profile via localStorage (WebView2 gives this app its own private storage
// under the appassets.local origin - no host round trip needed, purely
// client-side). The wiki may get its own matching version of this later,
// built separately there - this app never touches that repo, see CLAUDE.md.
// ---------------------------------------------------------------------------
(function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  function apply(isWin98) {
    document.documentElement.setAttribute('data-theme', isWin98 ? 'win98' : 'default');
    btn.classList.toggle('active', isWin98);
  }
  let stored = false;
  try { stored = localStorage.getItem('mnmTheme') === 'win98'; } catch {}
  apply(stored);
  btn.addEventListener('click', () => {
    const isWin98 = document.documentElement.getAttribute('data-theme') === 'win98';
    apply(!isWin98);
    try { localStorage.setItem('mnmTheme', !isWin98 ? 'win98' : 'default'); } catch {}
  });
})();

function setupChecklistDropdown(idPrefix, config) {
  config = config || {};
  const multi = config.multi !== false;
  ensureChecklistDropdownGlobalClose();
  const root = document.getElementById(`${idPrefix}-dropdown`);
  const toggle = document.getElementById(`${idPrefix}-toggle`);
  const toggleLabel = document.getElementById(`${idPrefix}-toggle-label`);
  const panel = document.getElementById(`${idPrefix}-panel`);
  const countEl = document.getElementById(`${idPrefix}-count`);
  const clearLink = document.getElementById(`${idPrefix}-clear`);
  const searchInput = document.getElementById(`${idPrefix}-search`);
  const grid = document.getElementById(`${idPrefix}-grid`);
  const options = [...panel.querySelectorAll('.checklist-option')];
  const inputs = options.map(opt => opt.querySelector('input'));

  function updateCount() {
    if (!multi) return;
    const n = inputs.filter(cb => cb.checked).length;
    countEl.textContent = n ? `(${n})` : '';
  }

  function applySearch() {
    const q = searchInput.value.trim().toLowerCase();
    let visible = 0;
    options.forEach(opt => {
      const match = !q || opt.textContent.toLowerCase().includes(q);
      opt.classList.toggle('filtered-out', !match);
      if (match) visible++;
    });
    let noMatches = grid.querySelector('.checklist-no-matches');
    if (visible === 0) {
      if (!noMatches) {
        noMatches = document.createElement('div');
        noMatches.className = 'checklist-no-matches';
        noMatches.textContent = 'No matches';
        grid.appendChild(noMatches);
      }
    } else if (noMatches) {
      noMatches.remove();
    }
  }

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.checklist-dropdown.open').forEach(d => { if (d !== root) d.classList.remove('open'); });
    const opening = !root.classList.contains('open');
    root.classList.toggle('open');
    if (opening) { searchInput.value = ''; applySearch(); searchInput.focus(); }
  });
  panel.addEventListener('click', e => e.stopPropagation());
  if (clearLink) {
    clearLink.addEventListener('click', e => {
      e.preventDefault();
      inputs.forEach(cb => { cb.checked = false; });
      updateCount();
    });
  }
  inputs.forEach(cb => cb.addEventListener('change', () => {
    updateCount();
    if (!multi && cb.checked) {
      // Plain value, not "baseLabel: value" - baseLabel is only captured once
      // at setup time, so on a panel that re-renders with the current value
      // already showing (Fishing/Gathering's zone dropdown), concatenating
      // would keep appending onto whatever was already selected.
      toggleLabel.textContent = cb.value;
      root.classList.remove('open');
    }
    if (config.onChange) config.onChange();
  }));
  searchInput.addEventListener('input', applySearch);
  searchInput.addEventListener('keydown', e => e.stopPropagation());

  return {
    getSelected: () => inputs.filter(cb => cb.checked).map(cb => cb.value),
    getValue: () => { const c = inputs.find(cb => cb.checked); return c ? c.value : ''; },
  };
}
// corner=true anchors bottom-right instead of dead-center - for confirmations
// triggered by clicking something in a grid (fish/gather-material picks),
// where a centered toast sits right on top of the grid the user's about to
// tap again. Plain center placement stays the default for everything else
// (errors, "start a session first" guards, etc.).
function showToast(text, corner) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.toggle('toast-corner', !!corner);
  t.style.display = 'block';
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => { t.style.display = 'none'; }, 4500);
}

// Update available banner - dismissible, never blocking. "View release"
// round-trips through the host (openUrl) rather than a plain <a target=_blank>
// so it always opens the system browser, not a bare WebView2 popup.
function showUpdateBanner(version, url) {
  const el = document.getElementById('update-banner');
  el.innerHTML = `<span>Version ${escapeHtml(version)} is available.</span><span><a href="#" id="update-banner-view">View release</a><a href="#" id="update-banner-dismiss">Dismiss</a></span>`;
  el.style.display = 'flex';
  document.getElementById('update-banner-view').addEventListener('click', e => {
    e.preventDefault();
    sendToHost({ type: 'openUrl', url });
  });
  document.getElementById('update-banner-dismiss').addEventListener('click', e => {
    e.preventDefault();
    el.style.display = 'none';
  });
}

// Submit-for-review banner (2026-08-27) - dismissible, never blocking, same
// visual/interaction pattern as the update banner above (deliberately reused,
// not a new design). Offered once per export, right after "sessionEnded" -
// the file is already safely on disk either way, submitting is purely
// additive. Posts the export text to the wiki's own submission Worker
// (extended with a session-export path - see CLAUDE.md "Session export
// submission"), which opens a PR; nothing is live until the wiki owner
// merges it - that PR review IS the "i check each submission" the user
// asked for, not a separate gate this app needs to add on top.
function showSubmitExportBanner(fileName) {
  const el = document.getElementById('submit-export-banner');
  el.innerHTML = `<span>Submit this session to the wiki for review?</span><span><a href="#" id="submit-export-go">Submit</a><a href="#" id="submit-export-dismiss">Dismiss</a></span>`;
  el.style.display = 'flex';
  // Re-trigger the flash even if this banner was already showing (e.g. a
  // second session ended before the first was dismissed) - just re-adding a
  // class that's already present doesn't restart a CSS animation, so drop it,
  // force a reflow, then re-add.
  el.classList.remove('submit-ask', 'flash');
  void el.offsetWidth;
  el.classList.add('submit-ask', 'flash');
  document.getElementById('submit-export-go').addEventListener('click', e => {
    e.preventDefault();
    el.classList.remove('submit-ask', 'flash');
    el.innerHTML = `<span>Submitting…</span>`;
    sendToHost({ type: 'submitExport', fileName });
  });
  document.getElementById('submit-export-dismiss').addEventListener('click', e => {
    e.preventDefault();
    el.style.display = 'none';
  });
}

document.getElementById('check-updates-link').addEventListener('click', e => {
  e.preventDefault();
  sendToHost({ type: 'checkForUpdates' });
});

// ---------------------------------------------------------------------------
// Profiles: who's logging. Persisted host-side (Data\Profiles.json) so the
// name doesn't need retyping every launch. First run (zero saved profiles)
// opens the modal automatically; returning users get their last-used
// profile pre-selected. Switching/adding a profile is available any time,
// just disabled (like everything else session-scoped) while one is running.
// ---------------------------------------------------------------------------
const profileState = { profiles: [], active: null };
const NEW_PROFILE_VALUE = '__new__';

const profileSelect = document.getElementById('profile-select');
const profileModal = document.getElementById('profile-modal');
const profileModalInput = document.getElementById('profile-modal-input');
const profileModalErr = document.getElementById('profile-modal-err');
const profileModalCancel = document.getElementById('profile-modal-cancel');

function renderProfileSelect() {
  profileSelect.innerHTML = profileState.profiles.map(p =>
    `<option value="${escapeHtml(p)}"${p === profileState.active ? ' selected' : ''}>${escapeHtml(p)}</option>`
  ).join('') + `<option value="${NEW_PROFILE_VALUE}">+ Add new profile&hellip;</option>`;
}

profileSelect.addEventListener('change', () => {
  if (profileSelect.value === NEW_PROFILE_VALUE) {
    renderProfileSelect(); // snap back to the active one while the modal is open
    openProfileModal({ firstRun: false });
    return;
  }
  profileState.active = profileSelect.value;
  sendToHost({ type: 'setProfile', name: profileState.active });
});

function openProfileModal({ firstRun }) {
  document.getElementById('profile-modal-title').textContent = firstRun ? 'Welcome' : 'Add a new profile';
  document.getElementById('profile-modal-body').textContent = firstRun
    ? 'What name should we log your entries under? You can add more profiles or switch any time later.'
    : 'What name should this new profile use?';
  profileModalInput.value = '';
  profileModalErr.style.display = 'none';
  profileModalCancel.style.display = firstRun ? 'none' : 'inline-block';
  profileModal.classList.add('open');
  profileModalInput.focus();
}

function closeProfileModal() { profileModal.classList.remove('open'); }

document.getElementById('profile-modal-save').addEventListener('click', () => {
  const name = profileModalInput.value.trim();
  if (!name) {
    profileModalErr.textContent = 'Enter a name first';
    profileModalErr.style.display = 'block';
    return;
  }
  if (!profileState.profiles.includes(name)) profileState.profiles.push(name);
  profileState.active = name;
  renderProfileSelect();
  sendToHost({ type: 'setProfile', name });
  closeProfileModal();
});
profileModalInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('profile-modal-save').click(); });
profileModalCancel.addEventListener('click', closeProfileModal);

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
// Maps the active tab to the session-level label used for the export
// header/filename (e.g. "Session export - fishing") - independent of the
// sessionType each logged entry carries (Fishing entries still log as
// 'harvesting', matching Write-HarvestingBlock's grouping in MnMFieldNotes.ps1).
const TAB_SESSION_TYPE = { combat: 'combat', gathering: 'gathering', fishing: 'fishing', craft: 'crafting', cooking: 'cooking', multi: 'multi' };

// Stats (and Combat's roster) are all-zero noise before a session exists -
// gated on session.id, not just which tab is active, so a tab shows ONLY
// its landing/browse info until something's actually being logged. Called
// from the tab-click handler below and from sessionStarted/sessionEnded.
function updateStatsBarVisibility() {
  const activeTab = document.querySelector('.tab.active');
  if (!activeTab) return;
  const running = !!session.id;
  const isFishing = activeTab.dataset.tab === 'fishing';
  const isCooking = activeTab.dataset.tab === 'cooking';
  const isGathering = activeTab.dataset.tab === 'gathering';
  document.getElementById('stats-combat').style.display = (running && !isFishing && !isCooking && !isGathering) ? '' : 'none';
  document.getElementById('stats-fishing').style.display = (running && isFishing) ? '' : 'none';
  document.getElementById('stats-cooking').style.display = (running && isCooking) ? '' : 'none';
  document.getElementById('stats-gathering').style.display = (running && isGathering) ? '' : 'none';
  if (isFishing) updateFishStats();
  if (isCooking) updateCookingStats();
  if (isGathering) updateGatherStats();
}

// Tabs that actually put data-tip on things worth hovering - a plain hint
// on every tab (including still-empty Crafting/Multi/Lookup) would just be
// noise where there's nothing to discover yet.
const TABS_WITH_TOOLTIPS = new Set(['combat', 'gathering', 'fishing', 'cooking']);

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel-body').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('panel-' + t.dataset.tab).classList.add('active');
  if (TAB_SESSION_TYPE[t.dataset.tab]) {
    session.type = TAB_SESSION_TYPE[t.dataset.tab];
  }
  document.getElementById('tooltip-hint').style.display = TABS_WITH_TOOLTIPS.has(t.dataset.tab) ? 'block' : 'none';
  updateStatsBarVisibility();
  updateCombatSessionVisibility();
}));

// ---------------------------------------------------------------------------
// Session start/end - one button, state-dependent (2026-08-27). Used to be
// two separate buttons, but the plain "Start session" one could bypass
// Fishing/Gathering's own prompt flow entirely (clicking it there started a
// session with no zone/skill/tradeskill ever collected, leaving the tab's
// own active-screen state out of sync with a session that technically
// existed). One button removes that wrong path: while no session is
// running it starts one, handing off to the active tab's own prompt flow
// if it has one (TAB_START_ENTRY); while a session IS running it ends +
// exports. Label/tooltip/click-behavior all just follow session.id.
// ---------------------------------------------------------------------------
const btnSession = document.getElementById('btn-session-action');

// Tabs with their own prompt-driven start flow hand off to that flow's
// entry point instead of starting a plain session immediately - same
// pattern Fishing/Gathering's own pre-start screens already use. Tabs
// without one yet fall back to startNewSession() directly below. Extend
// this as more tabs get their own prompt flow.
const TAB_START_ENTRY = { fishing: openFishSkillModal, gathering: openGatherZoneModal };

function setSessionButtonState(running) {
  btnSession.disabled = false;
  if (running) {
    btnSession.textContent = 'End session & export';
    btnSession.setAttribute('data-tip', 'Writes everything logged since the session started to a text file in Sessions\\, ready to hand to Claude for a wiki update.');
  } else {
    btnSession.textContent = 'Start new session';
    btnSession.setAttribute('data-tip', 'Starts a new session. On tabs with their own prompts (Fishing, Gathering), this walks you through those first.');
  }
}

// Shared by the button's "no session running" branch and Fishing/Gathering's
// own prompt-chain end point (they collect zone/skill/tradeskill first, then
// call this to actually start). Returns false (and toasts why) if a session
// couldn't be started.
function startNewSession() {
  if (!profileState.active) {
    showToast('Pick or add a profile first');
    return false;
  }
  session.loggedBy = profileState.active;
  session.startedAt = Date.now();
  const activeTab = document.querySelector('.tab.active');
  session.type = TAB_SESSION_TYPE[activeTab.dataset.tab] || 'combat';
  roster.clear();
  activeTarget = null;
  renderRoster();
  renderDetail();
  updateStats();

  sendToHost({ type: 'startSession', sessionType: session.type, loggedBy: session.loggedBy });
  return true;
}

btnSession.addEventListener('click', () => {
  if (session.id) {
    // Disable immediately rather than waiting for the async 'sessionEnded'
    // reply - otherwise a rapid double-click fires this handler twice before
    // the first round trip lands, and the second click's now-orphaned
    // messages surface a confusing "Error: Unknown session" toast even though
    // nothing was actually lost (the host already rejects them safely).
    btnSession.disabled = true;
    flushPendingFishAttempts(); // must happen before endSession - the session still needs to exist host-side to accept this last entry
    if (fishingSession.startSkillSent) {
      // Record the skill as of session end too, in case the player skilled up
      // but didn't happen to catch anything after the last logged entry.
      sendToHost({ type: 'fishingEnded', sessionId: session.id, skill: fishingSession.skill });
    }
    if (gatheringSession.startSkillSent) {
      sendToHost({ type: 'gatheringEnded', sessionId: session.id, skill: gatheringSession.skill });
    }
    sendToHost({ type: 'endSession', sessionId: session.id });
    return;
  }
  // Checked here (not left to startNewSession()'s own check) so a tab with
  // its own prompt flow doesn't walk the user through 3 modals only to fail
  // silently-ish on the last one - and so this button doesn't sit disabled
  // forever with nothing left to re-enable it, since TAB_START_ENTRY's
  // functions don't report back whether they ever actually reach that call.
  if (!profileState.active) {
    showToast('Pick or add a profile first');
    return;
  }
  btnSession.disabled = true;
  // Read fresh at click time, not cached - the active tab can change between
  // renders (same reasoning as startNewSession()'s own tab.active read).
  const entry = TAB_START_ENTRY[document.querySelector('.tab.active').dataset.tab];
  if (entry) { entry(); } else { startNewSession(); }
});

onHostMessage((msg) => {
  if (msg.type === 'sessionStarted') {
    session.id = msg.sessionId;
    setSessionButtonState(true);
    updateStatsBarVisibility();
    updateCombatSessionVisibility();
    profileSelect.disabled = true;
    document.getElementById('session-sub').textContent = 'Session running · logged by ' + session.loggedBy;
    if (pendingFishingStart) {
      pendingFishingStart = false;
      startFishing();
    }
    if (pendingGatheringStart) {
      pendingGatheringStart = false;
      startGathering();
    }
  } else if (msg.type === 'sessionEnded') {
    showToast('Exported ' + msg.entryCount + ' entries to ' + msg.exportFileName);
    showSubmitExportBanner(msg.exportFileName);
    session.id = null;
    session.startedAt = null;
    setSessionButtonState(false);
    updateStatsBarVisibility();
    updateCombatSessionVisibility();
    profileSelect.disabled = false;
    document.getElementById('session-sub').textContent = 'No session running';
    roster.clear();
    activeTarget = null;
    renderRoster();
    renderDetail();
    gatheringSession.active = false;
    gatheringSession.tradeskill = '';
    gatheringSession.zone = '';
    gatheringSession.skill = 0;
    gatheringSession.entries = [];
    gatheringSession.customNodes = [];
    gatheringSession.startSkillSent = false;
    renderGatheringPanel();
    updateGatherStats();
    dishRoster.clear();
    activeDish = null;
    renderDishRoster();
    renderDishDetail();
    updateCookingStats();
    stopKeyCounting();
    fishingSession.active = false;
    fishingSession.zone = '';
    fishingSession.area = '';
    fishingSession.skill = 0;
    fishingSession.liveAttempts = 0;
    fishingSession.entries = [];
    fishingSession.customFish = [];
    fishingSession.startSkillSent = false;
    keyState.spamPaused = false;
    keyPressTimestamps.length = 0;
    renderFishingPanel();
    updateStats();
    updateFishStats();
  } else if (msg.type === 'wikiData') {
    wikiData.monsters = msg.monsters || [];
    wikiData.items = msg.items || [];
    wikiData.nodes = msg.nodes || [];
    wikiData.recipes = msg.recipes || [];
    wikiData.factions = msg.factions || [];
    wikiData.zones = msg.zones || [];
    wikiData.pageUrl = msg.pageUrl || '';
    const mobList = document.getElementById('mob-list');
    mobList.innerHTML = wikiData.monsters.map(m => `<option value="${escapeHtml(m.name)}"></option>`).join('');
    refreshDishList();
    // Fishing/Gathering's landing screens build their zone picker's options
    // from wikiData.zones inline in a bigger template rendered once at init
    // (before this message has arrived, so wikiData.zones was still empty
    // then) - re-rendering the whole panel is what actually rebuilds the
    // picker with real options, not just the narrower info sub-functions.
    // Combat's own landing zone picker doesn't have this problem since
    // renderCombatLandingInfo() always rebuilds it fresh from wikiData.zones.
    if (fishingSession.active) { renderFishPickGrid(); renderFishRarityPanel(); } else { renderFishingPanel(); }
    if (gatheringSession.active) { renderGatherNodeGrid(); } else { renderGatheringPanel(); }
    renderCombatLandingInfo();
    if (msg.error) showToast('Wiki data unavailable — autocomplete limited (' + msg.error + ')');
  } else if (msg.type === 'profiles') {
    profileState.profiles = msg.profiles || [];
    if (profileState.profiles.length === 0) {
      renderProfileSelect();
      openProfileModal({ firstRun: true });
    } else {
      profileState.active = (msg.lastUsed && profileState.profiles.includes(msg.lastUsed))
        ? msg.lastUsed : profileState.profiles[0];
      renderProfileSelect();
    }
  } else if (msg.type === 'updateInfo') {
    document.getElementById('app-version').textContent = 'v' + msg.currentVersion + ' · built ' + msg.buildDate;
    if (msg.error) {
      if (msg.manual) showToast('Could not check for updates: ' + msg.error);
    } else if (msg.available) {
      showUpdateBanner(msg.latestVersion, msg.url);
    } else if (msg.manual) {
      showToast('You\'re on the latest version.');
    }
  } else if (msg.type === 'fishRarity') {
    // A one-time snapshot of every Fishing attempt ever logged (all
    // sessions), keyed by zone - see computeZoneRarity() for how this gets
    // combined with the CURRENT session's own catches/attempts, which
    // aren't in this snapshot since it's taken once at 'ready'.
    fishRarityBaseline = msg.data || {};
    if (fishingSession.active) renderFishRarityPanel();
  } else if (msg.type === 'sharedFishRarity') {
    sharedFishRarityBaseline = msg.data || {};
    if (fishingSession.active) renderFishRarityPanel();
  } else if (msg.type === 'combatLevelRange') {
    combatLevelRangeBaseline = msg.data || {};
    if (combatLandingZone) renderCombatLandingInfo();
  } else if (msg.type === 'submitExportResult') {
    const el = document.getElementById('submit-export-banner');
    if (msg.ok) {
      el.innerHTML = `<span>Submitted — thanks! It's waiting for review on the wiki now.</span><span><a href="#" id="submit-export-dismiss">Dismiss</a></span>`;
    } else {
      el.innerHTML = `<span>Couldn't submit: ${escapeHtml(msg.error || 'unknown error')}</span><span><a href="#" id="submit-export-retry">Retry</a><a href="#" id="submit-export-dismiss">Dismiss</a></span>`;
      const retry = document.getElementById('submit-export-retry');
      if (retry) retry.addEventListener('click', e => { e.preventDefault(); showSubmitExportBanner(msg.fileName); document.getElementById('submit-export-go').click(); });
    }
    document.getElementById('submit-export-dismiss').addEventListener('click', e => { e.preventDefault(); el.style.display = 'none'; });
  } else if (msg.type === 'error') {
    showToast('Error: ' + msg.message);
    // Safety net: if a session is still genuinely running (host-side export
    // hit a real problem rather than this being a harmless redundant
    // double-click response), don't leave "End session" stuck disabled with
    // no way to retry.
    if (session.id) btnSession.disabled = false;
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Wiki location strings aren't always the bare zone name - e.g.
// "Night Harbor (West Gate, North Gate)" or "Shaded Dunes, on the way to
// Tel'Ekir" - so an exact-match against wikiData.zones (which IS just the
// bare name) silently misses those, and the node/fish never gets flagged
// "expected" in the right zone. Matches on the zone name being a genuine
// prefix (not just any substring another zone's name happens to contain)
// followed by a word boundary, so "Vale" can't accidentally match inside a
// longer unrelated location.
function locationMatchesZone(location, zone) {
  if (!location || !zone) return false;
  if (location === zone) return true;
  if (!location.startsWith(zone)) return false;
  const rest = location.slice(zone.length);
  return rest === '' || /^[\s,(\-]/.test(rest);
}

// Pulls the "(West Gate, North Gate)" / ", on the way to Tel'Ekir" part back
// out for display - the sub-area detail is genuinely useful (tells you WHERE
// in the zone, not just that it's somewhere in it), so worth surfacing
// rather than just silently discarding it once the lenient match above
// no longer needs an exact string.
function extractLocationDetail(location, zone) {
  if (!locationMatchesZone(location, zone) || location === zone) return '';
  let rest = location.slice(zone.length).trim();
  rest = rest.replace(/^[,\-]\s*/, '');
  const parenMatch = rest.match(/^\(([^)]*)\)$/);
  return parenMatch ? parenMatch[1] : rest;
}

// A stable per-entry id, generated client-side at logging time so a single
// entry can be referenced later (currently: editing a fishing catch still in
// the active session - see 'editEntry'). No uniqueness guarantee needed
// beyond "won't collide within one session."
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
setInterval(() => {
  if (!session.startedAt) { document.getElementById('clock').textContent = '00:00:00'; return; }
  const s = Math.floor((Date.now() - session.startedAt) / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  document.getElementById('clock').textContent = `${hh}:${mm}:${ss}`;
}, 1000);

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------
document.getElementById('add-mob').addEventListener('click', addMobFromInput);
document.getElementById('new-mob').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMobFromInput(); });

function addMobFromInput() {
  const input = document.getElementById('new-mob');
  const name = input.value.trim();
  if (!name) return;
  if (!session.id) { showToast('Start a session first'); return; }
  if (!roster.has(name)) roster.set(name, { entries: [] });
  activeTarget = name;
  input.value = '';
  renderRoster();
  renderDetail();
}

function renderRoster() {
  const el = document.getElementById('roster-list');
  if (roster.size === 0) {
    el.innerHTML = '<div class="roster-empty">No monsters yet &mdash; add one above.</div>';
    return;
  }
  el.innerHTML = '';
  for (const [name, data] of roster) {
    const coin = sumCoin(data.entries);
    const div = document.createElement('div');
    div.className = 'roster-item' + (name === activeTarget ? ' selected' : '');
    div.innerHTML = `
      <span class="roster-item-remove" data-name="${escapeHtml(name)}" title="Remove ${escapeHtml(name)} from this session">&times;</span>
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">${data.entries.length} kill${data.entries.length === 1 ? '' : 's'} &middot; ${fmtCoin(coin)}</div>
      <div class="quickadd"><button class="mini-btn quick-kill" data-name="${escapeHtml(name)}">+1 kill</button></div>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('quick-kill') || e.target.classList.contains('roster-item-remove')) return;
      activeTarget = name;
      renderRoster();
      renderDetail();
    });
    el.appendChild(div);
  }
  el.querySelectorAll('.roster-item-remove').forEach(x => x.addEventListener('click', (e) => {
    e.stopPropagation();
    roster.delete(x.dataset.name);
    if (activeTarget === x.dataset.name) activeTarget = null;
    renderRoster();
    renderDetail();
    updateStats();
  }));
  el.querySelectorAll('.quick-kill').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    logKill(btn.dataset.name, { con: 'Dark Blue', playerLevel: null, coin: { platinum: 0, gold: 0, silver: 0, copper: 0 }, items: [], named: false, factionChanges: [] });
  }));
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------
let pendingItems = [];

function renderDetail() {
  const el = document.getElementById('detail-panel');
  if (!activeTarget) {
    el.innerHTML = '<div class="detail-empty">Add a monster to the roster, then select it to start logging kills.</div>';
    return;
  }
  const data = roster.get(activeTarget);
  pendingItems = [];
  el.innerHTML = `
    <div class="detail-head"><h2>${escapeHtml(activeTarget)}</h2></div>
    <div class="field-grid">
      <div><label>Zone</label><input id="f-zone" placeholder="e.g. Vale of Zintar" /></div>
      <div><label>Con</label>
        <select id="f-con">
          <option>Trivial</option><option>Green</option><option>Light Blue</option>
          <option selected>Dark Blue</option><option>White</option><option>Yellow</option><option>Red</option>
        </select>
      </div>
      <div><label>Your level</label><input id="f-level" type="number" min="0" /></div>
      <div><label>Named?</label><select id="f-named"><option>No</option><option>Yes</option></select></div>
    </div>
    <label>Coin drop (total off the corpse)</label>
    <div class="field-grid">
      <input id="f-plat" type="number" placeholder="platinum" min="0" />
      <input id="f-gold" type="number" placeholder="gold" min="0" />
      <input id="f-silver" type="number" placeholder="silver" min="0" />
      <input id="f-copper" type="number" placeholder="copper" min="0" />
    </div>
    <label>Faction change (optional)</label>
    <div style="display:flex; gap:8px; margin-bottom:10px;">
      ${checklistDropdownHTML('f-faction-pos', 'Went up', wikiData.factions, { tip: 'Factions this kill improved your standing with, if any.' })}
      ${checklistDropdownHTML('f-faction-neg', 'Went down', wikiData.factions, { tip: 'Factions this kill worsened your standing with, if any.' })}
    </div>
    <label>Items looted</label>
    <div style="display:flex; gap:8px;">
      <input id="f-item" list="item-list" placeholder="Search item name&hellip;" autocomplete="off" />
      <datalist id="item-list">${wikiData.items.map(i => `<option value="${escapeHtml(i.name)}"></option>`).join('')}</datalist>
      <button class="mini-btn" id="add-item-btn" style="padding:0 14px;">Add</button>
    </div>
    <div class="chips" id="item-chips"></div>
    <div class="err" id="detail-err"></div>
    <button class="primary-btn" id="log-kill-btn">Log encounter</button>
    <div class="log">
      <div class="log-title">Kills logged &mdash; ${escapeHtml(activeTarget)}</div>
      <div id="kill-log"></div>
    </div>
  `;
  const factionPos = setupChecklistDropdown('f-faction-pos');
  const factionNeg = setupChecklistDropdown('f-faction-neg');
  document.getElementById('add-item-btn').addEventListener('click', () => {
    const input = document.getElementById('f-item');
    const v = input.value.trim();
    if (!v) return;
    pendingItems.push(v);
    input.value = '';
    renderChips();
  });
  document.getElementById('log-kill-btn').addEventListener('click', () => {
    const err = document.getElementById('detail-err');
    const zone = document.getElementById('f-zone').value.trim();
    if (!zone) {
      err.textContent = 'Enter a zone first';
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';
    const entry = {
      zone,
      con: document.getElementById('f-con').value,
      playerLevel: document.getElementById('f-level').value ? Number(document.getElementById('f-level').value) : null,
      named: document.getElementById('f-named').value === 'Yes',
      coin: {
        platinum: Number(document.getElementById('f-plat').value) || 0,
        gold: Number(document.getElementById('f-gold').value) || 0,
        silver: Number(document.getElementById('f-silver').value) || 0,
        copper: Number(document.getElementById('f-copper').value) || 0,
      },
      items: pendingItems.slice(),
      factionChanges: [
        ...factionPos.getSelected().map(faction => ({ faction, effect: 'positive' })),
        ...factionNeg.getSelected().map(faction => ({ faction, effect: 'negative' })),
      ],
    };
    logKill(activeTarget, entry);
  });
  renderChips();
  renderKillLog();
}

function renderChips() {
  const el = document.getElementById('item-chips');
  if (!el) return;
  el.innerHTML = pendingItems.map((it, i) => {
    const known = !!findItem(it);
    return `<span class="chip${known ? '' : ' new'}">${escapeHtml(it)}${known ? '' : ' (new)'} <span class="x" data-i="${i}">&times;</span></span>`;
  }).join('');
  el.querySelectorAll('.x').forEach(x => x.addEventListener('click', () => {
    pendingItems.splice(+x.dataset.i, 1);
    renderChips();
  }));
}

function renderKillLog() {
  const el = document.getElementById('kill-log');
  if (!el) return;
  const data = roster.get(activeTarget);
  if (!data || data.entries.length === 0) {
    el.innerHTML = '<div class="roster-empty">No kills logged yet.</div>';
    return;
  }
  el.innerHTML = data.entries.slice().reverse().map(e => {
    const conClass = 'con-' + e.con.toLowerCase().replace(' ', '');
    const when = new Date(e.loggedAt).toLocaleTimeString();
    return `<div class="log-row"><span><span class="con-pill ${conClass}">${e.con}</span>&nbsp;${fmtCoin(e.coin)}${e.items.length ? ' &middot; ' + e.items.map(escapeHtml).join(', ') : ''}</span><span class="when">${when}</span></div>`;
  }).join('');
}

function logKill(target, entry) {
  if (!roster.has(target)) roster.set(target, { entries: [] });
  entry.loggedAt = Date.now();
  roster.get(target).entries.push(entry);

  sendToHost({
    type: 'logEntry',
    sessionId: session.id,
    sessionType: 'combat',
    entry: Object.assign({ target }, entry),
  });

  renderRoster();
  if (target === activeTarget) renderDetail();
  updateStats();
}

// ---------------------------------------------------------------------------
// Gathering (Mining / Lumberjacking / Herbalism - Foraging excluded for now,
// barely implemented in the wiki). Redesigned 2026-08-26 to follow Fishing's
// pattern instead of the roster+detail pattern: pick tradeskill, pick zone,
// auto-start, then fast one-tap logging. Deliberately NO attempts counter and
// NO key-listener - unlike Fishing's cast-and-see-what-you-get loop (which
// needs an attempts count to measure drop/skill-threshold rates), a gathering
// node is a discrete, deliberate interaction, so a manual skill counter is
// the only counting-buttons piece that carries over.
// ---------------------------------------------------------------------------
const GATHER_TRADESKILLS = ['Mining', 'Lumberjacking', 'Herbalism'];

// gatheringSession.entries: {id, target (node type name), zone, skill,
// success, resultItem (material), loggedAt}. Two-tap flow to log one: tap a
// node type, then tap which material it gave (or "No result") - a node type
// can yield several different materials per the wiki data, so tapping the
// node alone can't be the whole answer the way tapping a fish is for Fishing.
const gatheringSession = {
  active: false,
  tradeskill: '',
  zone: '',
  skill: 0,
  entries: [],
  customNodes: [],
  startSkillSent: false,
};

let gatherZoneCtrl = null;
let gatherZoneModalCtrl = null;
let pendingGatheringNode = null; // which node type the material modal is currently open for
let pendingGatheringStart = false; // session was just requested for gathering - start it once 'sessionStarted' confirms
let editingGatherEntryId = null;

// Landing-only, deliberately separate from gatheringSession.tradeskill - a
// real gathering session is always exactly one tradeskill, but browsing
// isn't a session, so it can show several at once (toggle any number on/off,
// e.g. Lumberjacking + Herbalism together). Doesn't feed into the real
// start-flow's own single-select tradeskill modal - there's no sensible
// single value to carry over from a multi-select browse into a
// single-tradeskill session anyway.
let gatherLandingTradeskills = [];

function renderGatheringPanel() {
  const el = document.getElementById('panel-gathering');

  if (!gatheringSession.active) {
    // Stale from a previous active-screen render - same reasoning as
    // Fishing's equivalent reset in renderFishingPanel().
    gatherZoneCtrl = null;
    el.innerHTML = `
      <div class="detail" style="text-align:center; padding: 48px 20px 24px;">
        <p style="font-size:13px; color:var(--text-secondary); max-width:38ch; margin:0 auto 20px;">
          Pick what you're gathering and where &mdash; the app will show you what's expected
          to find there, from the wiki's own data.
        </p>
        <button class="primary-btn" id="gather-start-btn" style="max-width:260px; margin:0 auto;">Let's start gathering!</button>
      </div>
      <div class="detail" style="text-align:left; max-width:440px; margin:24px auto 0; border-top:1px solid var(--border); padding-top:22px;">
        <label>Browse a zone <span style="color:var(--text-muted); font-weight:400;">(no session needed)</span></label>
        <div style="display:flex; gap:8px; margin-bottom:10px;">
          ${GATHER_TRADESKILLS.map(ts => `<button class="mini-btn${gatherLandingTradeskills.includes(ts) ? ' active' : ''}" data-landing-tradeskill="${escapeHtml(ts)}">${escapeHtml(ts)}</button>`).join('')}
        </div>
        ${checklistDropdownHTML('gather-landing-zone', gatheringSession.zone ? gatheringSession.zone : 'Select zone', wikiData.zones, { multi: false, selected: gatheringSession.zone ? [gatheringSession.zone] : [] })}
        <div id="gather-landing-info" style="margin-top:10px;"></div>
      </div>
    `;
    document.getElementById('gather-start-btn').addEventListener('click', openGatherZoneModal);
    el.querySelectorAll('[data-landing-tradeskill]').forEach(btn => btn.addEventListener('click', () => {
      const ts = btn.dataset.landingTradeskill;
      const idx = gatherLandingTradeskills.indexOf(ts);
      if (idx === -1) { gatherLandingTradeskills.push(ts); } else { gatherLandingTradeskills.splice(idx, 1); }
      renderGatheringPanel();
    }));
    const landingZoneCtrl = setupChecklistDropdown('gather-landing-zone', { multi: false, onChange: () => {
      gatheringSession.zone = landingZoneCtrl.getValue();
      renderGatherLandingInfo();
    } });
    renderGatherLandingInfo();
    return;
  }

  el.innerHTML = `
    <div class="detail">
      <p style="text-align:center; font-size:13.5px; color:var(--text-secondary); margin:0 0 14px;">
        Gathering <b style="color:var(--text-primary);">${escapeHtml(gatheringSession.tradeskill)}</b>.
        Tap a node type below to log what you found there.
      </p>
      <div class="field-grid" style="margin-bottom:4px;">
        <div><label>Zone</label>${checklistDropdownHTML('gather-zone', gatheringSession.zone ? gatheringSession.zone : 'Select zone', wikiData.zones, { multi: false, selected: gatheringSession.zone ? [gatheringSession.zone] : [] })}</div>
      </div>
      ${renderGatherSkillCounterHTML(gatheringSession)}
      <label>Click the node type you found</label>
      <div class="fish-pick-grid" id="gather-node-grid"></div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <input id="gather-new-node" placeholder="Not listed? Type its name&hellip;" autocomplete="off" />
        <button class="mini-btn" id="gather-add-node-btn" style="padding:0 14px;">+ Add</button>
      </div>
      <div class="log" style="margin-top:18px;">
        <div class="log-title">Logged this session</div>
        <div id="gather-log"></div>
      </div>
    </div>
  `;
  gatherZoneCtrl = setupChecklistDropdown('gather-zone', { multi: false, onChange: () => { gatheringSession.zone = gatherZoneCtrl.getValue(); renderGatherNodeGrid(); } });
  bindGatherSkillEvents();
  renderGatherNodeGrid();
  document.getElementById('gather-add-node-btn').addEventListener('click', addCustomGatherNode);
  document.getElementById('gather-new-node').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomGatherNode(); });
  renderGatherLog();
}

// Modal chain order (2026-08-26): zone, then tradeskill, then skill - skill
// last so it's the freshest thing asked right before logging starts, since
// forgetting to set it (and pushing finds at skill 0) was a real problem.
function openGatherZoneModal() {
  document.getElementById('gather-zone-modal-picker').innerHTML = checklistDropdownHTML(
    'gather-zone-modal', gatheringSession.zone ? gatheringSession.zone : 'Select zone', wikiData.zones,
    { multi: false, selected: gatheringSession.zone ? [gatheringSession.zone] : [] }
  );
  gatherZoneModalCtrl = setupChecklistDropdown('gather-zone-modal', { multi: false });
  document.getElementById('gather-zone-modal').classList.add('open');
}

document.getElementById('gather-zone-modal-go').addEventListener('click', () => {
  // Zone is optional, same reasoning as Fishing's zone modal.
  gatheringSession.zone = gatherZoneModalCtrl ? gatherZoneModalCtrl.getValue() : '';
  document.getElementById('gather-zone-modal').classList.remove('open');
  openGatherTradeskillModal();
});

function openGatherTradeskillModal() {
  document.getElementById('gather-tradeskill-modal').classList.add('open');
}
function chooseGatherTradeskill(tradeskill) {
  gatheringSession.tradeskill = tradeskill;
  document.getElementById('gather-tradeskill-modal').classList.remove('open');
  openGatherSkillModal();
}
document.getElementById('gather-tradeskill-mining').addEventListener('click', () => chooseGatherTradeskill('Mining'));
document.getElementById('gather-tradeskill-lumberjacking').addEventListener('click', () => chooseGatherTradeskill('Lumberjacking'));
document.getElementById('gather-tradeskill-herbalism').addEventListener('click', () => chooseGatherTradeskill('Herbalism'));

function openGatherSkillModal() {
  document.getElementById('gather-skill-modal-body').textContent =
    `What's your current ${gatheringSession.tradeskill} skill? You can adjust it any time once you're gathering.`;
  document.getElementById('gather-skill-modal-input').value = gatheringSession.skill || '';
  document.getElementById('gather-skill-modal-err').style.display = 'none';
  document.getElementById('gather-skill-modal').classList.add('open');
  document.getElementById('gather-skill-modal-input').focus();
}

document.getElementById('gather-skill-modal-go').addEventListener('click', () => {
  const input = document.getElementById('gather-skill-modal-input');
  const v = parseInt(input.value, 10);
  if (input.value.trim() && (isNaN(v) || v < 0)) {
    document.getElementById('gather-skill-modal-err').textContent = 'Enter a valid skill number';
    document.getElementById('gather-skill-modal-err').style.display = 'block';
    return;
  }
  gatheringSession.skill = isNaN(v) ? 0 : v;
  document.getElementById('gather-skill-modal').classList.remove('open');
  if (session.id) {
    // A session is already running (e.g. started from another tab) - join it.
    startGathering();
    return;
  }
  // Same async-race reasoning as Fishing: startSession's reply is a real
  // round trip, so don't call startGathering() until 'sessionStarted' confirms.
  if (!startNewSession()) return;
  pendingGatheringStart = true;
});
document.getElementById('gather-skill-modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('gather-skill-modal-go').click(); });

function startGathering() {
  gatheringSession.active = true;
  if (!gatheringSession.startSkillSent) {
    gatheringSession.startSkillSent = true;
    sendToHost({ type: 'gatheringStarted', sessionId: session.id, skill: gatheringSession.skill });
  }
  renderGatheringPanel();
}

function renderGatherSkillCounterHTML(data) {
  return `
    <div id="gather-skill-box" style="background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 8px; padding: 12px 14px; margin: 0 0 14px;">
      <label style="margin:0 0 8px;">Your skill &mdash; bump this (or type it) the moment you skill up</label>
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="mini-btn" id="gather-skill-minus">-</button>
        <input type="number" id="gather-skill-input" min="0" value="${data.skill}"
          style="font-family:Consolas,monospace; font-size:26px; font-weight:600; width:80px; text-align:center; padding:4px;" />
        <button class="mini-btn" id="gather-skill-plus">+</button>
      </div>
    </div>
  `;
}

function bindGatherSkillEvents() {
  const input = document.getElementById('gather-skill-input');
  document.getElementById('gather-skill-minus').addEventListener('click', () => {
    gatheringSession.skill = Math.max(0, gatheringSession.skill - 1);
    input.value = gatheringSession.skill;
    renderGatherNodeGrid();
  });
  document.getElementById('gather-skill-plus').addEventListener('click', () => {
    gatheringSession.skill = gatheringSession.skill + 1;
    input.value = gatheringSession.skill;
    renderGatherNodeGrid();
  });
  input.addEventListener('input', () => {
    const v = parseInt(input.value, 10);
    gatheringSession.skill = isNaN(v) ? 0 : Math.max(0, v);
    renderGatherNodeGrid();
  });
}

// Difficulty guess for a node at the player's current skill - an estimate,
// not measured data: the wiki only gives us two points (minSkill = can't
// attempt below it, trivialSkill = no more skill-ups at/above it), so the
// range between is split into 7 even bands using the wiki's own recipe
// difficulty vocabulary/colors (see .tier-* in style.css). Null when the
// node has no min/trivial skill in the wiki (true for a real chunk of
// nodes, mostly Mining) - no data in, no color guessed out.
function gatherDifficultyTier(node, skill) {
  if (!node || node.minSkill == null || node.trivialSkill == null) return null;
  const min = node.minSkill, trivial = node.trivialSkill;
  const pct = trivial > min ? (skill - min) / (trivial - min) : (skill >= trivial ? 1 : 0);
  if (pct >= 6 / 7) return 'green';
  if (pct >= 5 / 7) return 'light-blue';
  if (pct >= 4 / 7) return 'dark-blue';
  if (pct >= 3 / 7) return 'white';
  if (pct >= 2 / 7) return 'yellow';
  if (pct >= 1 / 7) return 'orange';
  return 'red';
}

// Landing-screen preview (2026-08-27) - read-only, no session needed: just
// which node types are expected in the picked zone+tradeskill. No difficulty
// tier here (skill isn't known yet pre-session, so a guess would just show
// everything as the hardest color) and no tap-to-log click handlers (there's
// nothing to log yet). Once gathering starts, renderGatherNodeGrid() below
// takes over with the full interactive version.
function renderGatherLandingInfo() {
  const el = document.getElementById('gather-landing-info');
  if (!el) return;
  const zone = gatheringSession.zone;
  const tradeskills = gatherLandingTradeskills;
  if (!zone || tradeskills.length === 0) {
    el.innerHTML = `<p class="landing-info-empty">Pick a zone and at least one tradeskill to see what you can expect to find there.</p>`;
    return;
  }
  const known = wikiData.nodes.filter(n => tradeskills.includes(n.tradeskill));
  const expected = known
    .filter(n => (n.locations || []).some(loc => locationMatchesZone(loc, zone)))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (known.length === 0) {
    el.innerHTML = `<p class="landing-info-empty">No data in the wiki yet for ${tradeskills.map(escapeHtml).join(', ')}.</p>`;
  } else if (expected.length === 0) {
    el.innerHTML = `<p class="landing-info-empty">Nothing expected in ${escapeHtml(zone)} yet, per the wiki.</p>`;
  } else {
    // Tagged with its tradeskill via tooltip - harmless when only one
    // tradeskill is picked, disambiguates when several are shown at once.
    el.innerHTML = `
      <div class="fish-pick-expected-box">
        <div class="fish-pick-expected-label">Expected in this zone</div>
        ${expected.map(n => `<span class="fish-pick-btn" style="cursor:default;" data-tip="${escapeHtml(n.tradeskill)}">${escapeHtml(n.name)}</span>`).join('')}
      </div>
    `;
  }
}

// Sorts/highlights the same way Fishing's fish-pick-grid does: known node
// types for this tradeskill, "expected in this zone" (wiki locations ∪
// anything actually found here this session) sorted to the top, a running
// catch count per node type, and a "new" badge for anything not in the wiki.
function renderGatherNodeGrid() {
  const el = document.getElementById('gather-node-grid');
  if (!el) return;
  const known = wikiData.nodes.filter(n => n.tradeskill === gatheringSession.tradeskill).map(n => n.name);
  const all = [...known, ...gatheringSession.customNodes.filter(f => !known.includes(f))];

  const selectedZone = gatherZoneCtrl ? gatherZoneCtrl.getValue() : gatheringSession.zone;
  const wikiExpected = wikiData.nodes
    .filter(n => n.tradeskill === gatheringSession.tradeskill && selectedZone && (n.locations || []).some(loc => locationMatchesZone(loc, selectedZone)))
    .map(n => n.name);
  const sessionGatheredHere = gatheringSession.entries.filter(e => e.success && e.zone === selectedZone).map(e => e.target);
  const expectedNames = new Set([...wikiExpected, ...sessionGatheredHere]);

  const catchCounts = {};
  gatheringSession.entries.forEach(e => {
    if (e.success) catchCounts[e.target] = (catchCounts[e.target] || 0) + 1;
  });

  function renderBtn(f) {
    const nodeData = wikiData.nodes.find(n => n.tradeskill === gatheringSession.tradeskill && n.name === f);
    const tier = gatherDifficultyTier(nodeData, gatheringSession.skill);
    const classes = ['fish-pick-btn'];
    if (!known.includes(f)) classes.push('new');
    if (tier) classes.push('tier-' + tier);
    const count = catchCounts[f] ? `<span class="fish-pick-count">&times;${catchCounts[f]}</span>` : '';
    const newBadge = !known.includes(f) ? '<span class="fish-pick-new-badge">new</span>' : '';

    // One combined tooltip - difficulty guess, the wiki's own testing/caveat
    // note if it has one (often directly about how sure minSkill/trivialSkill
    // actually are, which should inform trust in the color above it), and
    // the sub-area detail from whichever matched location pulled this node
    // into "expected" (e.g. "West Gate, North Gate" inside Night Harbor).
    const tipParts = [];
    if (tier) tipParts.push(`Guessed difficulty at skill ${gatheringSession.skill}, from this node's ${nodeData.minSkill}-${nodeData.trivialSkill} skill range in the wiki - not measured.`);
    if (nodeData && nodeData.note) tipParts.push(`Wiki note: ${nodeData.note}`);
    if (nodeData && selectedZone) {
      const matchedLoc = (nodeData.locations || []).find(loc => locationMatchesZone(loc, selectedZone));
      const detail = matchedLoc ? extractLocationDetail(matchedLoc, selectedZone) : '';
      if (detail) tipParts.push(`Specifically: ${detail}`);
    }
    const tip = tipParts.length ? ` data-tip="${escapeHtml(tipParts.join(' '))}"` : '';

    return `<button class="${classes.join(' ')}"${tip} data-node="${escapeHtml(f)}">${escapeHtml(f)}${count}${newBadge}</button>`;
  }

  const expected = all.filter(f => expectedNames.has(f)).sort();
  const rest = all.filter(f => !expectedNames.has(f)).sort();
  let html = '';
  if (expected.length > 0) {
    html += `<div class="fish-pick-expected-box"><div class="fish-pick-expected-label">Expected in this zone</div>${expected.map(renderBtn).join('')}</div>`;
  }
  html += rest.map(renderBtn).join('');
  el.innerHTML = html;
  el.querySelectorAll('.fish-pick-btn[data-node]').forEach(btn => btn.addEventListener('click', () => openGatherMaterialModal(btn.dataset.node)));
}

function addCustomGatherNode() {
  const input = document.getElementById('gather-new-node');
  const name = input.value.trim();
  if (!name) return;
  if (!gatheringSession.customNodes.includes(name)) gatheringSession.customNodes.push(name);
  input.value = '';
  renderGatherNodeGrid();
}

// The second tap: which material(s) this particular gather gave, from the
// node's own wiki `results` union'd with whatever's actually been logged for
// this node type this session - same "session observations feed back into
// expected" reasoning as Fishing's zone-expected fish. No "no result" option
// here (2026-08-26) - not interesting enough for these node types to track.
// Multi-pick with quantity: each click bumps a pending count for that
// material (`pendingMaterialCounts`), nothing is actually logged until "Log
// it" - lets the user click Copper Ore, Copper Ore, Brittle Stone, then
// confirm all three in one go instead of one modal round trip per unit.
let pendingMaterialCounts = {};

function openGatherMaterialModal(nodeType) {
  pendingGatheringNode = nodeType;
  pendingMaterialCounts = {};
  document.getElementById('gather-material-modal-title').textContent = `What did you get from ${nodeType}?`;
  renderGatherMaterialGrid();
  document.getElementById('gather-material-new').value = '';
  document.getElementById('gather-material-modal').classList.add('open');
}

function renderGatherMaterialGrid() {
  const nodeData = wikiData.nodes.find(n => n.tradeskill === gatheringSession.tradeskill && n.name === pendingGatheringNode);
  const wikiMaterials = nodeData ? (nodeData.results || []) : [];
  const sessionMaterials = gatheringSession.entries.filter(e => e.target === pendingGatheringNode).map(e => e.resultItem);
  const pendingMaterials = Object.keys(pendingMaterialCounts).filter(m => pendingMaterialCounts[m] > 0);
  const allMaterials = [...new Set([...wikiMaterials, ...sessionMaterials, ...pendingMaterials])].sort();

  const sessionCounts = {};
  gatheringSession.entries.forEach(e => {
    if (e.target === pendingGatheringNode) sessionCounts[e.resultItem] = (sessionCounts[e.resultItem] || 0) + 1;
  });

  const grid = document.getElementById('gather-material-grid');
  grid.innerHTML = allMaterials.map(m => {
    const isNew = !wikiMaterials.includes(m);
    const pendingCount = pendingMaterialCounts[m] || 0;
    const sessionCount = sessionCounts[m] || 0;
    const classes = ['fish-pick-btn'];
    if (isNew) classes.push('new');
    if (pendingCount) classes.push('picked');
    const pendingBadge = pendingCount ? `<span class="fish-pick-count pending">+${pendingCount}</span>` : '';
    const sessionBadge = sessionCount ? `<span class="fish-pick-count">&times;${sessionCount}</span>` : '';
    const newBadge = isNew ? '<span class="fish-pick-new-badge">new</span>' : '';
    return `<button class="${classes.join(' ')}" data-material="${escapeHtml(m)}">${escapeHtml(m)}${pendingBadge}${sessionBadge}${newBadge}</button>`;
  }).join('');
  grid.querySelectorAll('[data-material]').forEach(btn => btn.addEventListener('click', () => {
    const m = btn.dataset.material;
    pendingMaterialCounts[m] = (pendingMaterialCounts[m] || 0) + 1;
    renderGatherMaterialGrid();
  }));
}

function closeGatherMaterialModal() {
  document.getElementById('gather-material-modal').classList.remove('open');
  pendingGatheringNode = null;
  pendingMaterialCounts = {};
}

document.getElementById('gather-material-cancel').addEventListener('click', closeGatherMaterialModal);
document.getElementById('gather-material-reset').addEventListener('click', () => {
  pendingMaterialCounts = {};
  renderGatherMaterialGrid();
});
document.getElementById('gather-material-add-btn').addEventListener('click', () => {
  const input = document.getElementById('gather-material-new');
  const v = input.value.trim();
  if (!v) return;
  pendingMaterialCounts[v] = (pendingMaterialCounts[v] || 0) + 1;
  input.value = '';
  renderGatherMaterialGrid();
});
document.getElementById('gather-material-log').addEventListener('click', () => {
  const nodeType = pendingGatheringNode;
  const counts = pendingMaterialCounts;
  const totalUnits = Object.values(counts).reduce((a, b) => a + b, 0);
  if (totalUnits === 0) { closeGatherMaterialModal(); return; }
  Object.keys(counts).forEach(material => {
    for (let i = 0; i < counts[material]; i++) {
      logGatherAttempt(nodeType, material);
    }
  });
  showToast(`Logged ${totalUnits} item${totalUnits === 1 ? '' : 's'} from ${nodeType}`, true);
  closeGatherMaterialModal();
});

function logGatherAttempt(nodeType, resultItem) {
  if (!session.id) { showToast('Start a session first'); return; }
  const entry = {
    id: genId(),
    target: nodeType,
    zone: gatherZoneCtrl ? gatherZoneCtrl.getValue() : gatheringSession.zone,
    skill: gatheringSession.skill,
    success: true,
    resultItem: resultItem,
    loggedAt: Date.now(),
  };
  gatheringSession.zone = entry.zone;
  gatheringSession.entries.push(entry);

  sendToHost({
    type: 'logEntry',
    sessionId: session.id,
    sessionType: 'harvesting',
    entry: Object.assign({ tradeskill: gatheringSession.tradeskill }, entry),
  });

  renderGatherLog();
  renderGatherNodeGrid(); // catch just fed back into this zone's "expected" set - reflect it now
  updateGatherStats();
}

function renderGatherLog() {
  const el = document.getElementById('gather-log');
  if (!el) return;
  if (gatheringSession.entries.length === 0) {
    el.innerHTML = '<div class="roster-empty">Nothing logged yet.</div>';
    return;
  }
  el.innerHTML = gatheringSession.entries.slice().reverse().map(e => {
    const when = new Date(e.loggedAt).toLocaleTimeString();
    const result = e.success ? escapeHtml(e.resultItem || 'success') : 'no result';
    return `<div class="log-row"><span>${escapeHtml(e.zone || '(no zone)')} &middot; ${escapeHtml(e.target)} &middot; Skill ${e.skill} &middot; ${result}</span><span style="display:flex; align-items:center; gap:8px;"><span class="when">${when}</span><button class="mini-btn" data-edit-id="${escapeHtml(e.id)}">Edit</button></span></div>`;
  }).join('');
  el.querySelectorAll('[data-edit-id]').forEach(btn => btn.addEventListener('click', () => openGatherEditModal(btn.dataset.editId)));
}

// Editing, same reasoning/scope as Fishing's: only entries in the still-running
// session, and changing the node type has to patch `target` too (what
// Write-HarvestingBlock groups the export by), same zone-staleness-style lesson.
function openGatherEditModal(id) {
  const entry = gatheringSession.entries.find(e => e.id === id);
  if (!entry) return;
  editingGatherEntryId = id;
  document.getElementById('gather-edit-zone').value = entry.zone || '';
  document.getElementById('gather-edit-node').value = entry.target || '';
  document.getElementById('gather-edit-skill').value = entry.skill;
  document.getElementById('gather-edit-result').value = entry.success ? (entry.resultItem || '') : '';
  document.getElementById('gather-edit-err').style.display = 'none';
  document.getElementById('gather-edit-modal').classList.add('open');
}

document.getElementById('gather-edit-cancel').addEventListener('click', () => {
  document.getElementById('gather-edit-modal').classList.remove('open');
  editingGatherEntryId = null;
});

document.getElementById('gather-edit-save').addEventListener('click', () => {
  const entry = gatheringSession.entries.find(e => e.id === editingGatherEntryId);
  if (!entry) { document.getElementById('gather-edit-modal').classList.remove('open'); return; }
  const skillVal = parseInt(document.getElementById('gather-edit-skill').value, 10);
  if (isNaN(skillVal) || skillVal < 0) {
    document.getElementById('gather-edit-err').textContent = 'Skill must be a valid number';
    document.getElementById('gather-edit-err').style.display = 'block';
    return;
  }
  const resultVal = document.getElementById('gather-edit-result').value.trim();
  const patch = {
    zone: document.getElementById('gather-edit-zone').value.trim(),
    target: document.getElementById('gather-edit-node').value.trim(),
    skill: skillVal,
    success: !!resultVal,
    resultItem: resultVal,
  };
  Object.assign(entry, patch);
  sendToHost({ type: 'editEntry', sessionId: session.id, entryId: editingGatherEntryId, patch });
  document.getElementById('gather-edit-modal').classList.remove('open');
  editingGatherEntryId = null;
  renderGatherLog();
  renderGatherNodeGrid();
  updateGatherStats();
});

function updateGatherStats() {
  const logged = gatheringSession.entries.length;
  const uniqueNodes = new Set(gatheringSession.entries.map(e => e.target)).size;
  const successes = gatheringSession.entries.filter(e => e.success).length;
  const knownNodes = wikiData.nodes.filter(n => n.tradeskill === gatheringSession.tradeskill).map(n => n.name.toLowerCase());
  const newForWiki = new Set(gatheringSession.entries.filter(e => !knownNodes.includes((e.target || '').toLowerCase())).map(e => e.target)).size;
  document.getElementById('gt-logged').textContent = logged;
  document.getElementById('gt-unique').textContent = uniqueNodes;
  document.getElementById('gt-successes').textContent = successes;
  document.getElementById('gt-new').textContent = newForWiki;
}

// ---------------------------------------------------------------------------
// Cooking - its own tab (2026-08-24), not folded into the generic Crafting
// stub, because a dish can carry stat/resist/haste buffs the way any other
// item does (see items.json's Food entries) and that needs its own fast
// entry UI. Uses the same roster + active-detail pattern as Harvesting
// (a cooking attempt is one discrete event, not the high-repetition case
// Fishing was redesigned around) - own Map, own DOM ids, own state, nothing
// shared with Fishing or Combat beyond generic UI helpers (checklistDropdown,
// findItem, escapeHtml) and the wiki reference data itself.
// ---------------------------------------------------------------------------
const STAT_NAMES = ['STR', 'DEX', 'AGI', 'STA', 'WIS', 'INT', 'CHA', 'HP', 'MANA'];
const RESIST_NAMES = ['POISON', 'FIRE', 'COLD', 'CORRUPTION', 'DISEASE', 'MAGIC', 'ELECTRIC', 'HOLY'];

// dishRoster: Map of dish name -> { entries: [...], stats: {STR:2,...}, resists: {...}, haste: 0 }
// stats/resists/haste live on the dish itself (what the finished food grants,
// same shape items.json already uses for Food items) rather than per-attempt,
// since a given recipe always produces the same buff regardless of how many
// times it's cooked this session.
const dishRoster = new Map();
let activeDish = null;
let pendingComponents = [];
let ckStatsCtrl = null;
let ckResistsCtrl = null;

document.getElementById('add-dish').addEventListener('click', addDishFromInput);
document.getElementById('new-dish').addEventListener('keydown', (e) => { if (e.key === 'Enter') addDishFromInput(); });

function refreshDishList() {
  const matches = wikiData.recipes.filter(r => r.tradeskill === 'Cooking');
  document.getElementById('dish-list').innerHTML = matches.map(r => `<option value="${escapeHtml(r.name)}"></option>`).join('');
}

function addDishFromInput() {
  const input = document.getElementById('new-dish');
  const name = input.value.trim();
  if (!name) return;
  if (!session.id) { showToast('Start a session first'); return; }
  if (!dishRoster.has(name)) dishRoster.set(name, { entries: [], stats: {}, resists: {}, haste: 0 });
  selectDish(name);
  input.value = '';
}

function selectDish(name) {
  activeDish = name;
  renderDishRoster();
  renderDishDetail();
}

function renderDishRoster() {
  const el = document.getElementById('dish-roster-list');
  if (dishRoster.size === 0) {
    el.innerHTML = '<div class="roster-empty">No dishes yet &mdash; add one above.</div>';
    return;
  }
  el.innerHTML = '';
  for (const [name, data] of dishRoster) {
    const successes = data.entries.filter(e => e.success).length;
    const div = document.createElement('div');
    div.className = 'roster-item' + (name === activeDish ? ' selected' : '');
    div.innerHTML = `
      <span class="roster-item-remove" data-name="${escapeHtml(name)}" title="Remove ${escapeHtml(name)} from this session">&times;</span>
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">${data.entries.length} attempt${data.entries.length === 1 ? '' : 's'} &middot; ${successes} success${successes === 1 ? '' : 'es'}</div>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('roster-item-remove')) return;
      selectDish(name);
    });
    el.appendChild(div);
  }
  el.querySelectorAll('.roster-item-remove').forEach(x => x.addEventListener('click', (e) => {
    e.stopPropagation();
    dishRoster.delete(x.dataset.name);
    if (activeDish === x.dataset.name) activeDish = null;
    renderDishRoster();
    renderDishDetail();
    updateCookingStats();
  }));
}

function renderDishDetail() {
  const el = document.getElementById('dish-detail-panel');
  if (!activeDish) {
    el.innerHTML = '<div class="detail-empty">Add a dish to the roster, then select it to start logging attempts.</div>';
    return;
  }
  const data = dishRoster.get(activeDish);
  pendingComponents = [];
  el.innerHTML = `
    <div class="detail-head"><h2>${escapeHtml(activeDish)}</h2><span class="zone-tag">Cooking</span></div>
    <div class="field-grid">
      <div><label>Your skill</label><input id="ck-skill" type="number" min="0" /></div>
      <div><label>Difficulty</label>
        <select id="ck-difficulty">
          <option>Trivial</option><option>Green</option><option>Light Blue</option>
          <option selected>Dark Blue</option><option>White</option><option>Yellow</option><option>Red</option>
        </select>
      </div>
      <div><label>Outcome</label><select id="ck-outcome"><option value="1">Success</option><option value="0">Fail</option></select></div>
    </div>
    <label>Components used</label>
    <div style="display:flex; gap:8px;">
      <input id="ck-component" list="cook-item-list" placeholder="Search item name&hellip;" autocomplete="off" />
      <datalist id="cook-item-list">${wikiData.items.map(i => `<option value="${escapeHtml(i.name)}"></option>`).join('')}</datalist>
      <button class="mini-btn" id="ck-add-component" style="padding:0 14px;">Add</button>
    </div>
    <div class="chips" id="ck-component-chips"></div>

    <label style="margin-top:14px; display:block;">What this dish grants <span style="color:var(--text-muted); font-weight:400;">(optional)</span></label>
    <div style="display:flex; gap:8px; margin-bottom:8px; align-items:flex-start;">
      ${checklistDropdownHTML('ck-stats', 'Stats', STAT_NAMES, { selected: Object.keys(data.stats), tip: 'Which stats this dish grants - add the amount for each after picking.' })}
      ${checklistDropdownHTML('ck-resists', 'Resists', RESIST_NAMES, { selected: Object.keys(data.resists), tip: 'Which resists this dish grants - add the amount for each after picking.' })}
      <div style="flex:1;"><input id="ck-haste" type="number" placeholder="Haste %" min="0" value="${data.haste || ''}" data-tip="A single haste value for the whole dish, same as gear's haste stat - not per stat/resist." /></div>
    </div>
    <div id="ck-stat-values"></div>

    <div class="err" id="ck-err"></div>
    <button class="primary-btn" id="log-cook-btn">Log attempt</button>
    <div class="log">
      <div class="log-title">Logged &mdash; ${escapeHtml(activeDish)}</div>
      <div id="cook-log"></div>
    </div>
  `;
  ckStatsCtrl = setupChecklistDropdown('ck-stats', { onChange: () => syncStatSelection('stats', ckStatsCtrl) });
  ckResistsCtrl = setupChecklistDropdown('ck-resists', { onChange: () => syncStatSelection('resists', ckResistsCtrl) });
  document.getElementById('ck-haste').addEventListener('input', e => { data.haste = Number(e.target.value) || 0; });
  document.getElementById('ck-add-component').addEventListener('click', () => {
    const input = document.getElementById('ck-component');
    const v = input.value.trim();
    if (!v) return;
    pendingComponents.push(v);
    input.value = '';
    renderComponentChips();
  });
  document.getElementById('log-cook-btn').addEventListener('click', logCookAttempt);
  renderStatValueInputs();
  renderComponentChips();
  renderCookLog();
}

// Toggling a stat/resist checkbox adds/removes it from the dish's own
// stats/resists object (keeping any value already entered for a box that
// gets re-checked isn't expected here - unchecking clears it, matching how
// there's no "undo" concept elsewhere in this app either).
function syncStatSelection(kind, ctrl) {
  const data = dishRoster.get(activeDish);
  if (!data || !ctrl) return;
  const target = kind === 'stats' ? data.stats : data.resists;
  const selected = ctrl.getSelected();
  Object.keys(target).forEach(k => { if (!selected.includes(k)) delete target[k]; });
  selected.forEach(k => { if (!(k in target)) target[k] = 0; });
  renderStatValueInputs();
}

function renderStatValueInputs() {
  const el = document.getElementById('ck-stat-values');
  const data = activeDish ? dishRoster.get(activeDish) : null;
  if (!el || !data) return;
  const statEntries = Object.keys(data.stats).map(k => ({ k, v: data.stats[k], kind: 'stat' }));
  const resistEntries = Object.keys(data.resists).map(k => ({ k, v: data.resists[k], kind: 'resist' }));
  const all = [...statEntries, ...resistEntries];
  if (all.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = all.map(e =>
    `<span class="stat-value-input"><label>${escapeHtml(e.k)}${e.kind === 'resist' ? ' resist' : ''}</label><input type="number" data-kind="${e.kind}" data-key="${escapeHtml(e.k)}" value="${e.v || ''}" placeholder="0" /></span>`
  ).join('');
  el.querySelectorAll('input[data-key]').forEach(inp => inp.addEventListener('input', () => {
    const target = inp.dataset.kind === 'stat' ? data.stats : data.resists;
    target[inp.dataset.key] = Number(inp.value) || 0;
  }));
}

function renderComponentChips() {
  const el = document.getElementById('ck-component-chips');
  if (!el) return;
  el.innerHTML = pendingComponents.map((it, i) => {
    const known = !!findItem(it);
    return `<span class="chip${known ? '' : ' new'}">${escapeHtml(it)}${known ? '' : ' (new)'} <span class="x" data-i="${i}">&times;</span></span>`;
  }).join('');
  el.querySelectorAll('.x').forEach(x => x.addEventListener('click', () => {
    pendingComponents.splice(+x.dataset.i, 1);
    renderComponentChips();
  }));
}

function renderCookLog() {
  const el = document.getElementById('cook-log');
  if (!el) return;
  const data = dishRoster.get(activeDish);
  if (!data || data.entries.length === 0) {
    el.innerHTML = '<div class="roster-empty">Nothing logged yet.</div>';
    return;
  }
  el.innerHTML = data.entries.slice().reverse().map(e => {
    const when = new Date(e.loggedAt).toLocaleTimeString();
    const outcome = e.success ? 'Success' : 'Fail';
    const skillPart = e.skill != null ? `Skill ${e.skill} &middot; ` : '';
    const componentsPart = e.components.length ? ' &middot; ' + e.components.map(escapeHtml).join(', ') : '';
    return `<div class="log-row"><span>${skillPart}${escapeHtml(e.difficultyColor)} &middot; ${outcome}${componentsPart}</span><span class="when">${when}</span></div>`;
  }).join('');
}

function logCookAttempt() {
  const data = dishRoster.get(activeDish);
  const entry = {
    skill: document.getElementById('ck-skill').value ? Number(document.getElementById('ck-skill').value) : null,
    difficultyColor: document.getElementById('ck-difficulty').value,
    success: document.getElementById('ck-outcome').value === '1',
    components: pendingComponents.slice(),
    stats: Object.assign({}, data.stats),
    resists: Object.assign({}, data.resists),
    haste: data.haste || 0,
    loggedAt: Date.now(),
  };
  data.entries.push(entry);

  sendToHost({
    type: 'logEntry',
    sessionId: session.id,
    sessionType: 'crafting',
    entry: Object.assign({ target: activeDish, tradeskill: 'Cooking' }, entry),
  });

  renderDishRoster();
  renderDishDetail();
  updateCookingStats();
}

function updateCookingStats() {
  let attempts = 0, successes = 0;
  const uniqueDishes = new Set();
  const knownDishes = wikiData.recipes.filter(r => r.tradeskill === 'Cooking').map(r => r.name.toLowerCase());
  const newDishes = new Set();
  for (const [name, data] of dishRoster) {
    if (data.entries.length === 0) continue;
    uniqueDishes.add(name);
    attempts += data.entries.length;
    successes += data.entries.filter(e => e.success).length;
    if (!knownDishes.includes(name.toLowerCase())) newDishes.add(name);
  }
  document.getElementById('ck-attempts').textContent = attempts;
  document.getElementById('ck-unique').textContent = uniqueDishes.size;
  document.getElementById('ck-successes').textContent = successes;
  document.getElementById('ck-new').textContent = newDishes.size;
}

// ---------------------------------------------------------------------------
// Fishing - its own tab, not part of Harvesting's roster pattern. Fishing
// doesn't really have a "node" the way an ore vein or an herb patch does -
// you fish a zone and the catch is random. Redesigned 2026-08-24 around one
// goal: as few taps as possible while actually fishing. Pre-start screen is
// deliberately just two buttons; once "Start fishing!" is pressed, logging a
// result is a single tap on a fish name (or "No catch") - no form to fill.
// ---------------------------------------------------------------------------
// All-time Fishing attempts/catches by zone, snapshotted once from the host
// at 'ready' (see the 'fishRarity' message handler) - {zone: {totalAttempts,
// fish: {name: catches}}}. Feeds the rarity bars panel; combined with the
// current session's own entries in computeZoneRarity() since this snapshot
// predates anything caught this session.
let fishRarityBaseline = {};

// Pooled Fishing rarity across every guild member's MERGED session exports
// (backlog #20/#21) - same shape as fishRarityBaseline, fetched by the host
// from the wiki's own published fishing-rarity.json (see Get-SharedFishRarity
// in MnMFieldNotes.ps1). computeZoneRarity() sums this in alongside the
// local baseline and the current session's own entries. This can double-count
// a small slice of THIS install's own data if a session it logged has since
// been submitted and merged (the shared total already includes it, and the
// local log still has it too) - accepted, since this is already an
// "estimate" caption, not the wiki's own figure, and there's no cheap way to
// know from here which of this install's own past sessions were ever
// submitted.
let sharedFishRarityBaseline = {};

// Empirical Combat zone level range (2026-08-27, backlog #6) - {zone: {min,
// max, count}}, snapshotted once at 'ready' from Get-CombatZoneLevelRange -
// same pattern as fishRarityBaseline above. This app's own data, since the
// wiki has no numeric level field on any monster and is read-only anyway.
let combatLevelRangeBaseline = {};

const fishingSession = {
  active: false,        // has "Start fishing!" been pressed
  zone: '',
  area: '',              // optional sub-location within the zone (a specific lake/pond/dock)
  skill: 0,
  liveAttempts: 0,
  entries: [],
  customFish: [],       // fish names typed in this session that aren't in wikiData.nodes yet
  startSkillSent: false, // has the starting skill for this session already been reported to the host
  // Timestamp of every real attempt (manual +, or an auto-counted keypress),
  // this session only - never persisted/exported/compared across sessions,
  // see the "Avg. time between casts" stat's own tooltip for why (a break
  // mid-session, e.g. alt-tabbing, would silently skew it).
  attemptTimestamps: [],
};

const keyState = {
  listening: false,      // counting hook currently installed
  configured: null,      // { label, vkCode, ctrl, alt, shift } once a key has been captured
  capturing: false,      // mid-capture (waiting for the user's next keypress)
  spamPaused: false,     // listening was auto-paused because the key was pressed unrealistically fast
};

let fishZoneCtrl = null; // the Zone checklist-dropdown's controller for the current render

function renderFishingPanel() {
  const el = document.getElementById('panel-fishing');

  if (!fishingSession.active) {
    // Stale from a previous active-screen render - if left set, renderFishRarityPanel()'s
    // "fishZoneCtrl ? ... : fishingSession.zone" would read a detached DOM node's frozen
    // .checked state instead of the landing zone picker's actual live selection below.
    fishZoneCtrl = null;
    el.innerHTML = `
      <div class="detail" style="text-align:center; padding: 48px 20px 24px;">
        <p style="font-size:13px; color:var(--text-secondary); max-width:38ch; margin:0 auto 20px;">
          This lets the app count your casts automatically: pick one key you use to fish, and
          from then on every press of that key bumps the attempts counter below &mdash; the
          app only ever watches for that one key, and never touches the game itself. Pressing
          it rapidly (holding it down, spamming it) throws off the count, so listening
          auto-pauses if that happens &mdash; you can always add attempts manually instead.
        </p>
        <button class="secondary-btn" id="fish-listen-btn">${keyState.configured ? 'Change key (currently ' + escapeHtml(keyState.configured.label) + ')' : 'Listen for key'}</button>
        <div style="margin-top: 28px;">
          <button class="primary-btn" id="fish-start-btn" style="max-width:240px; margin:0 auto;">Start fishing!</button>
        </div>
      </div>
      <div class="detail" style="text-align:left; max-width:440px; margin:24px auto 0; border-top:1px solid var(--border); padding-top:22px;">
        <label>Browse a zone <span style="color:var(--text-muted); font-weight:400;">(no session needed)</span></label>
        ${checklistDropdownHTML('fish-landing-zone', fishingSession.zone ? fishingSession.zone : 'Select zone', wikiData.zones, { multi: false, selected: fishingSession.zone ? [fishingSession.zone] : [] })}
        <div id="fish-rarity-panel" style="margin-top:10px;"></div>
      </div>
    `;
    document.getElementById('fish-listen-btn').addEventListener('click', openFishKeyModal);
    document.getElementById('fish-start-btn').addEventListener('click', openFishSkillModal);
    const landingZoneCtrl = setupChecklistDropdown('fish-landing-zone', { multi: false, onChange: () => {
      fishingSession.zone = landingZoneCtrl.getValue();
      renderFishRarityPanel();
    } });
    renderFishRarityPanel();
    return;
  }

  const keyLabel = keyState.configured ? keyState.configured.label : 'no key set';
  el.innerHTML = `
    <div class="detail">
      <p style="text-align:center; font-size:13.5px; color:var(--text-secondary); margin:0 0 14px;">
        Just start fishing &mdash; the app counts every <b style="color:var(--text-primary);">${escapeHtml(keyLabel)}</b> press.
        <a href="#" id="fish-change-key-link" style="color:var(--accent);">${keyState.configured ? 'change key' : 'set a key'}</a>.
        When you catch a fish, click it below.
      </p>
      ${keyState.spamPaused ? `
      <div style="background: var(--danger-soft); border: 1px solid var(--danger); border-radius: 8px; padding: 10px 14px; margin: 0 0 14px; text-align:center; font-size:13px;">
        Listening paused &mdash; that many presses that fast usually means a stuck or held key,
        not real casts.
        <a href="#" id="fish-resume-listening-link" style="color:var(--accent); font-weight:600;">Resume listening</a>
      </div>` : ''}
      <div class="field-grid" style="margin-bottom:4px;">
        <div><label>Zone</label>${checklistDropdownHTML('fish-zone', fishingSession.zone ? fishingSession.zone : 'Select zone', wikiData.zones, { multi: false, selected: fishingSession.zone ? [fishingSession.zone] : [] })}</div>
        <div>
          <label>Area <span style="color:var(--text-muted); font-weight:400;">(optional)</span></label>
          <input id="fish-area" list="fish-area-list" placeholder="Specific lake, pond, dock&hellip;" value="${escapeHtml(fishingSession.area || '')}" autocomplete="off" data-tip="Different bodies of water in the same zone can have different fish - leave blank if that doesn't apply here." />
          <datalist id="fish-area-list">${[...new Set(fishingSession.entries.map(e => e.area).filter(Boolean))].map(a => `<option value="${escapeHtml(a)}">`).join('')}</datalist>
        </div>
      </div>
      ${renderAttemptsCounterHTML(fishingSession)}
      ${renderSkillCounterHTML(fishingSession)}
      <label>Click the fish you caught, as you catch them</label>
      <div class="fish-pick-grid" id="fish-pick-grid"></div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <input id="fish-new-name" placeholder="Not listed? Type its name&hellip;" autocomplete="off" />
        <button class="mini-btn" id="fish-add-btn" style="padding:0 14px;">+ Add</button>
      </div>
      <div id="fish-rarity-panel"></div>
      <div class="log" style="margin-top:18px;">
        <div class="log-title">Logged this session</div>
        <div id="fish-log"></div>
      </div>
    </div>
  `;
  fishZoneCtrl = setupChecklistDropdown('fish-zone', { multi: false, onChange: () => { fishingSession.zone = fishZoneCtrl.getValue(); renderFishPickGrid(); renderFishRarityPanel(); } });
  document.getElementById('fish-area').addEventListener('input', e => { fishingSession.area = e.target.value; renderFishPickGrid(); });
  document.getElementById('fish-change-key-link').addEventListener('click', e => { e.preventDefault(); openFishKeyModal(); });
  const resumeLink = document.getElementById('fish-resume-listening-link');
  if (resumeLink) resumeLink.addEventListener('click', e => { e.preventDefault(); resumeKeyListening(); });
  bindCounterEvents();
  bindSkillEvents();
  renderFishPickGrid();
  document.getElementById('fish-add-btn').addEventListener('click', addCustomFish);
  document.getElementById('fish-new-name').addEventListener('keydown', e => { if (e.key === 'Enter') addCustomFish(); });
  renderFishLog();
  renderFishRarityPanel();
}

function openFishSkillModal() {
  document.getElementById('fish-skill-modal-input').value = fishingSession.skill || '';
  document.getElementById('fish-skill-modal-err').style.display = 'none';
  document.getElementById('fish-skill-modal').classList.add('open');
  document.getElementById('fish-skill-modal-input').focus();
}

document.getElementById('fish-skill-modal-go').addEventListener('click', () => {
  const input = document.getElementById('fish-skill-modal-input');
  const v = parseInt(input.value, 10);
  if (input.value.trim() && (isNaN(v) || v < 0)) {
    document.getElementById('fish-skill-modal-err').textContent = 'Enter a valid skill number';
    document.getElementById('fish-skill-modal-err').style.display = 'block';
    return;
  }
  fishingSession.skill = isNaN(v) ? 0 : v;
  document.getElementById('fish-skill-modal').classList.remove('open');
  openFishZoneModal();
});
document.getElementById('fish-skill-modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('fish-skill-modal-go').click(); });

let fishZoneModalCtrl = null;
function openFishZoneModal() {
  document.getElementById('fish-zone-modal-picker').innerHTML = checklistDropdownHTML(
    'fish-zone-modal', fishingSession.zone ? fishingSession.zone : 'Select zone', wikiData.zones,
    { multi: false, selected: fishingSession.zone ? [fishingSession.zone] : [] }
  );
  fishZoneModalCtrl = setupChecklistDropdown('fish-zone-modal', { multi: false });
  document.getElementById('fish-zone-modal').classList.add('open');
}

let pendingFishingStart = false; // session was just requested for fishing - start it once 'sessionStarted' confirms

document.getElementById('fish-zone-modal-go').addEventListener('click', () => {
  // Zone was always optional in the in-screen dropdown too - don't block
  // starting fishing just because none was picked here.
  fishingSession.zone = fishZoneModalCtrl ? fishZoneModalCtrl.getValue() : '';
  document.getElementById('fish-zone-modal').classList.remove('open');
  if (session.id) {
    // A session is already running (e.g. started from another tab) - join it.
    startFishing();
    return;
  }
  // Auto-start the session here rather than making the user separately
  // remember to press the top "Start session" button first - forgetting that
  // step meant every catch silently failed to log (session.id was null).
  // startSession's reply is async (a real WebView2 round trip, not
  // synchronous), so don't call startFishing() until 'sessionStarted'
  // actually confirms session.id - otherwise fishingStarted/logEntry can
  // race ahead of it with a null sessionId.
  if (!startNewSession()) return;
  pendingFishingStart = true;
});

function startFishing() {
  fishingSession.active = true;
  if (!fishingSession.startSkillSent) {
    fishingSession.startSkillSent = true;
    sendToHost({ type: 'fishingStarted', sessionId: session.id, skill: fishingSession.skill });
  }
  renderFishingPanel();
  if (keyState.configured) startKeyCounting();
  updateFishStats();
}

function renderAttemptsCounterHTML(data) {
  return `
    <div id="fish-counter-box" style="background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 8px; padding: 12px 14px; margin: 4px 0 10px;">
      <label style="margin:0 0 8px;">Attempts since last catch</label>
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="mini-btn" id="fish-attempts-minus">-</button>
        <span style="font-family:Consolas,monospace; font-size:26px; font-weight:600; min-width:44px; text-align:center;">${data.liveAttempts}</span>
        <button class="mini-btn" id="fish-attempts-plus">+</button>
      </div>
    </div>
  `;
}

function renderSkillCounterHTML(data) {
  return `
    <div id="fish-skill-box" style="background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 8px; padding: 12px 14px; margin: 0 0 14px;">
      <label style="margin:0 0 8px;">Your skill &mdash; bump this (or type it) the moment you skill up</label>
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="mini-btn" id="fish-skill-minus">-</button>
        <input type="number" id="fish-skill-input" min="0" value="${data.skill}"
          style="width:64px; text-align:center; font-family:Consolas,monospace; font-size:16px; font-weight:600; padding:6px 4px;" />
        <button class="mini-btn" id="fish-skill-plus">+</button>
      </div>
    </div>
  `;
}

// The attempts box re-renders wholesale on every change (fine - nothing but
// buttons and a number in it, no risk of losing focus). The skill box is
// different: it now has a real text input the user might be mid-typing in,
// so +/- and typing both mutate that one input in place and never rebuild
// the box - a rebuild mid-keystroke would be a real, avoidable UX bug.
function updateCounterBox() {
  const box = document.getElementById('fish-counter-box');
  if (!box) return;
  box.outerHTML = renderAttemptsCounterHTML(fishingSession);
  bindCounterEvents();
}
function bindCounterEvents() {
  document.getElementById('fish-attempts-minus').addEventListener('click', () => adjustAttempts(-1));
  document.getElementById('fish-attempts-plus').addEventListener('click', () => adjustAttempts(1));
}
function adjustAttempts(delta) {
  fishingSession.liveAttempts = Math.max(0, fishingSession.liveAttempts + delta);
  if (delta > 0) fishingSession.attemptTimestamps.push(Date.now());
  updateCounterBox();
  updateFishStats();
  renderFishRarityPanel();
}

function bindSkillEvents() {
  const input = document.getElementById('fish-skill-input');
  document.getElementById('fish-skill-minus').addEventListener('click', () => {
    fishingSession.skill = Math.max(0, fishingSession.skill - 1);
    input.value = fishingSession.skill;
    updateFishStats();
  });
  document.getElementById('fish-skill-plus').addEventListener('click', () => {
    fishingSession.skill = fishingSession.skill + 1;
    input.value = fishingSession.skill;
    updateFishStats();
  });
  input.addEventListener('input', () => {
    const v = parseInt(input.value, 10);
    fishingSession.skill = isNaN(v) ? 0 : Math.max(0, v);
    updateFishStats();
  });
}

function openFishKeyModal() {
  document.getElementById('fish-key-modal-status').textContent = 'Waiting for a keypress…';
  document.getElementById('fish-key-modal').classList.add('open');
  sendToHost({ type: 'startKeyCapture' });
}

function startKeyCounting() {
  if (!keyState.configured) return;
  keyState.listening = true;
  sendToHost({ type: 'startKeyCounting', ...keyState.configured });
}

function stopKeyCounting() {
  if (!keyState.listening) return;
  keyState.listening = false;
  sendToHost({ type: 'stopKeyCounting' });
}

onHostMessage((msg) => {
  if (msg.type === 'keyCaptured') {
    keyState.capturing = false;
    keyState.configured = { label: msg.label, vkCode: msg.vkCode, ctrl: msg.ctrl, alt: msg.alt, shift: msg.shift };
    const statusEl = document.getElementById('fish-key-modal-status');
    statusEl.textContent = 'Got it - listening for ' + msg.label;
    setTimeout(() => {
      document.getElementById('fish-key-modal').classList.remove('open');
      if (fishingSession.active) startKeyCounting();
      renderFishingPanel();
    }, 700);
  } else if (msg.type === 'keyCounted') {
    fishingSession.liveAttempts++;
    fishingSession.attemptTimestamps.push(Date.now());
    updateCounterBox();
    updateFishStats();
    checkKeySpam();
  }
});

// Guards against a held-down or physically stuck key skewing the attempt
// count: 3+ counted presses within 5 seconds isn't 3 real casts, so pause
// listening rather than silently recording bad data. Deliberately handled
// entirely here, not in the native hook or its poll timer in
// MnMFieldNotes.ps1 - those have to stay minimal/trivial (see
// CLAUDE.md's "PowerShell/WinForms gotcha"), and there's no need to touch
// them at all since the UI already gets one message per press to work with.
const keyPressTimestamps = [];
function checkKeySpam() {
  const now = Date.now();
  keyPressTimestamps.push(now);
  while (keyPressTimestamps.length && now - keyPressTimestamps[0] > 5000) keyPressTimestamps.shift();
  if (keyPressTimestamps.length >= 3 && keyState.listening) {
    keyPressTimestamps.length = 0;
    keyState.spamPaused = true;
    stopKeyCounting();
    showToast('Key listening paused - that many presses that fast usually isn\'t real casts. Add attempts manually, or resume listening below.');
    renderFishingPanel();
  }
}

function resumeKeyListening() {
  keyState.spamPaused = false;
  startKeyCounting();
  renderFishingPanel();
}

function renderFishPickGrid() {
  const el = document.getElementById('fish-pick-grid');
  if (!el) return;
  const fishNodes = wikiData.nodes.filter(n => n.tradeskill === 'Fishing');
  const known = fishNodes.map(n => n.name);
  const all = [...known, ...fishingSession.customFish.filter(f => !known.includes(f))];

  // Junk isn't a structured field in the wiki data - it only ever shows up as
  // free text in a node's note (e.g. "A junk drop."), so match on that.
  const junkNames = new Set(fishNodes.filter(n => n.note && /junk/i.test(n.note)).map(n => n.name));

  const selectedZone = fishZoneCtrl ? fishZoneCtrl.getValue() : fishingSession.zone;
  const areaInput = document.getElementById('fish-area');
  const selectedArea = areaInput ? areaInput.value.trim() : (fishingSession.area || '');
  const wikiExpected = fishNodes.filter(n => selectedZone && (n.locations || []).some(loc => locationMatchesZone(loc, selectedZone))).map(n => n.name);
  // Anything actually caught here this session counts as "expected" too, even
  // if the wiki doesn't have this zone in that fish's locations yet. Scoped
  // to area too when one's been entered - different bodies of water in the
  // same zone can give different fish, so a catch in one pond shouldn't mark
  // a fish "expected" in a different pond across the same zone.
  const sessionCaughtHere = fishingSession.entries
    .filter(e => e.success && e.zone === selectedZone && (e.area || '') === selectedArea)
    .map(e => e.resultItem);
  const expectedNames = new Set([...wikiExpected, ...sessionCaughtHere]);

  const catchCounts = {};
  fishingSession.entries.forEach(e => {
    if (e.success && e.resultItem) catchCounts[e.resultItem] = (catchCounts[e.resultItem] || 0) + 1;
  });

  function renderBtn(f) {
    const nodeData = fishNodes.find(n => n.name === f);
    const classes = ['fish-pick-btn'];
    if (!known.includes(f)) classes.push('new');
    if (junkNames.has(f)) classes.push('junk');
    const count = catchCounts[f] ? `<span class="fish-pick-count">&times;${catchCounts[f]}</span>` : '';
    const newBadge = !known.includes(f) ? '<span class="fish-pick-new-badge">new</span>' : '';

    // Wiki note (e.g. a skill-threshold caveat) + the sub-area detail from
    // whichever matched location pulled this fish into "expected" - same
    // combined-tooltip approach as Gathering's node grid.
    const tipParts = [];
    if (nodeData && nodeData.note) tipParts.push(`Wiki note: ${nodeData.note}`);
    if (nodeData && selectedZone) {
      const matchedLoc = (nodeData.locations || []).find(loc => locationMatchesZone(loc, selectedZone));
      const detail = matchedLoc ? extractLocationDetail(matchedLoc, selectedZone) : '';
      if (detail) tipParts.push(`Specifically: ${detail}`);
    }
    const tip = tipParts.length ? ` data-tip="${escapeHtml(tipParts.join(' '))}"` : '';

    return `<button class="${classes.join(' ')}"${tip} data-fish="${escapeHtml(f)}">${escapeHtml(f)}${count}${newBadge}</button>`;
  }

  // Caught-this-session fish sort ahead of merely-expected (never-caught) ones
  // within the expected box, so a fish already found doesn't get buried behind
  // alphabetically-earlier ones the user hasn't caught yet.
  const expected = all.filter(f => expectedNames.has(f)).sort((a, b) => {
    const caughtDiff = (catchCounts[b] ? 1 : 0) - (catchCounts[a] ? 1 : 0);
    return caughtDiff !== 0 ? caughtDiff : a.localeCompare(b);
  });
  const rest = all.filter(f => !expectedNames.has(f)).sort();
  let html = '';
  if (expected.length > 0) {
    html += `<div class="fish-pick-expected-box"><div class="fish-pick-expected-label">Expected in this zone</div>${expected.map(renderBtn).join('')}</div>`;
  }
  html += rest.map(renderBtn).join('');
  el.innerHTML = html;
  el.querySelectorAll('.fish-pick-btn[data-fish]').forEach(btn => btn.addEventListener('click', () => logFishCatch(btn.dataset.fish)));
}

function addCustomFish() {
  const input = document.getElementById('fish-new-name');
  const name = input.value.trim();
  if (!name) return;
  if (!fishingSession.customFish.includes(name)) fishingSession.customFish.push(name);
  input.value = '';
  renderFishPickGrid();
}

// ---------------------------------------------------------------------------
// Rarity bars (2026-08-27) - an empirical guess at how rare each fish is in
// the current zone, from the app's own logged attempts/catches rather than
// the wiki's Common/Uncommon/Rare label (may switch to that instead later,
// this is the first cut). Expanded by default (2026-08-27) - features like
// this are exactly what makes the app worth using beyond a plain logging
// form, so it shouldn't be hidden behind a toggle most users never find.
// Collapsible for anyone who'd rather not see it.
// ---------------------------------------------------------------------------
const MIN_RARITY_ATTEMPTS = 20; // below this the ratio is too noisy to show with a straight face
let fishRarityPanelExpanded = true;

// Combines the all-time baseline (frozen at 'ready', so it excludes anything
// caught THIS session) with fishingSession's own entries plus any attempts
// not yet flushed into a logged entry, so the numbers stay live while
// actively fishing without a host round trip on every cast.
function computeZoneRarity(zone) {
  const local = fishRarityBaseline[zone] || { totalAttempts: 0, fish: {} };
  const shared = sharedFishRarityBaseline[zone] || { totalAttempts: 0, fish: {} };
  const sharedAttempts = shared.totalAttempts || 0;
  let totalAttempts = (local.totalAttempts || 0) + sharedAttempts;
  const fish = Object.assign({}, local.fish);
  Object.keys(shared.fish || {}).forEach(name => {
    fish[name] = (fish[name] || 0) + shared.fish[name];
  });
  fishingSession.entries.forEach(e => {
    if (e.zone !== zone) return;
    totalAttempts += (e.attempts || 0);
    if (e.success && e.resultItem) fish[e.resultItem] = (fish[e.resultItem] || 0) + 1;
  });
  if (fishingSession.zone === zone) totalAttempts += fishingSession.liveAttempts;
  return { totalAttempts, fish, sharedAttempts };
}

function renderFishRarityPanel() {
  const el = document.getElementById('fish-rarity-panel');
  if (!el) return;
  const zone = fishZoneCtrl ? fishZoneCtrl.getValue() : fishingSession.zone;

  if (!zone) {
    el.innerHTML = `<p class="landing-info-empty">Pick a zone to see how rare each fish is, based on your own logged catches.</p>`;
    return;
  }

  const toggleLabel = fishRarityPanelExpanded ? 'Hide rarity estimate ▲' : 'Show rarity estimate ▼';
  let body = '';
  if (fishRarityPanelExpanded) {
    const { totalAttempts, fish, sharedAttempts } = computeZoneRarity(zone);
    if (totalAttempts < MIN_RARITY_ATTEMPTS) {
      body = `<div class="rarity-panel"><p class="rarity-empty">Not enough data yet in ${escapeHtml(zone)} to guess rarity &mdash; ${totalAttempts} attempt${totalAttempts === 1 ? '' : 's'} logged here so far, want at least ${MIN_RARITY_ATTEMPTS}.</p></div>`;
    } else {
      const fishNodes = wikiData.nodes.filter(n => n.tradeskill === 'Fishing');
      const expectedHere = fishNodes.filter(n => (n.locations || []).some(loc => locationMatchesZone(loc, zone))).map(n => n.name);
      const names = [...new Set([...expectedHere, ...Object.keys(fish)])];
      if (names.length === 0) {
        body = `<div class="rarity-panel"><p class="rarity-empty">No fish data for ${escapeHtml(zone)} yet.</p></div>`;
      } else {
        const rows = names
          .map(name => ({ name, catches: fish[name] || 0, rate: totalAttempts > 0 ? (fish[name] || 0) / totalAttempts : 0 }))
          .sort((a, b) => b.rate - a.rate);
        const maxRate = Math.max(...rows.map(r => r.rate), 0.0001);
        const captionTail = sharedAttempts > 0
          ? `pooled with ${sharedAttempts} attempt${sharedAttempts === 1 ? '' : 's'} from the guild's submitted sessions &mdash; still an estimate, not the wiki's rarity label`
          : `an estimate from this app's own data, not the wiki's rarity label`;
        body = `
          <div class="rarity-panel">
            <p class="rarity-caption">From ${totalAttempts} logged attempts in ${escapeHtml(zone)} &mdash; ${captionTail}.</p>
            ${rows.map(r => `
              <div class="rarity-row">
                <span class="rarity-name">${escapeHtml(r.name)}</span>
                <span class="rarity-bar-track"><span class="rarity-bar-fill" style="width:${Math.max(4, (r.rate / maxRate) * 100)}%;"></span></span>
                <span class="rarity-pct">${(r.rate * 100).toFixed(1)}% (${r.catches})</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    }
  }

  el.innerHTML = `<button class="mini-btn" id="fish-rarity-toggle" style="margin-top:10px;">${toggleLabel}</button>${body}`;
  document.getElementById('fish-rarity-toggle').addEventListener('click', () => {
    fishRarityPanelExpanded = !fishRarityPanelExpanded;
    renderFishRarityPanel();
  });
}

function renderFishLog() {
  const el = document.getElementById('fish-log');
  if (!el) return;
  if (fishingSession.entries.length === 0) {
    el.innerHTML = '<div class="roster-empty">Nothing logged yet.</div>';
    return;
  }
  el.innerHTML = fishingSession.entries.slice().reverse().map(e => {
    const when = new Date(e.loggedAt).toLocaleTimeString();
    const result = e.success ? escapeHtml(e.resultItem || 'caught something') : 'no catch';
    const areaPart = e.area ? ` (${escapeHtml(e.area)})` : '';
    return `<div class="log-row"><span>${escapeHtml(e.zone || '(no zone)')}${areaPart} &middot; Skill ${e.skill} &middot; ${result} &middot; ${e.attempts} attempt${e.attempts === 1 ? '' : 's'}</span><span style="display:flex; align-items:center; gap:8px;"><span class="when">${when}</span><button class="mini-btn" data-edit-id="${escapeHtml(e.id)}">Edit</button></span></div>`;
  }).join('');
  el.querySelectorAll('[data-edit-id]').forEach(btn => btn.addEventListener('click', () => openFishEditModal(btn.dataset.editId)));
}

// This is the one action a real fishing session repeats over and over, so it
// intentionally has zero friction: one click, no confirmation, no form.
// There's no separate "no catch" button any more - a no-catch is just the
// attempts counter climbing without a fish being clicked; whatever count is
// showing when the next real catch happens already carries that information
// (same way the wiki's own Grouper skill-threshold data actually came from -
// noticing the gap before a catch, not a logged "40 failed casts" entry). If
// the session ends before another catch happens, flushPendingFishAttempts()
// (called from the sessionEnded handler) logs the remainder so it isn't lost.
function logFishCatch(fishName) {
  if (!session.id) { showToast('Start a session first'); return; }
  const areaInput = document.getElementById('fish-area');
  const entry = {
    id: genId(),
    zone: fishZoneCtrl ? fishZoneCtrl.getValue() : fishingSession.zone,
    area: areaInput ? areaInput.value.trim() : (fishingSession.area || ''),
    skill: fishingSession.skill,
    success: !!fishName,
    resultItem: fishName || '',
    attempts: fishingSession.liveAttempts,
    loggedAt: Date.now(),
  };
  fishingSession.zone = entry.zone;
  fishingSession.area = entry.area;
  fishingSession.entries.push(entry);
  fishingSession.liveAttempts = 0;
  updateCounterBox();

  sendToHost({
    type: 'logEntry',
    sessionId: session.id,
    sessionType: 'harvesting',
    entry: Object.assign({ target: fishingSession.zone || 'Fishing', tradeskill: 'Fishing' }, entry),
  });

  showToast('Logged ' + fishName + ' (skill ' + fishingSession.skill + ', ' + entry.attempts + ' attempts)', true);
  renderFishLog();
  renderFishPickGrid(); // catch just fed back into this zone's "expected" set - reflect it now
  refreshFishAreaDatalist();
  updateFishStats();
  renderFishRarityPanel();
}

function refreshFishAreaDatalist() {
  const dl = document.getElementById('fish-area-list');
  if (!dl) return;
  const areas = [...new Set(fishingSession.entries.map(e => e.area).filter(Boolean))];
  dl.innerHTML = areas.map(a => `<option value="${escapeHtml(a)}">`).join('');
}

// ---------------------------------------------------------------------------
// Editing a logged fishing entry - only while its session is still running
// (see 'editEntry' in MnMFieldNotes.ps1 for why: the export is already
// written once a session ends, so editing after that would silently
// desync from it).
// ---------------------------------------------------------------------------
let editingEntryId = null;

function openFishEditModal(id) {
  const entry = fishingSession.entries.find(e => e.id === id);
  if (!entry) return;
  editingEntryId = id;
  document.getElementById('fish-edit-zone').value = entry.zone || '';
  document.getElementById('fish-edit-area').value = entry.area || '';
  document.getElementById('fish-edit-skill').value = entry.skill;
  document.getElementById('fish-edit-result').value = entry.success ? (entry.resultItem || '') : '';
  document.getElementById('fish-edit-attempts').value = entry.attempts;
  document.getElementById('fish-edit-err').style.display = 'none';
  document.getElementById('fish-edit-modal').classList.add('open');
}

document.getElementById('fish-edit-cancel').addEventListener('click', () => {
  document.getElementById('fish-edit-modal').classList.remove('open');
  editingEntryId = null;
});

document.getElementById('fish-edit-save').addEventListener('click', () => {
  const entry = fishingSession.entries.find(e => e.id === editingEntryId);
  if (!entry) { document.getElementById('fish-edit-modal').classList.remove('open'); return; }
  const skillVal = parseInt(document.getElementById('fish-edit-skill').value, 10);
  const attemptsVal = parseInt(document.getElementById('fish-edit-attempts').value, 10);
  if (isNaN(skillVal) || skillVal < 0 || isNaN(attemptsVal) || attemptsVal < 0) {
    document.getElementById('fish-edit-err').textContent = 'Skill and attempts must be valid numbers';
    document.getElementById('fish-edit-err').style.display = 'block';
    return;
  }
  const resultVal = document.getElementById('fish-edit-result').value.trim();
  const zoneVal = document.getElementById('fish-edit-zone').value.trim();
  const patch = {
    zone: zoneVal,
    // 'target' is what Write-HarvestingBlock groups the export by - has to
    // move with the zone or the corrected entry stays grouped under the
    // export's old zone header.
    target: zoneVal || 'Fishing',
    area: document.getElementById('fish-edit-area').value.trim(),
    skill: skillVal,
    success: !!resultVal,
    resultItem: resultVal,
    attempts: attemptsVal,
  };
  Object.assign(entry, patch);
  sendToHost({ type: 'editEntry', sessionId: session.id, entryId: editingEntryId, patch });
  document.getElementById('fish-edit-modal').classList.remove('open');
  editingEntryId = null;
  renderFishLog();
  renderFishPickGrid();
  refreshFishAreaDatalist();
  updateFishStats();
  renderFishRarityPanel();
});

// Called right before the fishing UI resets for a new/ended session - if
// there were casts since the last catch, that "no catch" data still matters
// for the wiki (skill-threshold testing needs exactly this), so it gets
// logged automatically rather than silently discarded.
function flushPendingFishAttempts() {
  if (!fishingSession.active || fishingSession.liveAttempts === 0 || !session.id) return;
  const areaInput = document.getElementById('fish-area');
  const entry = {
    zone: fishZoneCtrl ? fishZoneCtrl.getValue() : fishingSession.zone,
    area: areaInput ? areaInput.value.trim() : (fishingSession.area || ''),
    skill: fishingSession.skill,
    success: false,
    resultItem: '',
    attempts: fishingSession.liveAttempts,
    loggedAt: Date.now(),
  };
  sendToHost({
    type: 'logEntry',
    sessionId: session.id,
    sessionType: 'harvesting',
    entry: Object.assign({ target: entry.zone || 'Fishing', tradeskill: 'Fishing' }, entry),
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function updateStats() {
  let kills = 0, items = 0, newForWiki = 0;
  const coin = { platinum: 0, gold: 0, silver: 0, copper: 0 };
  const seenNames = new Set();
  for (const [name, data] of roster) {
    if (data.entries.length) seenNames.add(name);
    if (!findMonster(name)) newForWiki++;
    data.entries.forEach(e => {
      kills++;
      items += e.items.length;
      coin.platinum += e.coin.platinum; coin.gold += e.coin.gold; coin.silver += e.coin.silver; coin.copper += e.coin.copper;
      e.items.forEach(it => { if (!findItem(it)) newForWiki++; });
    });
  }
  document.getElementById('s-kills').textContent = kills;
  document.getElementById('s-unique').textContent = seenNames.size;
  document.getElementById('s-coin').textContent = fmtCoin(coin);
  document.getElementById('s-items').textContent = items;
  document.getElementById('s-new').textContent = newForWiki;
}

// Fishing gets its own stats bar (swapped in by the tab-click handler above)
// since kills/coin don't mean anything there - this reads catches/attempts/
// skill instead, all sourced from fishingSession rather than the Combat roster.
function updateFishStats() {
  const catches = fishingSession.entries.filter(e => e.success).length;
  const uniqueFish = new Set(fishingSession.entries.filter(e => e.success).map(e => e.resultItem)).size;
  const totalAttempts = fishingSession.entries.reduce((sum, e) => sum + (e.attempts || 0), 0) + fishingSession.liveAttempts;
  const knownFish = wikiData.nodes.filter(n => n.tradeskill === 'Fishing').map(n => n.name.toLowerCase());
  const newForWiki = new Set(
    fishingSession.entries.filter(e => e.success && !knownFish.includes(e.resultItem.toLowerCase())).map(e => e.resultItem)
  ).size;
  document.getElementById('fs-catches').textContent = catches;
  document.getElementById('fs-unique').textContent = uniqueFish;
  document.getElementById('fs-attempts').textContent = totalAttempts;
  document.getElementById('fs-skill').textContent = fishingSession.skill;
  document.getElementById('fs-new').textContent = newForWiki;
  document.getElementById('fs-avgtime').textContent = formatAvgCastTime(fishingSession.attemptTimestamps);
}

// Average gap between consecutive attempts this session, from the first
// timestamp to the last - not a total-session-time/count average, since
// that would also (wrongly) count time spent before the very first cast.
function formatAvgCastTime(timestamps) {
  if (timestamps.length < 2) return '—';
  const totalMs = timestamps[timestamps.length - 1] - timestamps[0];
  const avgSec = Math.round(totalMs / (timestamps.length - 1) / 1000);
  if (avgSec < 60) return avgSec + 's';
  return Math.floor(avgSec / 60) + 'm ' + (avgSec % 60) + 's';
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------
function renderLookupResults(q) {
  const results = [];
  const query = q.toLowerCase();
  wikiData.monsters.forEach(m => { if (!query || (m.name || '').toLowerCase().includes(query)) results.push({ name: m.name, type: 'Monster' }); });
  wikiData.items.forEach(i => { if (!query || (i.name || '').toLowerCase().includes(query)) results.push({ name: i.name, type: 'Item' }); });
  document.getElementById('lookup-results').innerHTML = results.slice(0, 100).map(r =>
    `<div class="result-card"><span class="rname">${escapeHtml(r.name)}</span><span class="rtype">${r.type}</span></div>`
  ).join('') || '<div class="roster-empty">No matches.</div>';
}
document.getElementById('lookup-input').addEventListener('input', e => renderLookupResults(e.target.value));

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
renderRoster();
renderDetail();
renderCombatLandingInfo();
renderFishingPanel();
renderGatheringPanel();
updateStats();
setSessionButtonState(false);
updateStatsBarVisibility();
updateCombatSessionVisibility();
sendToHost({ type: 'ready' });
