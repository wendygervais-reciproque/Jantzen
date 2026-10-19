# Architecture Paris — Base photographique Jantzen

Site statique (HTML / CSS / JS, sans build) de consultation du fonds photographique
d'Éric Jantzen — projet de recherche **TORNE-H**.

---

## 1. Déploiement sur un serveur

Aucune compilation : on copie les fichiers tels quels sur un serveur web (Apache, Nginx…).

> ⚠️ Les chemins sont **absolus** (`/public/data`, `/src/...`) : le site doit être servi
> **à la racine d'un domaine ou sous-domaine** (ex. `https://jantzen.exemple.fr/`),
> pas dans un sous-dossier.

### Fichiers à envoyer

```
index.html
a-propos.html
src/                         # CSS, JS, polices, icônes, logos
public/data/                 # JSON + images
```


### Protection par mot de passe (optionnel)

Le fichier `.htaccess` active une authentification Basic (Apache). Adapter le chemin
`AuthUserFile` au serveur, et créer le fichier de mots de passe :

```bash
htpasswd -c /chemin/vers/.htpasswd nom_utilisateur
```

Pour une mise en ligne publique : supprimer le `.htaccess`.

### Clé API CARTO (fond de carte)

Le fond de carte CARTO nécessite une **clé API** pour un usage en production
(voir [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey/)). Si la clé est absente
ou invalide, le fond de carte risque de ne pas s'afficher.

1. Créer / récupérer une clé sur [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey/)
   (en suivant les conditions indiquées sur cette page).
2. La renseigner dans `src/js/map.js`, à la fin de l'URL des tuiles (paramètre `?key=`) :

```js
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=VOTRE_CLE', { … })
```

La clé est visible dans le code envoyé au navigateur : ne pas y mettre de clé
qui donne accès à d'autres services CARTO.

### Tester en local

Le site charge ses données via `fetch()` : il faut un serveur HTTP (pas d'ouverture en `file://`).

```bash
python3 -m http.server 8000   # puis http://localhost:8000
```

---

## 2. Remplacer les images

Toutes les images sont dans `public/data/`.

| Dossier                | Contenu                              | Format  |
|------------------------|--------------------------------------|---------|
| `photos_webp/`         | Photographies (affichage par défaut) | `.webp` |
| `photos_avif/`         | Photographies (si navigateur compatible) | `.avif` |
| `photos_jpg/`          | Originaux JPG (non utilisés par le site) | `.jpg`  |
| `thumb_personnes_jpg/` | Portraits des personnes (architectes…) | `.jpg` / `.png` |

**Règles :**

- Le nom du fichier doit correspondre **exactement** au champ `fichier` de
  `photos.json` (ex. `Abbaye-2_6_§1.jpg` → `Abbaye-2_6_§1.webp` et `Abbaye-2_6_§1.avif`).
- Fournir **les deux formats** `webp` et `avif` pour chaque photo (le site bascule de l'un à l'autre si un fichier manque).
- Portraits : le nom doit correspondre au champ `media` de la fiche personne
  (`personnes/id_archi_*.json`).

---

## 3. Mettre à jour les données (JSON)

Tous les fichiers sont dans `public/data/`. Remplacer le fichier par la nouvelle
version **en conservant le même nom et la même structure**.

Voir le dossier *Jantzen_traitement_donnee* pour le traitement des données sources.

| Fichier                     | Rôle                                                                 |
|-----------------------------|----------------------------------------------------------------------|
| `map_poi.geojson`           | Points des bâtiments sur la carte (**obligatoire**, sinon le site ne charge pas) |
| `batiments/id_bat_<id>.json`| Fiche détaillée d'un bâtiment (chargée au clic)                      |
| `personnes/id_archi_<id>.json` | Fiche détaillée d'une personne                                    |
| `photos.json`               | Liste des photos : fichier, bâtiment, termes d'index, dimensions     |
| `personnes_filtre.json`     | Liste des personnes du filtre                                        |
| `periode_filtre.json`       | Périodes du filtre chronologique                                     |
| `thesaurus_index.json`      | Termes du thésaurus (filtre + liens externes)                        |
| `thesaurus_jantzen.json`    | Thésaurus complet (définitions)                                      |
| `arrondissements.geojson`   | Contours des arrondissements                                         |

**Points d'attention :**

- Les identifiants doivent rester cohérents entre fichiers : `id_bat` (geojson ↔
  `batiments/`, `photos.json` → `batimentID`), `id_archi` (`personnes/` ↔ `personnes_filtre.json`).
- Vérifier que le JSON est valide avant envoi : `python3 -m json.tool fichier.json > /dev/null`.
- Après mise à jour, vider le cache navigateur (`Cmd/Ctrl + Shift + R`) pour voir les changements.

---

## 4. Modifier la page « À propos »

Fichier : `a-propos.html` — texte en HTML simple, organisé en 3 onglets :

| Onglet      | Bloc à modifier                         |
|-------------|-----------------------------------------|
| La base     | `<section ... id="panel-base">`         |
| Le projet   | `<section ... id="panel-projet">`       |
| Crédits     | `<section ... id="panel-credits">`      |

- Un titre de partie = `<h2>…</h2>`, un paragraphe = `<p>…</p>`.
- Les contenus encore à compléter sont marqués `<span class="page-todo">[…]</span>`
  (surlignés à l'écran) : remplacer le `<span>` entier par le texte définitif.
- Les logos des partenaires sont dans `src/assets/logos/`.

---

## 5. Modifier le titre du site

Le titre apparaît à **4 endroits** :

| Fichier         | Élément                              | Rôle                    |
|-----------------|--------------------------------------|-------------------------|
| `index.html`    | `<title>…</title>`                   | Onglet du navigateur    |
| `index.html`    | `<a … id="brand-home">…</a>`         | Titre dans l'en-tête    |
| `a-propos.html` | `<title>À propos — …</title>`        | Onglet du navigateur    |
| `a-propos.html` | `<a … id="brand-home">…</a>`         | Titre dans l'en-tête    |

Favicon : `src/assets/icons/favicon.svg` et `favicon.ico`.

---

## Annexe — Structure du code

```
index.html          # Page principale (carte, recherche, filtres)
a-propos.html       # Page À propos
src/css/tokens.css  # Couleurs, typographies, espacements
src/css/main.css    # Styles
src/js/             # data.js (chargement), map.js, filters.js, search.js, ui.js,
                    # views.js, card.js, mosaic-detail.js, lightbox.js, pages.js, app.js
```

L'ordre des `<script>` dans `index.html` compte (`data.js` en premier, `app.js` en dernier).

Dépendances chargées par CDN : Leaflet, Leaflet.markercluster, Lunr.js ; fond de carte CARTO / OpenStreetMap.
