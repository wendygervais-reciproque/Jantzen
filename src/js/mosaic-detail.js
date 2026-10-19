/** mosaic-detail.js — Volet de détail du bâtiment sélectionné. */

const MD_MIN = 400, MD_MAX = 900;
const PANEL_STEP = 40;


const ROW_H_MIN = 240, ROW_H_MAX = 400;   // hauteur de rangée visée, en px
const ROW_W_MIN = 400, ROW_W_MAX = 900;   // interpolée entre ces largeurs de conteneur
const DEFAULT_RATIO = 3 / 4;               // ratio portrait (le plus fréquent)

let mdPhotos      = [];
let mdPhotoFilter = new Set();
let mdBatId       = null;   

/* ─── OUVERTURE / FERMETURE ─────────────────────────────────────────────── */

function isMobileLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

/**
 * @param {number|string} id_bat
 * @param {{moveFocus?: boolean}} [opts]
 */
async function openMosaicDetail(id_bat, opts = {}) {
  const { moveFocus = false } = opts;
  const panel = document.getElementById('mosaic-detail');
  if (!panel) return;

  panel.classList.remove('is-closing');
  panel.hidden = false;
  document.getElementById('app')?.classList.add('has-detail');

  if (isMobileLayout()) {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (typeof setAppSiblingsInert === 'function') setAppSiblingsInert(panel, true);
    panel.classList.add('is-opening');
    panel.addEventListener('animationend', () => panel.classList.remove('is-opening'), { once: true });
  }
  if (moveFocus) document.getElementById('mosaic-detail-close')?.focus();

  const info   = document.getElementById('md-info');
  const photos = document.getElementById('md-photos');
  const header = document.getElementById('md-photos-header');
  if (info)   info.innerHTML = '<p class="md-loading">Chargement…</p>';
  if (photos) photos.innerHTML = '';
  if (header) header.hidden = true;
  mdPhotoFilter.clear();   // nouvelle sélection : on repart d'une galerie non filtrée
  resetMosaicScroll();

  let data;
  try {
    data = await getBatiment(id_bat);
  } catch {
    if (info) info.innerHTML = '<p class="md-loading">Erreur de chargement.</p>';
    return;
  }
  if (String(selectedId) !== String(id_bat)) return;

  renderMosaicInfo(data);
  renderMosaicPhotos(data);
  resetMosaicScroll();
}

/** Remonte le volet en haut (le défilement se fait dans #mosaic-detail-body). */
function resetMosaicScroll() {
  const body = document.getElementById('mosaic-detail-body');
  if (body) body.scrollTop = 0;
}

function closeMosaicDetail() {
  const panel = document.getElementById('mosaic-detail');
  if (panel) {
    const wasModal = panel.hasAttribute('aria-modal');
    if (wasModal) {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      if (typeof setAppSiblingsInert === 'function') setAppSiblingsInert(panel, false);
    }

    panel.classList.remove('is-opening');

    if (wasModal) {
      panel.classList.add('is-closing');
      const finish = () => { panel.classList.remove('is-closing'); panel.hidden = true; };
      panel.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 300);
    } else {
      panel.hidden = true;
    }
  }
  document.getElementById('app')?.classList.remove('has-detail');
  teardownMosaicLayout();
  mdPhotos = [];
  mdPhotoFilter.clear();
}

/* ─── RENDU DES INFOS ───────────────────────────────────────────────────── */

