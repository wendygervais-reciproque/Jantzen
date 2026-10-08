/**
 * card.js — Card (« snippet ») d'un bâtiment, PARTAGÉE entre :
 *   • la carte    — popup au survol / clic d'un POI (map.js) ;
 *   • la liste — tuile de résultat (views.js).
 *
 * En deux temps, pour rester léger :
 *   1. buildBuildingCard(props)  — card à partir des données du
 *      GeoJSON (nom, arrondissement, ensemble), avec un squelette d'image.
 *   2. enrichBuildingCard(el, data) — complète avec l'image de référence et les
 *      personnes (rôle), issues de la fiche complète getBatiment(id) chargée à
 *      la demande. getBatiment / getPersonne sont mutualisés (cache) donc la carte
 *      et la liste partagent le même chargement
 */

// Échecs CONSÉCUTIFS (remis à zéro à chaque image chargée) au-delà desquels
// on considère les fichiers absents du serveur et on arrête les requêtes.
const MAX_IMAGE_FAILURES = 10;
let cardImageFailureCount = 0;
let cardImagesAborted = false;

/**
 * URL (+ id_pic) de l'image de référence d'un bâtiment. Par défaut : image_ref
 * (à défaut 1re photo). Si une seule facette thésaurus est active, on préfère
 * la première photo du bâtiment porteuse de ce terme (plus parlant pour la
 * recherche en cours) ; au-delà d'une facette active, le critère devient
 * ambigu et on retombe sur l'image de référence par défaut
 * @returns {{ idPic: string, url: string } | null}
 */
function buildingRefImageId(data) {
  const photos = Array.isArray(data?.photos) ? data.photos : [];

  if (typeof activeFilters !== 'undefined' && activeFilters.thesaurus.size === 1) {
    const [term] = activeFilters.thesaurus;
    const normTerm = normalizeText(term);
    const match = photos.find(ph =>
      [...(ph.IndexJantzen || []), ...(ph.IndexTorneh || [])].some(t => normalizeText(t) === normTerm));
    if (match?.id_pic) return match.id_pic;
  }

  return data?.image_ref || photos[0]?.id_pic || null;
}

function attachCardImage(img, idPic, onLoaded) {
  if (cardImagesAborted || !idPic) return;

  img.onload = () => {
    cardImageFailureCount = 0;
    onLoaded?.();
  };

  let triedWebp = false;

  img.onerror = function () {
    // 1er échec en avif : on retente une fois en webp (même repli que la galerie)
    if (!triedWebp && IMG_FORMAT === 'avif') {
      triedWebp = true;
      this.src = thumbUrl(idPic, 'webp');
      return;
    }

    this.onerror = null;
    this.classList.add('img-broken');
    console.warn('[card] image introuvable :', this.src);

    if (cardImagesAborted) return;

    cardImageFailureCount++;
    if (cardImageFailureCount >= MAX_IMAGE_FAILURES && !cardImagesAborted) {
      cardImagesAborted = true;
      console.error(`[card] ${cardImageFailureCount} échecs consécutifs — arrêt du chargement des images (fichiers probablement absents du serveur)`);
    }
  };

  img.src = thumbUrl(idPic);
}

/**
 * Construit la card, renvoie un <button> cliquable
 * @param {object} props  properties d'une feature GeoJSON (id_bat, libelle,
 *        ensemble, arrondissement).
 */
function buildBuildingCard(props) {
  const card = document.createElement('button');
  card.type        = 'button';
  card.className   = 'bldg-card';
  card.dataset.id  = props.id_bat;
  card.setAttribute('aria-label', props.libelle || `Bâtiment ${props.id_bat}`);

  card.addEventListener('contextmenu', e => e.preventDefault());

  const arr = Number(props.arrondissement);

  const terms = Array.isArray(props.terme_jantzen_bat) ? props.terme_jantzen_bat : [];
  const termsText = terms.slice(0, 4).map(capitalize).join(', ')
    + (terms.length > 4 ? '…' : '');

  card.innerHTML = `
    <div class="bldg-card-thumb">
      <svg class="thumb-skeleton" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="skeleton-shine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stop-color="currentColor" stop-opacity="0.08" />
            <stop offset="50%" stop-color="currentColor" stop-opacity="0.18" />
            <stop offset="100%" stop-color="currentColor" stop-opacity="0.08" />
            <animateTransform attributeName="gradientTransform" type="translate"
              from="-1 0" to="1 0" dur="1.4s" repeatCount="indefinite" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="currentColor" opacity="0.06" />
        <rect width="100" height="100" fill="url(#skeleton-shine)" />
      </svg>
      ${arr ? `<span class="bldg-card-arr">${ordinalArr(arr)} arr.</span>` : ''}
    </div>
    <div class="bldg-card-body">
      <span class="bldg-card-name">${props.libelle || 'Bâtiment sans nom'}</span>
      ${props.ensemble ? `<span class="bldg-card-meta">${props.ensemble}</span>` : ''}
      <div class="bldg-card-people" hidden></div>
      ${termsText ? `<div class="bldg-card-terms">${termsText}</div>` : ''}
    </div>`;

  return card;
}

/**
 * Complète une card avec l'image de référence et les personnes liées, à partir
 * de la fiche complète `data` (getBatiment)
 */
async function enrichBuildingCard(card, data) {
  if (!card || !data) return;

  // Image de référence insérée SOUS le badge arrondissement, squelette retiré
  // une fois chargée
  const thumb = card.querySelector('.bldg-card-thumb');
  const idPic = buildingRefImageId(data);
  if (thumb && idPic && !thumb.querySelector('img')) {
    const img = document.createElement('img');
    img.alt      = '';
    img.decoding = 'async';

    img.addEventListener('contextmenu', e => e.preventDefault());
    img.addEventListener('dragstart', e => e.preventDefault());

    attachCardImage(img, idPic, () => {
      thumb.querySelector('.thumb-skeleton')?.remove();
    });

    thumb.insertBefore(img, thumb.firstChild);
  }

  // Personnes liées
  const host = card.querySelector('.bldg-card-people');
  const entries = Array.isArray(data.personnes) ? data.personnes : [];
  if (host && entries.length) {
    const resolved = await Promise.all(entries.map(async e => {
      try { return { role: e.role, nom: (await getPersonne(e.personneID)).libelle }; }
      catch { return null; }
    }));
    const text = resolved
      .filter(Boolean)
      .map(r => r.role ? `${r.nom} (${r.role})` : r.nom)
      .join(' · ');
    if (text) { host.textContent = text; host.hidden = false; }
  }
}