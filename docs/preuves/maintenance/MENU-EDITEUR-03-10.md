# BienVu — menu constant dans l’Éditeur, 3 octobre 2026

L’Éditeur remplaçait les styles communs du menu : largeur de 224 px, textes de 14 px, logo et avatar réduits, espacements et police différents. Ces remplacements sont supprimés dans `apps/web/app/editeur/editor.css`. La police de l’espace de montage reste limitée à `.editor-workspace`.

`apps/web/app/landing.css` définit les dimensions communes : menu de 256 px, 225 px entre 901 et 1250 px, panneau mobile de 270 px jusqu’à 900 px. L’Éditeur utilise la même largeur pour son décalage et la même hauteur d’en-tête mobile pour remplir l’espace restant (78 px, puis 72 px jusqu’à 540 px). L’entrée « Dossiers & modèles » réserve deux lignes afin que son passage en gras ne déplace pas les activités récentes.

Validation réalisée :

- `pnpm build:web`, dry-run Wrangler avec `apps/web/wrangler.staging.jsonc` et `git diff --check` réussis.
- Chromium local puis publié à **1536, 1280, 1200, 901, 900, 870, 840 et 390 px** : navigation réelle par liens entre accueil, dossiers et Éditeur, puis ouverture d’un projet. Dimensions et styles du menu, logo, textes, récents, crédits et compte identiques à chaque largeur ; espace de montage correctement aligné.
- Anciennes règles réintroduites temporairement dans le navigateur local : le menu revient à 224 px et les liens à 14 px. Leur retrait rétablit les dimensions communes.
- Captures de l’Éditeur inspectées sur ordinateur et mobile. Les API et médias privés sont remplacés par des fixtures uniquement dans le navigateur de recette ; la récupération automatique de voix est simulée. Aucun brouillon client modifié, aucune vidéo générée et aucun appel fournisseur.
- Web `bienvu-web-probe-staging` publié sur **bienvu.online**, version **`6d49b229-33a9-4423-8071-252791f7c4dc`**, trafic **100 %**. Comparaison des **35 bindings**, date et flags de compatibilité avant/après réussie. Accueil, dossiers et Éditeur réels en HTTP 200 ; `/api/me` sans session reste en 401.

Traces privées ignorées : `evidence/local/sidebar-consistency/` (fixtures, captures, rapports, configuration distante sans valeurs de secrets). La recette vérifie l’interface avec un compte fictif ; aucune nouvelle génération authentifiée distante n’est revendiquée. Serveur local arrêté, aucun changement de pipeline ou de base de données pour cette correction.
