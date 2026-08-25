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
        monsters: [{ name: 'a corrupted outrider' }, { name: 'a smuggler' }, { name: 'Onis the Elder' }],
        items: [{ name: 'Ashira War Tooth' }, { name: 'Corroded Bronze Chain Boots' }],
        nodes: [
          { name: 'Lionleaf', tradeskill: 'Herbalism' }, { name: 'Ghost Poppy', tradeskill: 'Herbalism' },
          { name: 'Copper Vein', tradeskill: 'Mining' }, { name: 'Limestone Deposit', tradeskill: 'Mining' },
          { name: 'Whitefish', tradeskill: 'Fishing', locations: ['Night Harbor', 'Shaded Dunes'] },
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
      });
      deliverFromHost({ type: 'profiles', profiles: mockProfiles.profiles, lastUsed: mockProfiles.lastUsed });
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
    }
  }, 50);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const wikiData = { monsters: [], items: [], nodes: [], recipes: [], factions: [], zones: [] };

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

function setupChecklistDropdown(idPrefix, config) {
  config = config || {};
  const multi = config.multi !== false;
  ensureChecklistDropdownGlobalClose();
  const root = document.getElementById(`${idPrefix}-dropdown`);
  const toggle = document.getElementById(`${idPrefix}-toggle`);
  const toggleLabel = document.getElementById(`${idPrefix}-toggle-label`);
  const baseLabel = toggleLabel.textContent;
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
      toggleLabel.textContent = baseLabel + ': ' + cb.value;
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
function showToast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.style.display = 'block';
  clearTimeout(showToast._h);
  showToast._h = setTimeout(() => { t.style.display = 'none'; }, 4500);
}

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
const TAB_SESSION_TYPE = { combat: 'combat', harvest: 'harvesting', fishing: 'fishing', craft: 'crafting', cooking: 'cooking', multi: 'multi' };

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.panel-body').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('panel-' + t.dataset.tab).classList.add('active');
  if (TAB_SESSION_TYPE[t.dataset.tab]) {
    session.type = TAB_SESSION_TYPE[t.dataset.tab];
  }
  // Kills/coin are meaningless on Fishing/Cooking, so each gets its own stats
  // bar rather than showing Combat numbers that don't apply.
  const isFishing = t.dataset.tab === 'fishing';
  const isCooking = t.dataset.tab === 'cooking';
  document.getElementById('stats-combat').style.display = (isFishing || isCooking) ? 'none' : '';
  document.getElementById('stats-fishing').style.display = isFishing ? '' : 'none';
  document.getElementById('stats-cooking').style.display = isCooking ? '' : 'none';
  if (isFishing) updateFishStats();
  if (isCooking) updateCookingStats();
}));

// ---------------------------------------------------------------------------
// Session start/end
// ---------------------------------------------------------------------------
const btnStart = document.getElementById('btn-start-session');
const btnEnd = document.getElementById('btn-end-session');

// Shared by the top "Start session" button and the fishing start-up flow
// (which auto-starts a session once skill+zone are entered, rather than
// making the user separately remember to press "Start session" first).
// Returns false (and toasts why) if a session couldn't be started.
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

btnStart.addEventListener('click', startNewSession);

btnEnd.addEventListener('click', () => {
  if (!session.id) { showToast('No session running'); return; }
  // Disable immediately rather than waiting for the async 'sessionEnded'
  // reply - otherwise a rapid double-click fires this handler twice before
  // the first round trip lands, and the second click's now-orphaned
  // messages surface a confusing "Error: Unknown session" toast even though
  // nothing was actually lost (the host already rejects them safely).
  btnEnd.disabled = true;
  flushPendingFishAttempts(); // must happen before endSession - the session still needs to exist host-side to accept this last entry
  if (fishingSession.startSkillSent) {
    // Record the skill as of session end too, in case the player skilled up
    // but didn't happen to catch anything after the last logged entry.
    sendToHost({ type: 'fishingEnded', sessionId: session.id, skill: fishingSession.skill });
  }
  sendToHost({ type: 'endSession', sessionId: session.id });
});

