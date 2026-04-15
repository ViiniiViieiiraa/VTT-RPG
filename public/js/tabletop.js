/**
 * tabletop.js — VTT Engine (Etapa 5)
 * Fix: Snap-to-center · Scenes · Notes CRUD
 */

// ══════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════
const ZOOM_MIN    = 0.1;
const ZOOM_MAX    = 8.0;
const ZOOM_SPEED  = 0.0012;
const GRID_SIZE   = 64;          // px no espaço interno do mapa
const PX_PER_FT = GRID_SIZE / 5;   // 12.8 px / foot (GRID_SIZE=64, 5ft/square)
const TOKEN_PX    = 56;          // diâmetro base 1×1 em px do mapa
const NOTE_DEBOUNCE_MS = 1500;

const SWATCHES = [
  '#e63946','#f4a261','#e9c46a',
  '#2a9d8f','#457b9d','#9b5de5',
  '#ffffff','#6c757d',
];
const DICE = [4, 6, 8, 10, 12, 20];

// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
const cam  = { x: 0, y: 0, scale: 1 };
const pan  = { active: false, startX: 0, startY: 0, originX: 0, originY: 0 };
const drag = { active: false, el: null, id: null, size: 1, offX: 0, offY: 0 };
const ui   = { gridVisible: false, mapLoaded: false };

const CAMPAIGN_ID = window.CAMPAIGN_ID;
let   activeSceneId = null;   // scene corrente

let isFogEditing = false;
let isDrawingFog = false;
let fogTool = 'hide'; // 'hide' ou 'reveal'
let masterFogVisible = true;

// ══════════════════════════════════════════════
// ELEMENTOS
// ══════════════════════════════════════════════
const $ = id => document.getElementById(id);

const viewport     = $('viewport');
const mapLayer     = $('mapLayer');
const mapImage     = $('mapImage');
const tokenLayer   = $('tokenLayer');
const gridOverlay  = $('gridOverlay');
const noMap        = $('noMap');
const zoomDisplay  = $('zoomDisplay');
const btnReset     = $('btnReset');
const btnGrid      = $('btnGrid');
const gridIcon     = $('gridIcon');
const gridLabel    = $('gridLabel');

// mapImage.addEventListener('load', () => {
//     console.log("📢 Imagem do mapa detectada, iniciando componentes...");
//     if (typeof initOverlayCanvas === 'function') initOverlayCanvas();
// });

// Tokens
const btnAddToken  = $('btnAddToken');
const tokenForm    = $('tokenForm');
const tfName       = $('tfName');
const tfSwatches   = $('tfSwatches');
const tfSubmit     = $('tfSubmit');
const ctxMenu      = $('ctxMenu');
const ctxDelete    = $('ctxDelete');

// Scenes
const btnNewScene  = $('btnNewScene');
const sceneForm    = $('sceneForm');
const sfName       = $('sfName');
const sfUrl        = $('sfUrl');
const sfFile       = $('sfFile');
const sfSubmit     = $('sfSubmit');
const sceneList    = $('sceneList');
const sceneEmptyHint = $('sceneEmptyHint');

// Dice / Log
const dicePanel    = $('dicePanel');
const logList      = $('logList');
const logDrawer    = $('logDrawer');
const btnToggleLog = $('btnToggleLog');
const btnCloseLog  = $('btnCloseLog');

// Notes
const btnNotes       = $('btnNotes');
const notesDrawer    = $('notesDrawer');
const btnCloseNotes  = $('btnCloseNotes');
const btnNewNote     = $('btnNewNote');
const notesList      = $('notesList');
const notesEmptyHint = $('notesEmptyHint');
const noteEditor     = $('noteEditor');
const btnBackNotes   = $('btnBackNotes');
const noteTitleInput = $('noteTitleInput');
const notesArea      = $('notesArea');
const notesSaved     = $('notesSaved');
const btnDeleteNote  = $('btnDeleteNote');

const btnFog = $('btnFog');
const fogToolPanel = $('fogToolPanel');
const btnToggleFogView = $('btnToggleFogView');
const fogViewLabel = $('fogViewLabel');
const btnFogClear = $('btnFogClear');
const fogCanvas = $('fogCanvas');
const fogCtx = fogCanvas ? fogCanvas.getContext('2d', { willReadFrequently: true }) : null;

