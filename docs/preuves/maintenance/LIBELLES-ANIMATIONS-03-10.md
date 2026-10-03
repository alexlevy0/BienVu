# BienVu — libellés des animations IA, 3 octobre 2026

Retrait de « Sans animation IA » des trois offres. À zéro photo animée dans l’estimateur, les cartes affichent uniquement « Jusqu’à … vidéos », sans séparateur superflu. Lorsque des photos sont ajoutées à l’estimation, le nombre de vidéos et de photos animées reste actualisé.

Les références au fournisseur d’animation sont remplacées par « animations IA » ou « photos animées » dans l’estimateur, le comparatif, la FAQ, les boutons et aides de personnalisation, les libellés accessibles, les réglages de l’Éditeur et le message de connexion nécessaire. Les conditions, la politique de confidentialité et `llms.txt` utilisent le même vocabulaire. La politique décrit la catégorie du prestataire d’animation, les photos transmises, le stockage, la conservation de 90 jours et les informations sur les transferts. Les identifiants techniques du pipeline et le suivi fournisseur privé dans le Super admin restent destinés à l’administration.

Vérifications :

- Build Next.js, TypeScript et OpenNext (`pnpm build:web`), dry-run Wrangler et `git diff --check` réussis.
- Chromium local puis publié : visiteur et compte fictif à **1536/390 px**, soit **4 parcours** par environnement. Offres, estimateur, personnalisation, réglages d’une photo dans l’Éditeur et pages d’informations vérifiés ; recherche dans les textes visibles, titres et libellés accessibles. Aucun débordement de la page. Captures ordinateur/mobile inspectées.
- L’estimation avec quatre photos animées donne toujours **5 crédits** et **8 vidéos** sur Plus. Les tarifs, quotas et choix techniques restent inchangés. API de recette interceptées, éventuelles sauvegardes de brouillon simulées ; aucun paiement, rendu, import ou appel fournisseur réel effectué.
- HTTP publié : accueil, abonnement, Éditeur, dossiers, conditions, confidentialité et `llms.txt` en **200**, `/api/me` sans session en **401**. Le fichier `llms.txt` publié ne contient plus le nom du fournisseur d’animation.

Web **`d1a7604a-0fdb-441b-9da9-d292494ebad2`** à **100 %**, avec **35 bindings**, date et flags de compatibilité identiques à l’état précédent. Déploiement `--keep-vars` ; aucune modification des bases de données, des Workers du pipeline ou des paramètres fournisseurs.

Traces privées ignorées : `evidence/local/animation-copy/`. Serveur local et navigateurs de recette arrêtés. Changements précédents conservés ; aucun commit/push pour cette demande.
