# César & Brutus, iad et RE/MAX — import adapté, 6 octobre 2026

## Résultat dans le produit déployé

Les trois liens demandés ont été importés une fois chacun via `POST https://bienvu.online/api/imports`, après publication du correctif, dans une agence technique isolée. Toutes les réponses ont le statut métier `ready`, sans avertissement, sans photo rejetée et sans recours au navigateur.

| Source et référence | Faits vérifiés | Photos enregistrées | Début de l’essai UTC |
| --- | --- | --- | --- |
| César & Brutus · `MCL-10287-CESARETBRUTUS69` | Maison à Limonest, 1 290 000 €, 271,65 m², 7 pièces | 12 | 15:29:42 |
| iad · `2125326` | Appartement à Lyon 4e, 278 000 €, 55 m², 3 pièces | 8 | 15:30:09 |
| RE/MAX · `749351027-200` | Maison à Étaules, 340 000 €, 112 m², 4 pièces | 12 | 15:30:26 |

Les descriptions complètes sont conservées. Pour RE/MAX, le nombre de pièces est distinct des 3 chambres affichées dans le titre. Les galeries César & Brutus et RE/MAX contiennent respectivement 14 et 15 candidats : le plafond produit reste fixé à 12 photos. Les 8 photos iad sont récupérées dans leur ordre, sans se limiter aux trois couvertures affichées.

Chaque réponse est relue par sa route privée et comparée à la réponse initiale. Les 32 JPEG enregistrés sont relus, décodés avec Sharp, vérifiés par SHA-256 et dépourvus de métadonnées EXIF. Les accès sans session répondent HTTP 401. Les diagnostics D1 confirment `browserUsed: false` et zéro doublon.

## Lecture des sources

- César & Brutus : référence et en-tête Estatik, champs de surface habitable et pièces, description du bien et galerie JSON-LD liée à la même annonce. Les virgules de groupement du prix `1,290,000€` sont prises en charge uniquement pour ce format observé.
- iad : table JSON Nuxt et références d’indices bornées, fiche unique portant la référence attendue, recoupement du titre et des données JSON-LD, description et galerie complète. Les recommandations restent exclues.
- RE/MAX : JSON Next et fiche base64 UTF-8 bornée, référence/état de publication vérifiés, prix et surface recoupés avec JSON-LD/en-tête, galerie liée au même identifiant interne. Le preset public `l-view` (1300 × 800) est observé dans les bundles `_app` et `7133` de RE/MAX ; la vignette JSON-LD `ds-l` (400 px) n’est pas importable. Même fichier et filigrane conservé.

Les hôtes des fiches et des CDN sont enregistrés explicitement. Aucun joker ou nouvel hôte fourni par le contenu. Les protections SSRF, DNS/TLS, redirections, tailles, durées, formats raster et budgets restent en place. Le widget `static.proptexx.com` à l’origine du premier échec RE/MAX reste interdit ; il n’est plus nécessaire à l’import.

## Vérifications

87 tests ciblés d’import, contrats et catalogue réussissent, notamment identité/contradictions, recommandations étrangères, URL privées, références Nuxt, encodage RE/MAX, ordre/déduplication/plafond des photos, délais et budgets. TypeScript complet, frontières, compilation Next/OpenNext et dry-runs Wrangler stricts réussissent. Le catalogue est vérifié à nouveau après ajout des preuves datées ; les horodatages distinguent deux essais du même lien le même jour.

Le correctif d’import est initialement publié avec la version web `dda88de4-778f-4731-9217-344e0ea1d2c5`, le service d’import `43a791e8-2986-460d-b90e-b9f218bfc861` et le service de génération `214c3271-6ffd-4563-a672-846e11f6ecbb`. Les 44/9/28 bindings sont identiques avant/après par empreinte. Aucun conteneur n’a été reconstruit ni remplacé (`--containers-rollout none`), aucune migration ou nouvelle clé.

## Catalogue et preuves

Les succès sont ajoutés à `/sources`, en conservant les premiers échecs et leurs dates. Le catalogue contient 21 sources : 17 agences/réseaux et 4 portails, dont 7 avec au moins un import complet confirmé. Les cartes affichent des nombres d’essais, car un même lien peut avoir été testé avant et après adaptation. Ces trois succès ne sont pas une garantie de compatibilité de toutes les annonces de chaque réseau.

Les rapports privés, diagnostics, captures et traces de publication restent hors Git dans `evidence/remote/source-adapters-20261006/`. Les explorations et tests locaux restent dans `evidence/local/source-adapters-20261006/` ; les HTML et fiches encodées bruts ne sont pas ajoutés aux fixtures de tests ni à Git.

Le catalogue mis à jour est publié à 100 % avec la version web `a6733aac-1adf-4cf6-822d-fe47c919d779`. Les mêmes empreintes de bindings sont vérifiées après cette publication. Le navigateur réel valide `/sources` en 1440 et 390 px : 21 cartes, 7 sources avec import confirmé, 14 conseillées en manuel, recherches des trois réseaux, liens et historique, remise à zéro et absence de débordement horizontal. Les captures sont inspectées et aucune requête d’écriture n’est émise par ce contrôle. Un premier contrôle pendant la propagation du déploiement recevait encore l’ancien HTML ; il a été repris après vérification HTTP du nouveau document et de ses assets.

## Nettoyage et budget

Les trois imports techniques et leurs 32 objets temporaires ont été supprimés après le délai normal de protection. Les credentials et sessions sont révoqués, le fichier d’identité est supprimé ; seul le propriétaire technique est conservé pour respecter les invariants de l’agence. Zéro objet et zéro génération restent pour cet espace.

Les trois essais portent l’usage à 6 imports sur 20 aujourd’hui et 47 sur 60 ce mois-ci. Les provisions mensuelles passent de 67,85 € à 69,35 € (baseline comprise), dans le plafond existant de 90 €. Ce sont des provisions, pas des coûts réellement facturés. Les compteurs et provisions restent identiques avant/après nettoyage : aucun remboursement ou contournement des plafonds. Aucune vidéo, voix off, animation IA ou notification par e-mail n’a été produite ; aucun crédit vidéo n’a été consommé.