// ══════════════════════════════════════════════
// CAMERA / TRANSFORM
// ══════════════════════════════════════════════
function applyTransform(smooth = false) {
  mapLayer.style.transition = smooth
    ? 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none';
  mapLayer.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.scale})`;
  zoomDisplay.textContent  = `${Math.round(cam.scale * 100)}%`;
}

function screenToMap(sx, sy) {
  return { x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale };
}

// ══════════════════════════════════════════════
// ZOOM — centrado no cursor
// ══════════════════════════════════════════════
viewport.addEventListener('wheel', e => {
  e.preventDefault();
  const rect  = viewport.getBoundingClientRect();
  const cx    = e.clientX - rect.left;
  const cy    = e.clientY - rect.top;
  const delta = -e.deltaY * ZOOM_SPEED * cam.scale;
  const after = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.scale + delta));
  if (after === cam.scale) return;
  const mpx = (cx - cam.x) / cam.scale;
  const mpy = (cy - cam.y) / cam.scale;
  cam.x     = cx - mpx * after;
  cam.y     = cy - mpy * after;
  cam.scale = after;
  applyTransform();
}, { passive: false });

// ══════════════════════════════════════════════
// PAN — Botão Direito / Meio
// ══════════════════════════════════════════════
viewport.addEventListener('mousedown', e => {
  if (e.button !== 2 && e.button !== 1) return;
  if (drag.active) return;
  e.preventDefault();
  pan.active  = true;
  pan.startX  = e.clientX; pan.startY  = e.clientY;
  pan.originX = cam.x;     pan.originY = cam.y;
  viewport.classList.add('panning');
});

window.addEventListener('mousemove', e => {
  if (!pan.active) return;
  cam.x = pan.originX + (e.clientX - pan.startX);
  cam.y = pan.originY + (e.clientY - pan.startY);
  applyTransform();
});

window.addEventListener('mouseup', e => {
  if (e.button !== 2 && e.button !== 1) return;
  pan.active = false;
  viewport.classList.remove('panning');
});

viewport.addEventListener('contextmenu', e => {
  if (!e.target.closest('.token')) e.preventDefault();
});

// ══════════════════════════════════════════════
// RESET VIEW
// ══════════════════════════════════════════════
function resetView() {
  if (!ui.mapLoaded) return;
  const vw = viewport.clientWidth,  vh = viewport.clientHeight;
  const iw = mapImage.naturalWidth, ih = mapImage.naturalHeight;
  cam.scale = Math.min((vw * 0.95) / iw, (vh * 0.95) / ih, 1);
  cam.x = (vw - iw * cam.scale) / 2;
  cam.y = (vh - ih * cam.scale) / 2;
  
  // Garante que o canvas de medição se ajuste ao novo tamanho/zoom
  if (typeof initOverlayCanvas === 'function') initOverlayCanvas();
  
  applyTransform(true);
}

btnReset.addEventListener('click', resetView);

// ══════════════════════════════════════════════
// GRID
// ══════════════════════════════════════════════
btnGrid.addEventListener('click', () => {
  ui.gridVisible = !ui.gridVisible;
  gridOverlay.classList.toggle('visible', ui.gridVisible);
  gridIcon.textContent  = ui.gridVisible ? '⊟' : '⊞';
  gridLabel.textContent = ui.gridVisible ? 'Ocultar Grade' : 'Mostrar Grade';
  btnGrid.classList.toggle('active', ui.gridVisible);
});

// ══════════════════════════════════════════════
// SNAP-TO-CENTER
// ══════════════════════════════════════════════
/**
 * Alinha o CENTRO do token ao centro do quadrado mais próximo.
 *
 * Centro do quadrado = (Math.floor(pos / GRID_SIZE) * GRID_SIZE) + GRID_SIZE/2
 *
 * pos_x/pos_y representam o centro do token em coords do mapa.
 * Encontramos a célula onde o centro do token caiu e retornamos o centro dela.
 */
/**
 * Snap inteligente por tamanho:
 *   Ímpar (1×1): centro do token → centro do quadrado
 *     snap = Math.floor(cx / G) * G + G/2
 *   Par   (2×2): centro do token → cruzamento de linhas
 *     snap = Math.round(cx / G) * G
 *
 * Isso garante que tokens 2×2 ocupam exatamente 4 células,
 * e tokens 1×1 ficam no meio de 1 célula.
 */
function snapPosition(cx, cy, size = 1) {
  const isEven = size % 2 === 0;

  if (isEven) {
    // Para 2x2, 4x4, etc: Alinha no cruzamento das linhas (vértice)
    return {
      x: Math.round(cx / GRID_SIZE) * GRID_SIZE,
      y: Math.round(cy / GRID_SIZE) * GRID_SIZE,
    };
  } else {
    // Para 1x1, 3x3, etc: Alinha no centro exato do quadrado
    return {
      x: Math.floor(cx / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2,
      y: Math.floor(cy / GRID_SIZE) * GRID_SIZE + GRID_SIZE / 2,
    };
  }
}

// ══════════════════════════════════════════════
// MAP LOAD
// ══════════════════════════════════════════════
function loadMapDataURL(dataURL) {
  mapImage.onload = () => {
    ui.mapLoaded = true;
    noMap.classList.add('hidden');
    
    // 1. Ajuste de tamanho físico
    gridOverlay.style.width  = mapImage.naturalWidth  + 'px';
    gridOverlay.style.height = mapImage.naturalHeight + 'px';
    
    // 2. Chame uma única função organizadora
    initializeMapDependencies();

    resetView();
  };
  mapImage.src = dataURL;
}

function initializeMapDependencies() {
  console.log("🚀 Sincronizando componentes com o novo mapa...");
  
  if (typeof initFogCanvas === 'function') initFogCanvas();
  if (typeof initOverlayCanvas === 'function') initOverlayCanvas();

}

// ══════════════════════════════════════════════
// SCENES
// ══════════════════════════════════════════════
async function loadScene(scene) {
  activeSceneId = scene.id;
  tokenLayer.innerHTML = '';
  ui.mapLoaded = false;

  // Destaca a cena ativa na lista lateral
  document.querySelectorAll('.scene-item').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.id) === scene.id);
  });

  if (scene.image_url) {
    mapImage.onload = () => {
      ui.mapLoaded = true;
      noMap.classList.add('hidden');
      gridOverlay.style.width  = mapImage.naturalWidth  + 'px';
      gridOverlay.style.height = mapImage.naturalHeight + 'px';
      
      // Inicializa o Canvas da Névoa e restaura os desenhos salvos
      if (typeof initFogCanvas === 'function') initFogCanvas();
      if (typeof restoreFog === 'function') restoreFog(scene.id);

      initFogCanvas();
      loadFog(scene.id);
      resetView();
    };
    mapImage.src = scene.image_url;
  } else {
    noMap.classList.remove('hidden');
    mapImage.src = '';
  }

  // Avisa o servidor qual cena está ativa e carrega os tokens dela
  await fetch(`/campaigns/${CAMPAIGN_ID}/scenes/${scene.id}/activate`, { method: 'PATCH' });
  await restoreTokens();
}

function buildSceneItem(scene) {
  const el = document.createElement('div');
  el.className  = 'scene-item';
  el.dataset.id = scene.id;
  if (scene.is_active) el.classList.add('active');

  el.innerHTML = `
    <button class="scene-activate" title="Ativar cena">
      <span class="scene-dot"></span>
      <span class="scene-name">${scene.name}</span>
    </button>
    <button class="scene-delete" data-id="${scene.id}" title="Excluir cena">✕</button>`;

  el.querySelector('.scene-activate').addEventListener('click', () => loadScene(scene));

  el.querySelector('.scene-delete').addEventListener('click', async e => {
    e.stopPropagation();
    el.remove();
    await fetch(`/scenes/${scene.id}`, { method: 'DELETE' });
    if (Number(sceneList.children.length) === 0) sceneEmptyHint.classList.remove('hidden');
    if (activeSceneId === scene.id) {
      activeSceneId = null;
      tokenLayer.innerHTML = '';
      mapImage.src = '';
      ui.mapLoaded = false;
      noMap.classList.remove('hidden');
    }
  });

  return el;
}

async function restoreScenes() {
  const res    = await fetch(`/campaigns/${CAMPAIGN_ID}/scenes`);
  const scenes = await res.json();

  sceneList.querySelectorAll('.scene-item').forEach(el => el.remove());

  if (scenes.length === 0) {
    sceneEmptyHint.classList.remove('hidden');
    return;
  }
  sceneEmptyHint.classList.add('hidden');

  scenes.forEach(scene => sceneList.appendChild(buildSceneItem(scene)));

  // Auto-load active scene
  const active = scenes.find(s => s.is_active) || scenes[0];
  if (active) loadScene(active);
}

// Toggle scene form
btnNewScene.addEventListener('click', () => {
  sceneForm.classList.toggle('collapsed');
  if (!sceneForm.classList.contains('collapsed')) sfName.focus();
});

// File input → base64
sfFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { sfUrl.value = ev.target.result; };
  reader.readAsDataURL(file);
  sfFile.value = '';
});

sfSubmit.addEventListener('click', async () => {
  const name = sfName.value.trim();
  if (!name) { sfName.focus(); return; }
  const image_url = sfUrl.value.trim() || null;

  const res   = await fetch(`/campaigns/${CAMPAIGN_ID}/scenes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, image_url }),
  });
  const scene = await res.json();

  sceneEmptyHint.classList.add('hidden');
  sceneList.appendChild(buildSceneItem(scene));

  sfName.value = '';
  sfUrl.value  = '';
  sceneForm.classList.add('collapsed');

  loadScene(scene);
});

