# Offres BienVu — décision du 09/10 et publication du 10/10/2026

## Résultat et décisions d’Alex

Page `/abonnement` reprise depuis la maquette : titre éditorial, calculateur photos/présentateur, trois cartes Solo/Agence/Équipe, Réseau en bandeau, outils inclus, démonstration du présentateur dans son emplacement, solde privé, Découverte, recharges, tableau comparatif, historique paginé et FAQ. Démonstration muette sur demande, portraits chargés progressivement ; aucun avatar n’est activé par défaut dans les générations.

Prix des **nouvelles** souscriptions : Solo **50 € HT / 50 crédits**, Agence **100 € / 100**, Équipe **200 € / 200**, Réseau **500 € / 500**, par mois. Nouvelles recharges **20 / 50 / 100 crédits**, respectivement **20 / 50 / 100 € HT**, sans expiration. Le simulateur démarre à six photos animées et un présentateur court : **8 crédits**, soit **6 / 12 / 25 / 62 vidéos** dans les quatre mensualités. Présentateur continu : barème existant **+1 crédit / 10 s** conservé (+2/+3/+4 pour 20/30/40 s).

Les prix proviennent du catalogue serveur partagé, avec consentement avant Stripe. Les nouvelles commandes utilisent des identifiants `pack20v2`, `pack50v2`, `pack100v2` pour conserver la signification du pack historique de 100 crédits à 59 €. Les prix récurrents sont envoyés à Checkout par `price_data`, sans modifier les anciennes souscriptions Stripe. Le serveur continue à accepter leurs factures et les confirmations des anciennes commandes. Le renouvellement et les achats sont confirmés uniquement par les événements Stripe vérifiés ; le retour du navigateur n’accorde aucun crédit.

## Report des mensualités payantes

Après renouvellement payé d’une nouvelle offre, les crédits payés inutilisés et non réservés sont utilisables pendant **un seul mois supplémentaire**, avec un plafond égal à la mensualité entrante. La facture future n’est prise en compte qu’au début de sa période. Le report est figé une seule fois, même après deux lectures concurrentes. Une hausse administrative de quota ne transforme pas des crédits supplémentaires en crédits payés reportables.

Le journal `credit_rollover_links` relie la nouvelle mensualité au **lot payé d’origine**. La vue de financement ajoute une disponibilité dans la nouvelle période, sans augmenter la quantité achetée ni prolonger l’allocation originale. Le lot reporté est consommé avant la nouvelle mensualité et les recharges ; ses consommations restent attachées à sa facture originale pour le rapprochement et les remboursements. Les réservations de générations et avatars sont conservées dans leurs lots. Une restitution tardive n’augmente pas le report déjà figé. Le report du mois précédent ne peut pas être reporté à nouveau. Sans renouvellement payé, il n’est pas disponible.

Gratuit **3/mois sans report**, souscriptions Plus/Pro, paiements et commandes antérieurs : conditions conservées. Les recharges restent sans expiration. Aucun montant de budget, prix fournisseur, secret, quota global ou média existant n’est remplacé.

## Vérifications réellement exécutées

- **68 tests métier distincts** réussis : avatar continu, report, tarifs serveur des quatre souscriptions et des trois packs, commandes historiques, crédits/réservations, remboursements/litiges, isolation test/live et entre agences, signatures et replay de webhooks, génération, comptes/équipe, simulateur et rapprochement. Tests avec D1/workerd et fournisseurs simulés ; certaines suites ont été répétées après les dernières corrections.
- `pnpm typecheck` : tous les packages, pipeline, web et tests validés.
- `pnpm check:boundaries` : **481 fichiers** vérifiés, renderer isolé des Workers.
- `pnpm build:web` : Next et OpenNext terminés. Avertissement `fast-png` existant sur une expression nullish, sans erreur de compilation.
- `scripts/probe-offers-ui.mjs` : composants de production dans Chrome à **1536 / 900 / 390 / 320 px**, sans débordement. Coût initial 8, minimum 1, maximum 17 avec avatar continu de 40 s ; comparaison des offres, consentements remis à zéro, choix Découverte, historique paginé, démonstration muette, rôle Éditeur empêché d’acheter. Aucun achat ni appel fournisseur payant.
- Chrome sur **bienvu.online/abonnement**, sans compte, à **1536 / 390 px** : prix et simulateur réellement affichés, vignettes décodées, aucun débordement ni erreur JavaScript. Consentement analytics refusé pour la recette ; captures inspectées.
- HTTP réel : Offres, Conditions, Comment ça marche, article Budget et `llms.txt` **200** ; API billing/crédits sans connexion **401**. JSON-LD relu : Gratuit 0, Solo 50, Agence 100, Équipe 200, Réseau 500. Pages éditoriales, conditions et `llms.txt` cohérents avec le catalogue.
- `git diff --check` validé.
- Préparation du commit le 10/10 : sonde CI `probe:foundations` actualisée pour les offres Solo/Agence/Équipe/Réseau ; vérifiée sur le Worker local avec neuf pages publiques 200, protections HTTP et API sans compte 401, aucun appel externe. Le contrôle obsolète Plus/Pro a été retiré.

## Migration et publication

Sauvegarde SQL privée avant intervention, puis répétition de **0063** sur sa copie : **123 tables / 3 431 lignes existantes** identiques après migration, aucune erreur de clé étrangère. Ajout de `credit_rollover_links`, élargissement des contraintes des commandes/factures et remplacement des vues/trigger de financement. Aucun nouveau lot ou paiement créé par la migration.

Migration **0063 appliquée** sur la D1 `bienvu-s00-staging` utilisée par le domaine. Les quatre journaux de facturation ont été comparés à la sauvegarde : contenu identique ; commande et recharge historiques conservées. `PRAGMA foreign_key_check` vide avant et après. Aucun journal de report créé dans les données existantes lors de cette recette.

Versions publiées à **100 %** :

- Web `bienvu-web-probe-staging` : **628024ed-0080-49ce-9e59-06055a70059a**.
- Génération `bienvu-generation-development` : **795c9aa5-8cc1-4a82-b8b9-722f888a5db2**.

Préparation `wrangler deploy --dry-run --keep-vars` validée. Publications avec `--keep-vars` ; génération avec `--containers-rollout none`. Les **56/32 bindings** ont été comparés intégralement avant/après : identiques. Image renderer, secrets, budgets et ressources conservés. Politique distante **test**, recharges `topup_valid_days=0`, aucun passage en live.

## Limites et coûts

Les nouveaux montants et renouvellements Stripe sont validés par fixtures typées, pas par une nouvelle carte ni une vraie facture Stripe. Aucun achat, nouvelle souscription externe, génération vidéo, envoi d’e-mail ou appel OpenAI/TTS/Runway/HeyGen payant n’a été exécuté. Le mode d’encaissement réel n’est pas ouvert par cette livraison. Les lectures et publications Cloudflare utilisent les ressources existantes ; aucune nouvelle provision fournisseur ni modification de budget.

Les exports de base, configurations privées, logs et captures sont ignorés dans `evidence/local/offers-2026-10-09/`. Le journal de report est immuable. Revenir à une ancienne interface ne doit pas rétablir un processeur de factures ignorant les nouvelles offres : conserver la compatibilité avec les commandes et factures v2, et ne pas supprimer leurs allocations ou journaux pour revenir en arrière.
