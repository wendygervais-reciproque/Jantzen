/**
 * views.js — Bascule carte ↔ mosaïque et rendu de la vue mosaïque.
 *
 * Les deux vues consomment le même jeu de features filtrées : la bascule
 * ne relance jamais les filtres, elle re-rend simplement la vue active.
 */

let currentView    = 'map';   // 'map' | 'mosaic'
let currentResults = [];      // features après filtrage

const MOSAIC_MAX = 300;       // au-delà, on invite à affiner les filtres

/* ─── AIGUILLAGE ────────────────────────────────────────────────────────── */

/**
 * Point d'entrée appelé après chaque passe de filtrage.
 * Alimente la carte (toujours, pour qu'elle soit à jour au retour) et la vue active.
 */
function renderCurrentView(features) {
  currentResults = features;
  updateResultsCount(features);
  renderMapFeatures(features);
  if (currentView === 'mosaic') renderMosaic(features);
  updateStageEmpty(features);
}

function setView(view) {
  if (view === currentView) return;

  // Chaque vue a sa propre présentation du détail : on repart d'une sélection
  // vierge pour éviter qu'un panneau d'une vue persiste dans l'autre.
  if (selectedId !== null && typeof deselectBatiment === 'function') deselectBatiment();

  currentView = view;
  document.getElementById('app')?.classList.toggle('is-mosaic', view === 'mosaic');

  const mapEl    = document.getElementById('map');
  const mosaicEl = document.getElementById('mosaic');
  if (mapEl)    mapEl.hidden    = view !== 'map';
  if (mosaicEl) mosaicEl.hidden = view !== 'mosaic';

  document.querySelectorAll('.view-btn').forEach(btn => {
    const on = btn.dataset.view === view;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  if (view === 'mosaic') {
    renderMosaic(currentResults);
  } else if (typeof map !== 'undefined' && map) {
    // Leaflet mesure mal un conteneur qui était masqué : on force le recalcul.
    map.invalidateSize();
  }
  updateStageEmpty(currentResults);
}

function updateResultsCount(features) {
  const count = document.getElementById('search-results-count');
  if (!count) return;
  count.textContent = features.length === ALL_FEATURES.length
    ? ''
    : `${features.length} résultat${features.length > 1 ? 's' : ''}`;
}

function updateStageEmpty(features) {
  const empty = document.getElementById('stage-empty');
  if (empty) empty.hidden = features.length > 0 || currentView !== 'mosaic';
}

/* ─── VUE MOSAÏQUE ──────────────────────────────────────────────────────── */

function renderMosaic(features) {
  const grid = document.getElementById('mosaic');
  if (!grid) return;
  grid.innerHTML = '';
  grid.scrollTop = 0;

  features.slice(0, MOSAIC_MAX).forEach(f => {
    grid.appendChild(buildMosaicTile(f.properties));
  });

  bindCoverScroll();
  updateVisibleCovers();

  if (features.length > MOSAIC_MAX) {
    const more = document.createElement('p');
    more.className   = 'mosaic-more';
    more.textContent = `+${features.length - MOSAIC_MAX} autres — affinez vos filtres pour les afficher`;
    grid.appendChild(more);
  }
}

function buildMosaicTile(p) {
  const tile = document.createElement('button');
  tile.type      = 'button';
  tile.className = 'mosaic-tile';
  tile.dataset.id = p.id_bat;
  tile.setAttribute('aria-label', p.libelle || `Bâtiment ${p.id_bat}`);
  if (String(selectedId) === String(p.id_bat)) tile.classList.add('is-active');

  // La vignette n'est pas connue depuis le geojson : elle arrive avec la fiche,
  // chargée seulement quand la tuile approche du champ de vision.
  tile.innerHTML = `
    <div class="mosaic-thumb"><span class="no-img">☐</span></div>
    <span class="mosaic-arr">${p.arrondissement ? ordinalArr(p.arrondissement) : ''}</span>
    <div class="mosaic-info">
      <span class="mosaic-name">${p.libelle || 'Bâtiment sans nom'}</span>
      ${p.ensemble ? `<span class="mosaic-meta">${p.ensemble}</span>` : ''}
    </div>`;

  // Choix produit : depuis la mosaïque, le clic ouvre directement le plein écran.
  tile.onclick = () => selectBatiment(p.id_bat, { fullscreen: true });
  return tile;
}

/* ─── VIGNETTES DE COUVERTURE (chargement paresseux) ────────────────────── */

const COVER_MARGIN = 600;   // px chargés de part et d'autre du champ visible

/**
 * Charge les couvertures des tuiles proches du champ de vision.
 *
 * Calcul de position explicite plutôt qu'`IntersectionObserver` : les photos
 * pèsent lourd et il faut un déclenchement fiable, y compris quand le
 * compositing est suspendu (onglet en arrière-plan, navigateur piloté), cas où
 * l'observateur — comme `loading="lazy"` — reste muet.
 */
function updateVisibleCovers() {
  const grid = document.getElementById('mosaic');
  if (!grid || grid.hidden) return;

  const top    = grid.scrollTop - COVER_MARGIN;
  const bottom = grid.scrollTop + grid.clientHeight + COVER_MARGIN;

  grid.querySelectorAll('.mosaic-tile:not([data-cover])').forEach(tile => {
    if (tile.offsetTop + tile.offsetHeight < top || tile.offsetTop > bottom) return;
    tile.dataset.cover = 'loading';
    loadCover(tile);
  });
}

let coverScrollTimer = null;

function bindCoverScroll() {
  const grid = document.getElementById('mosaic');
  if (!grid || grid.dataset.scrollBound) return;
  grid.dataset.scrollBound = '1';

  // Étranglement par minuterie plutôt que `requestAnimationFrame`, suspendu
  // lui aussi lorsque la page n'est pas composée.
  grid.addEventListener('scroll', () => {
    if (coverScrollTimer) return;
    coverScrollTimer = setTimeout(() => {
      coverScrollTimer = null;
      updateVisibleCovers();
    }, 120);
  }, { passive: true });
}

async function loadCover(tile) {
  let data;
  try {
    data = await getBatiment(tile.dataset.id);
  } catch {
    return;   // la tuile garde son placeholder
  }

  // `image_ref` de la fiche, à défaut la première photographie indexée.
  const src = photoUrl(data.image_ref) || photoUrl(data.photos?.[0]?.id_pic);
  const thumb = tile.querySelector('.mosaic-thumb');
  if (!src || !thumb) return;

  const img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.onload  = () => { thumb.innerHTML = ''; thumb.appendChild(img); };
  img.onerror = function () { retryUppercaseJpg(this); };
  img.src = src;
}