// ══════════════════════════════════════════════
// TOKENS — DOM
// ══════════════════════════════════════════════
function updateTokenVisibility() {
  if (!fogCtx) return;
  const tokens = document.querySelectorAll('.token');
  
  tokens.forEach(tokenEl => {
    const tokenId = tokenEl.dataset.id; // Pegamos o ID para achar a aura depois
    const size = Number(tokenEl.dataset.size);
    const half = (TOKEN_PX * size) / 2;
    const cx = parseFloat(tokenEl.style.left) + half;
    const cy = parseFloat(tokenEl.style.top) + half;

    const pixel = fogCtx.getImageData(cx, cy, 1, 1).data;
    const isUnderFog = pixel[3] > 0;

    // Lógica: Só esconde se estiver sob a névoa E a visão do mestre estiver "sólida"
    const shouldHide = isUnderFog && masterFogVisible;
    
    // 1. Aplica ao Token
    tokenEl.classList.toggle('token-fog-hidden', shouldHide);

    // 2. Aplica às Auras vinculadas a este token
    const auras = tokenLayer.querySelectorAll(`.aura-ring[data-tid="${tokenId}"]`);
    auras.forEach(auraEl => {
      // Usamos a mesma lógica de visibilidade
      // Se 'shouldHide' for true, adicionamos uma classe para esconder a aura também
      if (shouldHide) {
        auraEl.style.visibility = 'hidden';
      } else {
        // Só mostramos se a visibilidade global das auras estiver ativa
        auraEl.style.visibility = auraVisible ? 'visible' : 'hidden';
      }
    });
  });
}

function createTokenEl(token) {
  const px   = TOKEN_PX * token.size;
  const half = px / 2;
  const el   = document.createElement('div');

  el.className    = 'token';
  el.dataset.id   = token.id;
  el.dataset.size = token.size;
  el.style.width  = px + 'px';
  el.style.height = px + 'px';
  el.style.left   = (token.pos_x - half) + 'px';
  el.style.top    = (token.pos_y - half) + 'px';
  el.style.setProperty('--token-color', token.color);
  el.style.setProperty('--sz', px + 'px');

  // Build token image or initial
  // Resolve image from token instance first, fall back to nothing (gallery sets image_url on token row)
  const tokenImgUrl = token.image_url || null;
  const imgHtml = tokenImgUrl
    ? `<img src="${tokenImgUrl}" alt="${token.name}" class="token-img" loading="lazy">`
    : `<span class="token-initial">${token.name.charAt(0).toUpperCase()}</span>`;

  // HP bar — read from sheet_data JSON (single source of truth)
  const hpHtml = (() => {
    let cur = 0, max = 0;
    if (token.sheet_data) {
      try {
        const sd = JSON.parse(token.sheet_data);
        cur = sd.hp_current ?? sd.hp_max ?? 0;
        max = sd.hp_max ?? 0;
      } catch(_) {}
    }
    if (max <= 0) return '';
    const pct   = Math.max(0, Math.min(100, (cur / max) * 100));
    const color = pct > 50 ? '#2a9d8f' : pct > 25 ? '#f4a261' : '#e63946';
    return `<div class="token-hp-bar">
      <div class="token-hp-fill" style="width:${pct}%;background:${color}"></div>
    </div>
    <span class="token-hp-text">${cur}/${max}</span>`;
  })();

  // Condition badges
  const COND_ICONS = {
    blinded:'👁️', charmed:'💞', deafened:'🔇', exhaustion:'😴',
    frightened:'😱', grappled:'🤼', incapacitated:'❌', invisible:'👻',
    paralyzed:'⚡', petrified:'🪨', poisoned:'🤢', prone:'⬇️',
    restrained:'🕸️', stunned:'💫', unconscious:'💀',
  };
  // Conditions — read from sheet_data JSON (single source of truth)
  let conditions = [];
  try {
    if (token.sheet_data) {
      const sd = JSON.parse(token.sheet_data);
      conditions = sd.conditions || [];
    }
  } catch(_) {}
  const condHtml = conditions.length > 0
    ? `<div class="token-conditions">${conditions.slice(0,5).map(c =>
        `<span class="token-condition-badge" title="${c}">${COND_ICONS[c]||'?'}</span>`).join('')}</div>`
    : '';

  el.innerHTML = `
    ${imgHtml}
    <span class="token-label">${token.name}</span>
    ${hpHtml}
    ${condHtml}`;

  // ── Drag ────────────────────────────────────
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    closeCtxMenu();

    const size = Number(el.dataset.size);
    const half = (TOKEN_PX * size) / 2;

    // ★ Lê posição do DOM (nunca stale)
    const cx = parseFloat(el.style.left) + half;
    const cy = parseFloat(el.style.top)  + half;

    const rect    = viewport.getBoundingClientRect();
    const mouseMap = screenToMap(e.clientX - rect.left, e.clientY - rect.top);

    drag.active = true;
    drag.el     = el;
    drag.id     = Number(el.dataset.id);
    drag.size   = size;
    drag.offX   = mouseMap.x - cx;
    drag.offY   = mouseMap.y - cy;
    drag.token  = token;       // for aura re-render on drop

    el.classList.add('dragging');
    viewport.classList.add('token-drag');
  });

  // ── Context ──────────────────────────────────
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    showCtxMenu(e.clientX, e.clientY, Number(el.dataset.id), el);
  });

  return el;
}