function dateIndicative(data) {
  const periodes = Array.isArray(data.periode) ? data.periode
                 : (data.periode ? [data.periode] : []);
  const parts = [...periodes, data.dateConstruction]
    .map(v => String(v || '').trim())
    .filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

/* ─── INFOBULLES ACCESSIBLES ─────────────────────────────────────────────
 * Motif WAI-ARIA « tooltip » : affichée au survol et au focus clavier, masquée
 * à la sortie, à la perte de focus ou à Échap (RGAA 12.9). */
let tooltipIdSeq = 0;

function attachTooltip(el, text) {
  const id = `tooltip-${++tooltipIdSeq}`;
  el.classList.add('has-tooltip');
  el.tabIndex = 0;
  el.setAttribute('aria-describedby', id);
  el.setAttribute('aria-label', el.textContent.trim());

  const bubble = document.createElement('span');
  bubble.className = 'tooltip';
  bubble.id = id;
  bubble.setAttribute('role', 'tooltip');
  bubble.textContent = text;
  el.appendChild(bubble);

  const show = () => el.classList.add('tooltip-visible');
  const hide = () => el.classList.remove('tooltip-visible');
  el.addEventListener('mouseenter', show);
  el.addEventListener('mouseleave', hide);
  el.addEventListener('focus', show);
  el.addEventListener('blur', hide);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}

const TOOLTIP_DATE_INDICATIVE =
  "Les dates peuvent correspondre à la date de début de réalisation, à des aménagements majeurs ou à des éléments particuliers et ne couvrent pas toujours l'ensemble de l'histoire du bâtiment.";

const TOOLTIP_TORNEH =
  "Index réalisé à l'aide d'outils d'intelligence artificielle dans le cadre du projet TORNE-H.";

const TOOLTIP_PERSONNES =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

function renderMosaicInfo(data) {
  const host = document.getElementById('md-info');
  if (!host) return;
  host.innerHTML = '';

  const title = document.createElement('h2');
  title.className   = 'md-title';
  title.textContent = data.libelle || 'Bâtiment sans nom';
  host.appendChild(title);

  const adresse = data.adresse;
  const addrText = (adresse && typeof adresse === 'object')
    ? (adresse.affichage || adresse.voie || '')
    : (adresse || '');

  const cells = [
    ['Ensemble',        data.ensemble],
    ['Date indicative <br> de construction', dateIndicative(data), 'date-indicative'],
    ['Arrondissement',  data.arrondissement ? ordinalArr(Number(data.arrondissement)) : null],
    ['Adresse',         addrText]
  ];

  const grid = document.createElement('div');
  grid.className = 'info-meta-grid';
  grid.innerHTML = cells.map(([label, value, key]) => `
    <div class="info-meta-cell">
      <span class="info-meta-label"${key ? ` data-tooltip-key="${key}"` : ''}>${label}</span>
      <span class="info-meta-value">${value || '-'}</span>
    </div>`).join('');
  grid.appendChild(buildPermalinkCell(data.id_bat));
  const torneh = buildTornehBlock(data.terme_torneh_bat);
  if (torneh) grid.appendChild(torneh);
  host.appendChild(grid);

  const dateLabel = grid.querySelector('[data-tooltip-key="date-indicative"]');
  if (dateLabel) attachTooltip(dateLabel, TOOLTIP_DATE_INDICATIVE);

  renderMosaicPersonnes(host, data);
}

function buildPermalinkCell(id_bat) {
  const url = `${location.origin}${location.pathname}#bat=${encodeURIComponent(id_bat)}`;

  const cell = document.createElement('div');
  cell.className = 'info-meta-cell';

  const label = document.createElement('span');
  label.className = 'info-meta-label';
  label.textContent = 'Permalien';
  cell.appendChild(label);

  const value = document.createElement('span');
  value.className = 'info-meta-value';
  cell.appendChild(value);

  const copyIconSVG = `
    <svg class="icon-copy" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>`;
  const checkIconSVG = `
    <svg class="icon-copy" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>`;

  const link = document.createElement('a');
  link.className = 'info-permalink has-tooltip';
  link.href = url;
  const urlText = document.createElement('span');
  urlText.className   = 'info-permalink-url';   // tronquée (…) sur une ligne
  urlText.textContent = url;
  link.appendChild(urlText);
  link.insertAdjacentHTML('beforeend', copyIconSVG);
  link.setAttribute('aria-label', 'Copier le permalien du bâtiment');

  const tipId = `tooltip-${++tooltipIdSeq}`;
  link.setAttribute('aria-describedby', tipId);
  const bubble = document.createElement('span');
  bubble.className = 'tooltip';
  bubble.id = tipId;
  bubble.setAttribute('role', 'status');
  bubble.textContent = 'Lien copié dans le presse-papier';
  link.appendChild(bubble);

  let hideTimer = null;
  link.addEventListener('click', async e => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(url);
      link.classList.add('copied', 'tooltip-visible');
      link.setAttribute('aria-label', 'Permalien copié !');
      const icon = link.querySelector('svg.icon-copy');
      if (icon) icon.outerHTML = checkIconSVG;

      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        link.classList.remove('copied', 'tooltip-visible');
        link.setAttribute('aria-label', 'Copier le permalien du bâtiment');
        const check = link.querySelector('svg.icon-copy');
        if (check) check.outerHTML = copyIconSVG;
      }, 1500);
    } catch (err) {
      console.error('Impossible de copier le permalien :', err);
    }
  });

  value.appendChild(link);
  return cell;
}

