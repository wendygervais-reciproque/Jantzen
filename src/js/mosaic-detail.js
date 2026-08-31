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

/* En dessous de ce seuil, la fiche bâtiment n'est plus un panneau flottant
   non modal (carte docké, redimensionnable, carte/mosaïque restent
   utilisables derrière) mais une modale plein écran — cf. main.css. */
function isMobileLayout() {
  return window.matchMedia('(max-width: 900px)').matches;
}

async function openMosaicDetail(id_bat) {
  const panel = document.getElementById('mosaic-detail');
  if (!panel) return;

  panel.classList.remove('is-closing');
  panel.hidden = false;
  document.getElementById('app')?.classList.add('has-detail');

  if (isMobileLayout()) {
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    if (typeof setAppSiblingsInert === 'function') setAppSiblingsInert(panel, true);
    document.getElementById('mosaic-detail-close')?.focus();
    // Classe retirée après coup (voir plus bas) pour pouvoir la rejouer à
    // chaque ouverture — sinon une classe déjà présente ne redéclenche pas
    // l'animation CSS.
    panel.classList.add('is-opening');
    panel.addEventListener('animationend', () => panel.classList.remove('is-opening'), { once: true });
  }

  const info   = document.getElementById('md-info');
  const photos = document.getElementById('md-photos');
  const header = document.getElementById('md-photos-header');
  if (info)   info.innerHTML = '<p class="md-loading">Chargement…</p>';
  if (photos) photos.innerHTML = '';
  if (header) header.hidden = true;
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
  if (panel) {
    // Vérifié via l'attribut plutôt que re-testé via isMobileLayout() : reste
    // cohérent même si la fenêtre a changé de largeur pendant l'ouverture —
    // on ne défait que ce que l'ouverture a effectivement posé.
    const wasModal = panel.hasAttribute('aria-modal');
    if (wasModal) {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      if (typeof setAppSiblingsInert === 'function') setAppSiblingsInert(panel, false);
    }
    // Fermé avant la fin de l'animation d'ouverture : on l'interrompt pour
    // ne pas la faire cohabiter avec celle de fermeture ci-dessous.
    panel.classList.remove('is-opening');
    // Le panneau reste affiché (display:flex, cf. [hidden]!important sinon)
    // le temps de l'animation de fermeture, en mobile uniquement — voir
    // `.is-closing` dans main.css. Repli via timeout si l'animation ne se
    // déclenche pas (prefers-reduced-motion, etc.).
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

/**
 * « Date indicative » : une seule donnée de datation, qui réunit la période
 * (tranche large du référentiel) et la fourchette de construction quand les
 * deux sont renseignées et distinctes — de la plus large à la plus précise.
 */
function dateIndicative(data) {
  const periodes = Array.isArray(data.periode) ? data.periode
                 : (data.periode ? [data.periode] : []);
  const parts = [...periodes, data.dateConstruction]
    .map(v => String(v || '').trim())
    .filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

/* ─── INFOBULLES ACCESSIBLES ─────────────────────────────────────────────
 * Motif WAI-ARIA APG « tooltip » : déclenchée au survol ET au focus clavier
 * (donc joignable au Tab), masquée à la perte de focus / sortie de survol /
 * Échap — aucune information n'est donc réservée à la souris (RGAA 12.9). */
let tooltipIdSeq = 0;

function attachTooltip(el, text) {
  const id = `tooltip-${++tooltipIdSeq}`;
  el.classList.add('has-tooltip');
  el.tabIndex = 0;
  el.setAttribute('aria-describedby', id);
  // Nom accessible figé sur le seul libellé visible : la bulle, ajoutée
  // juste après comme enfant (pour l'ancrage CSS), ne doit pas se retrouver
  // absorbée dans le nom au lieu de rester une description à part — sans
  // quoi un lecteur d'écran risque de l'annoncer deux fois.
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

  // L'adresse n'est plus un sous-titre sous le nom : c'est une donnée comme les
  // autres, alignée dans la grille à deux colonnes.
  // Les quatre lignes sont toujours rendues, un tiret tenant lieu de valeur
  // manquante : la fiche garde la même ossature d'un bâtiment à l'autre.
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
  host.appendChild(grid);

  const dateLabel = grid.querySelector('[data-tooltip-key="date-indicative"]');
  if (dateLabel) attachTooltip(dateLabel, TOOLTIP_DATE_INDICATIVE);

  renderMosaicPersonnes(host, data);
}

/**
 * Cellule « Permalien » : au clic, copie le lien dans le presse-papier plutôt
 * que de naviguer (rouvrir la même page n'a pas de sens ici), avec le style
 * « lien » (souligné, couleur --link-default) des liens personnes/référentiels
 * plutôt que le style discret des autres valeurs de cette grille (qui, elles,
 * ouvrent un vrai lien externe).
 */
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
  link.append(url);
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


/* ─── RENDU DES PHOTOS ──────────────────────────────────────────────────── */

// État du layout courant, pour que le ResizeObserver puisse recalculer sans
// tout reconstruire, et qu'on puisse tout démonter à la fermeture du volet.
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
    dateCapture: ph.dateCapture,
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

/** Termes des photos regroupés par catégorie du thésaurus, « Non classés » en
 *  dernier — même regroupement que le panneau de filtres. */
function mdElementClusters() {
  const groups = new Map();
  mdElementCounts().forEach(([term, count]) => {
    const cluster = getTermMeta(term)?.c || CLUSTER_UNSORTED;
    if (!groups.has(cluster)) groups.set(cluster, []);
    groups.get(cluster).push({ term, count });
  });
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === CLUSTER_UNSORTED) return 1;
    if (b === CLUSTER_UNSORTED) return -1;
    return a.localeCompare(b, 'fr');
  });
}

