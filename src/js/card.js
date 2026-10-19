/**
 * card.js — Card d'un bâtiment, partagée entre la carte (popup d'un POI, map.js)
 * et la liste (tuile de résultat, views.js). En deux temps :
 *   1. buildBuildingCard(props) — card depuis les données du GeoJSON, avec un
 *      squelette d'image ;
 *   2. enrichBuildingCard(el, data) — ajoute l'image de référence et les
 *      personnes, depuis la fiche complète getBatiment(id) chargée à la demande
 *      (cache mutualisé entre la carte et la liste).
 */


/**
 * Image de référence d'un bâtiment : image_ref, à défaut la 1re photo. Si une
 * seule facette thésaurus est active, on préfère la première photo porteuse de
 * ce terme.
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

/** Une image introuvable n'affecte que sa propre tuile. */
function attachCardImage(img, idPic, onLoaded, onFailed) {
  if (!idPic) return;
  img.onload = () => { onLoaded?.(); };
  setImageSources(img, thumbUrls(idPic), onFailed);
}

/**
 * Construit la card, renvoie un <button> cliquable.
 * @param {object} props  properties d'une feature GeoJSON
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

/** Complète une card avec l'image de référence et les personnes de la fiche `data`. */
async function enrichBuildingCard(card, data) {
  if (!card || !data) return;

  // Image de référence insérée sous le badge arrondissement
  const thumb = card.querySelector('.bldg-card-thumb');
  const idPic = buildingRefImageId(data);
  if (thumb && idPic && !thumb.querySelector('img')) {
    const img = document.createElement('img');
    img.alt      = '';
    img.decoding = 'async';

    img.addEventListener('contextmenu', e => e.preventDefault());
    img.addEventListener('dragstart', e => e.preventDefault());

    // Squelette retiré au chargement comme à l'échec
    const dropSkeleton = () => thumb.querySelector('.thumb-skeleton')?.remove();
    attachCardImage(img, idPic, dropSkeleton, () => { dropSkeleton(); img.remove(); });

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