/** Index Torne-H du bâtiment : métadonnée informative, une rangée par typologie
 *  du thésaurus. Renvoie null s'il n'y a aucun terme. */
function buildTornehBlock(terms) {
  const clusters = termClusters(Array.isArray(terms) ? terms : []);
  if (clusters.length === 0) return null;

  const block = document.createElement('div');
  block.className = 'info-meta-block';

  const label = document.createElement('span');
  label.className   = 'info-meta-label';
  label.textContent = 'Index Torne-H';
  attachTooltip(label, TOOLTIP_TORNEH);
  block.appendChild(label);

  clusters.forEach(([cluster, clusterTerms]) => {
    const row = document.createElement('div');
    row.className = 'info-meta-cell';

    const sub = document.createElement('span');
    sub.className   = 'info-meta-sublabel';
    sub.textContent = cluster;
    row.appendChild(sub);

    const value = document.createElement('span');
    value.className   = 'info-meta-value';
    value.textContent = clusterTerms.map(capitalize).join(', ');
    row.appendChild(value);

    block.appendChild(row);
  });
  return block;
}

function renderMosaicPersonnes(host, data) {
  const personnes = Array.isArray(data.personnes) ? data.personnes : [];
  if (personnes.length === 0) return;

  const label = document.createElement('h3');
  label.className   = 'md-section-title';

  const wordPersonne = personnes.length > 1 ? 'Architectes & Artistes' : 'Architecte & Artiste';
  const labelText = document.createElement('span');
  labelText.textContent = wordPersonne;
  attachTooltip(labelText, TOOLTIP_PERSONNES);
  label.appendChild(labelText);

  host.appendChild(label);

  const list = document.createElement('div');
  list.className = 'info-personnes';
  host.appendChild(list);

  Promise.all(personnes.map(async entry => {
    try { return { entry, personne: await getPersonne(entry.personneID) }; }
    catch (err) { console.error(err); return null; }
  })).then(people => {
    if (String(selectedId) !== String(data.id_bat)) return;
    people.filter(Boolean).forEach(({ entry, personne }) => {
      list.appendChild(buildPersonCard(entry, personne));
    });
  });
}


/* ─── RENDU DES PHOTOS ──────────────────────────────────────────────────── */


let mosaicRO       = null;   // ResizeObserver du conteneur des photos
let mosaicRelayout = null;   // fonction de recalcul courante (ou null)
let mosaicRafId    = 0;      // throttle rAF des rafales de redimensionnement

