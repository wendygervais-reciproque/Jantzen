/**
 * card.js — Card (« snippet ») d'un bâtiment, PARTAGÉE entre :
 *   • la carte    — popup au survol / clic d'un POI (map.js) ;
 *   • la mosaïque — tuile de résultat (views.js).
 *
 * En deux temps, pour rester léger :
 *   1. buildBuildingCard(props)  — coque immédiate à partir des données du
 *      GeoJSON (nom, arrondissement, ensemble), avec un squelette d'image.
 *   2. enrichBuildingCard(el, data) — complète avec l'image de référence et les
 *      personnes (rôle), issues de la fiche complète getBatiment(id) chargée à
 *      la demande. getBatiment / getPersonne étant mutualisés (cache), la carte
 *      et la mosaïque partagent le même chargement.
 */

/**
 * URL de l'image de référence d'un bâtiment. Par défaut : image_ref (à défaut
 * 1re photo). Si une seule facette thésaurus est active, on préfère la
 * première photo du bâtiment porteuse de ce terme (plus parlant pour la
 * recherche en cours) ; au-delà d'une facette active, le critère devient
 * ambigu et on retombe sur l'image de référence par défaut.
 */
function buildingRefImageUrl(data) {
  const photos = Array.isArray(data?.photos) ? data.photos : [];

  if (typeof activeFilters !== 'undefined' && activeFilters.thesaurus.size === 1) {
    const [term] = activeFilters.thesaurus;
    const normTerm = normalizeText(term);
    const match = photos.find(ph => (ph.IndexJantzen || []).some(t => normalizeText(t) === normTerm));
    const url = match && photoUrl(match.id_pic);
    if (url) return url;
  }

  return photoUrl(data?.image_ref) || photoUrl(photos[0]?.id_pic) || null;
}

/**
 * Construit la coque de la card. Renvoie un <button> cliquable (le clic est
 * câblé par l'appelant, différent selon le contexte carte / mosaïque).
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

  // Termes du thésaurus (Index Jantzen) : présents dans les propriétés de la
  // feature, donc affichés d'emblée (au plus 4, le reste résumé par « … »).
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
 * de la fiche complète `data` (getBatiment). Idempotent : ne réinsère pas
 * l'image si elle est déjà là.
 */
async function enrichBuildingCard(card, data) {
  if (!card || !data) return;

  // Image de référence — insérée SOUS le badge arrondissement, squelette retiré
  // une fois chargée.
  const thumb = card.querySelector('.bldg-card-thumb');
  const src   = buildingRefImageUrl(data);
  if (thumb && src && !thumb.querySelector('img')) {
    const img = document.createElement('img');
    img.alt      = '';
    img.decoding = 'async';

    img.addEventListener('contextmenu', e => e.preventDefault());
    img.addEventListener('dragstart', e => e.preventDefault());
    
    img.onload   = () => { thumb.querySelector('.thumb-skeleton')?.remove(); };
    img.onerror  = function () { retryUppercaseJpg(this); };
    img.src      = src;
    thumb.insertBefore(img, thumb.firstChild);
  }

  // Personnes liées : « Libellé (rôle) », séparées par « · ».
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
