# BienVu — offres selon la nouvelle maquette, 3 octobre 2026

La page `/abonnement` reprend la maquette transmise par Alex : grand titre sérif avec soulignement vert, deux repères de coût, cartes Gratuit/Plus/Pro compactes, offre Plus recommandée et bandeau commun des six fonctionnalités. Un estimateur à boutons − / + remplace le menu précédent : de zéro à douze photos animées, coût de 1 à 13 crédits, avec actualisation du nombre de vidéos réalisables pour chaque offre. La disposition s’adapte aux écrans mobiles.

Les tarifs et contrats de crédits restent ceux déjà confirmés : 3/40/120 crédits mensuels à 0/19/49 € HT, packs 10/30/100 à 7/19/59 € HT, essai anonyme, portefeuille, historique paginé et gestion d’abonnement. Les recharges et informations du compte suivent les blocs de la maquette. Le choix d’un abonnement fait défiler la page vers sa confirmation, en respectant la préférence de mouvement réduit. Consentement et contrôle des rôles conservés ; Stripe reste en mode test.

Vérifications réalisées :

- `pnpm build:web` : compilation Next.js, TypeScript et bundle OpenNext réussis. Dry-run Wrangler avec la configuration existante et `git diff --check` réussis.
- Chromium local puis sur les assets publiés : **12 scénarios**. Visiteur à **1536/1280/1024/900/768/620/390/320 px**, propriétaire à **1536/390 px**, rôle éditeur à **390 px**, abonnement actif à **1536 px**.
- Tarifs et quotas, estimateur de 0 à 12 et retour à 0, équivalences à 5 crédits, boutons aux limites, absence de débordement, offre actuelle, solde mensuel/rechargé, confirmations d’abonnement et de recharge avec consentement/annulation, historique paginé, FAQ, droits d’achat et bouton de gestion vérifiés. Navigation vers l’Éditeur puis retour sans changement de largeur ou de taille des textes du menu.
- Captures ordinateur/mobile inspectées. Comptes et réponses API fictifs, requêtes d’écriture interceptées : **aucune requête de paiement, génération, fournisseur ou modification métier distante**. Le paiement réel et la synthèse vidéo ne font pas partie de cette recette visuelle.

Publication web : **`c483d14e-66e6-4a4e-8439-f33f8e46b2f4`**, service `bienvu-web-probe-staging`, à **100 %** sur **bienvu.online**. Les **35 bindings**, date et flags de compatibilité correspondent exactement à l’état précédent. Accueil, abonnement, Éditeur et dossiers en HTTP 200 ; `/api/me` sans session en 401. Déploiement avec `--keep-vars` ; aucun changement de configuration Stripe, de base de données ou de pipeline.

Traces privées ignorées : `evidence/local/offers-redesign/` (sonde, captures, rapports et états distants sans valeurs de secrets). Serveur local et navigateurs de recette arrêtés. Les changements des deux corrections précédentes du menu et de la timeline sont conservés ; aucun commit/push effectué pour cette demande.
