/**
 * mosaic-detail.js — Volet de détail du bâtiment sélectionné.
 *
 * Nommé d'après son origine (volet gauche docké de la vue mosaïque), mais
 * désormais commun aux deux vues : rassemble les informations du bâtiment
 * sélectionné et ses photographies (empilées, puis réparties en rangées quand
 * le volet est élargi), en carte comme en mosaïque.
 */

/* ⚙️ RÉGLAGES — largeur du volet détail (gauche) de la mosaïque, en pixels. */
const MD_MIN = 400, MD_MAX = 900;   // défaut = min ; la tirette n'élargit que
const PANEL_STEP = 40;              // pas de redimensionnement au clavier

/* ⚙️ RÉGLAGES — mosaïque justifiée des photos. La hauteur de rangée visée croît
   avec la largeur du conteneur : plus le volet est large, plus les rangées sont
   hautes (donc moins de photos, mais plus grandes, par rangée). */
const ROW_H_MIN = 240, ROW_H_MAX = 400;   // hauteur de rangée visée, en px…
const ROW_W_MIN = 400, ROW_W_MAX = 900;   // …interpolée entre ces largeurs de conteneur
const DEFAULT_RATIO = 3 / 4;               // ratio portrait, dominant dans le fonds

// Photos du bâtiment courant (non filtrées) et filtre du multiselect
// « élément architectural », qui restreint la galerie à ces termes. Repris du
// carrousel disparu ; fonctionne comme lui indépendamment des filtres globaux.
let mdPhotos      = [];
let mdPhotoFilter = new Set();
let mdBatId       = null;   // pour ignorer une réponse de loadPhotoRatios() obsolète

/* ─── OUVERTURE / FERMETURE ─────────────────────────────────────────────── */

async function openMosaicDetail(id_bat) {
  const panel = document.getElementById('mosaic-detail');
  if (!panel) return;

  panel.hidden = false;
  document.getElementById('app')?.classList.add('has-detail');

  const info   = document.getElementById('md-info');
  const photos = document.getElementById('md-photos');
  const header = document.getElementById('md-photos-header');
  if (info)   info.innerHTML = '<p class="md-loading">Chargement…</p>';
  if (photos) photos.innerHTML = '';
  if (header) header.hidden = true;
  closeMdElementMenu();
  mdPhotoFilter.clear();   // nouvelle sélection : on repart d'une galerie non filtrée

  let data;
  try {
    data = await getBatiment(id_bat);
  } catch {
    if (info) info.innerHTML = '<p class="md-loading">Erreur de chargement.</p>';
    return;
  }
  // Une autre sélection a pu aboutir entre-temps.
  if (String(selectedId) !== String(id_bat)) return;

  renderMosaicInfo(data);
  renderMosaicPhotos(data);
  panel.scrollTop = 0;
}

function closeMosaicDetail() {
  const panel = document.getElementById('mosaic-detail');
  if (panel) panel.hidden = true;
  document.getElementById('app')?.classList.remove('has-detail');
  teardownMosaicLayout();
  closeMdElementMenu();
  mdPhotos = [];
  mdPhotoFilter.clear();
}

/* ─── RENDU DES INFOS ───────────────────────────────────────────────────── */

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
  if (addrText) {
    const p = document.createElement('p');
    p.className   = 'md-address';
    p.textContent = addrText;
    host.appendChild(p);
  }

  const cells = [
    ['Ensemble',             data.ensemble],
    ['Date de construction', data.dateConstruction],
    ['Periode', data.periode],
    ['Arrondissement',       data.arrondissement ? ordinalArr(Number(data.arrondissement)) : null]
  ].filter(([, value]) => value);

  if (cells.length) {
    const grid = document.createElement('div');
    grid.className = 'info-meta-grid';
    grid.innerHTML = cells.map(([label, value]) => `
      <div class="info-meta-cell">
        <span class="info-meta-label">${label}</span>
        <span class="info-meta-value">${value}</span>
      </div>`).join('');
    host.appendChild(grid);
  }

  renderMosaicPersonnes(host, data);
  renderMosaicElements(host, data.terme_jantzen_bat || []);
}