async function renderMosaicPhotos(data) {
  const header  = document.getElementById('md-photos-header');
  const label   = document.getElementById('md-photos-label');
  const context = document.getElementById('md-photos-context');

  mdPhotos = Array.isArray(data.photos) ? data.photos : [];
  mdBatId  = data.id_bat;

  if (header) header.hidden = mdPhotos.length === 0;
  if (label) {
    const wordPhoto = mdPhotos.length > 1 ? 'Photographies' : 'Photographie';
    label.textContent = `${wordPhoto} d’Eric Jantzen`;
  }
  if (context) context.textContent = data.libelle || '';

  buildMdElementGroups();   // puces par catégorie, à partir des termes des photos
  await renderMdGallery();
}

/** (Re)construit la galerie à partir de `visibleMdPhotos()`, au premier rendu
 *  et à chaque bascule du filtre. */
async function renderMdGallery() {
  const host = document.getElementById('md-photos');
  if (!host) return;
  teardownMosaicLayout();
  host.innerHTML = '';

  if (mdPhotos.length === 0) return;

  const photos = visibleMdPhotos();
  if (photos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'md-loading';
    empty.textContent = 'Aucune photo pour cette sélection.';
    host.appendChild(empty);
    return;
  }

  // Liste normalisée pour la visionneuse 
  const gallery = photos.map(ph => {
    const terms = ph.IndexJantzen || [];
    return {
      src:     photoUrl(ph.id_pic),
      srcs:    photoUrls(ph.id_pic),           // candidates (formats / formes Unicode)
      terms,                                   // termes bruts, pour les liens de filtre de la visionneuse
      caption: terms.map(capitalize).join(' · '),
      id_pic:  ph.id_pic,
      dateCapture: ph.dateCapture,
      ratio:   DEFAULT_RATIO
    };
  });

  const tiles = gallery.map((g, i) => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'md-photo';
    btn.setAttribute('aria-label', g.caption
      ? `Agrandir la photographie : ${g.caption}`
      : 'Agrandir la photographie');

    const img = document.createElement('img');
    img.alt      = g.caption || '';
    img.loading  = 'lazy';
    img.decoding = 'async';
    setImageSources(img, thumbUrls(g.id_pic));
    // Corrige un ratio absent de photos.json une fois l'image chargée, puis relance le layout.
    img.addEventListener('load', () => {
      if (!img.naturalWidth || !img.naturalHeight) return;
      const r = img.naturalWidth / img.naturalHeight;
      if (Math.abs(r - g.ratio) > 0.01) { g.ratio = r; scheduleMosaicRelayout(); }
    });
    btn.appendChild(img);

    btn.onclick = () => openGalleryLightbox(gallery, i);
    host.appendChild(btn);
    return btn;
  });

  mosaicRelayout = () => layoutJustified(host, tiles, gallery);

  const ratios = await loadPhotoRatios();
  if (String(selectedId) !== String(mdBatId)) return;   // sélection changée
  gallery.forEach(g => {
    const r = ratios.get(photoRatioKey(g.id_pic));
    if (r) g.ratio = r;
  });

  mosaicRelayout();

  mosaicRO = new ResizeObserver(() => mosaicRelayout?.());
  mosaicRO.observe(host);
}

/* ─── FILTRE « ÉLÉMENTS ARCHITECTURAUX » ─────────────────────────────────  */
// Les puces de l'index Jantzen filtrent la galerie (sélection unique). L'index
// Torne-H n'est qu'une métadonnée de l'en-tête (cf. buildTornehBlock).

function visibleMdPhotos() {
  if (mdPhotoFilter.size === 0) return mdPhotos;
  return mdPhotos.filter(ph =>
    (ph.IndexJantzen || []).some(t => mdPhotoFilter.has(t)));
}

/** Regroupe des termes par catégorie du thésaurus : [[catégorie, termes[]], …],
 *  catégories et termes triés, « Non classés » en dernier. */
