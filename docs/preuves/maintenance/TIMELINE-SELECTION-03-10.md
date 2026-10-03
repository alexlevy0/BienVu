# BienVu — sélection de texte pendant le déplacement du curseur, 3 octobre 2026

Le gestionnaire de la règle temporelle capturait le pointeur et déplaçait la tête de lecture, mais laissait également le navigateur commencer une sélection de texte. Le problème est reproduit avec un vrai glissement souris dans Chromium sur la version publiée `6d49b229-33a9-4423-8071-252791f7c4dc` : les repères de durée sont sélectionnés pendant le déplacement.

`apps/web/components/editor-timeline.tsx` annule maintenant le comportement natif dès `onPointerDown`. `apps/web/app/editeur/editor.css` interdit la sélection du texte sur `.editor-timeline-sheet`, avec `-webkit-user-select` et `user-select`. Les champs de réglage des textes sont hors de cette zone ; la capture du pointeur et le calcul de la position restent identiques.

Vérifications réussies :

- Build OpenNext (`pnpm build:web`), dry-run Wrangler avec la configuration existante et `git diff --check`.
- Chromium local puis publié à **1536, 1280 et 390 px** : glissements avant/arrière sur la règle, tête de lecture à la position attendue, aucun texte sélectionné, pointeur relâché sans déplacement supplémentaire.
- Sur ordinateur, capture maintenue lors d’un glissement hors de la règle et sélection toujours possible dans le champ de texte de l’inspecteur. Sur mobile, déplacement tactile de la tête de lecture sans sélection du texte.
- Captures avant/après et version publiée inspectées. Les API et médias privés sont interceptés avec un brouillon fictif ; aucun brouillon client sauvegardé ni appel de génération/fournisseur.
- Web `bienvu-web-probe-staging`, version **`765b26f0-1017-477b-88ae-66d38256ffb4`**, publié sur **bienvu.online** à **100 %**. Les **35 bindings**, date et flags de compatibilité correspondent exactement à l’état précédent. Pages accueil/Éditeur/dossiers en HTTP 200 ; `/api/me` sans session en 401.

Traces ignorées : `evidence/local/timeline-scrub/` (sonde, captures, rapports, état distant sans valeurs de secrets). La recette porte sur l’interaction dans l’interface avec des données fictives, sans nouveau montage distant. Serveur local arrêté ; aucun changement de base de données ou de pipeline.
