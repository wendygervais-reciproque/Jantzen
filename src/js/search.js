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

  lunr.tokenizer.separator = /[\s,;]+/;

  // Index rapide personneID → libelle, pour éviter un .find() par bâtiment
  const archiById = new Map(
    (typeof ARCHI_TERMS !== 'undefined' ? ARCHI_TERMS : []).map(a => [Number(a.id), a.libelle])
  );

  lunrIndex = lunr(function () {
    this.pipeline.remove(lunr.stemmer);
    this.searchPipeline.remove(lunr.stemmer);

    this.ref('id_bat');
    this.field('dateConstruction', { boost: 10 });
    this.field('periode', { boost: 10 });
    this.field('all', { boost: 1 });
    this.field('libelle', { boost: 5 });
    this.field('architectes', { boost: 5 });

    ALL_FEATURES.forEach(f => {
      const p = f.properties;

      const libelleText = p.libelle || '';
      const normalizedLibelle = normalizeText(libelleText);
      const termsText = Array.isArray(p.terme_jantzen_bat)
        ? p.terme_jantzen_bat.join(' ')
        : '';
      const adresseText = (p.adresse && typeof p.adresse === 'object')
        ? (p.adresse.affichage || p.adresse.voie || '')
        : (p.adresse || '');
      const dateConstructionValue = Array.isArray(p.dateConstruction)
        ? p.dateConstruction[0]
        : p.dateConstruction;
      const periodeValue = Array.isArray(p.periode)
        ? p.periode[0]
        : p.periode;

      // Récupère le nom complet de l'architecte via personneID
      const archiName = archiById.get(Number(p.personneID)) || '';
      const normalizedArchitectes = normalizeText(archiName);

      const allText = [
        normalizedLibelle,
        normalizeText(adresseText),
        normalizeText(p.ensemble || ''),
        normalizeText(termsText),
        normalizedArchitectes,
      ].filter(Boolean).join(' ');

      this.add({
        id_bat: String(p.id_bat),
        dateConstruction: dateConstructionValue || '',
        periode: periodeValue || '',
        libelle: libelleText,
        architectes: normalizedArchitectes,
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
          const isTyping = isLastTerm && !/\s$/.test(normalizedQuery);
          const isStopword = FRENCH_STOPWORDS.has(term);

          if (isTyping) {
            // Mot en cours de frappe : wildcard des DEUX côtés → "contient"
            // n'importe où dans le mot (ex: "lou" trouve "louvre", "chalouette")
            q.term(term, {
              fields: ['all', 'libelle', 'architectes'],
              usePipeline: false,
              boost: isStopword ? 1 : 10,
              presence: isStopword
                ? lunr.Query.presence.OPTIONAL
                : lunr.Query.presence.REQUIRED,
              wildcard: lunr.Query.wildcard.LEADING | lunr.Query.wildcard.TRAILING
            });
          } else {
            // Mot fini : match exact classique
            q.term(term, {
              fields: ['all', 'libelle', 'architectes'],
              usePipeline: true,
              boost: isStopword ? 1 : 10,
              presence: isStopword
                ? lunr.Query.presence.OPTIONAL
                : lunr.Query.presence.REQUIRED
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