function renderMosaicPersonnes(host, data) {
  const personnes = Array.isArray(data.personnes) ? data.personnes : [];
  if (personnes.length === 0) return;

  const label = document.createElement('span');
  label.className   = 'info-elements-label';
  label.textContent = 'Personnes';
  host.appendChild(label);

  const list = document.createElement('div');
  list.className = 'info-personnes';
  host.appendChild(list);

  // buildPersonCard (ui.js) est réutilisé tel quel : vignette + nom + rôle +
  // liens vers les référentiels.
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

function renderMosaicElements(host, terms) {
  if (terms.length === 0) return;

  const label = document.createElement('span');
  label.className   = 'info-elements-label';
  label.textContent = 'Éléments architecturaux (Index Jantzen)';
  host.appendChild(label);

  const tags = document.createElement('div');
  tags.className = 'info-elements';
  terms.forEach(term => {
    const tag = document.createElement('button');
    tag.type        = 'button';
    tag.className   = 'info-element-tag';
    tag.textContent = capitalize(term);
    tag.dataset.term = term;
    // Lié fonctionnellement au multiselect de la galerie ci-dessous : un clic
    // filtre les photos par ce terme (bascule, comme dans le multiselect).
    tag.onclick = () => toggleMdElementTerm(term);
    tags.appendChild(tag);
  });
  host.appendChild(tags);
}

/* ─── RENDU DES PHOTOS ──────────────────────────────────────────────────── */

// État du layout courant, pour que le ResizeObserver puisse recalculer sans
// tout reconstruire, et qu'on puisse tout démonter à la fermeture du volet.
let mosaicRO       = null;   // ResizeObserver du conteneur des photos
let mosaicRelayout = null;   // fonction de recalcul courante (ou null)
let mosaicRafId    = 0;      // throttle rAF des rafales de redimensionnement

async function renderMosaicPhotos(data) {
  const header = document.getElementById('md-photos-header');
  const label  = document.getElementById('md-photos-label');

  mdPhotos = Array.isArray(data.photos) ? data.photos : [];
  mdBatId  = data.id_bat;

  if (header) header.hidden = mdPhotos.length === 0;
  if (label)  label.textContent = `Photos du ${data.libelle || 'bâtiment'}`;

  buildMdElementSelect();   // options du multiselect, à partir des termes des photos
  await renderMdGallery();
}

/** (Re)construit la galerie à partir de `visibleMdPhotos()` — appelé au premier
 *  rendu et à chaque bascule du filtre, sans re-solliciter getBatiment(). */
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

  // Liste normalisée pour la visionneuse : même ordre que la galerie. Chaque
  // entrée porte aussi son ratio (largeur/hauteur), complété plus bas.
  const gallery = photos.map(ph => ({
    src:     photoUrl(ph.id_pic),
    caption: (ph.IndexJantzen || []).map(capitalize).join(' · '),
    id_pic:  ph.id_pic,
    ratio:   DEFAULT_RATIO
  }));

  // Les tuiles sont créées une seule fois ; le layout ne fait ensuite que régler
  // leur largeur/hauteur. On garde l'ordre gauche→droite (= ordre visionneuse).
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
    img.src      = g.src;
    img.onerror  = function () { retryUppercaseJpg(this); };
    // Filet de sécurité : si un ratio manquait dans photos.json, on le corrige
    // dès que l'image réelle est chargée, puis on relance le layout.
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

  // Ratios connus d'avance (photos.json) → première disposition sans attendre
  // le chargement des images. Puis on observe la largeur du conteneur.
  const ratios = await loadPhotoRatios();
  if (String(selectedId) !== String(mdBatId)) return;   // sélection changée
  gallery.forEach(g => {
    const r = ratios.get(photoRatioKey(g.id_pic));
    if (r) g.ratio = r;
  });

  mosaicRelayout();

  // Redimensionnement du volet : ResizeObserver est déjà cadencé par frame (spec),
  // et poser la taille des tuiles n'altère pas la largeur du conteneur (pas de
  // boucle). On relaie donc DIRECTEMENT, pour toujours lire la largeur courante —
  // un throttle rAF risquerait d'abandonner l'appel de la largeur finale.
  mosaicRO = new ResizeObserver(() => mosaicRelayout?.());
  mosaicRO.observe(host);
}

/* ─── MULTISELECT « ÉLÉMENT ARCHITECTURAL » ──────────────────────────────
 * Filtre la galerie du bâtiment courant par les termes de `photo.IndexJantzen`,
 * indépendamment des filtres globaux (carte/mosaïque). Repris du carrousel
 * disparu ; fonctionnellement lié aux puces « Éléments architecturaux »
 * (résumé des termes) du bloc infos ci-dessus : les deux pilotent le même
 * `mdPhotoFilter`. */

function visibleMdPhotos() {
  if (mdPhotoFilter.size === 0) return mdPhotos;
  return mdPhotos.filter(ph => (ph.IndexJantzen || []).some(t => mdPhotoFilter.has(t)));
}

