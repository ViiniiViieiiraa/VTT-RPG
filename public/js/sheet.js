/**
 * sheet.js — D&D 5e Sheet Panel  (Etapa 9 — Single Source of Truth)
 *
 * MODE A — Token instance:  openSheet(tokenId)
 *   GET  /tokens/:id/sheet   →  { token, sheet }
 *   PATCH /tokens/:id/sheet  →  { sheet_data: {...} }
 *
 * MODE B — Template:  openSheet(null, { templateId, name, ... })
 *   GET  /templates/:id/sheet →  { template, sheet }
 *   PATCH /templates/:id/sheet →  { sheet_data: {...} }
 *
 * HP, conditions, ALL stats live exclusively in sheet_data JSON.
 * No separate hp / conditions columns are read or written.
 */

const $ = id => document.getElementById(id);

const sheetPanel      = $('sheetPanel');
const sheetPanelTitle = $('sheetPanelTitle');
const sheetBody       = $('sheetBody');
const btnSheetClose   = $('btnSheetClose');
const sheetSaved      = $('sheetSaved');

// ── Mode state ────────────────────────────────────────────
let mode         = null;   // 'token' | 'template'
let activeId     = null;   // token id or template id
let sheetData    = {};
let saveTimer    = null;
const SAVE_MS    = 1400;

// ── Constants ─────────────────────────────────────────────
const STATS  = ['str','dex','con','int','wis','cha'];
const STAT_L = { str:'FOR', dex:'DES', con:'CON', int:'INT', wis:'SAB', cha:'CAR' };

const SKILLS_MAP = [
  ['Acrobatics','dex'],['Animal Handling','wis'],['Arcana','int'],['Athletics','str'],
  ['Deception','cha'],['History','int'],['Insight','wis'],['Intimidation','cha'],
  ['Investigation','int'],['Medicine','wis'],['Nature','int'],['Perception','wis'],
  ['Performance','cha'],['Persuasion','cha'],['Religion','int'],['Sleight of Hand','dex'],
  ['Stealth','dex'],['Survival','wis'],
];

const CONDITIONS = [
  {id:'blinded',icon:'👁️',label:'Cego'},{id:'charmed',icon:'💞',label:'Enfeitiçado'},
  {id:'deafened',icon:'🔇',label:'Surdo'},{id:'exhaustion',icon:'😴',label:'Exausto'},
  {id:'frightened',icon:'😱',label:'Amedrontado'},{id:'grappled',icon:'🤼',label:'Agarrado'},
  {id:'incapacitated',icon:'❌',label:'Incapacitado'},{id:'invisible',icon:'👻',label:'Invisível'},
  {id:'paralyzed',icon:'⚡',label:'Paralisado'},{id:'petrified',icon:'🪨',label:'Petrificado'},
  {id:'poisoned',icon:'🤢',label:'Envenenado'},{id:'prone',icon:'⬇️',label:'Prostrado'},
  {id:'restrained',icon:'🕸️',label:'Contido'},{id:'stunned',icon:'💫',label:'Atordoado'},
  {id:'unconscious',icon:'💀',label:'Inconsciente'},
];
const COND_ICONS = Object.fromEntries(CONDITIONS.map(c => [c.id, c.icon]));

// ── Formulas ──────────────────────────────────────────────
const modNum  = s => Math.floor((s - 10) / 2);
const modStr  = s => { const m = modNum(s); return (m >= 0 ? '+' : '') + m; };
const profLvl = l => Math.ceil((l||1) / 4) + 1;
const bonusStr = (score, prof, isProficient) => {
  const b = modNum(score) + (isProficient ? prof : 0);
  return (b >= 0 ? '+' : '') + b;
};

// ── Open ──────────────────────────────────────────────────
async function openSheet(tokenId, templateCtx = null) {
  sheetSaved.textContent = '';

  if (templateCtx) {
    // ── Mode B: Template ──
    mode     = 'template';
    activeId = templateCtx.templateId;
    try {
      const res  = await fetch(`/templates/${activeId}/sheet`);
      const data = await res.json();
      sheetPanelTitle.textContent = `[Template] ${data.template?.name || ''}`;
      _initSheet(data.sheet || {});
    } catch(e) { console.error('openSheet template:', e); return; }

  } else {
    // ── Mode A: Token instance ──
    mode     = 'token';
    activeId = tokenId;
    try {
      const res  = await fetch(`/tokens/${tokenId}/sheet`);
      const data = await res.json();
      sheetPanelTitle.textContent = data.token?.name || 'Ficha';
      _initSheet(data.sheet || {});
    } catch(e) { console.error('openSheet token:', e); return; }
  }

  renderSheet();
  sheetPanel.classList.remove('hidden');
  sheetPanel.classList.add('open');
}

