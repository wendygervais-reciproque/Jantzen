# Polices

`src/css/main.css` déclare trois `@font-face` qui attendent les fichiers `.woff`
suivants **dans ce dossier** :

| Fichier attendu                    | Famille CSS   | Graisse |
|------------------------------------|---------------|---------|
| `WalbaumBook-Regular.woff`         | `WalbaumBook` | 400     |
| `UniversCom-47LightCond.woff`      | `UniversCom`  | 300     |
| `UniversCom-67BoldCond.woff`       | `UniversCom`  | 700     |

Ces fichiers ne sont pas fournis dans le dépôt (polices sous licence).
Tant qu'ils sont absents, le navigateur retombe silencieusement sur les
polices de secours définies dans `tokens.css` (`Helvetica Neue`, `Georgia`).

➡️ Déposer les `.woff` ici, sans renommer, pour activer l'identité typographique.