/** Termes présents dans les photos du bâtiment courant, avec leur nombre de vues. */
function mdElementCounts() {
  const counts = new Map();
  mdPhotos.forEach(ph => {
    (ph.IndexJantzen || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
}

function buildMdElementSelect() {
  const menu  = document.getElementById('md-elem-select-menu');
  const field = document.querySelector('#md-elem-select .ms-field');
  if (!menu || !field) return;

  const entries = mdElementCounts();
  menu.innerHTML = '';

  entries.forEach(([term, count]) => {
    const li = document.createElement('li');
    li.className = 'ms-option';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.term = term;
    li.innerHTML = `
      <span class="ms-check" aria-hidden="true"></span>
      <span class="ms-option-label">${capitalize(term)}</span>
      <span class="ms-option-count">${count}</span>`;
    li.onclick = () => toggleMdElementTerm(term);
    menu.appendChild(li);
  });

  field.disabled = entries.length === 0;
  updateMdElementSelectUI();
}

function toggleMdElementTerm(term) {
  if (mdPhotoFilter.has(term)) mdPhotoFilter.clear();
  else {
    mdPhotoFilter.clear();
    mdPhotoFilter.add(term);
  }
  updateMdElementSelectUI();
  renderMdGallery();
}

function clearMdElementFilter() {
  mdPhotoFilter.clear();
  updateMdElementSelectUI();
  renderMdGallery();
}

/** Synchronise l'état visuel du multiselect ET des puces « Éléments
 *  architecturaux » : les deux représentations du même filtre restent en phase. */
function updateMdElementSelectUI() {
  const badge = document.querySelector('#md-elem-select .ms-badge');
  if (badge) badge.hidden = mdPhotoFilter.size === 0;

  document.querySelectorAll('#md-elem-select-menu .ms-option').forEach(li => {
    const on = mdPhotoFilter.has(li.dataset.term);
    li.classList.toggle('is-selected', on);
    li.setAttribute('aria-selected', String(on));
  });

  document.querySelectorAll('#md-info .info-element-tag').forEach(tag => {
    const active = mdPhotoFilter.has(tag.dataset.term);
    tag.classList.toggle('is-active', active);
  });
}

function toggleMdElementMenu() {
  const menu  = document.getElementById('md-elem-select-menu');
  const field = document.querySelector('#md-elem-select .ms-field');
  if (!menu || !field) return;
  const open = menu.hidden;
  menu.hidden = !open;
  field.setAttribute('aria-expanded', String(open));
  document.getElementById('md-elem-select')?.classList.toggle('is-open', open);
}

function closeMdElementMenu() {
  const menu  = document.getElementById('md-elem-select-menu');
  const field = document.querySelector('#md-elem-select .ms-field');
  if (menu) menu.hidden = true;
  if (field) field.setAttribute('aria-expanded', 'false');
  document.getElementById('md-elem-select')?.classList.remove('is-open');
}

/** Coalesce les rafales de chargement d'images en un seul relayout par frame.
 *  (Sûr ici : chaque `load` a déjà committé son ratio avant d'appeler.) */
function scheduleMosaicRelayout() {
  if (mosaicRafId) return;
  mosaicRafId = requestAnimationFrame(() => {
    mosaicRafId = 0;
    mosaicRelayout?.();
  });
}

/* ─── MOSAÏQUE JUSTIFIÉE ─────────────────────────────────────────────────── */

/** Hauteur de rangée visée, croissant linéairement avec la largeur `W` du
 *  conteneur, bornée à [ROW_H_MIN, ROW_H_MAX]. */
function targetRowHeight(W) {
  const t = (W - ROW_W_MIN) / (ROW_W_MAX - ROW_W_MIN);
  const clamped = Math.max(0, Math.min(1, t));
  return ROW_H_MIN + clamped * (ROW_H_MAX - ROW_H_MIN);
}

/**
 * Dispose les tuiles en rangées justifiées :
 *   • on remplit une rangée à la hauteur cible jusqu'à ce qu'elle déborde ;
 *   • on résout alors la hauteur réelle pour que la rangée occupe pile `W` ;
 *   • la dernière rangée (incomplète) reste à la hauteur cible, sauf si elle
 *     déborderait — auquel cas elle est justifiée elle aussi.
 * La largeur d'une tuile à la hauteur `h` vaut `h × ratio`.
 */
function layoutJustified(host, tiles, gallery) {
  const W = host.clientWidth;
  if (W <= 0) return;
  const gap    = parseFloat(getComputedStyle(host).columnGap) || 0;
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

/** Démonte l'observateur et oublie le layout courant (fermeture / re-rendu). */
function teardownMosaicLayout() {
  if (mosaicRO) { mosaicRO.disconnect(); mosaicRO = null; }
  if (mosaicRafId) { cancelAnimationFrame(mosaicRafId); mosaicRafId = 0; }
  mosaicRelayout = null;
}

/* ─── REDIMENSIONNEMENT (tirette) ───────────────────────────────────────── */

/**
 * Rend une poignée `role="separator"` fonctionnelle :
 *   • glissement au pointeur — largeur en continu, bornée [min, max] ;
 *   • flèches / Origine / Fin au clavier — pas discrets, pour l'accessibilité.
 *
 * @param {{cssVar, min, max, step, invert}} opts  invert : la poignée est sur
 *        le bord gauche du volet (glisser vers la gauche élargit).
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

    // Écoute sur window : le pointeur quitte forcément la fine poignée pendant
    // le glissement, les mouvements doivent continuer d'arriver.
    const onMove = ev => {
      const dx = ev.clientX - startX;
      setW(startW + (invert ? -dx : dx));
    };
    const onUp = () => {
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

  const field = document.querySelector('#md-elem-select .ms-field');
  field?.addEventListener('click', e => {
    // La pastille de comptage sert de bouton « tout désélectionner ».
    if (e.target.closest('.ms-badge-clear')) {
      e.stopPropagation();
      clearMdElementFilter();
      return;
    }
    toggleMdElementMenu();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#md-elem-select')) closeMdElementMenu();
  });
}