function placeToken(token) {
  const existing = tokenLayer.querySelector(`[data-id="${token.id}"]`);
  if (existing) {
    tokenLayer.querySelectorAll(`.aura-ring[data-tid="${token.id}"]`).forEach(r => r.remove());
    existing.remove();
  }
  tokenLayer.appendChild(createTokenEl(token));
  if (typeof renderTokenAuras === 'function') renderTokenAuras(token);
}

// ══════════════════════════════════════════════
// DRAG — global
// ══════════════════════════════════════════════
window.addEventListener('mousemove', e => {
  if (!drag.active) return;
  const rect    = viewport.getBoundingClientRect();
  const mm      = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
  const cx      = mm.x - drag.offX;
  const cy      = mm.y - drag.offY;
  const half    = (TOKEN_PX * drag.size) / 2;
  drag.el.style.left = (cx - half) + 'px';
  drag.el.style.top  = (cy - half) + 'px';
});

window.addEventListener('mouseup', async e => {
  if (!drag.active || e.button !== 0) return;

  const rect  = viewport.getBoundingClientRect();
  const mm    = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
  const rawCX = mm.x - drag.offX;
  const rawCY = mm.y - drag.offY;

  // ── Snap-to-center ────────────────────────────
  const snapped = snapPosition(rawCX, rawCY, drag.size);
  const half    = (TOKEN_PX * drag.size) / 2;

  drag.el.classList.remove('dragging');
  drag.el.classList.add('snapping');
  drag.el.style.left = (snapped.x - half) + 'px';
  drag.el.style.top  = (snapped.y - half) + 'px';
  setTimeout(() => drag.el?.classList.remove('snapping'), 280);

  viewport.classList.remove('token-drag');
  const tokenId = drag.id;
  const savedToken = drag.token;
  drag.active = false; drag.el = null; drag.token = null;
  updateTokenVisibility?.();

  await fetch(`/tokens/${tokenId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pos_x: snapped.x, pos_y: snapped.y }),
  });
  // Re-render auras at new snap position
  if (savedToken && typeof renderTokenAuras === 'function') {
    savedToken.pos_x = snapped.x;
    savedToken.pos_y = snapped.y;
    renderTokenAuras(savedToken);
  }
});

// ══════════════════════════════════════════════
// CONTEXT MENU
// ══════════════════════════════════════════════
let ctxTargetId = null, ctxTargetEl = null;

function showCtxMenu(x, y, tokenId, el) {
  ctxTargetId = tokenId; ctxTargetEl = el;
  ctxMenu.style.left = Math.min(x, window.innerWidth  - 180) + 'px';
  ctxMenu.style.top  = Math.min(y, window.innerHeight - 60)  + 'px';
  ctxMenu.classList.remove('hidden');
}

function closeCtxMenu() {
  ctxMenu.classList.add('hidden');
  ctxTargetId = null; ctxTargetEl = null;
}

ctxDelete.addEventListener('click', async () => {
  if (!ctxTargetId) return;

  // 1. Remove as auras vinculadas a este token no mapa
  tokenLayer.querySelectorAll(`.aura-ring[data-tid="${ctxTargetId}"]`).forEach(r => r.remove());

  // 2. Remove o elemento visual do token
  ctxTargetEl?.remove();

  // 3. Avisa o servidor para deletar do banco de dados
  await fetch(`/tokens/${ctxTargetId}`, { method: 'DELETE' });

  closeCtxMenu();
});

// "Abrir Ficha" — delegated to sheet.js via window.openTokenSheet
document.getElementById('ctxOpenSheet')?.addEventListener('click', () => {
  const id = ctxTargetId;
  closeCtxMenu();
  window.openTokenSheet?.(id);
});

document.addEventListener('click', e => { if (!e.target.closest('#ctxMenu')) closeCtxMenu(); });

// ══════════════════════════════════════════════
// TOKEN CREATION
// ══════════════════════════════════════════════
let selectedColor = SWATCHES[0];
let selectedSize  = 1;

SWATCHES.forEach(color => {
  const s = document.createElement('button');
  s.className = 'swatch'; s.title = color;
  s.style.background = color;
  if (color === selectedColor) s.classList.add('active');
  s.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach(b => b.classList.remove('active'));
    s.classList.add('active'); selectedColor = color;
  });
  tfSwatches.appendChild(s);
});

document.querySelectorAll('.tf-size').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tf-size').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); selectedSize = Number(btn.dataset.size);
  });
});

btnAddToken.addEventListener('click', () => {
  tokenForm.classList.toggle('collapsed');
  btnAddToken.classList.toggle('active', !tokenForm.classList.contains('collapsed'));
  if (!tokenForm.classList.contains('collapsed')) setTimeout(() => tfName.focus(), 50);
});

tfSubmit.addEventListener('click', createToken);
tfName.addEventListener('keydown', e => { if (e.key === 'Enter') createToken(); });

async function createToken() {
  const name = tfName.value.trim();
  if (!name) { tfName.focus(); return; }

  const rect    = viewport.getBoundingClientRect();
  const center  = screenToMap(rect.width / 2, rect.height / 2);
  const snapped = snapPosition(center.x, center.y, selectedSize);

  const res   = await fetch('/tokens', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign_id: CAMPAIGN_ID, scene_id: activeSceneId,
      name, pos_x: snapped.x, pos_y: snapped.y,
      size: selectedSize, color: selectedColor,
    }),
  });
  const token = await res.json();
  placeToken(token);
  tfName.value = '';
  tokenForm.classList.add('collapsed');
  btnAddToken.classList.remove('active');
}

async function restoreTokens() {
  tokenLayer.innerHTML = '';
  if (!activeSceneId) return;
  try {
    const res    = await fetch(`/campaigns/${CAMPAIGN_ID}/tokens?scene_id=${activeSceneId}`);
    const tokens = await res.json();
    tokens.forEach(placeToken);
    updateTokenVisibility();
  } catch (_) {}
}

// ══════════════════════════════════════════════
// DICE ROLLER
// ══════════════════════════════════════════════
function showToast(msg) {
  const t = document.createElement('div');
  t.className   = 'dice-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => {
    t.classList.remove('visible');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, 2800);
}

function addLogEntry(msg) {
  const li   = document.createElement('li');
  li.className = 'log-entry';
  const time   = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  li.innerHTML = `<span class="log-time">${time}</span><span class="log-msg">${msg}</span>`;
  logList.prepend(li);
  while (logList.children.length > 15) logList.lastChild.remove();
}

async function handleDiceRoll(faces) {
  const result  = Math.floor(Math.random() * faces) + 1;
  const message = `1d${faces} → ${result}`;
  showToast(`🎲 ${message}`);
  addLogEntry(message);
  try {
    await fetch(`/campaigns/${CAMPAIGN_ID}/logs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  } catch (_) {}
}

DICE.forEach(faces => {
  const btn = dicePanel.querySelector(`[data-faces="${faces}"]`);
  if (btn) btn.addEventListener('click', () => handleDiceRoll(faces));
});

btnToggleLog.addEventListener('click', () => {
  logDrawer.classList.toggle('open');
  btnToggleLog.classList.toggle('active', logDrawer.classList.contains('open'));
  notesDrawer.classList.remove('open');
  btnNotes.classList.remove('active');
});
btnCloseLog.addEventListener('click', () => {
  logDrawer.classList.remove('open');
  btnToggleLog.classList.remove('active');
});

async function restoreLogs() {
  try {
    const res  = await fetch(`/campaigns/${CAMPAIGN_ID}/logs?limit=10`);
    const data = await res.json();
    data.reverse().forEach(row => addLogEntry(row.message));
  } catch (_) {}
}

// ══════════════════════════════════════════════
// NOTES — LIST + EDITOR
// ══════════════════════════════════════════════
let activeNoteId   = null;
let notesDebounce  = null;

btnNotes.addEventListener('click', () => {
  notesDrawer.classList.toggle('open');
  btnNotes.classList.toggle('active', notesDrawer.classList.contains('open'));
  logDrawer.classList.remove('open');
  btnToggleLog.classList.remove('active');
  if (notesDrawer.classList.contains('open')) restoreNotes();
});
btnCloseNotes.addEventListener('click', () => {
  notesDrawer.classList.remove('open');
  btnNotes.classList.remove('active');
});

// Back from editor → list
btnBackNotes.addEventListener('click', () => {
  noteEditor.classList.add('hidden');
  notesList.classList.remove('hidden');
  btnNewNote.classList.remove('hidden');
  activeNoteId = null;
  restoreNotes();
});

// New note
btnNewNote.addEventListener('click', async () => {
  const res  = await fetch(`/campaigns/${CAMPAIGN_ID}/notes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Nova nota', content: '' }),
  });
  const note = await res.json();
  openNoteEditor(note);
});

// Delete current note
btnDeleteNote.addEventListener('click', async () => {
  if (!activeNoteId) return;
  await fetch(`/notes/${activeNoteId}`, { method: 'DELETE' });
  btnBackNotes.click();
});

function openNoteEditor(note) {
  activeNoteId = note.id;
  noteTitleInput.value = note.title;
  notesArea.value      = note.content || '';
  notesSaved.textContent = '';
  notesList.classList.add('hidden');
  btnNewNote.classList.add('hidden');
  noteEditor.classList.remove('hidden');
  setTimeout(() => notesArea.focus(), 50);
}

// Debounced auto-save
async function saveCurrentNote() {
  if (!activeNoteId) return;
  await fetch(`/notes/${activeNoteId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: noteTitleInput.value.trim() || 'Sem título', content: notesArea.value }),
  });
  notesSaved.textContent = '✓ Salvo';
  notesSaved.classList.add('ok');
}

