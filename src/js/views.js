/**
 * views.js — Bascule carte <-> liste et rendu de la vue liste.
 *
 * Les deux vues utilisent le même jeu filtré : la bascule
 * ne relance pas les filtres, elle re-rend  la vue active.
 */

let currentView    = 'map';   // 'map' | 'mosaic'
let currentResults = [];      // features après filtrage

const MOSAIC_MAX = 3065;       // max cards, au-delà, on invite à affiner les filtres

/* ─── BASCULE ────────────────────────────────────────────────────────── */

function renderCurrentView(features) {
  currentResults = features;
  updateResultsCount(features);
  renderMapFeatures(features);
  if (currentView === 'mosaic') renderMosaic(features);
  updateStageEmpty(features);
}

function setView(view) {
  if (view === currentView) return;

  if (selectedId !== null && typeof clearSelectionSurfaces === 'function') {
    clearSelectionSurfaces();
  }

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
    map.invalidateSize();
  }

  // Ré-affiche le détail du bâtiment sélectionné dans la présentation de la vue.
  if (selectedId !== null && typeof presentSelection === 'function') {
    presentSelection(selectedId);
  }

  updateStageEmpty(currentResults);
  if (typeof writeStateToHash === 'function') writeStateToHash('push');
}

function updateResultsCount(features) {
  const text = `${features.length} résultat${features.length > 1 ? 's' : ''}`;
  const count = document.getElementById('search-results-count');
  if (count) count.textContent = text;
  const footerCount = document.getElementById('filters-footer-count');
  if (footerCount) footerCount.textContent = text;
}

function updateStageEmpty(features) {
  const empty = document.getElementById('stage-empty');
  if (!empty) return;
  // Contenu vide plutôt que `hidden` : voir #stage-empty dans main.css 
  empty.innerHTML = features.length === 0
    ? 'Aucun résultat.<br>Modifiez vos critères de recherche.'
    : '';
}

/* ─── VUE LISTE ──────────────────────────────────────────────────────── */

function renderMosaic(features) {
  const grid = document.getElementById('mosaic');
  if (!grid) return;
  grid.innerHTML = '';
  grid.scrollTop = 0;

  const sortedFeatures = [...features].sort(comparePoi);

  sortedFeatures.slice(0, MOSAIC_MAX).forEach(f => {
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
  const tile = buildBuildingCard(p);
  tile.classList.add('mosaic-tile');
  if (String(selectedId) === String(p.id_bat)) tile.classList.add('is-active');
  tile.onclick = () => selectBatiment(p.id_bat);
  return tile;
}

/* ─── VIGNETTES DE COUVERTURE ────────────────────── */

const COVER_MARGIN = 600;   // px chargés de part et d'autre du champ visible

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
    return;   // la tuile garde son squelette
  }
  enrichBuildingCard(tile, data);
}