onHostMessage((msg) => {
  if (msg.type === 'sessionStarted') {
    session.id = msg.sessionId;
    btnStart.disabled = true;
    btnEnd.disabled = false;
    profileSelect.disabled = true;
    document.getElementById('session-sub').textContent = 'Session running · logged by ' + session.loggedBy;
    if (pendingFishingStart) {
      pendingFishingStart = false;
      startFishing();
    }
  } else if (msg.type === 'sessionEnded') {
    showToast('Exported ' + msg.entryCount + ' entries to ' + msg.exportFileName);
    session.id = null;
    session.startedAt = null;
    btnStart.disabled = false;
    btnEnd.disabled = true;
    profileSelect.disabled = false;
    document.getElementById('session-sub').textContent = 'No session running';
    roster.clear();
    activeTarget = null;
    renderRoster();
    renderDetail();
    nodeRoster.clear();
    activeNode = null;
    renderNodeRoster();
    renderNodeDetail();
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
    const mobList = document.getElementById('mob-list');
    mobList.innerHTML = wikiData.monsters.map(m => `<option value="${escapeHtml(m.name)}"></option>`).join('');
    refreshNodeList();
    refreshDishList();
    renderFishPickGrid();
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
  } else if (msg.type === 'error') {
    showToast('Error: ' + msg.message);
    // Safety net: if a session is still genuinely running (host-side export
    // hit a real problem rather than this being a harmless redundant
    // double-click response), don't leave "End session" stuck disabled with
    // no way to retry.
    if (session.id) btnEnd.disabled = false;
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
// Harvesting (Mining / Lumberjacking / Herbalism / Foraging - Fishing has its
// own tab, see below, since it doesn't really have "nodes" the way these do)
// ---------------------------------------------------------------------------
// nodeRoster: Map of node name -> { tradeskill, entries: [ {zone, skill, success, resultItem, loggedAt} ] }
const nodeRoster = new Map();
let activeNode = null;

document.getElementById('add-node').addEventListener('click', addNodeFromInput);
document.getElementById('new-node').addEventListener('keydown', (e) => { if (e.key === 'Enter') addNodeFromInput(); });
document.getElementById('new-node-tradeskill').addEventListener('change', refreshNodeList);

// Node autocomplete is scoped to whichever tradeskill is currently selected
// - a Herbalism node name shouldn't show up while adding a Mining node.
function refreshNodeList() {
  const tradeskill = document.getElementById('new-node-tradeskill').value;
  const matches = wikiData.nodes.filter(n => n.tradeskill === tradeskill);
  document.getElementById('node-list').innerHTML = matches.map(n => `<option value="${escapeHtml(n.name)}"></option>`).join('');
}

function addNodeFromInput() {
  const input = document.getElementById('new-node');
  const name = input.value.trim();
  if (!name) return;
  if (!session.id) { showToast('Start a session first'); return; }
  const tradeskill = document.getElementById('new-node-tradeskill').value;
  if (!nodeRoster.has(name)) nodeRoster.set(name, { tradeskill, entries: [] });
  selectNode(name);
  input.value = '';
}

function selectNode(name) {
  activeNode = name;
  renderNodeRoster();
  renderNodeDetail();
}

function renderNodeRoster() {
  const el = document.getElementById('node-roster-list');
  if (nodeRoster.size === 0) {
    el.innerHTML = '<div class="roster-empty">No nodes yet &mdash; add one above.</div>';
    return;
  }
  el.innerHTML = '';
  for (const [name, data] of nodeRoster) {
    const catches = data.entries.filter(e => e.success).length;
    const div = document.createElement('div');
    div.className = 'roster-item' + (name === activeNode ? ' selected' : '');
    div.innerHTML = `
      <span class="roster-item-remove" data-name="${escapeHtml(name)}" title="Remove ${escapeHtml(name)} from this session">&times;</span>
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">${data.tradeskill} &middot; ${catches} catch${catches === 1 ? '' : 'es'}</div>
    `;
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('roster-item-remove')) return;
      selectNode(name);
    });
    el.appendChild(div);
  }
  el.querySelectorAll('.roster-item-remove').forEach(x => x.addEventListener('click', (e) => {
    e.stopPropagation();
    nodeRoster.delete(x.dataset.name);
    if (activeNode === x.dataset.name) activeNode = null;
    renderNodeRoster();
    renderNodeDetail();
  }));
}

function renderNodeDetail() {
  const el = document.getElementById('node-detail-panel');
  if (!activeNode) {
    el.innerHTML = '<div class="detail-empty">Add a node to the roster, then select it to start logging attempts.</div>';
    return;
  }
  const data = nodeRoster.get(activeNode);

  el.innerHTML = `
    <div class="detail-head"><h2>${escapeHtml(activeNode)}</h2><span class="zone-tag">${escapeHtml(data.tradeskill)}</span></div>
    <div class="field-grid">
      <div><label>Zone</label><input id="h-zone" placeholder="e.g. Shaded Dunes" /></div>
      <div><label>Your skill</label><input id="h-skill" type="number" min="0" /></div>
      <div><label>Outcome</label><select id="h-success"><option value="1">Success</option><option value="0">No catch/result</option></select></div>
      <div><label>Result item</label><input id="h-item" list="item-list" placeholder="if successful" autocomplete="off" /></div>
    </div>
    <div class="err" id="h-err"></div>
    <button class="primary-btn" id="log-harvest-btn">Log attempt</button>
    <div class="log">
      <div class="log-title">Logged &mdash; ${escapeHtml(activeNode)}</div>
      <div id="harvest-log"></div>
    </div>
  `;

  document.getElementById('log-harvest-btn').addEventListener('click', logHarvestBatch);

  renderHarvestLog();
}

