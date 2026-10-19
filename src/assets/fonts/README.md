# Polices

`src/css/main.css` déclare quatre `@font-face` qui attendent les fichiers `.woff`
suivants **dans ce dossier** :

| Fichier attendu                    | Famille CSS   | Graisse | Style Figma           |
|------------------------------------|---------------|---------|-----------------------|
| `WalbaumBook-Regular.woff`         | `WalbaumBook` | 400     | Regular               |
| `UniversCom-47LightCond.woff`      | `UniversCom`  | 300     | 47 Light Condensed    |
| `UniversCom-57Condensed.woff`      | `UniversCom`  | 400     | 57 Condensed          |
| `UniversCom-67BoldCond.woff`       | `UniversCom`  | 700     | 67 Bold Condensed     |

Ces fichiers ne sont pas fournis dans le dépôt (polices sous licence).
Tant qu'ils sont absents, le navigateur retombe silencieusement sur les
polices de secours définies dans `tokens.css` (`Arial Narrow`, `Georgia`) —
condensées elles aussi, pour ne pas casser les gabarits.

➡️ Déposer les `.woff` ici, sans renommer, pour activer l'identité typographique.
