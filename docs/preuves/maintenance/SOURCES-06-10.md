# César & Brutus et iad — 6 octobre 2026

Ce compte rendu décrit les premiers essais, avant adaptation de l’importeur. Les correctifs et les nouveaux essais réussis sont documentés dans [SOURCES-ADAPTATEURS-06-10.md](SOURCES-ADAPTATEURS-06-10.md).

Les deux liens fournis par Alex ont été testés une fois dans l’import réel de BienVu, via `POST /api/imports`, sous un compte technique isolé. Un premier diagnostic local avec le même importeur et son transport HTTPS épinglé donnait déjà le même résultat. Aucun résultat local n’est présenté comme une preuve de compatibilité dans le produit.

| Source et annonce | Résultat dans BienVu | Photos importées |
| --- | --- | --- |
| [César & Brutus — maison à Limonest, 7 pièces](https://www.cesaretbrutus.com/bien/vente-dune-maison-de-famille-7-pieces-27165-m%c2%b2-a-limonest-mcl-10287-cesaretbrutus69/) | `failed`, `INCOMPLETE_LISTING` | 0 |
| [iad — appartement à Lyon 4e, 55 m²](https://www.iadfrance.fr/annonce/appartement-vente-3-pieces-lyon-55m2/r2125326) | `failed`, `INCOMPLETE_LISTING` | 0 |

Les diagnostics indiquent une page HTML effectivement récupérée pour chacun des liens, puis un échec au stade `extraction`, avant toute récupération de photo. Il ne s’agit pas d’un refus réseau `UNSAFE_URL` ou d’une source bloquée. Le format de ces annonces ne fournit pas toutes les informations nécessaires sous une forme actuellement interprétée par l’extracteur générique. Aucun navigateur de repli ni nouvelle tentative automatique n’a été utilisé. Le HTTP 200 de la route d’import représente une réponse terminée, avec le statut métier `failed` ; il n’est pas compté comme un succès.

Chaque réponse a été relue par sa route privée et comparée à la réponse initiale. Les mêmes routes sans session répondent HTTP 401. Les diagnostics ont également été relus en D1.

## Mise à jour du catalogue

- César & Brutus rejoint la page `/sources`, avec son domaine exact, le lien testé, la date du 6 octobre et le statut « Saisie manuelle conseillée ».
- La carte iad affiche le nouvel essai et conserve celui du 5 octobre, avec sa date d’origine. Elle décrit deux échecs et ne compte aucun import complet.
- Le catalogue totalise **20 sources** : 16 agences/réseaux et 4 portails. Quatre sources ont au moins un import complet démontré ; les 16 autres restent dans le filtre de saisie manuelle.
- L’indication sous l’URL de création utilise le même catalogue. Le registre des adaptateurs, les permissions de domaines et CDN, les garde-fous SSRF et les limites d’import sont inchangés. Aucun nouvel adaptateur n’a été annoncé comme compatible.
- Le fichier d’échantillons de recette contient désormais ces deux liens pour les prochains essais. L’historique publié des anciens tests reste conservé séparément.

## Vérifications et publication

**11 tests ciblés réussis** pour le catalogue et le réseau d’import : résultats partiels/localisés, compteurs et dates des preuves, reconnaissance sans élargissement des permissions, SSRF, redirections, images, limites et délais. Les domaines César & Brutus et iad sont explicitement vérifiés comme de simples entrées du catalogue, sans autorisation de nouveaux hôtes dans le transport.

TypeScript complet, frontières des 390 fichiers, `git diff --check`, compilation Next/OpenNext et dry-run Wrangler strict réussis.

Le navigateur réel vérifie la page sur le Worker local puis sur `bienvu.online`, en **1440 et 390 px** : nombre de sources, filtres, recherche « cesar » sans accent et par domaine iad, statuts, nouveaux liens, dates du 6 octobre, ancien essai iad du 5 octobre, état vide, remise à zéro, focus et absence de débordement horizontal. Aucune requête d’écriture pendant ces contrôles. Les captures ont été inspectées.

Le Worker web `bienvu-web-probe-staging` est publié à 100 %, version **`4e0bb21b-1936-4d41-a55e-ba9c41be6ba7`**. Les 44 bindings, variables et secrets sont identiques avant/après par empreinte. Les services d’import et de génération conservent leurs versions et leurs bindings. Aucun conteneur, migration ou secret n’a été publié.

## Nettoyage et provisions

Aucune vidéo, voix off, animation IA ou notification par e-mail n’a été produite ; aucun crédit vidéo consommé. Deux tentatives d’import ont été enregistrées : **2 sur 20 aujourd’hui**, **43 sur 60 ce mois-ci**, sans remise à zéro des compteurs.

Les provisions augmentent de **1,00 €** pour ces deux essais, de 66,35 € à 67,35 € pour le mois, dans la limite existante de 90 €. Il s’agit du budget provisionné, pas d’une facture rapprochée. Aucun plafond ou coupe-circuit n’a été modifié.

Les deux imports temporaires ont été supprimés après le délai de protection normal du produit. Aucun média n’avait été téléchargé. Les credentials et sessions techniques sont révoqués et le fichier d’identité locale a été supprimé ; le propriétaire technique est conservé pour respecter les invariants de l’agence. Le nettoyage vérifie zéro objet et zéro génération pour cet espace, sans modifier les compteurs ni les provisions.

Les réponses privées, diagnostics, captures et attestations de nettoyage restent hors Git dans `evidence/remote/source-coverage-20261006/`. Les HTML de diagnostic local restent dans `evidence/local/source-additions-20261006/`.
