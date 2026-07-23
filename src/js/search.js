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
    // ⚠️ Identifiant unique de chaque document
    this.ref('id_bat');

    // ⚠️ Champs indexés avec pondération (boost)
    this.field('libelle', { boost: 10 });
    this.field('ensemble', { boost: 3 });
    this.field('terme_jantzen_bat', { boost: 5 });

    ALL_FEATURES.forEach(f => {
      const p = f.properties;

      // Transformation du tableau de termes ["façade", "lucarne"] en chaîne de texte
      const termsText = Array.isArray(p.terme_jantzen_bat) 
        ? p.terme_jantzen_bat.join(' ') 
        : '';

      this.add({
        id_bat: String(p.id_bat), // Lunr s'attend à une chaîne de caractères
        libelle: p.libelle || '',
        ensemble: p.ensemble || '',
        terme_jantzen_bat: termsText
      });
    });
  });
}

/**
 * Retourne un Set des id_bat correspondant à la requête.
 * @param {string} query
 * @returns {Set<string|number>}
 */
function lunrSearch(query) {
  if (!lunrIndex) return new Set();

  try {
    // Recherche par préfixe (* à la fin) pour la saisie semi-automatique
    const results = lunrIndex.search(query + '*');
    
    // Convertit les ref en nombre/string selon le format de tes données
    return new Set(results.map(r => {
      const numVal = Number(r.ref);
      return isNaN(numVal) ? r.ref : numVal;
    }));
  } catch (e) {
    // Fallback si la recherche Lunr échoue (caractères spéciaux, syntaxe invalide...)
    const q = query.toLowerCase();
    return new Set(
      ALL_FEATURES
        .filter(f => {
          const p = f.properties;
          const libelle = (p.libelle || '').toLowerCase();
          const ensemble = (p.ensemble || '').toLowerCase();
          const terms = Array.isArray(p.terme_jantzen_bat) 
            ? p.terme_jantzen_bat.join(' ').toLowerCase() 
            : '';

          return libelle.includes(q) || ensemble.includes(q) || terms.includes(q);
        })
        .map(f => f.properties.id_bat)
    );
  }
}