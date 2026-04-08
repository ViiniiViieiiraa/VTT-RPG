/**
 * sheet.js — D&D 5e Character Sheet Panel  (Etapa 7)
 * Abre ao clicar direito → "Abrir Ficha" em um token.
 * Salva dados de volta via PATCH /tokens/:id/sheet (debounced).
 */

const $ = id => document.getElementById(id);

const sheetPanel      = $('sheetPanel');
const sheetPanelTitle = $('sheetPanelTitle');
const sheetBody       = $('sheetBody');
const btnSheetClose   = $('btnSheetClose');
const sheetSaved      = $('sheetSaved');
const ctxOpenSheet    = $('ctxOpenSheet');

let currentTokenId = null;
let sheetData      = {};
let sheetDebounce  = null;
const SAVE_DELAY   = 1500;

// ── Context menu hook ──────────────────────────────────────
// tabletop.js expõe: window.getCtxTargetId()
ctxOpenSheet?.addEventListener('click', async () => {
  const tokenId = window.getCtxTargetId?.();
  if (!tokenId) return;
  window.closeCtxMenuGlobal?.();
  await openSheet(tokenId);
});

btnSheetClose?.addEventListener('click', closeSheet);

// ── Open / Close ───────────────────────────────────────────
async function openSheet(tokenId) {
  currentTokenId = tokenId;
  sheetSaved.textContent = '';

  try {
    const res  = await fetch(`/tokens/${tokenId}/sheet`);
    const data = await res.json();

    sheetPanelTitle.textContent = data.token?.name || 'Ficha';
    sheetData = {
      // Defaults for a new token
      class: '', race: '', background: '', level: 1, alignment: '',
      proficiency: 2, ac: 10, speed: 30, initiative: 0,
      hp_max: data.token?.max_hp || 0,
      hp_current: data.token?.current_hp ?? data.token?.max_hp ?? 0,
      hit_dice: '1d8',
      stats: { str:10, dex:10, con:10, int:10, wis:10, cha:10 },
      saving_throws: [],
      skills_prof: [],
      attacks: [],
      features: '',
      equipment: '',
      notes: '',
      // Override with saved data
      ...data.sheet,
    };

    renderSheet();
    sheetPanel.classList.remove('hidden');
    sheetPanel.classList.add('open');
  } catch (err) {
    console.error('Erro ao abrir ficha:', err);
  }
}

function closeSheet() {
  sheetPanel.classList.remove('open');
  sheetPanel.classList.add('hidden');
  currentTokenId = null;
  clearTimeout(sheetDebounce);
}

// ── Render ─────────────────────────────────────────────────
const STATS  = ['str','dex','con','int','wis','cha'];
const STAT_L = { str:'FOR', dex:'DES', con:'CON', int:'INT', wis:'SAB', cha:'CAR' };

const SKILLS_MAP = [
  ['Acrobatics','dex'],['Animal Handling','wis'],['Arcana','int'],['Athletics','str'],
  ['Deception','cha'],['History','int'],['Insight','wis'],['Intimidation','cha'],
  ['Investigation','int'],['Medicine','wis'],['Nature','int'],['Perception','wis'],
  ['Performance','cha'],['Persuasion','cha'],['Religion','int'],['Sleight of Hand','dex'],
  ['Stealth','dex'],['Survival','wis'],
];

const CONDITIONS_LIST = [
  { id:'blinded',      label:'Cego',         icon:'👁️' },
  { id:'charmed',      label:'Enfeitiçado',   icon:'💞' },
  { id:'deafened',     label:'Surdo',         icon:'🔇' },
  { id:'exhaustion',   label:'Exausto',       icon:'😴' },
  { id:'frightened',   label:'Amedrontado',   icon:'😱' },
  { id:'grappled',     label:'Agarrado',      icon:'🤼' },
  { id:'incapacitated',label:'Incapacitado',  icon:'❌' },
  { id:'invisible',    label:'Invisível',     icon:'👻' },
  { id:'paralyzed',    label:'Paralisado',    icon:'⚡' },
  { id:'petrified',    label:'Petrificado',   icon:'🪨' },
  { id:'poisoned',     label:'Envenenado',    icon:'🤢' },
  { id:'prone',        label:'Prostrado',     icon:'⬇️' },
  { id:'restrained',   label:'Contido',       icon:'🕸️' },
  { id:'stunned',      label:'Atordoado',     icon:'💫' },
  { id:'unconscious',  label:'Inconsciente',  icon:'💀' },
];

