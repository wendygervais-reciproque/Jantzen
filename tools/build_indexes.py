#!/usr/bin/env python3
"""
Génère les index légers consommés au démarrage par l'interface.

    python3 tools/build_indexes.py

Produit dans public/data/ :

  • batiments_index.json  id_bat -> {y: [année min, année max], n: nb de photos}
        Ni les dates ni le nombre de photographies ne figurent dans
        map_poi.geojson : sans cet index, filtrer par temporalité et
        dimensionner les points de la carte imposeraient de charger les
        1 574 fiches individuelles.

  • thesaurus_index.json  [{t: terme, c: cluster, u: URL, s: source}]
        Version allégée de thesaurus_jantzen.json (sans les définitions), pour
        construire l'arborescence des filtres. Les définitions ne sont chargées
        qu'à la première consultation d'une infobulle.

À relancer après toute régénération des fiches ou du thésaurus.
"""

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / 'public' / 'data'

YEAR_RE = re.compile(r'\b(1[0-9]{3}|20[0-9]{2})\b')


def years(value):
    """Toutes les années à 4 chiffres d'une chaîne libre ('1671-1680, 1734')."""
    return [int(y) for y in YEAR_RE.findall(str(value or ''))]


def build_batiments_index():
    index, undated = {}, 0

    for path in sorted((DATA / 'batiments').glob('*.json')):
        fiche = json.loads(path.read_text(encoding='utf-8'))
        id_bat = fiche.get('id_bat')
        if id_bat is None:
            continue

        entry = {'n': len(fiche.get('photos') or [])}

        # dateConstruction quand elle est renseignée, periode en repli.
        found = years(fiche.get('dateConstruction'))
        if not found:
            found = years(';'.join(fiche.get('periode') or []))
        if found:
            entry['y'] = [min(found), max(found)]
        else:
            undated += 1

        index[str(id_bat)] = entry

    out = DATA / 'batiments_index.json'
    out.write_text(json.dumps(index, separators=(',', ':')), encoding='utf-8')

    spans  = [e['y'] for e in index.values() if 'y' in e]
    counts = [e['n'] for e in index.values()]
    print(f'batiments_index.json  : {len(index)} bâtiments, {undated} sans date')
    print(f'                        amplitude {min(s[0] for s in spans)} – {max(s[1] for s in spans)}')
    print(f'                        photos {min(counts)} – {max(counts)} par bâtiment, '
          f'{sum(counts)} au total')
    print(f'                        {out.stat().st_size / 1024:.1f} Ko')


def build_thesaurus_index():
    source = DATA / 'thesaurus_jantzen.json'
    if not source.exists():
        raise SystemExit(f'{source} introuvable — le fichier a-t-il bien été renommé ?')

    terms = json.loads(source.read_text(encoding='utf-8'))
    index = [
        {
            't': entry['Term_TMS'],
            'c': entry.get('cluster') or '',
            'u': entry.get('URL') or '',
            's': entry.get('source') or '',
        }
        for entry in terms
        if entry.get('Term_TMS')
    ]

    out = DATA / 'thesaurus_index.json'
    out.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    print(f'thesaurus_index.json  : {len(index)} termes, '
          f'{len({e["c"] for e in index})} clusters, '
          f'{out.stat().st_size / 1024:.1f} Ko '
          f'(source : {source.stat().st_size / 1024:.1f} Ko)')


if __name__ == '__main__':
    build_batiments_index()
    build_thesaurus_index()
