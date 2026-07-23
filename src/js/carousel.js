/**
 * carousel.js — Carrousel « coverflow » des photographies du bâtiment sélectionné,
 * son multiselect d'éléments architecturaux et la visionneuse plein écran.
 *
 * Les photos portent leurs propres termes dans `photos[].IndexJantzen` : le
 * multiselect filtre donc les vues d'un même bâtiment, indépendamment des
 * filtres globaux de la carte.
 */

let carouselPhotos = [];        // toutes les photos du bâtiment courant
let carouselFilter = new Set(); // termes sélectionnés dans le multiselect
let carouselIndex  = 0;         // index dans la liste filtrée

const CAROUSEL_DEPTH = 2;       // nombre de vignettes visibles de chaque côté

/* ─── ÉTAT DÉRIVÉ ───────────────────────────────────────────────────────── */

function visiblePhotos() {
  if (carouselFilter.size === 0) return carouselPhotos;
  return carouselPhotos.filter(ph =>
    (ph.IndexJantzen || []).some(t => carouselFilter.has(t))
  );
}

/* ─── OUVERTURE / FERMETURE ─────────────────────────────────────────────── */

function openCarousel(data) {
  const section = document.getElementById('carousel');
  if (!section) return;

  carouselPhotos = Array.isArray(data.photos) ? data.photos : [];
  carouselFilter.clear();
  carouselIndex = 0;

  const title = document.getElementById('carousel-title');
  if (title) {
    title.textContent = carouselPhotos.length
      ? `Photos du ${data.libelle || 'bâtiment'}`
      : 'Aucune photographie disponible';
  }

  section.hidden = false;   // avant le rendu : les images se mesurent et se chargent
  buildElementSelect();
  renderCarousel();
}

function closeCarousel() {
  const section = document.getElementById('carousel');
  if (section) section.hidden = true;
  closeElementMenu();
  closeLightbox();
  carouselPhotos = [];
  carouselFilter.clear();
  carouselIndex = 0;
}

/* ─── RENDU DU COVERFLOW ────────────────────────────────────────────────── */

function renderCarousel() {
  const stage = document.getElementById('carousel-stage');
  if (!stage) return;

  const photos = visiblePhotos();
  carouselIndex = Math.max(0, Math.min(carouselIndex, photos.length - 1));

  stage.innerHTML = '';

  if (photos.length === 0) {
    stage.innerHTML = '<p class="carousel-empty">Aucune photo pour cette sélection.</p>';
  } else {
    for (let offset = -CAROUSEL_DEPTH; offset <= CAROUSEL_DEPTH; offset++) {
      stage.appendChild(buildSlide(photos, carouselIndex + offset, offset));
    }
  }

  const counter = document.getElementById('carousel-counter');
  if (counter) {
    counter.textContent = photos.length
      ? `${carouselIndex + 1} | ${photos.length}`
      : '0 | 0';
  }

  const prev = document.getElementById('carousel-prev');
  const next = document.getElementById('carousel-next');
  const full = document.getElementById('carousel-fullscreen');
  if (prev) prev.disabled = carouselIndex <= 0;
  if (next) next.disabled = carouselIndex >= photos.length - 1;
  if (full) full.disabled = photos.length === 0;

  if (isLightboxOpen()) renderLightbox();
}

function buildSlide(photos, index, offset) {
  const slide = document.createElement('div');
  slide.className = `carousel-slide depth-${Math.abs(offset)}`;

  // Emplacement vide : conserve le centrage quand on est en bord de liste.
  if (index < 0 || index >= photos.length) {
    slide.classList.add('is-empty');
    slide.setAttribute('aria-hidden', 'true');
    return slide;
  }

  const photo = photos[index];
  const src   = photoUrl(photo.id_pic);
  const terms = (photo.IndexJantzen || []).map(capitalize).join(' · ');

  if (offset === 0) {
    slide.classList.add('is-current');
    slide.setAttribute('aria-current', 'true');
  }

  // Pas de `loading="lazy"` : les vues sont construites pendant que la section
  // est encore masquée, le chargement différé ne se déclencherait jamais.
  const img = document.createElement('img');
  img.decoding = 'async';
  img.alt = terms || '';
  img.src = src;
  img.onerror = function () {
    if (retryUppercaseJpg(this)) return;
    slide.classList.add('is-broken');
    this.remove();
  };
  slide.appendChild(img);

  slide.title = terms;
  slide.onclick = () => {
    if (offset === 0) openLightbox();
    else goToPhoto(index);
  };
  return slide;
}