function termClusters(terms) {
  const groups = new Map();
  [...new Set(terms)].sort((a, b) => a.localeCompare(b, 'fr')).forEach(term => {
    const cluster = getTermMeta(term)?.c || CLUSTER_UNSORTED;
    if (!groups.has(cluster)) groups.set(cluster, []);
    groups.get(cluster).push(term);
  });
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === CLUSTER_UNSORTED) return 1;
    if (b === CLUSTER_UNSORTED) return -1;
    return a.localeCompare(b, 'fr');
  });
}

function buildMdElementGroups() {
  const host   = document.getElementById('md-elem-groups');
  const toggle = document.getElementById('md-elem-toggle');
  if (!host) return;
  host.innerHTML = '';

  const clusters = termClusters(mdPhotos.flatMap(ph => ph.IndexJantzen || []));
  clusters.forEach(([cluster, terms]) => {
    const group = document.createElement('div');
    group.className = 'archi-group';

    const label = document.createElement('span');
    label.className   = 'archi-group-label';
    label.textContent = cluster;
    group.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'archi-chips';
    terms.forEach(term => {
      const chip = document.createElement('button');
      chip.type         = 'button';
      chip.className    = 'chip';
      chip.textContent  = capitalize(term);
      chip.dataset.term = term;
      chip.setAttribute('aria-pressed', 'false');
      chip.onclick = () => toggleMdElementTerm(term);
      chips.appendChild(chip);
    });
    group.appendChild(chips);
    host.appendChild(group);
  });

  if (toggle) toggle.disabled = clusters.length === 0;

  updateMdElementUI();
}

function toggleMdElementTerm(term) {
  if (mdPhotoFilter.has(term)) mdPhotoFilter.clear();
  else {
    mdPhotoFilter.clear();
    mdPhotoFilter.add(term);
  }
  updateMdElementUI();
  renderMdGallery();
}

function clearMdElementFilter() {
  mdPhotoFilter.clear();
  updateMdElementUI();
  renderMdGallery();
}