function renderHarvestLog() {
  const el = document.getElementById('harvest-log');
  if (!el) return;
  const data = nodeRoster.get(activeNode);
  if (!data || data.entries.length === 0) {
    el.innerHTML = '<div class="roster-empty">Nothing logged yet.</div>';
    return;
  }
  el.innerHTML = data.entries.slice().reverse().map(e => {
    const when = new Date(e.loggedAt).toLocaleTimeString();
    const result = e.success ? escapeHtml(e.resultItem || 'success') : 'no catch';
    return `<div class="log-row"><span>Skill ${e.skill != null ? e.skill : '?'} &middot; ${result}</span><span class="when">${when}</span></div>`;
  }).join('');
}

function logHarvestBatch() {
  const err = document.getElementById('h-err');
  const zone = document.getElementById('h-zone').value.trim();
  if (!zone) {
    err.textContent = 'Enter a zone first';
    err.style.display = 'block';
    return;
  }
  err.style.display = 'none';
  const data = nodeRoster.get(activeNode);
  const entry = {
    zone,
    skill: document.getElementById('h-skill').value ? Number(document.getElementById('h-skill').value) : null,
    success: document.getElementById('h-success').value === '1',
    resultItem: document.getElementById('h-item').value.trim(),
    loggedAt: Date.now(),
  };
  data.entries.push(entry);

  sendToHost({
    type: 'logEntry',
    sessionId: session.id,
    sessionType: 'harvesting',
    entry: Object.assign({ target: activeNode, tradeskill: data.tradeskill }, entry),
  });

  renderNodeRoster();
  renderNodeDetail();
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
const fishingSession = {
  active: false,        // has "Start fishing!" been pressed
  zone: '',
  area: '',              // optional sub-location within the zone (a specific lake/pond/dock)
  skill: 0,
  liveAttempts: 0,
  entries: [],
  customFish: [],       // fish names typed in this session that aren't in wikiData.nodes yet
  startSkillSent: false, // has the starting skill for this session already been reported to the host
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
    el.innerHTML = `
      <div class="detail" style="text-align:center; padding: 48px 20px;">
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
    `;
    document.getElementById('fish-listen-btn').addEventListener('click', openFishKeyModal);
    document.getElementById('fish-start-btn').addEventListener('click', openFishSkillModal);
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
      <label>Click the fish you caught</label>
      <div class="fish-pick-grid" id="fish-pick-grid"></div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <input id="fish-new-name" placeholder="Not listed? Type its name&hellip;" autocomplete="off" />
        <button class="mini-btn" id="fish-add-btn" style="padding:0 14px;">+ Add</button>
      </div>
      <div class="log" style="margin-top:18px;">
        <div class="log-title">Logged this session</div>
        <div id="fish-log"></div>
      </div>
    </div>
  `;
  fishZoneCtrl = setupChecklistDropdown('fish-zone', { multi: false, onChange: () => { fishingSession.zone = fishZoneCtrl.getValue(); renderFishPickGrid(); } });
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
  updateCounterBox();
  updateFishStats();
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
    updateCounterBox();
    updateFishStats();
    checkKeySpam();
  }
});

// Guards against a held-down or physically stuck key skewing the attempt
// count: 3+ counted presses within 1 second isn't 3 real casts, so pause
// listening rather than silently recording bad data. Deliberately handled
// entirely here, not in the native hook or its poll timer in
// MnMFieldNotes.ps1 - those have to stay minimal/trivial (see
// CLAUDE.md's "PowerShell/WinForms gotcha"), and there's no need to touch
// them at all since the UI already gets one message per press to work with.
const keyPressTimestamps = [];
function checkKeySpam() {
  const now = Date.now();
  keyPressTimestamps.push(now);
  while (keyPressTimestamps.length && now - keyPressTimestamps[0] > 1000) keyPressTimestamps.shift();
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
  const wikiExpected = fishNodes.filter(n => selectedZone && (n.locations || []).includes(selectedZone)).map(n => n.name);
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
    const classes = ['fish-pick-btn'];
    if (!known.includes(f)) classes.push('new');
    if (expectedNames.has(f)) classes.push('expected');
    if (junkNames.has(f)) classes.push('junk');
    const count = catchCounts[f] ? `<span class="fish-pick-count">&times;${catchCounts[f]}</span>` : '';
    const newBadge = !known.includes(f) ? '<span class="fish-pick-new-badge">new</span>' : '';
    return `<button class="${classes.join(' ')}" data-fish="${escapeHtml(f)}">${escapeHtml(f)}${count}${newBadge}</button>`;
  }

  const expected = all.filter(f => expectedNames.has(f)).sort();
  const rest = all.filter(f => !expectedNames.has(f)).sort();
  let html = '';
  if (expected.length > 0) {
    html += '<div class="fish-pick-section-label">Expected in this zone</div>';
    html += expected.map(renderBtn).join('');
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

  showToast('Logged ' + fishName + ' (skill ' + fishingSession.skill + ', ' + entry.attempts + ' attempts)');
  renderFishLog();
  renderFishPickGrid(); // catch just fed back into this zone's "expected" set - reflect it now
  refreshFishAreaDatalist();
  updateFishStats();
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
renderFishingPanel();
updateStats();
sendToHost({ type: 'ready' });