/* ─── NAVIGATION ────────────────────────────────────────────────────────── */

function goToPhoto(index) {
  const photos = visiblePhotos();
  if (index < 0 || index >= photos.length) return;
  carouselIndex = index;
  renderCarousel();
}

function stepPhoto(delta) {
  goToPhoto(carouselIndex + delta);
}

/* ─── MULTISELECT « ÉLÉMENT ARCHITECTURAL » ─────────────────────────────── */

/** Termes présents dans les photos du bâtiment courant, avec leur nombre de vues. */
function elementCounts() {
  const counts = new Map();
  carouselPhotos.forEach(ph => {
    (ph.IndexJantzen || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
}

function buildElementSelect() {
  const menu  = document.getElementById('elem-select-menu');
  const field = document.querySelector('#elem-select .ms-field');
  if (!menu || !field) return;

  const entries = elementCounts();
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
    li.onclick = () => toggleElementTerm(term);
    menu.appendChild(li);
  });

  field.disabled = entries.length === 0;
  updateElementSelectUI();
}

function toggleElementTerm(term) {
  if (carouselFilter.has(term)) carouselFilter.delete(term);
  else carouselFilter.add(term);
  carouselIndex = 0;
  updateElementSelectUI();
  renderCarousel();
}

function clearElementFilter() {
  carouselFilter.clear();
  carouselIndex = 0;
  updateElementSelectUI();
  renderCarousel();
}

function updateElementSelectUI() {
  const badge = document.querySelector('#elem-select .ms-badge');
  const count = document.querySelector('#elem-select .ms-badge-count');
  if (badge) badge.hidden = carouselFilter.size === 0;
  if (count) count.textContent = String(carouselFilter.size);

  document.querySelectorAll('#elem-select-menu .ms-option').forEach(li => {
    const on = carouselFilter.has(li.dataset.term);
    li.classList.toggle('is-selected', on);
    li.setAttribute('aria-selected', String(on));
  });
}

function toggleElementMenu() {
  const menu  = document.getElementById('elem-select-menu');
  const field = document.querySelector('#elem-select .ms-field');
  if (!menu || !field) return;
  const open = menu.hidden;
  menu.hidden = !open;
  field.setAttribute('aria-expanded', String(open));
  document.getElementById('elem-select')?.classList.toggle('is-open', open);
}

function closeElementMenu() {
  const menu  = document.getElementById('elem-select-menu');
  const field = document.querySelector('#elem-select .ms-field');
  if (menu) menu.hidden = true;
  if (field) field.setAttribute('aria-expanded', 'false');
  document.getElementById('elem-select')?.classList.remove('is-open');
}

/* ─── VISIONNEUSE PLEIN ÉCRAN ───────────────────────────────────────────── */

function isLightboxOpen() {
  const box = document.getElementById('lightbox');
  return !!box && !box.hidden;
}

function openLightbox() {
  const box = document.getElementById('lightbox');
  if (!box || visiblePhotos().length === 0) return;
  box.hidden = false;
  renderLightbox();
  document.getElementById('lightbox-close')?.focus();
}

function closeLightbox() {
  const box = document.getElementById('lightbox');
  if (box) box.hidden = true;
}

function renderLightbox() {
  const photos  = visiblePhotos();
  const photo   = photos[carouselIndex];
  const img     = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  const prev    = document.getElementById('lightbox-prev');
  const next    = document.getElementById('lightbox-next');
  if (!photo || !img) return;

  img.src = photoUrl(photo.id_pic);
  img.onerror = function () { retryUppercaseJpg(this); };

  if (caption) {
    const terms = (photo.IndexJantzen || []).map(capitalize).join(' · ');
    caption.textContent = `${carouselIndex + 1} / ${photos.length}${terms ? ' — ' + terms : ''}`;
  }
  if (prev) prev.disabled = carouselIndex <= 0;
  if (next) next.disabled = carouselIndex >= photos.length - 1;
}
