# Architecture Paris — Base photographique Jantzen

Interface de consultation cartographique et documentaire du fonds photographique
**Architecture Paris** (≈ 17 000 photographies d'immeubles parisiens réalisées
par Éric Jantzen), produite dans le cadre du projet de recherche **TORNE-H**.

Prototype front-end « vanilla » (sans build) : HTML + CSS + JavaScript, données
statiques servies en local.

## Lancer en local

Les données sont chargées via `fetch()` : il faut **servir le dossier par HTTP**
(l'ouverture directe du fichier en `file://` est bloquée par le navigateur).

Depuis la racine du projet, au choix :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

```bash
npx serve .
```

## Structure du projet

```
.
├── index.html            # Point d'entrée (charge les CSS puis les JS dans l'ordre)
├── src/
│   ├── css/
│   │   ├── tokens.css     # Design tokens (couleurs, typo, espacements) — aucune valeur en dur ailleurs
│   │   └── main.css       # Styles de l'application (consomme les tokens via var(--…))
│   ├── js/                # Un fichier = une responsabilité
│   │   ├── data.js        # Chargement des données + calcul de l'arrondissement
│   │   ├── map.js         # Carte Leaflet + clustering des marqueurs
│   │   ├── search.js      # Index et recherche plein-texte (Lunr)
│   │   ├── filters.js     # Filtres arrondissement / thésaurus
│   │   ├── ui.js          # Rendu des résultats, panneau de détail, galerie
│   │   ├── pages.js       # Pages statiques (overlay) : base, projet, crédits, CGU
│   │   └── app.js         # Orchestration : init au chargement + application des filtres
│   └── assets/
│       └── fonts/         # Polices .woff (voir le README de ce dossier)
└── public/
    └── data/             # Jeu de données servi tel quel
        ├── map_point.geojson   # Points de tous les bâtiments (source de vérité carte)
        ├── thesaurus.json      # Vocabulaire d'indexation
        ├── batiments/          # Une fiche JSON détaillée par bâtiment (imm_*.json), chargée à la demande
        └── images/             # Photographies (.jpg / .jpeg)
```

### Dépendances (via CDN, versions figées dans `index.html`)

- [Leaflet 1.9.4](https://leafletjs.com) + [Leaflet.markercluster 1.4.1](https://github.com/Leaflet/Leaflet.markercluster) — carte et regroupement
- [Lunr.js 2.3.9](https://lunrjs.com) — moteur de recherche
- Fond de carte : [CARTO](https://carto.com) / [OpenStreetMap](https://www.openstreetmap.org)

## Note sur l'ordre des scripts

Les fichiers JS partagent leur état par variables globales (`ALL_FEATURES`,
`THESAURUS`, `activeFilters`, `map`…). L'**ordre des balises `<script>`** dans
`index.html` est donc significatif : `data.js` en premier, `app.js` en dernier.

---

*Prototype de recherche — EPMO, projet TORNE-H. Non destiné à un service pérenne.*