/** (Re)construit les groupes de puces sous la ligne « Éléments architecturaux ». */
function buildMdElementGroups() {
  const host   = document.getElementById('md-elem-groups');
  const toggle = document.getElementById('md-elem-toggle');
  if (!host) return;
  host.innerHTML = '';

  const clusters = mdElementClusters();
  if (toggle) toggle.disabled = clusters.length === 0;

  clusters.forEach(([cluster, entries]) => {
    const group = document.createElement('section');
    group.className = 'archi-group';

    const label = document.createElement('span');
    label.className   = 'archi-group-label';
    label.textContent = cluster;
    group.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'archi-chips';
    entries.forEach(({ term }) => {
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

/** Reflète `mdPhotoFilter` sur les puces (seul porteur de l'état de sélection). */
function updateMdElementUI() {
  document.querySelectorAll('#md-elem-groups .chip').forEach(chip => {
    const active = mdPhotoFilter.has(chip.dataset.term);
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

/** Replie / déplie les groupes de puces (ligne « Dropdown » de la maquette). */
function toggleMdElementGroups() {
  const host   = document.getElementById('md-elem-groups');
  const toggle = document.getElementById('md-elem-toggle');
  if (!host || !toggle) return;
  const open = host.hidden;
  host.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
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
  const cs = getComputedStyle(host);
  // clientWidth inclut le padding du conteneur (20 px de chaque côté depuis
  // l'ajout du padding sur #md-photos) : la largeur réellement disponible pour
  // les tuiles en flex-wrap est le clientWidth MOINS ce padding, sans quoi les
  // rangées calculées débordent de la vraie zone et le flex-wrap coupe trop tôt.
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

    // `:active` ne tient pas quand le pointeur quitte la poignée : on marque
    // l'état « Active » de la tirette pendant toute la durée du glissement.
    handle.classList.add('is-dragging');

    // Écoute sur window : le pointeur quitte forcément la poignée pendant le
    // glissement, les mouvements doivent continuer d'arriver.
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

/**
 * Détecte l'instant où #md-photos-header se colle réellement en haut du
 * volet (par opposition à sa position normale dans le flux, sous le titre,
 * ou pas encore atteinte plus bas dans une fiche pas encore scrollée) pour
 * n'afficher #md-photos-context (rappel du nom du bâtiment) que là — même
 * motif que initStickyFilterHeaders (filters.js) : une sentinelle de hauteur
 * nulle juste avant l'en-tête sort du viewport du volet exactement quand
 * celui-ci se fige. `intersectionRatio < 1` seul ne suffit pas : c'est vrai
 * aussi bien quand la sentinelle est masquée par le bord HAUT (fixé) que
 * quand elle n'est simplement pas encore atteinte, plus bas, hors du volet
 * (fiche non scrollée) — d'où la comparaison de position avec `rootBounds`.
 */
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

/**
 * Fonction de comparaison pour trier les POIs / Bâtiments.
 */
/**
 * Comparateur de bâtiments / POIs.
 * Combine la voie, l'ensemble ou le libellé en une clé textuelle unique
 * pour un tri alphabétique global cohérent.
 */
function comparePoi(a, b) {
  const propA = a.properties || a;
  const propB = b.properties || b;

  // 1. Détermination de la clé d'affichage textuelle principale pour chaque élément
  // Ordre de priorité pour la clé : voie d'adresse > ensemble > libellé
  const keyA = (propA.adresse?.voie || propA.ensemble || propA.libelle || '').trim();
  const keyB = (propB.adresse?.voie || propB.ensemble || propB.libelle || '').trim();

  // 2. Comparaison alphabétique sur la clé principale
  const compKey = keyA.localeCompare(keyB, 'fr', { sensitivity: 'base' });
  if (compKey !== 0) return compKey;

  // 3. En cas d'égalité sur la clé (ex: deux bâtiments sur la même voie "Place de l'Opéra")
  // On compare par numéro de rue si disponible
  const numA = parseInt(propA.adresse?.numero, 10) || 0;
  const numB = parseInt(propB.adresse?.numero, 10) || 0;
  
  if (numA !== numB) {
    return numA - numB;
  }

  // 4. Dernier recours en cas de seconde égalité : tri sur le libellé
  const libA = (propA.libelle || '').trim();
  const libB = (propB.libelle || '').trim();
  return libA.localeCompare(libB, 'fr', { sensitivity: 'base' });
}