function _initSheet(raw) {
  // Merge defaults with saved data — HP lives here exclusively
  sheetData = {
    token_name: '', class: '', race: '', background: '', level: 1, alignment: '',
    ac: 10, speed: 30, initiative: 0,
    hp_max: 0, hp_current: 0, hit_dice: '1d8',
    stats: { str:10, dex:10, con:10, int:10, wis:10, cha:10 },
    saving_throws: [], skills_prof: [],
    attacks: [], features: '', equipment: '', notes: '',
    conditions: [],
    ...raw,
  };
  // Auto-sync proficiency from level (never stored separately)
}

function closeSheet() {
  clearTimeout(saveTimer);
  sheetPanel.classList.remove('open');
  setTimeout(() => sheetPanel.classList.add('hidden'), 320);
  mode = null; activeId = null;
}

$('btnSheetClose')?.addEventListener('click', closeSheet);

// ── Context menu hook ─────────────────────────────────────
$('ctxOpenSheet')?.addEventListener('click', () => {
  const id = window.getCtxTargetId?.();
  if (!id) return;
  window.closeCtxMenuGlobal?.();
  openSheet(id);
});

// ── Render ────────────────────────────────────────────────
function renderSheet() {
  const s    = sheetData;
  const prof = profLvl(s.level);
  const hp   = s.hp_current ?? 0;
  const hpMax = s.hp_max || 0;
  const hpPct = hpMax > 0 ? Math.max(0, Math.min(100, (hp / hpMax) * 100)) : 0;
  const hpColor = hpPct > 50 ? '#2a9d8f' : hpPct > 25 ? '#f4a261' : '#e63946';
  const esc = v => (v||'').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;');

  sheetBody.innerHTML = `

    <!-- ── IDENTITY ──────────────────────────────────── -->
    <div class="sheet-section">
      <div class="sheet-row-3">
        <label class="sheet-field"><span>Nome</span>
          <input data-key="token_name" type="text" value="${esc(s.token_name)}" placeholder="Personagem"></label>
        <label class="sheet-field"><span>Classe</span>
          <input data-key="class" type="text" value="${esc(s.class)}" placeholder="Guerreiro"></label>
        <label class="sheet-field"><span>Nível</span>
          <input data-key="level" type="number" value="${s.level||1}" min="1" max="20"></label>
      </div>
      <div class="sheet-row-3">
        <label class="sheet-field"><span>Raça</span>
          <input data-key="race" type="text" value="${esc(s.race)}" placeholder="Humano"></label>
        <label class="sheet-field"><span>Antecedente</span>
          <input data-key="background" type="text" value="${esc(s.background)}"></label>
        <label class="sheet-field"><span>Bônus Prof.</span>
          <input type="text" value="+${prof}" readonly class="sheet-readonly" id="profDisplay"></label>
      </div>
    </div>

    <!-- ── HP ────────────────────────────────────────── -->
    <div class="sheet-section">
      <div class="sheet-hp-row">
        <label class="sheet-field" style="flex:1"><span>HP Atual</span>
          <input data-key="hp_current" type="number" value="${hp}" min="0" class="hp-input"></label>
        <span class="hp-slash">/</span>
        <label class="sheet-field" style="flex:1"><span>HP Máximo</span>
          <input data-key="hp_max" type="number" value="${hpMax}" min="0" class="hp-input"></label>
        <label class="sheet-field" style="width:80px"><span>Dado de Vida</span>
          <input data-key="hit_dice" type="text" value="${esc(s.hit_dice)}" placeholder="1d8"></label>
      </div>
      <div class="hp-bar-track">
        <div class="hp-bar-fill" id="sheetHpFill" style="width:${hpPct}%;background:${hpColor}"></div>
        <span class="hp-bar-text" id="sheetHpText">${hp} / ${hpMax}</span>
      </div>
    </div>

    <!-- ── COMBAT ─────────────────────────────────────── -->
    <div class="sheet-section">
      <div class="sheet-row-3">
        <div class="sheet-combat-stat"><span class="combat-label">CA</span>
          <input data-key="ac" type="number" value="${s.ac||10}" class="combat-input"></div>
        <div class="sheet-combat-stat"><span class="combat-label">Iniciativa</span>
          <input data-key="initiative" type="number" value="${s.initiative??0}" class="combat-input"></div>
        <div class="sheet-combat-stat"><span class="combat-label">Deslocamento</span>
          <input data-key="speed" type="number" value="${s.speed||30}" class="combat-input"></div>
      </div>
    </div>

    <!-- ── ABILITY SCORES ─────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Atributos</p>
      <div class="stats-grid">
        ${STATS.map(st => `
          <div class="stat-block">
            <span class="stat-label">${STAT_L[st]}</span>
            <span class="stat-mod" id="smod-${st}">${modStr(s.stats?.[st]??10)}</span>
            <input type="number" data-stat="${st}" value="${s.stats?.[st]??10}" min="1" max="30" class="stat-input">
          </div>`).join('')}
      </div>
    </div>

    <!-- ── SAVING THROWS ──────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Testes de Resistência <span style="font-size:.52rem;color:var(--text-3);font-family:Raleway">(auto)</span></p>
      <div class="saves-grid">
        ${STATS.map(st => {
          const prof2 = (s.saving_throws||[]).includes(st);
          return `<label class="save-item">
            <input type="checkbox" data-save="${st}" ${prof2?'checked':''}>
            <span class="save-bonus" id="sb-${st}">${bonusStr(s.stats?.[st]??10,prof,prof2)}</span>
            <span>${STAT_L[st]}</span></label>`;
        }).join('')}
      </div>
    </div>

    <!-- ── SKILLS ─────────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label sheet-toggle" data-target="skillsList" style="cursor:pointer">
        Perícias ▾ <span style="font-size:.52rem;color:var(--text-3);font-family:Raleway">(auto)</span></p>
      <div class="skills-grid" id="skillsList">
        ${SKILLS_MAP.map(([skill, base]) => {
          const prof2 = (s.skills_prof||[]).includes(skill);
          const sid   = 'sk-' + skill.replace(/ /g,'_');
          return `<label class="save-item">
            <input type="checkbox" data-skill="${skill}" data-base="${base}" ${prof2?'checked':''}>
            <span class="save-bonus" id="${sid}">${bonusStr(s.stats?.[base]??10,prof,prof2)}</span>
            <span>${skill}</span></label>`;
        }).join('')}
      </div>
    </div>

    <!-- ── ATTACKS ─────────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Ataques</p>
      <div id="atkList">${(s.attacks||[]).map((a,i) => atkRow(a,i)).join('')}</div>
      <button class="sheet-btn-sm" id="btnAddAtk">＋ Ataque</button>
    </div>

    <!-- ── CONDITIONS ─────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Condições</p>
      <div class="conditions-grid">
        ${CONDITIONS.map(c => {
          const on = (s.conditions||[]).includes(c.id);
          return `<label class="condition-item ${on?'active':''}" title="${c.label}">
            <input type="checkbox" data-condition="${c.id}" ${on?'checked':''}>
            <span>${c.icon}</span>
            <span class="condition-label">${c.label}</span></label>`;
        }).join('')}
      </div>
    </div>

    <!-- ── NOTES ──────────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Traços / Habilidades</p>
      <textarea data-key="features" class="sheet-textarea" rows="3" placeholder="Ação de Surto…">${esc(s.features)}</textarea>
      <p class="sheet-section-label" style="margin-top:.4rem">Equipamentos</p>
      <textarea data-key="equipment" class="sheet-textarea" rows="2">${esc(s.equipment)}</textarea>
      <p class="sheet-section-label" style="margin-top:.4rem">Notas</p>
      <textarea data-key="notes" class="sheet-textarea" rows="3">${esc(s.notes)}</textarea>
    </div>`;

  _bindEvents();
}