function scheduleNoteSave() {
  notesSaved.textContent = '…';
  notesSaved.classList.remove('ok');
  clearTimeout(notesDebounce);
  notesDebounce = setTimeout(saveCurrentNote, NOTE_DEBOUNCE_MS);
}

notesArea.addEventListener('input', scheduleNoteSave);
noteTitleInput.addEventListener('input', scheduleNoteSave);

// Build note card in list
function buildNoteCard(note) {
  const el = document.createElement('div');
  el.className  = 'note-card';
  el.dataset.id = note.id;

  const date = new Date(note.updated_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
  el.innerHTML = `
    <div class="note-card-top">
      <span class="note-card-title">${note.title}</span>
      <span class="note-card-date">${date}</span>
    </div>
    <p class="note-card-preview">${note.preview || 'Sem conteúdo.'}</p>`;

  el.addEventListener('click', async () => {
    const res  = await fetch(`/notes/${note.id}`);
    const full = await res.json();
    openNoteEditor(full);
  });

  return el;
}

async function restoreNotes() {
  try {
    notesList.querySelectorAll('.note-card').forEach(el => el.remove());
    const res   = await fetch(`/campaigns/${CAMPAIGN_ID}/notes`);
    const notes = await res.json();

    if (notes.length === 0) {
      notesEmptyHint.classList.remove('hidden');
    } else {
      notesEmptyHint.classList.add('hidden');
      notes.forEach(n => notesList.appendChild(buildNoteCard(n)));
    }
  } catch (_) {}
}

// ══════════════════════════════════════════════
// FOG OF WAR — BRUSH SYSTEM
// ══════════════════════════════════════════════

function initFogCanvas() {
  if (!fogCanvas) return;
  fogCanvas.width = mapImage.naturalWidth;
  fogCanvas.height = mapImage.naturalHeight;
  
  // Limpa o canvas (Começa sem névoa como você pediu)
  fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  
  // Ajusta opacidade inicial baseada na visão do mestre
  fogCanvas.style.opacity = masterFogVisible ? "1" : "0.3";
}

function handleFogStroke(e) {
  if (!isDrawingFog || !isFogEditing) return;

  const rect = fogCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / cam.scale;
  const y = (e.clientY - rect.top) / cam.scale;

  fogCtx.lineWidth = 80; // Tamanho do pincel
  fogCtx.lineCap = 'round';
  fogCtx.lineJoin = 'round';

  if (fogTool === 'hide') {
    fogCtx.globalCompositeOperation = 'source-over';
    fogCtx.fillStyle = "#1a1a1d"; // Cor da névoa
    fogCtx.strokeStyle = "#1a1a1d";
  } else {
    // Modo borracha
    fogCtx.globalCompositeOperation = 'destination-out';
  }

  fogCtx.lineTo(x, y);
  fogCtx.stroke();
  fogCtx.beginPath();
  fogCtx.moveTo(x, y);
}

async function saveFog() {
  if (!activeSceneId) return;
  // Converte o desenho atual em uma string de imagem (Base64)
  const dataURL = fogCanvas.toDataURL(); 
  
  await fetch(`/scenes/${activeSceneId}/fog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_data: dataURL }),
  });
}

async function loadFog(sceneId) {
  if (!fogCtx) return;
  try {
    const res = await fetch(`/scenes/${sceneId}/fog`);
    const data = await res.json();

    if (data && data.image_data) {
      const img = new Image();
      img.onload = () => {
        fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
        fogCtx.drawImage(img, 0, 0);
        updateTokenVisibility();
      };
      img.src = data.image_data;
    } else {
      // Se não houver dados, limpa o canvas
      fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
      updateTokenVisibility();
    }
  } catch (err) {
    console.error("Erro ao carregar névoa:", err);
  }
}

// ── Eventos de UI ──

btnFog.addEventListener('click', () => {
  isFogEditing = !isFogEditing;
  btnFog.classList.toggle('active', isFogEditing);
  fogToolPanel.classList.toggle('hidden', !isFogEditing);
  viewport.classList.toggle('fog-mode-active', isFogEditing);
  
  fogCanvas.style.pointerEvents = isFogEditing ? 'all' : 'none';
});

document.querySelectorAll('.fog-tool').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fog-tool').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    fogTool = btn.dataset.tool;
  });
});

btnToggleFogView.addEventListener('click', () => {
  masterFogVisible = !masterFogVisible;
  fogCanvas.style.opacity = masterFogVisible ? "1" : "0.3";
  btnToggleFogView.classList.toggle('active', !masterFogVisible);
  fogViewLabel.innerText = masterFogVisible ? "Ocultar Névoa" : "Exibir Névoa";

  updateTokenVisibility();
});

btnFogClear.addEventListener('click', async () => {
  if (confirm("Limpar toda a névoa desta cena?")) {
    fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
    updateTokenVisibility();

    await saveFog(); 
  }
});

// ── Eventos de Desenho ──

fogCanvas.addEventListener('mousedown', (e) => {
  if (!isFogEditing || e.button !== 0) return;
  isDrawingFog = true;
  
  const rect = fogCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / cam.scale;
  const y = (e.clientY - rect.top) / cam.scale;
  
  fogCtx.beginPath();
  fogCtx.moveTo(x, y);
});

window.addEventListener('mousemove', handleFogStroke);

window.addEventListener('mouseup', () => {
  if (isDrawingFog) {
    isDrawingFog = false;
    updateTokenVisibility();
    
    saveFog();
  }
});

// ══════════════════════════════════════════════
// EXPOSE TO gallery.js / sheet.js
// ══════════════════════════════════════════════
window.getActiveSceneId    = () => activeSceneId;
window.getCtxTargetId      = () => ctxTargetId;
window.closeCtxMenuGlobal  = closeCtxMenu;

/** Called by gallery.js after creating a token instance via API */
window.placeTokenFromGallery = (token) => {
  // Center on current viewport
  const rect   = viewport.getBoundingClientRect();
  const center = screenToMap(rect.width / 2, rect.height / 2);
  const snapped = snapPosition(center.x, center.y, token.size);
  token.pos_x = snapped.x;
  token.pos_y = snapped.y;
  // Update server with centered position
  fetch(`/tokens/${token.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pos_x: snapped.x, pos_y: snapped.y }),
  });
  placeToken(token);
};

