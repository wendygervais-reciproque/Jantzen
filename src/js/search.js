/**
 * search.js - Adapté au nouveau jeu de données (id_bat & terme_jantzen_bat)
 * Index Lunr construit depuis les features du GeoJSON.
 */

let lunrIndex = null;

function buildLunrIndex() {
  if (typeof lunr === 'undefined') {
    console.error('Lunr.js n\'est pas chargé !');
    return;
  }

  lunrIndex = lunr(function () {
    this.ref('id_bat');

    // Un seul champ, qui agrège tout le texte pertinent du document.
    this.field('all', { boost: 1 });

    ALL_FEATURES.forEach(f => {
      const p = f.properties;

      const termsText = Array.isArray(p.terme_jantzen_bat)
        ? p.terme_jantzen_bat.join(' ')
        : '';

      const adresseText = (p.adresse && typeof p.adresse === 'object')
        ? (p.adresse.affichage || p.adresse.voie || '')
        : (p.adresse || '');

      // Concatène tous les champs texte pertinents. Ajoute ici toute
      // nouvelle propriété texte du dataset sans devoir créer un champ Lunr dédié.
      const allText = [
        p.libelle,
        adresseText,
        p.ensemble,
        termsText,
        // TODO : à ajouter quand dispo dans map_poi.geojson
        // p.dateConstruction,
        // p.personnes,
        // p.periode
      ].filter(Boolean).join(' ');

      this.add({
        id_bat: String(p.id_bat),
        all: allText
      });
    });
  });
}

/**
 * Retourne un Set des id_bat correspondant à la requête.
 * @param {string} query
 * @returns {Set<string|number>}
 */
// Mots-outils français : trop fréquents/peu discriminants pour être exigés,
// et souvent absents des champs indexés tels quels (élisions, accords...).
const FRENCH_STOPWORDS = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'l', 'un', 'une',
  'et', 'à', 'au', 'aux', 'en', 'sur', 'dans', 'pour'
]);

function lunrSearch(query) {
  if (!lunrIndex) return new Set();

  try {
    const endsWithSpace = /\s$/.test(query);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const results = lunrIndex.query(q => {
      terms.forEach((term, i) => {
        const isLastTerm = i === terms.length - 1;
        const isFinished = !isLastTerm || endsWithSpace;
        const isStopword = FRENCH_STOPWORDS.has(term);

        q.term(term, {
          usePipeline: true,
          boost: isStopword ? 1 : 10,
          presence: isStopword
            ? lunr.Query.presence.OPTIONAL
            : lunr.Query.presence.REQUIRED
        });

        if (!isFinished) {
          q.term(term, {
            usePipeline: false,
            boost: 1,
            wildcard: lunr.Query.wildcard.TRAILING
          });
        }
      });
    });

    return new Set(results.map(r => {
      const numVal = Number(r.ref);
      return isNaN(numVal) ? r.ref : numVal;
    }));
  } catch (e) {
    // ... fallback inchangé
  }
}