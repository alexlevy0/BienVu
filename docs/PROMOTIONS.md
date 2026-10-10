# Codes bonus d’abonnement

Décision du 10 octobre 2026 : proposer **20 % de crédits supplémentaires sur la première mensualité payée d’une nouvelle souscription**, pour les offres Solo, Agence, Équipe et Réseau. Le prix HT, le renouvellement et les recharges restent identiques.

| Offre | Crédits habituels | Bonus | Première mensualité |
| --- | ---: | ---: | ---: |
| Solo | 50 | 10 | 60 |
| Agence | 100 | 20 | 120 |
| Équipe | 200 | 40 | 240 |
| Réseau | 500 | 100 | 600 |

## Parcours client

Dans `/abonnement`, ouvrir **J’ai un code bonus**, saisir le code et cliquer sur **Appliquer**. La validation est facultative ; le bouton d’achat continue à ouvrir directement Stripe. Les cartes des offres concernées indiquent le bonus et le total du premier mois, en conservant le quota récurrent habituel. Le code reste dans le stockage de session du navigateur pendant 24 heures au maximum, puis est revalidé après connexion ou changement d’agence.

Le code est saisi dans BienVu avant la redirection. Le champ natif `allow_promotion_codes` de Stripe applique des réductions monétaires : il ne sert pas pour ce bonus produit. Checkout reçoit un identifiant de réservation dans ses métadonnées et celles de l’abonnement ; son texte de confirmation rappelle le bonus et sa validité. Aucun coupon Stripe ni remise de prix n’est créé.

## Administration

Dans `/admin?view=promotions`, l’onglet **Codes bonus** permet de créer une campagne et de régler :

- le code (3 à 32 caractères, majuscules, chiffres, tirets et underscores), son nom et son activation ;
- ses dates de début/fin en heure locale et ses offres éligibles ;
- son nombre maximal d’utilisations, ou aucune limite ;
- son suivi : paiements en attente, bonus attribués, crédits offerts/repris, agences, factures, consommation et expiration ;
- l’export CSV des lignes affichées et le journal des modifications avec auteur et motif.

Le pourcentage reste fixé à 20 %. Un code existant ne peut pas être renommé : désactiver l’ancien et créer une autre campagne. Les dates, offres et plafonds peuvent changer, mais une offre déjà réservée avant paiement conserve son bonus. Une modification obsolète est refusée par contrôle de version. Il n’y a pas de suppression de l’historique financier.

Les codes et leurs réglages sont communs au catalogue, mais les utilisations, plafonds et statistiques sont **séparés entre test et réel**. Seul le superadmin peut gérer ou consulter ces données ; l’admin associé n’y a pas accès. Aucune campagne publique n’est activée automatiquement par la migration.

## Attribution et validité

- Une seule promotion d’abonnement par agence et par mode Stripe, tous codes confondus. Aucun cumul et aucun bonus sur une recharge.
- La place est réservée atomiquement lors de la création de Checkout ; deux achats simultanés ne peuvent pas dépasser le plafond.
- Le bonus est attribué dans la même transaction D1 que la facture après `invoice.paid`, seulement pour `subscription_create`. Le retour navigateur et `checkout.session.completed` ne donnent aucun crédit d’abonnement.
- La facture, la devise, le prix, le client, l’agence, l’abonnement et la session Stripe doivent correspondre au journal serveur. La première facture peut arriver avant l’enregistrement de la réponse Checkout : la session est alors retrouvée auprès de Stripe et vérifiée.
- Une répétition de webhook ne réattribue pas le bonus. Une nouvelle mensualité n’en attribue pas non plus.
- Le bonus suit les dates de la première mensualité payée. Il **expire à sa fin sans report**, et est consommé avant les crédits mensuels qui peuvent être reportés. Un échec de génération restitue les suppléments non réalisés dans leur lot initial, avec leur validité initiale.
- Le bonus suit les remboursements au prorata, arrondis au crédit supérieur, et est suspendu en cas de litige. Une dette après consommation empêche un contournement via d’autres crédits. Un remboursement ne remet pas la campagne à disposition de la même agence.
- La rentabilité répartit le revenu et les frais du paiement sur les crédits habituels **plus le bonus**, sans augmenter le revenu encaissé ni changer le plafond du report mensuel.

## Paiements abandonnés et reprises

La durée Checkout est de 45 minutes. Une réservation n’est pas libérée sur la seule base d’une date locale : un paiement asynchrone confirmé peut encore attendre sa facture. Le bouton **Vérifier les paiements expirés** vérifie jusqu’à 20 réservations auprès de Stripe et libère celles dont la session est réellement expirée. Cette vérification se fait aussi avant de réserver un nouveau code.

Si la création de session a eu une réponse incertaine, le même achat reprend sa clé Stripe et le bonus réservé. Si aucun identifiant de session n’a été enregistré après expiration, le rapprochement recherche la session dans le compte Stripe du client, avec au maximum cinq pages de 100 résultats. Il conserve la réservation si cette recherche est incomplète ; il la libère si la recherche terminée confirme qu’aucune session n’a été créée. Les sessions complétées en attente de paiement ou de facture restent protégées.

## Fichiers et migration

`packages/db/migrations/0067_subscription_promotions.sql` ajoute les campagnes, leurs réservations, les attributions et le journal. Les vues de crédits et de rentabilité raccordent le bonus au paiement original. Les écritures et paiements antérieurs ne sont pas réécrits. La migration doit être appliquée avant de déployer le web ; ses vues et déclencheurs restent compatibles avec le pipeline existant.

Les API ajoutées sont `/api/billing/promotion` (validation bornée, origine contrôlée, 15 essais/minute par empreinte IP sans conserver l’adresse brute) et `/api/admin/promotions` (superadmin vérifié, origine contrôlée pour les mutations). Les réponses sont privées et non mises en cache. Aucun secret supplémentaire n’est requis.

Déploiement D1 du 10 octobre : `wrangler d1 migrations apply` a refusé le SQL multiligne avec `incomplete input`, sans appliquer de changement. La même migration, sans commentaires de ligne et avec les retours à la ligne remplacés par des espaces, a été appliquée par `wrangler d1 execute --remote --file`, en incluant l’enregistrement `0067_subscription_promotions.sql` dans `d1_migrations`. La facture préexistante reste identique, les vues de crédits/rentabilité sont lisibles et `PRAGMA foreign_key_check` ne signale aucune anomalie. Ne pas réappliquer la migration déjà enregistrée. Pour une autre base distante, utiliser l’import de fichier normalisé si l’application directe rencontre le même refus ; il ne faut pas retirer des contraintes ou tronquer les déclencheurs.

Recette locale : `pnpm exec tsx --test tests/stripe-billing.test.ts tests/admin.test.ts tests/credit-topups.test.ts`, `node scripts/probe-promotions-ui.mjs` et `pnpm check`. Les fixtures ne déclenchent ni génération IA, ni paiement réel, ni notification e-mail.