/** Called by sheet.js when HP changes */
window.updateTokenHp = (tokenId, current, max) => {
  if (!tokenId) return;
  const el   = tokenLayer.querySelector(`[data-id="${tokenId}"]`);
  if (!el) return;
  // Show bar if hidden (token had no HP when placed)
  let bar  = el.querySelector('.token-hp-bar');
  let fill = el.querySelector('.token-hp-fill');
  let text = el.querySelector('.token-hp-text');
  if (!bar && max > 0) {
    // Inject bar dynamically if not present
    bar  = document.createElement('div');
    bar.className = 'token-hp-bar';
    fill = document.createElement('div');
    fill.className = 'token-hp-fill';
    text = document.createElement('span');
    text.className = 'token-hp-text';
    bar.appendChild(fill);
    el.appendChild(bar);
    el.appendChild(text);
  }
  if (!fill) return;
  const pct   = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color = pct > 50 ? '#2a9d8f' : pct > 25 ? '#f4a261' : '#e63946';
  fill.style.width      = pct + '%';
  fill.style.background = color;
  if (text) text.textContent = `${current}/${max}`;
};

/** Called by sheet.js when conditions change */
window.updateTokenConditions = (tokenId, conditions) => {
  const el   = tokenLayer.querySelector(`[data-id="${tokenId}"]`);
  if (!el) return;
  let badges = el.querySelector('.token-conditions');
  if (!badges) {
    badges = document.createElement('div');
    badges.className = 'token-conditions';
    el.appendChild(badges);
  }
  const COND_ICONS = {
    blinded:'👁️', charmed:'💞', deafened:'🔇', exhaustion:'😴',
    frightened:'😱', grappled:'🤼', incapacitated:'❌', invisible:'👻',
    paralyzed:'⚡', petrified:'🪨', poisoned:'🤢', prone:'⬇️',
    restrained:'🕸️', stunned:'💫', unconscious:'💀',
  };
  badges.innerHTML = (conditions||[]).slice(0,5).map(c =>
    `<span class="token-condition-badge" title="${c}">${COND_ICONS[c]||'?'}</span>`
  ).join('');
};

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
applyTransform();
restoreScenes();
restoreLogs();

// ─────────────────────────────────────────────
// AURAS
// ─────────────────────────────────────────────

let auraVisible = true;

