/**
 * search.js - Adapté au nouveau jeu de données (id_bat & terme_jantzen_bat)
 * Index Lunr construit depuis les features du GeoJSON.
 */


let lunrIndex = null;

function extractYearsFromRangeArray(rangeArray) {
  if (!rangeArray || !Array.isArray(rangeArray)) return [];

  const years = [];
  rangeArray.forEach(range => {
    if (typeof range === 'string') {
      // Extraire les années d'une plage (ex: "1660-1759" → ["1660", "1759"])
      const rangeYears = range.split('-').filter(y => /^\d{4}$/.test(y));
      if (rangeYears.length === 2) {
        years.push(...rangeYears);
      } else {
        years.push(range); // Si ce n'est pas une plage valide, garder la valeur
      }
    }
  });
  return years;
}

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFD') // Décompose les caractères accentués (ex: "É" → "E + ´")
    .replace(/[\u0300-\u036f]/g, '') // Supprime les diacritiques
    .replace(/[^\w\s]/g, ' ') // Remplace les caractères spéciaux par un espace
    .toLowerCase()
    .trim();
}

function normalizeRangeArray(rangeArray) {
  if (!rangeArray || !Array.isArray(rangeArray)) return [];

  return rangeArray.map(range => {
    if (typeof range === 'string') {
      return range.replace(/-/g, '_'); // Remplacer les tirets par des underscores
    }
    return String(range); // Convertir en chaîne si ce n'est pas une chaîne
  });
}

function buildLunrIndex() {
  if (typeof lunr === 'undefined') {
    console.error('Lunr.js n\'est pas chargé !');
    return;
  }

  // Configuration personnalisée pour éviter de diviser les termes sur '-'
  lunr.tokenizer.separator = /[\s,;]+/;

  lunrIndex = lunr(function () {
    this.ref('id_bat');

    // Champ pour dateConstruction (recherche exacte sur l'année)
    this.field('dateConstruction', { boost: 10 });

    // Champ pour periode (recherche exacte sur la plage)
    this.field('periode', { boost: 10 });

    // Champ générique pour les autres termes (inclut libelle normalisé)
    this.field('all', { boost: 1 });

    // Champ pour libelle original (optionnel, pour une recherche exacte)
    this.field('libelle', { boost: 5 });

    ALL_FEATURES.forEach(f => {
      const p = f.properties;

      // Normaliser p.libelle
      const libelleText = p.libelle || '';
      const normalizedLibelle = normalizeText(libelleText);

      const termsText = Array.isArray(p.terme_jantzen_bat)
        ? p.terme_jantzen_bat.join(' ')
        : '';

      const adresseText = (p.adresse && typeof p.adresse === 'object')
        ? (p.adresse.affichage || p.adresse.voie || '')
        : (p.adresse || '');

      // Normaliser dateConstruction et periode
      const dateConstructionValue = Array.isArray(p.dateConstruction)
        ? p.dateConstruction[0]
        : p.dateConstruction;

      const periodeValue = Array.isArray(p.periode)
        ? p.periode[0]
        : p.periode;

      // Concaténer tous les champs pour 'all', en incluant libelle normalisé
      const allText = [
        normalizedLibelle, // Version normalisée de libelle
        normalizeText(adresseText),
        normalizeText(p.ensemble || ''),
        normalizeText(termsText),
      ].filter(Boolean).join(' ');

      this.add({
        id_bat: String(p.id_bat),
        dateConstruction: dateConstructionValue || '',
        periode: periodeValue || '',
        libelle: libelleText, // Version originale de libelle
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
    const normalizedQuery = normalizeText(query); // Normaliser la requête
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return new Set();

    // Vérifier si la requête est une plage ou une année
    const isRangeQuery = /^\d{4}-\d{4}$/.test(query);
    const isYearQuery = /^\d{4}$/.test(query);

    let results = [];

    if (isRangeQuery) {
      // Rechercher uniquement dans 'periode'
      results = lunrIndex.query(q => {
        q.term(query, {
          fields: ['periode'],
          usePipeline: true,
          presence: lunr.Query.presence.REQUIRED
        });
      });
    } else if (isYearQuery) {
      // Rechercher uniquement dans 'dateConstruction'
      results = lunrIndex.query(q => {
        q.term(query, {
          fields: ['dateConstruction'],
          usePipeline: true,
          presence: lunr.Query.presence.REQUIRED
        });
      });
    } else {
      // Recherche générique dans 'all' et 'libelle'
      results = lunrIndex.query(q => {
        terms.forEach((term, i) => {
          const isLastTerm = i === terms.length - 1;
          const isFinished = !isLastTerm || /\s$/.test(normalizedQuery);
          const isStopword = FRENCH_STOPWORDS.has(term);

          // Recherche dans 'all' et 'libelle'
          q.term(term, {
            fields: ['all', 'libelle'],
            usePipeline: true,
            boost: isStopword ? 1 : 10,
            presence: isStopword
              ? lunr.Query.presence.OPTIONAL
              : lunr.Query.presence.REQUIRED
          });

          // Ajouter des wildcards pour 'all' uniquement
          if (!isFinished) {
            q.term(term, {
              fields: ['all'],
              usePipeline: false,
              boost: 1,
              wildcard: lunr.Query.wildcard.TRAILING
            });
          }
        });
      });
    }

    return new Set(results.map(r => {
      const numVal = Number(r.ref);
      return isNaN(numVal) ? r.ref : numVal;
    }));
  } catch (e) {
    console.error('Erreur lors de la recherche :', e);
    return new Set();
  }
}