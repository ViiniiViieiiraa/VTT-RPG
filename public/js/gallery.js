/**
 * gallery.js — Token Template Gallery  (Etapa 7)
 * Galeria lateral direita com CRUD de templates e instanciação no mapa
 */

// ── Compartilhado com tabletop.js via window ──────────────
// window.CAMPAIGN_ID       → id da campanha
// window.activeSceneId     → getter/setter exposto pelo tabletop
// window.createTokenOnMap  → função exposta pelo tabletop

const $ = id => document.getElementById(id);

const btnGalleryToggle  = $('btnGalleryToggle');
const btnGalleryClose   = $('btnGalleryClose');
const gallerySidebar    = $('gallerySidebar');
const galleryList       = $('galleryList');
const btnNewTemplate    = $('btnNewTemplate');
const tplModalBackdrop  = $('tplModalBackdrop');
const tplModalTitle     = $('tplModalTitle');
const btnTplModalClose  = $('btnTplModalClose');
const btnTplModalCancel = $('btnTplModalCancel');
const btnTplModalSave   = $('btnTplModalSave');
const tplName           = $('tplName');
const tplCategory       = $('tplCategory');
const tplSize           = $('tplSize');
const tplSwatches       = $('tplSwatches');
const tplImageUrl       = $('tplImageUrl');
const tplImageFile      = $('tplImageFile');
const tplMaxHp          = $('tplMaxHp');

// ── State ─────────────────────────────────────────────────
let templates      = [];
let activeTab      = 'player';
let editingTplId   = null;
let selectedTplColor = '#9b5de5';

const SWATCHES = [
  '#e63946','#f4a261','#e9c46a',
  '#2a9d8f','#457b9d','#9b5de5','#ffffff','#6c757d',
];

const CAT_LABEL = { player: 'Jogadores', npc: 'NPCs', enemy: 'Inimigos' };
const CAT_COLOR = { player: '#457b9d', npc: '#2a9d8f', enemy: '#e63946' };

const SIZE_TO_GRID = { '1x1': 1, '2x2': 2, '3x3': 3 };

// ── Gallery toggle ─────────────────────────────────────────
btnGalleryToggle.addEventListener('click', () => {
  gallerySidebar.classList.toggle('open');
  btnGalleryToggle.classList.toggle('active', gallerySidebar.classList.contains('open'));
});
btnGalleryClose.addEventListener('click', () => {
  gallerySidebar.classList.remove('open');
  btnGalleryToggle.classList.remove('active');
});

// ── Tabs ──────────────────────────────────────────────────
document.querySelectorAll('.gtab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.cat;
    renderGallery();
  });
});

// ── Fetch templates ───────────────────────────────────────
async function loadTemplates() {
  try {
    const res = await fetch(`/campaigns/${window.CAMPAIGN_ID}/templates`);
    templates = await res.json();
    renderGallery();
  } catch (_) {}
}

// ── Render ────────────────────────────────────────────────
function renderGallery() {
  galleryList.innerHTML = '';

  const filtered = templates.filter(t => t.category === activeTab);
  if (filtered.length === 0) {
    const hint = document.createElement('p');
    hint.className   = 'empty-hint';
    hint.style.padding = '.75rem';
    hint.textContent = 'Nenhum template nesta categoria.';
    galleryList.appendChild(hint);
    return;
  }

  // Group enemies by size
  if (activeTab === 'enemy') {
    const bySize = {};
    filtered.forEach(t => {
      const k = t.subcategory || '1x1';
      if (!bySize[k]) bySize[k] = [];
      bySize[k].push(t);
    });
    Object.entries(bySize).sort().forEach(([size, list]) => {
      const header = document.createElement('div');
      header.className   = 'gallery-subheader';
      header.textContent = `${size} Tamanho`;
      galleryList.appendChild(header);
      list.forEach(t => galleryList.appendChild(buildTemplateCard(t)));
    });
  } else {
    filtered.forEach(t => galleryList.appendChild(buildTemplateCard(t)));
  }
}