/** Render aura rings in tokenLayer as siblings (absolute, auto-follow token). */
function renderTokenAuras(token) {
  // Remove stale rings for this token
  tokenLayer.querySelectorAll(`.aura-ring[data-tid="${token.id}"]`).forEach(r => r.remove());

  let auras = [];
  try { if (token.sheet_data) auras = JSON.parse(token.sheet_data).auras || []; } catch(_) {}
  if (!auras.length) return;

  const size   = token.size || 1;
  const halfPx = (TOKEN_PX * size) / 2;
  const tokEl  = tokenLayer.querySelector(`[data-id="${token.id}"]`);
  if (!tokEl) return;

  const cx = parseFloat(tokEl.style.left) + halfPx;
  const cy = parseFloat(tokEl.style.top)  + halfPx;

  // Insert largest aura first (bottom of visual stack)
  [...auras].reverse().forEach(aura => {
    if (!(aura.radius_ft > 0)) return;
    const rPx  = aura.radius_ft * PX_PER_FT;
    const ring = document.createElement('div');
    ring.className     = 'aura-ring';
    ring.dataset.tid   = token.id;
    ring.dataset.rPx   = rPx;
    ring.style.cssText = `width:${rPx*2}px;height:${rPx*2}px;` +
      `left:${cx-rPx}px;top:${cy-rPx}px;` +
      `border-color:${aura.color||'#9b5de5'};` +
      `background:${aura.color||'#9b5de5'}22;`;
    ring.title = `${aura.name||'Aura'} — ${aura.radius_ft}ft`;
    if (!auraVisible) ring.style.display = 'none';
    tokenLayer.insertBefore(ring, tokenLayer.firstChild);
  });
}

/** Move aura rings when token is being dragged (live follow). */
function updateAuraPositions(tokenId, cx, cy) {
  tokenLayer.querySelectorAll(`.aura-ring[data-tid="${tokenId}"]`).forEach(ring => {
    const rPx = Number(ring.dataset.rPx);
    ring.style.left = (cx - rPx) + 'px';
    ring.style.top  = (cy - rPx) + 'px';
  });
}

/** Called by sheet.js after aura list is saved, re-fetches and re-renders. */
window.refreshTokenAuras = async (tokenId) => {
  if (!tokenId) return;
  try {
    const res  = await fetch(`/tokens/${tokenId}/sheet`);
    const data = await res.json();
    const tokEl = tokenLayer.querySelector(`[data-id="${tokenId}"]`);
    if (!tokEl) return;
    renderTokenAuras({
      id: tokenId,
      size: Number(tokEl.dataset.size) || 1,
      sheet_data: JSON.stringify(data.sheet),
    });
  } catch(_) {}
};

// Supplementary drag-move listener: keep auras in sync with token
window.addEventListener('mousemove', e => {
  if (!drag.active) return;
  const rect = viewport.getBoundingClientRect();
  const mm   = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
  updateAuraPositions(drag.id, mm.x - drag.offX, mm.y - drag.offY);
});

// Aura toggle button
$('btnToggleAuras')?.addEventListener('click', () => {
  auraVisible = !auraVisible;
  $('btnToggleAuras').classList.toggle('active', auraVisible);
  const lbl = $('auraLabel');
  if (lbl) lbl.textContent = auraVisible ? 'Auras' : 'Auras (off)';
  tokenLayer.querySelectorAll('.aura-ring').forEach(r => {
    r.style.display = auraVisible ? '' : 'none';
  });
});

// ─────────────────────────────────────────────
// OVERLAY CANVAS (AoE Measurement)
// ─────────────────────────────────────────────

let overlayCtx = null;

function initOverlayCanvas() {
  const oc = document.getElementById('overlayCanvas');
  if (!oc || !mapImage) return;

  // Garante que o buffer interno seja igual ao tamanho real da imagem
  oc.width = mapImage.naturalWidth;
  oc.height = mapImage.naturalHeight;

  // Garante que o CSS acompanhe (importante para alinhar com o grid)
  oc.style.width = mapImage.naturalWidth + 'px';
  oc.style.height = mapImage.naturalHeight + 'px';
  
  overlayCtx = oc.getContext('2d');
  console.log("📏 Canvas de Medição pronto:", oc.width, "x", oc.height);
  redrawOverlay();
}

// ─────────────────────────────────────────────
// MEASURE STATE
// ─────────────────────────────────────────────

const ms = {
  tool:     null,    // 'line' | 'cone' | 'circle'
  rangeFt:  30,
  phase:    0,       // 0=idle  1=origin placed, waiting for direction click
  origin:   null,    // {x,y} map coords
  mousePos: null,    // current mouse in map coords (for preview)
  shapes:   [],      // committed shapes [{tool,origin,dir,rangeFt}]
};

// ─────────────────────────────────────────────
// GEOMETRY HELPERS
// ─────────────────────────────────────────────

const _dir = (a, b) => {
  const dx = b.x-a.x, dy = b.y-a.y, d = Math.sqrt(dx*dx+dy*dy)||1;
  return { x:dx/d, y:dy/d };
};

const _inCircle = (px,py,ox,oy,r) => {
  const dx=px-ox, dy=py-oy; return dx*dx+dy*dy <= r*r;
};

const _inCone = (px,py,ox,oy,dx,dy,r) => {
  const vx=px-ox, vy=py-oy;
  const fwd = vx*dx+vy*dy;
  return fwd>=0 && fwd<=r && Math.abs(vx*(-dy)+vy*dx) <= fwd*0.5;
};

const _inLine = (px,py,ox,oy,dx,dy,r) => {
  const vx=px-ox, vy=py-oy;
  const fwd=vx*dx+vy*dy;
  return fwd>=0 && fwd<=r && Math.abs(vx*(-dy)+vy*dx)<=GRID_SIZE/2;
};

/** Highlight grid cells whose centres are inside the shape. */
function _highlightCells(ctx, testFn) {
  if (!overlayCtx) return;
  const W = overlayCtx.canvas.width, H = overlayCtx.canvas.height;
  // Save/restore fill is handled by caller
  for (let x=0; x<W; x+=GRID_SIZE)
    for (let y=0; y<H; y+=GRID_SIZE)
      if (testFn(x+GRID_SIZE/2, y+GRID_SIZE/2))
        ctx.fillRect(x+2, y+2, GRID_SIZE-4, GRID_SIZE-4);
}