function updateMdElementUI() {
  document.querySelectorAll('#md-elem-groups .chip').forEach(chip => {
    const active = mdPhotoFilter.has(chip.dataset.term);
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

function toggleMdElementGroups() {
  const host   = document.getElementById('md-elem-groups');
  const toggle = document.getElementById('md-elem-toggle');
  if (!host || !toggle) return;
  const open = host.hidden;
  host.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
}

function scheduleMosaicRelayout() {
  if (mosaicRafId) return;
  mosaicRafId = requestAnimationFrame(() => {
    mosaicRafId = 0;
    mosaicRelayout?.();
  });
}

/* ─── LISTE JUSTIFIÉE ─────────────────────────────────────────────────── */

/** Hauteur de rangée visée, croissant linéairement avec la largeur `W` du
 *  conteneur, bornée à [ROW_H_MIN, ROW_H_MAX]. */
function targetRowHeight(W) {
  const t = (W - ROW_W_MIN) / (ROW_W_MAX - ROW_W_MIN);
  const clamped = Math.max(0, Math.min(1, t));
  return ROW_H_MIN + clamped * (ROW_H_MAX - ROW_H_MIN);
}

function layoutJustified(host, tiles, gallery) {
  const cs = getComputedStyle(host);
  // Largeur disponible pour les tuiles : clientWidth moins le padding du conteneur.
  const W = host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  if (W <= 0) return;
  const gap    = parseFloat(cs.columnGap) || 0;
  const Hcible = targetRowHeight(W);

  let row = [], sumRatios = 0;

  const flush = isLast => {
    if (row.length === 0) return;
    const gaps = (row.length - 1) * gap;
    const natW = Hcible * sumRatios + gaps;            // largeur à la hauteur cible
    const h    = (isLast && natW <= W) ? Hcible : (W - gaps) / sumRatios;
    row.forEach(i => {
      tiles[i].style.width  = `${Math.floor(h * gallery[i].ratio)}px`;
      tiles[i].style.height = `${Math.round(h)}px`;
    });
    row = []; sumRatios = 0;
  };

  gallery.forEach((g, i) => {
    row.push(i);
    sumRatios += g.ratio;
    if (Hcible * sumRatios + (row.length - 1) * gap >= W) flush(false);
  });
  flush(true);
}

function teardownMosaicLayout() {
  if (mosaicRO) { mosaicRO.disconnect(); mosaicRO = null; }
  if (mosaicRafId) { cancelAnimationFrame(mosaicRafId); mosaicRafId = 0; }
  mosaicRelayout = null;
}

/* ─── REDIMENSIONNEMENT (tirette) ───────────────────────────────────────── */

/**
 * @param {{cssVar, min, max, step, invert}} opts  invert : la poignée est sur
 *        le bord gauche du volet (glisser vers la gauche élargit)
 */
function initPanelResize(handle, { cssVar, min, max, step, invert }) {
  if (!handle) return;
  const root = document.documentElement;

  const getW = () => parseFloat(getComputedStyle(root).getPropertyValue(cssVar)) || min;
  const setW = w => {
    w = Math.round(Math.min(max, Math.max(min, w)));
    root.style.setProperty(cssVar, `${w}px`);
    handle.setAttribute('aria-valuenow', String(w));
  };

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getW();
    try { handle.setPointerCapture(e.pointerId); } catch { /* pas de pointeur réel */ }

    handle.classList.add('is-dragging');

    // Écoute sur window : le pointeur quitte la poignée pendant le glissement
    const onMove = ev => {
      const dx = ev.clientX - startX;
      setW(startW + (invert ? -dx : dx));
    };
    const onUp = () => {
      handle.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  handle.addEventListener('keydown', e => {
    let w = getW();
    switch (e.key) {
      case 'ArrowRight': w += invert ? -step : step; break;
      case 'ArrowLeft':  w += invert ? step : -step; break;
      case 'Home':       w = min; break;
      case 'End':        w = max; break;
      default: return;
    }
    e.preventDefault();
    setW(w);
  });
}

function bindMosaicDetail() {
  document.getElementById('mosaic-detail-close')?.addEventListener('click', deselectBatiment);

  initPanelResize(document.getElementById('mosaic-detail-handle'),
    { cssVar: '--md-w', min: MD_MIN, max: MD_MAX, step: PANEL_STEP, invert: false });

  document.getElementById('md-elem-toggle')?.addEventListener('click', toggleMdElementGroups);

  initStickyPhotosHeader();
}

function initStickyPhotosHeader() {
  const root     = document.getElementById('mosaic-detail-body');
  const sentinel = document.querySelector('.md-sticky-sentinel');
  const header   = document.getElementById('md-photos-header');
  if (!root || !sentinel || !header || typeof IntersectionObserver === 'undefined') return;

  new IntersectionObserver(([entry]) => {
    const stuck = entry.intersectionRatio < 1
      && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0);
    header.classList.toggle('is-stuck', stuck);
  }, { root, threshold: [1] }).observe(sentinel);
}

/** Comparateur de bâtiments : clé de tri alphabétique, puis numéro de rue, puis libellé. */
function comparePoi(a, b) {
  const propA = a.properties || a;
  const propB = b.properties || b;

  const keyA = (propA.tri_alphab || '').trim();
  const keyB = (propB.tri_alphab || '').trim();

  const compKey = keyA.localeCompare(keyB, 'fr', { sensitivity: 'base' });
  if (compKey !== 0) return compKey;

  // Même clé (même voie) : numéro de rue
  const numA = parseInt(propA.adresse?.numero, 10) || 0;
  const numB = parseInt(propB.adresse?.numero, 10) || 0;
  
  if (numA !== numB) {
    return numA - numB;
  }

  // Dernier recours : libellé
  const libA = (propA.libelle || '').trim();
  const libB = (propB.libelle || '').trim();
  return libA.localeCompare(libB, 'fr', { sensitivity: 'base' });
}