function buildTemplateCard(tpl) {
  const card = document.createElement('div');
  card.className  = 'tpl-card';
  card.dataset.id = tpl.id;

  const sizeNum = SIZE_TO_GRID[tpl.subcategory] || 1;
  const px      = 40 * sizeNum;

  card.innerHTML = `
    <div class="tpl-avatar" style="width:${px}px;height:${px}px;--tc:${tpl.color};background:${tpl.image_url ? 'transparent' : ''}"
         ${tpl.image_url ? `style="background-image:url('${tpl.image_url}');background-size:cover;background-position:center"` : ''}>
      ${tpl.image_url
        ? `<img src="${tpl.image_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : `<span>${tpl.name.charAt(0).toUpperCase()}</span>`}
    </div>
    <div class="tpl-info">
      <span class="tpl-name">${tpl.name}</span>
      <span class="tpl-sub">${tpl.subcategory} · ${CAT_LABEL[tpl.category]}</span>
    </div>
    <div class="tpl-actions">
      <button class="tpl-btn-place"  data-id="${tpl.id}" title="Colocar no mapa">⊕</button>
      <button class="tpl-btn-sheet"  data-id="${tpl.id}" title="Editar Ficha">📋</button>
      <button class="tpl-btn-edit"   data-id="${tpl.id}" title="Editar template">✎</button>
      <button class="tpl-btn-del"    data-id="${tpl.id}" title="Excluir">✕</button>
    </div>`;

  // Place on map
  card.querySelector('.tpl-btn-place').addEventListener('click', () => placeTemplateOnMap(tpl));

  // Double-click on avatar also places
  card.querySelector('.tpl-avatar').addEventListener('dblclick', () => placeTemplateOnMap(tpl));

  // Edit sheet (opens sheet panel in "template mode")
  card.querySelector('.tpl-btn-sheet').addEventListener('click', () => openTemplateSheet(tpl));

  // Edit template metadata
  card.querySelector('.tpl-btn-edit').addEventListener('click', () => openTemplateModal(tpl));

  // Delete
  card.querySelector('.tpl-btn-del').addEventListener('click', async () => {
    if (!confirm(`Excluir template "${tpl.name}"?`)) return;
    await fetch(`/templates/${tpl.id}`, { method: 'DELETE' });
    templates = templates.filter(t => t.id !== tpl.id);
    renderGallery();
  });

  return card;
}

// ── Place template instance on map ─────────────────────────
async function placeTemplateOnMap(tpl) {
  const sceneId = window.getActiveSceneId?.();
  if (!sceneId) {
    alert('Nenhuma cena ativa. Crie ou selecione uma cena primeiro.'); return;
  }

  const sizeNum = SIZE_TO_GRID[tpl.subcategory] || 1;
  const res   = await fetch('/tokens', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign_id: window.CAMPAIGN_ID,
      scene_id:    sceneId,
      template_id: tpl.id,
      name:        tpl.name,       // server auto-suffixes "Goblin 1", "Goblin 2"…
      color:       tpl.color,
      image_url:   tpl.image_url || null,
      size:        sizeNum,
      pos_x: 0, pos_y: 0,
      // HP lives exclusively in sheet_data — server deep-clones it
    }),
  });
  const token = await res.json();

  // Ask tabletop.js to place it centered on viewport
  window.placeTokenFromGallery?.(token);
}

// ── Template modal ─────────────────────────────────────────
function openTemplateModal(tpl = null) {
  editingTplId = tpl?.id || null;
  tplModalTitle.textContent = tpl ? 'Editar Template' : 'Novo Template';
  tplName.value      = tpl?.name        || '';
  tplCategory.value  = tpl?.category    || 'npc';
  tplSize.value      = tpl?.subcategory || '1x1';
  tplImageUrl.value  = tpl?.image_url   || '';
  selectedTplColor = tpl?.color || '#9b5de5';
  document.querySelectorAll('.tpl-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === selectedTplColor);
  });
  tplModalBackdrop.classList.remove('hidden');
  tplName.focus();
}

function closeTemplateModal() {
  tplModalBackdrop.classList.add('hidden');
  editingTplId = null;
}

btnNewTemplate.addEventListener('click',    () => openTemplateModal());
btnTplModalClose.addEventListener('click',  closeTemplateModal);
btnTplModalCancel.addEventListener('click', closeTemplateModal);
tplModalBackdrop.addEventListener('click', e => { if (e.target === tplModalBackdrop) closeTemplateModal(); });

// Build swatches in modal
SWATCHES.forEach(color => {
  const s = document.createElement('button');
  s.className     = 'tpl-swatch swatch';
  s.dataset.color = color;
  s.style.background = color;
  if (color === selectedTplColor) s.classList.add('active');
  s.addEventListener('click', () => {
    document.querySelectorAll('.tpl-swatch').forEach(b => b.classList.remove('active'));
    s.classList.add('active');
    selectedTplColor = color;
  });
  tplSwatches.appendChild(s);
});

// File → base64
tplImageFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { tplImageUrl.value = ev.target.result; };
  reader.readAsDataURL(file);
  tplImageFile.value = '';
});

btnTplModalSave.addEventListener('click', async () => {
  const name = tplName.value.trim();
  if (!name) { tplName.focus(); return; }

  const payload = {
    name, category: tplCategory.value,
    subcategory: tplSize.value,
    color: selectedTplColor,
    image_url: tplImageUrl.value.trim() || null,
  };

  if (editingTplId) {
    await fetch(`/templates/${editingTplId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    templates = templates.map(t => t.id === editingTplId ? { ...t, ...payload, id: editingTplId } : t);
  } else {
    const res = await fetch(`/campaigns/${window.CAMPAIGN_ID}/templates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const newTpl = await res.json();
    templates.push(newTpl);
  }

  closeTemplateModal();
  renderGallery();
});

// ── Open sheet for a template (not an instance) ───────────
async function openTemplateSheet(tpl) {
  // Mode B: pass templateCtx so sheet.js uses correct routes
  await window.openTokenSheet?.(null, { templateId: tpl.id, name: tpl.name });
}

// ── Init ──────────────────────────────────────────────────
loadTemplates();