function mod(score) {
  const m = Math.floor((score - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}

function renderSheet() {
  const s  = sheetData;
  const hp = s.hp_current ?? s.hp_max ?? 0;
  const hpMax = s.hp_max || 1;
  const hpPct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
  const hpColor = hpPct > 60 ? '#2a9d8f' : hpPct > 25 ? '#f4a261' : '#e63946';

  sheetBody.innerHTML = `
    <!-- ── IDENTITY ─────────────────────────────────────── -->
    <div class="sheet-section">
      <div class="sheet-row-3">
        <label class="sheet-field"><span>Classe</span>
          <input type="text" data-key="class" value="${esc(s.class)}" placeholder="Guerreiro">
        </label>
        <label class="sheet-field"><span>Raça</span>
          <input type="text" data-key="race" value="${esc(s.race)}" placeholder="Humano">
        </label>
        <label class="sheet-field"><span>Nível</span>
          <input type="number" data-key="level" value="${s.level||1}" min="1" max="20" style="width:60px">
        </label>
      </div>
      <div class="sheet-row-3">
        <label class="sheet-field"><span>Antecedente</span>
          <input type="text" data-key="background" value="${esc(s.background)}" placeholder="Soldado">
        </label>
        <label class="sheet-field"><span>Alinhamento</span>
          <input type="text" data-key="alignment" value="${esc(s.alignment)}" placeholder="Leal e Bom">
        </label>
        <label class="sheet-field"><span>Bônus Proficiência</span>
          <input type="number" data-key="proficiency" value="${s.proficiency||2}" min="1" max="9" style="width:60px">
        </label>
      </div>
    </div>

    <!-- ── HP BAR ────────────────────────────────────────── -->
    <div class="sheet-section">
      <div class="sheet-hp-row">
        <label class="sheet-field" style="flex:1">
          <span>HP Atual</span>
          <input type="number" data-key="hp_current" value="${hp}" min="0" class="hp-input">
        </label>
        <span class="hp-slash">/</span>
        <label class="sheet-field" style="flex:1">
          <span>HP Máximo</span>
          <input type="number" data-key="hp_max" value="${hpMax}" min="0" class="hp-input">
        </label>
        <label class="sheet-field" style="width:80px">
          <span>Dado de Vida</span>
          <input type="text" data-key="hit_dice" value="${esc(s.hit_dice)}" placeholder="1d8">
        </label>
      </div>
      <div class="hp-bar-track">
        <div class="hp-bar-fill" style="width:${hpPct}%;background:${hpColor}"></div>
        <span class="hp-bar-text">${hp} / ${hpMax}</span>
      </div>
    </div>

    <!-- ── COMBAT ────────────────────────────────────────── -->
    <div class="sheet-section">
      <div class="sheet-row-3">
        <div class="sheet-combat-stat">
          <span class="combat-label">CA</span>
          <input type="number" data-key="ac" value="${s.ac||10}" class="combat-input">
        </div>
        <div class="sheet-combat-stat">
          <span class="combat-label">Iniciativa</span>
          <input type="number" data-key="initiative" value="${s.initiative??0}" class="combat-input">
        </div>
        <div class="sheet-combat-stat">
          <span class="combat-label">Deslocamento</span>
          <input type="number" data-key="speed" value="${s.speed||30}" class="combat-input">
        </div>
      </div>
    </div>

    <!-- ── ABILITY SCORES ────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Atributos</p>
      <div class="stats-grid">
        ${STATS.map(stat => `
          <div class="stat-block">
            <span class="stat-label">${STAT_L[stat]}</span>
            <span class="stat-mod">${mod(s.stats?.[stat]??10)}</span>
            <input type="number" data-stat="${stat}" value="${s.stats?.[stat]??10}" min="1" max="30" class="stat-input">
          </div>`).join('')}
      </div>
    </div>

    <!-- ── SAVING THROWS ─────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Testes de Resistência</p>
      <div class="saves-grid">
        ${STATS.map(stat => {
          const isProficient = (s.saving_throws||[]).includes(stat);
          const bonus = Math.floor(((s.stats?.[stat]??10) - 10) / 2) + (isProficient ? (s.proficiency||2) : 0);
          const sign  = bonus >= 0 ? '+' : '';
          return `<label class="save-item">
            <input type="checkbox" data-save="${stat}" ${isProficient?'checked':''}>
            <span class="save-bonus">${sign}${bonus}</span>
            <span>${STAT_L[stat]}</span>
          </label>`;
        }).join('')}
      </div>
    </div>

    <!-- ── SKILLS ─────────────────────────────────────────── -->
    <div class="sheet-section sheet-section--collapsible" id="skillsSection">
      <p class="sheet-section-label sheet-toggle" data-target="skillsList">Perícias ▾</p>
      <div class="skills-grid" id="skillsList">
        ${SKILLS_MAP.map(([skill, base]) => {
          const isProficient = (s.skills_prof||[]).includes(skill);
          const bonus = Math.floor(((s.stats?.[base]??10) - 10) / 2) + (isProficient ? (s.proficiency||2) : 0);
          const sign  = bonus >= 0 ? '+' : '';
          return `<label class="save-item">
            <input type="checkbox" data-skill="${skill}" ${isProficient?'checked':''}>
            <span class="save-bonus">${sign}${bonus}</span>
            <span>${skill}</span>
          </label>`;
        }).join('')}
      </div>
    </div>

    <!-- ── ATTACKS ────────────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Ataques</p>
      <div id="attacksList">
        ${(s.attacks||[]).map((atk, i) => attackRow(atk, i)).join('')}
      </div>
      <button class="sheet-btn-sm" id="btnAddAtk">＋ Ataque</button>
    </div>

    <!-- ── CONDITIONS ─────────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Condições</p>
      <div class="conditions-grid">
        ${CONDITIONS_LIST.map(c => {
          const active = (s.conditions||[]).includes(c.id);
          return `<label class="condition-item ${active?'active':''}" title="${c.label}">
            <input type="checkbox" data-condition="${c.id}" ${active?'checked':''}> 
            <span>${c.icon}</span>
            <span class="condition-label">${c.label}</span>
          </label>`;
        }).join('')}
      </div>
    </div>

    <!-- ── TRAITS / NOTES ─────────────────────────────────── -->
    <div class="sheet-section">
      <p class="sheet-section-label">Traços e Habilidades</p>
      <textarea data-key="features" class="sheet-textarea" rows="3" placeholder="Ação de Surto, Segundo Fôlego…">${esc(s.features)}</textarea>
      <p class="sheet-section-label" style="margin-top:.5rem">Equipamentos</p>
      <textarea data-key="equipment" class="sheet-textarea" rows="2" placeholder="Espada Longa, Escudo…">${esc(s.equipment)}</textarea>
      <p class="sheet-section-label" style="margin-top:.5rem">Notas</p>
      <textarea data-key="notes" class="sheet-textarea" rows="3" placeholder="Observações da sessão…">${esc(s.notes)}</textarea>
    </div>`;

  bindSheetEvents();
}

function attackRow(atk, i) {
  return `<div class="atk-row" data-atk="${i}">
    <input type="text"   data-atk-key="name"   value="${esc(atk.name)}"   placeholder="Espada" class="tf-input atk-name">
    <input type="text"   data-atk-key="bonus"  value="${esc(atk.bonus)}"  placeholder="+5"    class="tf-input atk-bonus">
    <input type="text"   data-atk-key="damage" value="${esc(atk.damage)}" placeholder="1d8+3" class="tf-input atk-dmg">
    <button class="tpl-btn-del atk-del" data-atk="${i}">✕</button>
  </div>`;
}

function esc(v) { return (v||'').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Bind events ────────────────────────────────────────────
function bindSheetEvents() {
  // Generic text/number inputs
  sheetBody.querySelectorAll('[data-key]').forEach(el => {
    el.addEventListener('input', () => {
      const key = el.dataset.key;
      const val = el.type === 'number' ? Number(el.value) : el.value;
      sheetData[key] = val;
      // Live HP bar update
      if (key === 'hp_current' || key === 'hp_max') updateHpBar();
      scheduleSave();
    });
  });

  // Stats
  sheetBody.querySelectorAll('[data-stat]').forEach(el => {
    el.addEventListener('input', () => {
      if (!sheetData.stats) sheetData.stats = {};
      sheetData.stats[el.dataset.stat] = Number(el.value);
      scheduleSave();
    });
  });

  // Saving throws
  sheetBody.querySelectorAll('[data-save]').forEach(el => {
    el.addEventListener('change', () => {
      const saves = sheetBody.querySelectorAll('[data-save]:checked');
      sheetData.saving_throws = [...saves].map(s => s.dataset.save);
      scheduleSave();
    });
  });

  // Skills
  sheetBody.querySelectorAll('[data-skill]').forEach(el => {
    el.addEventListener('change', () => {
      const checked = sheetBody.querySelectorAll('[data-skill]:checked');
      sheetData.skills_prof = [...checked].map(s => s.dataset.skill);
      scheduleSave();
    });
  });

  // Conditions
  sheetBody.querySelectorAll('[data-condition]').forEach(el => {
    el.addEventListener('change', () => {
      const checked = sheetBody.querySelectorAll('[data-condition]:checked');
      sheetData.conditions = [...checked].map(c => c.dataset.condition);
      el.closest('.condition-item').classList.toggle('active', el.checked);
      scheduleSave();
      // Update token overlay immediately
      window.updateTokenConditions?.(currentTokenId, sheetData.conditions);
    });
  });

  // Attacks
  sheetBody.querySelector('#btnAddAtk')?.addEventListener('click', () => {
    if (!sheetData.attacks) sheetData.attacks = [];
    sheetData.attacks.push({ name: '', bonus: '', damage: '' });
    sheetBody.querySelector('#attacksList').insertAdjacentHTML(
      'beforeend', attackRow({ name:'', bonus:'', damage:'' }, sheetData.attacks.length - 1)
    );
    bindAtkEvents();
    scheduleSave();
  });

  bindAtkEvents();

  // Collapsible sections
  sheetBody.querySelectorAll('.sheet-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const target = document.getElementById(el.dataset.target);
      target?.classList.toggle('collapsed');
      el.textContent = el.textContent.includes('▾')
        ? el.textContent.replace('▾','▸')
        : el.textContent.replace('▸','▾');
    });
  });
}