function atkRow(a, i) {
  const e = v => (v||'').toString().replace(/</g,'&lt;');
  return `<div class="atk-row" data-atk="${i}">
    <input type="text" data-atk-key="name"   value="${e(a.name)}"   placeholder="Espada" class="tf-input atk-name">
    <input type="text" data-atk-key="bonus"  value="${e(a.bonus)}"  placeholder="+5"     class="tf-input atk-bonus">
    <input type="text" data-atk-key="damage" value="${e(a.damage)}" placeholder="1d8+3"  class="tf-input atk-dmg">
    <button class="tpl-btn-del atk-del" data-atk="${i}">✕</button></div>`;
}

// ── Bind events ───────────────────────────────────────────
function _bindEvents() {

  // Generic key→value inputs
  sheetBody.querySelectorAll('[data-key]').forEach(el => {
    el.addEventListener('input', () => {
      const k = el.dataset.key;
      sheetData[k] = el.type === 'number' ? Number(el.value) : el.value;
      if (k === 'hp_current' || k === 'hp_max') _syncHp();
      if (k === 'level') _syncLevel();
      _scheduleSave();
    });
  });

  // Stat inputs → recalc everything
  sheetBody.querySelectorAll('[data-stat]').forEach(el => {
    el.addEventListener('input', () => {
      if (!sheetData.stats) sheetData.stats = {};
      sheetData.stats[el.dataset.stat] = Number(el.value);
      _recalc();
      _scheduleSave();
    });
  });

  // Saving throw checkboxes
  sheetBody.querySelectorAll('[data-save]').forEach(el => {
    el.addEventListener('change', () => {
      sheetData.saving_throws = [...sheetBody.querySelectorAll('[data-save]:checked')]
        .map(e => e.dataset.save);
      _recalc();
      _scheduleSave();
    });
  });

  // Skill checkboxes
  sheetBody.querySelectorAll('[data-skill]').forEach(el => {
    el.addEventListener('change', () => {
      sheetData.skills_prof = [...sheetBody.querySelectorAll('[data-skill]:checked')]
        .map(e => e.dataset.skill);
      _recalc();
      _scheduleSave();
    });
  });

  // Conditions
  sheetBody.querySelectorAll('[data-condition]').forEach(el => {
    el.addEventListener('change', () => {
      sheetData.conditions = [...sheetBody.querySelectorAll('[data-condition]:checked')]
        .map(e => e.dataset.condition);
      el.closest('.condition-item').classList.toggle('active', el.checked);
      // Live update token overlay
      if (mode === 'token') window.updateTokenConditions?.(activeId, sheetData.conditions);
      _scheduleSave();
    });
  });

  // Attacks
  sheetBody.querySelector('#btnAddAtk')?.addEventListener('click', () => {
    if (!sheetData.attacks) sheetData.attacks = [];
    sheetData.attacks.push({ name:'', bonus:'', damage:'' });
    const list = sheetBody.querySelector('#atkList');
    list.insertAdjacentHTML('beforeend', atkRow({ name:'',bonus:'',damage:'' }, sheetData.attacks.length - 1));
    _bindAtkRow(list.lastElementChild);
    _scheduleSave();
  });

  sheetBody.querySelectorAll('.atk-row').forEach(_bindAtkRow);

  // Collapsible
  sheetBody.querySelectorAll('.sheet-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const t = document.getElementById(el.dataset.target);
      t?.classList.toggle('collapsed');
      el.innerHTML = el.innerHTML.includes('▾')
        ? el.innerHTML.replace('▾','▸') : el.innerHTML.replace('▸','▾');
    });
  });
}

