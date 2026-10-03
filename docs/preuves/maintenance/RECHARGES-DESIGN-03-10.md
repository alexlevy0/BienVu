# BienVu — suite de la page Offres, 3 octobre 2026

La section `/abonnement#recharges` reprend la seconde maquette transmise par Alex : trois cartes radio verticales, pack de 10 crédits sélectionné par défaut, prix unitaire et badges d’achat unique/validité, meilleur prix signalé sur le pack de 100. Le récapitulatif vert à droite affiche immédiatement le pack et le prix sélectionnés, les trois bénéfices, le consentement et le bouton de paiement. Sous les recharges, un bandeau « Essayez sans compte » et le comparatif des offres, avec une nouvelle ligne de prix mensuel. Les colonnes deviennent une liste sur les écrans plus étroits.

Les tarifs restent **10/30/100 crédits à 7/19/59 € HT**, et **3/40/120 crédits mensuels à 0/19/49 € HT**. Un changement de pack décoche le consentement. La connexion et les droits de propriétaire/administrateur restent nécessaires à l’achat ; le Checkout existant conserve sa clé d’idempotence et sa vérification du lien Stripe. L’historique des recharges et les messages de confirmation sont conservés. Stripe reste en mode test, explicitement indiqué après connexion ; la validité affichée suit toujours la configuration existante.

Vérifications réalisées :

- Build Next.js, TypeScript et OpenNext (`pnpm build:web`), dry-run Wrangler et `git diff --check` réussis.
- **12 scénarios Chromium**, en local puis sur les assets publiés : visiteur à **1536/1280/1101/1024/620/390/320 px**, propriétaire à **1536/390 px**, rôle éditeur à **390 px**, paiement désactivé à **1280 px**, validité de 12 mois et historique de remboursement à **390 px**.
- Pack initial, choix des trois montants, prix unitaires, récapitulatif, navigation radio au clavier, consentement réinitialisé, droits d’achat, liens juridiques, essai gratuit, nouvelle ligne du comparatif et estimateur du haut de page vérifiés. Aucun débordement horizontal de la page ; le tableau reste défilable dans son conteneur sur mobile.
- Échec de paiement et réessai **simulés** : deux POST interceptés vers l’API de recharge, pack et consentement exacts, même clé d’idempotence, retour à un bouton disponible et solde affiché inchangé. Les comptes et API de recette sont fictifs ; tous les accès d’écriture sont interceptés. **Aucun Checkout réel créé, aucun encaissement, génération ou appel fournisseur effectué.** Les contrats et notifications Stripe ne sont pas retestés par cette recette visuelle.
- Captures ordinateur et mobile inspectées, navigateur et serveur local arrêtés.

Publication web : **`56d2c8a2-aef7-4906-b303-cbe9d031bcf1`**, service `bienvu-web-probe-staging`, à **100 %** sur **bienvu.online**. Les **35 bindings**, date et flags de compatibilité correspondent exactement à l’état précédent. Accueil, abonnement, Éditeur et dossiers en HTTP 200 ; `/api/me` sans session en 401. Déploiement avec `--keep-vars` ; aucune modification de configuration Stripe, de base de données ou du pipeline vidéo.

Traces privées ignorées : `evidence/local/topups-redesign/` (sonde, captures, rapports et états distants sans valeurs de secrets). Les corrections précédentes du menu et de la timeline, ainsi que le haut de la page Offres, sont conservés. Aucun commit/push effectué pour cette demande.