function bindAtkEvents() {
  sheetBody.querySelectorAll('.atk-row').forEach(row => {
    const idx = Number(row.dataset.atk);
    row.querySelectorAll('[data-atk-key]').forEach(el => {
      el.addEventListener('input', () => {
        if (!sheetData.attacks) sheetData.attacks = [];
        if (!sheetData.attacks[idx]) sheetData.attacks[idx] = {};
        sheetData.attacks[idx][el.dataset.atkKey] = el.value;
        scheduleSave();
      });
    });
    row.querySelector('.atk-del')?.addEventListener('click', () => {
      sheetData.attacks.splice(idx, 1);
      renderSheet();
      scheduleSave();
    });
  });
}

// ── HP bar live update ─────────────────────────────────────
function updateHpBar() {
  const track = sheetBody.querySelector('.hp-bar-track');
  const fill  = sheetBody.querySelector('.hp-bar-fill');
  const text  = sheetBody.querySelector('.hp-bar-text');
  if (!fill) return;

  const hp    = sheetData.hp_current ?? 0;
  const max   = sheetData.hp_max || 1;
  const pct   = Math.max(0, Math.min(100, (hp / max) * 100));
  const color = pct > 60 ? '#2a9d8f' : pct > 25 ? '#f4a261' : '#e63946';

  fill.style.width      = pct + '%';
  fill.style.background = color;
  text.textContent      = `${hp} / ${max}`;

  // Also update the token on the map
  window.updateTokenHp?.(currentTokenId, hp, max);
}

// ── Save ───────────────────────────────────────────────────
function scheduleSave() {
  sheetSaved.textContent = '…';
  sheetSaved.classList.remove('ok');
  clearTimeout(sheetDebounce);
  sheetDebounce = setTimeout(saveSheet, SAVE_DELAY);
}

async function saveSheet() {
  if (!currentTokenId) return;
  try {
    await fetch(`/tokens/${currentTokenId}/sheet`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_hp:  sheetData.hp_current,
        max_hp:      sheetData.hp_max,
        conditions:  sheetData.conditions || [],
        sheet_data:  sheetData,
      }),
    });
    sheetSaved.textContent = '✓ Salvo';
    sheetSaved.classList.add('ok');
  } catch (_) {
    sheetSaved.textContent = 'Erro';
  }
}

// ── Expose to tabletop.js ──────────────────────────────────
window.openTokenSheet = openSheet;