function _bindAtkRow(row) {
  const i = Number(row.dataset.atk);
  row.querySelectorAll('[data-atk-key]').forEach(el => {
    el.addEventListener('input', () => {
      if (!sheetData.attacks[i]) sheetData.attacks[i] = {};
      sheetData.attacks[i][el.dataset.atkKey] = el.value;
      _scheduleSave();
    });
  });
  row.querySelector('.atk-del')?.addEventListener('click', () => {
    sheetData.attacks.splice(i, 1);
    renderSheet();
    _scheduleSave();
  });
}

// ── Auto-calculation helpers ──────────────────────────────
function _syncLevel() {
  const prof = profLvl(sheetData.level);
  const el   = document.getElementById('profDisplay');
  if (el) el.value = `+${prof}`;
  _recalc();
}

function _recalc() {
  const s    = sheetData;
  const prof = profLvl(s.level);

  STATS.forEach(st => {
    const score = s.stats?.[st] ?? 10;
    const modEl = document.getElementById(`smod-${st}`);
    if (modEl) modEl.textContent = modStr(score);

    const saveEl = document.getElementById(`sb-${st}`);
    if (saveEl) saveEl.textContent = bonusStr(score, prof, (s.saving_throws||[]).includes(st));
  });

  SKILLS_MAP.forEach(([skill, base]) => {
    const el = document.getElementById('sk-' + skill.replace(/ /g,'_'));
    if (el) el.textContent = bonusStr(s.stats?.[base]??10, prof, (s.skills_prof||[]).includes(skill));
  });
}

function _syncHp() {
  const hp    = sheetData.hp_current ?? 0;
  const max   = sheetData.hp_max || 0;
  const pct   = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const color = pct > 50 ? '#2a9d8f' : pct > 25 ? '#f4a261' : '#e63946';

  const fill = document.getElementById('sheetHpFill');
  const text = document.getElementById('sheetHpText');
  if (fill) { fill.style.width = pct + '%'; fill.style.background = color; }
  if (text) text.textContent = `${hp} / ${max}`;

  // Live update map token overlay
  if (mode === 'token') window.updateTokenHp?.(activeId, hp, max);
}

// ── Save ──────────────────────────────────────────────────
function _scheduleSave() {
  sheetSaved.textContent = '…';
  sheetSaved.classList.remove('ok');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(_save, SAVE_MS);
}

async function _save() {
  if (!activeId || !mode) return;
  const url = mode === 'token'
    ? `/tokens/${activeId}/sheet`
    : `/templates/${activeId}/sheet`;
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet_data: sheetData }),
    });
    sheetSaved.textContent = '✓ Salvo';
    sheetSaved.classList.add('ok');
  } catch (_) { sheetSaved.textContent = 'Erro'; }
}

// ── Expose ────────────────────────────────────────────────
window.openTokenSheet = openSheet;
