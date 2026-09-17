/**
 * lightbox.js — Visionneuse plein écran de la galerie de photographies du
 * bâtiment, dans le volet détail (mosaic-detail.js).
 */

let lightboxGallery = null;     // {photos:[{src,caption}], index} — galerie du volet détail
let lightboxTrigger  = null;    // vignette par laquelle on est entré — pour lui rendre le focus à la fermeture

/* ─── OUVERTURE / FERMETURE ─────────────────────────────────────────────── */

function isLightboxOpen() {
  const box = document.getElementById('lightbox');
  return !!box && !box.hidden;
}

/**
 * Ouvre la visionneuse sur la galerie du volet détail, avec navigation prev/next.
 * @param {{src, caption}[]} photos
 * @param {number} index
 */
function openGalleryLightbox(photos, index) {
  const box = document.getElementById('lightbox');
  if (!box || !Array.isArray(photos) || photos.length === 0) return;
  // Mémorisé avant tout changement de focus ci-dessous : la vignette cliquée/
  // activée au clavier, pour la retrouver à la fermeture (cf. closeLightbox).
  lightboxTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  lightboxGallery = { photos, index: Math.max(0, Math.min(index, photos.length - 1)) };
  box.hidden = false;
  renderLightbox();
  setBackgroundInert(true);
  document.getElementById('lightbox-close')?.focus();
}

function closeLightbox() {
  const box = document.getElementById('lightbox');
  if (box) box.hidden = true;
  lightboxGallery = null;
  setBackgroundInert(false);
  // Rend le focus à la vignette d'origine — sauf si le volet détail a entre-
  // temps changé de bâtiment/photos sous elle (filtre, sélection…), auquel
  // cas elle n'est plus dans le DOM et il n'y a rien de pertinent à restaurer.
  if (lightboxTrigger && document.body.contains(lightboxTrigger)) lightboxTrigger.focus();
  lightboxTrigger = null;
}

/* ─── NAVIGATION ────────────────────────────────────────────────────────── */

function stepPhoto(delta) {
  if (!lightboxGallery) return;   // visionneuse fermée : pas de navigation
  const n = lightboxGallery.photos.length;
  lightboxGallery.index = Math.max(0, Math.min(lightboxGallery.index + delta, n - 1));
  renderLightbox();
}

/* ─── RENDU ──────────────────────────────────────────────────────────────── */
function renderLightbox() {
  const img     = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  const prev    = document.getElementById('lightbox-prev');
  const next    = document.getElementById('lightbox-next');
  if (!img) return;

  if (!lightboxGallery) return;

  const { photos, index } = lightboxGallery;
  const item = photos[index];
  img.src = item.src;
  img.onerror = function () { retryUppercaseJpg(this); };
  if (caption) renderLightboxCaption(caption, item, index, photos.length);

  if (photos.length > 1) {
    // Réaffiche les flèches si elles avaient été cachées au préalable
    if (prev) {
      prev.style.display = ''; 
      prev.disabled = index <= 0;
    }
    if (next) {
      next.style.display = ''; 
      next.disabled = index >= photos.length - 1;
    }
  } else {
    // Masque les flèches pour une galerie d'une seule photo
    if (prev) prev.style.display = 'none';
    if (next) next.style.display = 'none';
  }
}

/**
 * Remplit la légende : compteur, termes du thésaurus (un bouton par terme —
 * pas un lien, puisqu'il n'ouvre pas une ressource mais active le filtre
 * correspondant, cf. buildPersonFilterButton dans ui.js), date et crédit.
 */
function renderLightboxCaption(caption, item, index, total) {
  caption.textContent = '';
  caption.append(`${index + 1} / ${total}`);

  const terms = Array.isArray(item.terms) ? item.terms : [];
  if (terms.length > 0) {
    caption.append(' — ');
    terms.forEach((term, i) => {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'lightbox-term-link';
      btn.textContent = capitalize(term);
      btn.setAttribute('aria-label', `Filtrer les bâtiments avec le terme « ${capitalize(term)} »`);
      btn.onclick = () => filterByThesaurusTermFromLightbox(term);
      caption.appendChild(btn);
      if (i < terms.length - 1) caption.append(' · ');
    });
  }

  const formattedDate = item.dateCapture
    ? item.dateCapture.replace(/^(\d{4}):(\d{2}):(\d{2})$/, '$3/$2/$1')
    : '';
  if (formattedDate) caption.append(` — ${formattedDate}`);

  caption.append(' — © Eric Jantzen ');
}

/**
 * Clic sur un terme de la légende de la visionneuse : réinitialise les filtres
 * actuels et active ce terme uniquement dans le filtre thésaurus (nouvelle
 * recherche), puis referme visionneuse et fiche bâtiment pour laisser voir les
 * résultats filtrés — dans la vue courante (carte ou mosaïque), inchangée.
 */
function filterByThesaurusTermFromLightbox(term) {
  if (!term || typeof activeFilters === 'undefined') return;

  // Réinitialiser tous les filtres (nouvelle recherche de zéro)
  activeFilters.arrondissements.clear();
  activeFilters.thesaurus.clear();
  activeFilters.architectes.clear();
  activeFilters.periodes.clear();

  // Nettoyer les styles des puces
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.remove('active');
    c.setAttribute('aria-pressed', 'false');
  });

  // Ajouter le nouveau terme
  activeFilters.thesaurus.add(term);

  // Fermer et appliquer
  closeLightbox();
  if (typeof deselectBatiment === 'function') deselectBatiment();
  if (typeof applyFilters === 'function') applyFilters();
}