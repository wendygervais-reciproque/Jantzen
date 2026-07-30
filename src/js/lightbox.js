/**
 * lightbox.js — Visionneuse plein écran partagée par les deux points d'entrée
 * du volet détail (mosaic-detail.js) : la galerie de photographies du bâtiment
 * et, sans navigation, le portrait isolé d'une personne liée.
 */

let lightboxPerson  = null;     // {src, caption} — portrait isolé, sans navigation
let lightboxGallery = null;     // {photos:[{src,caption}], index} — galerie du volet détail

/* ─── OUVERTURE / FERMETURE ─────────────────────────────────────────────── */

function isLightboxOpen() {
  const box = document.getElementById('lightbox');
  return !!box && !box.hidden;
}

/**
 * Ouvre la visionneuse sur une image isolée (portrait d'une personne liée au
 * bâtiment), sans navigation puisqu'il n'y a qu'une seule image.
 */
function openPersonLightbox(src, { name, wikidataUrl }) {
  const box = document.getElementById('lightbox');
  if (!box || !src) return;
  lightboxPerson = { src, name, wikidataUrl };
  lightboxGallery = null;
  box.hidden = false;
  renderLightbox();
  document.getElementById('lightbox-close')?.focus();
}

/**
 * Ouvre la visionneuse sur la galerie du volet détail, avec navigation prev/next.
 * @param {{src, caption}[]} photos
 * @param {number} index
 */
function openGalleryLightbox(photos, index) {
  const box = document.getElementById('lightbox');
  if (!box || !Array.isArray(photos) || photos.length === 0) return;
  lightboxPerson  = null;
  lightboxGallery = { photos, index: Math.max(0, Math.min(index, photos.length - 1)) };
  box.hidden = false;
  renderLightbox();
  document.getElementById('lightbox-close')?.focus();
}

function closeLightbox() {
  const box = document.getElementById('lightbox');
  if (box) box.hidden = true;
  lightboxPerson = lightboxGallery = null;
}

/* ─── NAVIGATION ────────────────────────────────────────────────────────── */

function stepPhoto(delta) {
  if (!lightboxGallery) return;   // portrait isolé, ou visionneuse fermée : pas de navigation
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

  if (lightboxPerson) {
    img.src = lightboxPerson.src;
    img.onerror = null;

    if (prev) prev.disabled = true;
    if (next) next.disabled = true;

    if (caption) {
      caption.innerHTML = ''; // reset propre avant reconstruction
      caption.append(lightboxPerson.name || '');

      if (lightboxPerson.wikidataUrl) {
        caption.append(' © ');
        const link = document.createElement('a');
        link.href        = lightboxPerson.wikidataUrl;
        link.target      = '_blank';
        link.rel         = 'noopener noreferrer';
        link.textContent = 'Wikidata';
        link.classList.add('credit-link')
        caption.appendChild(link);
      }
    }
    return;
  }

  if (!lightboxGallery) return;

  const { photos, index } = lightboxGallery;
  const item = photos[index];
  img.src = item.src;
  img.onerror = function () { retryUppercaseJpg(this); };
  if (caption) {
    caption.textContent = `${index + 1} / ${photos.length}${item.caption ? ' — ' + item.caption : ''} © Eric Jantzen`;
  }
  if (prev) prev.disabled = index <= 0;
  if (next) next.disabled = index >= photos.length - 1;
}