function _drawShape(ctx, shape, preview) {
  if (!shape.origin) return;
  const { tool, origin:{x:ox,y:oy}, dir, rangeFt } = shape;
  const rPx = rangeFt * PX_PER_FT;

  ctx.save();
  if (preview) { ctx.setLineDash([5,4]); ctx.globalAlpha = 0.75; }
  ctx.strokeStyle = preview ? 'rgba(230,100,50,.9)' : 'rgba(220,50,50,.95)';
  ctx.lineWidth   = preview ? 1.5 : 2.5;

  if (tool === 'circle') {
    ctx.fillStyle = preview ? 'rgba(220,50,50,.10)' : 'rgba(220,50,50,.18)';
    ctx.beginPath(); ctx.arc(ox, oy, rPx, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = preview ? 'rgba(220,50,50,.18)' : 'rgba(220,50,50,.28)';
    _highlightCells(ctx, (px,py)=>_inCircle(px,py,ox,oy,rPx));

  } else if (dir) {
    const perp = {x:-dir.y, y:dir.x};
    const ex   = ox+dir.x*rPx, ey = oy+dir.y*rPx;

    ctx.fillStyle = preview ? 'rgba(220,50,50,.10)' : 'rgba(220,50,50,.18)';
    if (tool === 'cone') {
      const hw = rPx*0.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ex+perp.x*hw, ey+perp.y*hw);
      ctx.lineTo(ex-perp.x*hw, ey-perp.y*hw);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = preview ? 'rgba(220,50,50,.18)' : 'rgba(220,50,50,.28)';
      _highlightCells(ctx, (px,py)=>_inCone(px,py,ox,oy,dir.x,dir.y,rPx));
    } else { // line
      const hw = GRID_SIZE/2;
      ctx.beginPath();
      ctx.moveTo(ox+perp.x*hw, oy+perp.y*hw);
      ctx.lineTo(ex+perp.x*hw, ey+perp.y*hw);
      ctx.lineTo(ex-perp.x*hw, ey-perp.y*hw);
      ctx.lineTo(ox-perp.x*hw, oy-perp.y*hw);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = preview ? 'rgba(220,50,50,.18)' : 'rgba(220,50,50,.28)';
      _highlightCells(ctx, (px,py)=>_inLine(px,py,ox,oy,dir.x,dir.y,rPx));
    }
  }
  ctx.restore();
}

function redrawOverlay() {
  if (!overlayCtx) return;
  const {width:W, height:H} = overlayCtx.canvas;
  overlayCtx.clearRect(0, 0, W, H);

  // Committed shapes
  ms.shapes.forEach(s => _drawShape(overlayCtx, s, false));

  // Live preview (phase 1)
  if (ms.phase===1 && ms.origin && ms.mousePos && ms.tool) {
    const dir = ms.tool !== 'circle' ? _dir(ms.origin, ms.mousePos) : {x:1,y:0};
    _drawShape(overlayCtx, { tool:ms.tool, origin:ms.origin, dir, rangeFt:ms.rangeFt }, true);
  }
}

// ─────────────────────────────────────────────
// MEASURE INTERACTION
// ─────────────────────────────────────────────

/** Returns the point on the token's circular edge closest to (mx,my) in map coords. */
function _tokenEdgePoint(tokEl, mx, my) {
  const size = Number(tokEl.dataset.size)||1;
  const half = (TOKEN_PX*size)/2;
  const cx   = parseFloat(tokEl.style.left)+half;
  const cy   = parseFloat(tokEl.style.top)+half;
  const dx   = mx-cx, dy = my-cy;
  const d    = Math.sqrt(dx*dx+dy*dy)||1;
  return { x: cx+(dx/d)*half, y: cy+(dy/d)*half };
}

// Capture phase: intercepts left-clicks in measure mode BEFORE token drag starts
viewport.addEventListener('mousedown', e => {
  if (e.button !== 0 || !ms.tool) return;
  e.stopPropagation();   // prevent token drag from starting

  const rect = viewport.getBoundingClientRect();
  const mm   = screenToMap(e.clientX-rect.left, e.clientY-rect.top);

  if (ms.phase === 0) {
    // Phase 0→1: set origin (from token edge or map point)
    const tokEl   = e.target.closest('.token');
    ms.origin     = tokEl ? _tokenEdgePoint(tokEl, mm.x, mm.y) : { x:mm.x, y:mm.y };
    ms.phase      = 1;
    viewport.classList.add('measure-phase-1');
  } else {
    // Phase 1→0: commit shape
    const dir = ms.tool !== 'circle' ? _dir(ms.origin, mm) : { x:1, y:0 };
    ms.shapes.push({ tool:ms.tool, origin:{...ms.origin}, dir, rangeFt:ms.rangeFt });
    ms.phase = 0; ms.origin = null;
    viewport.classList.remove('measure-phase-1');
    redrawOverlay();
  }
}, true /* capture */);

// Preview update on mouse move
viewport.addEventListener('mousemove', e => {
  if (!ms.tool || ms.phase !== 1) return;
  const rect = viewport.getBoundingClientRect();
  ms.mousePos = screenToMap(e.clientX-rect.left, e.clientY-rect.top);
  redrawOverlay();
});

// Escape to cancel current phase
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ms.phase === 1) {
    ms.phase = 0; ms.origin = null;
    viewport.classList.remove('measure-phase-1');
    redrawOverlay();
  }
});

// ─────────────────────────────────────────────
// HUD MEASURE CONTROLS
// ─────────────────────────────────────────────

function _setMeasureTool(tool) {
  ms.tool   = ms.tool === tool ? null : tool;  // toggle off if same
  ms.phase  = 0; ms.origin = null;
  viewport.classList.toggle('measure-mode', !!ms.tool);
  viewport.classList.remove('measure-phase-1');
  ['btnMeasureLine','btnMeasureCone','btnMeasureCircle'].forEach(id => {
    $(id)?.classList.remove('active');
  });
  if (ms.tool === 'line')   $('btnMeasureLine')?.classList.add('active');
  if (ms.tool === 'cone')   $('btnMeasureCone')?.classList.add('active');
  if (ms.tool === 'circle') $('btnMeasureCircle')?.classList.add('active');
  $('measureRangePanel')?.classList.toggle('hidden', !ms.tool);
  redrawOverlay();
}

$('btnMeasureLine')?.addEventListener('click',   () => _setMeasureTool('line'));
$('btnMeasureCone')?.addEventListener('click',   () => _setMeasureTool('cone'));
$('btnMeasureCircle')?.addEventListener('click', () => _setMeasureTool('circle'));

$('btnMeasureClear')?.addEventListener('click', () => {
  ms.shapes = []; ms.phase = 0; ms.origin = null;
  viewport.classList.remove('measure-phase-1');
  redrawOverlay();
});

const _rangeInput = $('measureRange');
_rangeInput?.addEventListener('change', () => {
  let v = Math.round((parseInt(_rangeInput.value)||5) / 5) * 5;
  v = Math.max(5, v);
  ms.rangeFt = v;
  _rangeInput.value = v;
  redrawOverlay();
});
