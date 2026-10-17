# Abonnements mensuels et annuels

La page `/abonnement` propose le paiement mensuel sans engagement (sélectionné par défaut) et le paiement annuel en une fois, avec 10 % de réduction. L’équivalent mensuel, le total facturé et l’économie annuelle sont affichés ensemble.

| Offre | Mensuel HT | Annuel HT | Crédits par mois |
| --- | ---: | ---: | ---: |
| Solo | 50 € | 540 € | 50 |
| Agence | 100 € | 1 080 € | 100 |
| Équipe | 200 € | 2 160 € | 200 |
| Réseau | 500 € | 5 400 € | 500 |

Les montants sont calculés côté serveur. `billingInterval` accepte uniquement `month` ou `year` ; l’absence du champ conserve le fonctionnement des anciens onglets ouverts. La cadence fait partie de l’intention Checkout et de la clé navigateur. Un changement de cadence expire l’ancien paiement ouvert après confirmation par Stripe. Aucun crédit n’est attribué par le retour Checkout.

Une facture annuelle payée et vérifiée produit un seul reçu financier et douze allocations mensuelles bornées par leurs dates UTC. `annual_credit_periods` relie les allocations à la facture réelle, sans inventer de factures mensuelles. `subscription_credit_periods` unifie les périodes mensuelles et annuelles. Chaque limite est calculée depuis le jour d’origine (31 janvier → 28/29 février → 31 mars). Les périodes futures sont inutilisables avant leur date ; elles deviennent disponibles automatiquement par le filtre de validité du registre, sans nouvelle tâche planifiée ni nouveau prélèvement. Les crédits non utilisés se reportent un mois maximum entre deux périodes payées consécutives.

Le bonus promotionnel existant reste calculé sur un mois de crédits et expire après ce premier mois. Les crédits repris après remboursement sont répartis exactement sur les douze périodes, sans multiplier les arrondis pour les petits remboursements. Les remboursements et litiges suivent le reçu original pour toutes les allocations, y compris futures. Les attributions de revenu et frais répartissent le paiement annuel sur son total de crédits, bonus compris, sans compter douze fois la recette. Les quotas ajoutés manuellement ne deviennent pas des crédits payés reportables.

La résiliation via le portail Stripe désactive le renouvellement à la fin de la période payée ; l’année réglée continue à ouvrir ses mois de crédits. Les abonnements existants conservent leur cadence ; le sélecteur ne transforme pas un abonnement en cours. Leur gestion reste accessible via l’espace de facturation.

## Déploiement et validation

Appliquer `0079_annual_subscriptions.sql` puis `0080_annual_credit_reversals.sql` avant de publier le web. Elle ajoute des colonnes avec `month` par défaut, conserve les factures/reçus existants et étend les vues du registre. Aucun changement de mode Stripe ou secret supplémentaire n’est nécessaire. L’intégration conserve les prix Checkout calculés côté serveur.

Tests : `tests/stripe-billing.test.ts`, `tests/credit-rollover.test.ts`, `tests/credit-topups.test.ts` et suite générale. Ils couvrent calendrier, validation des paiements, idempotence, périodes futures, annulation, renouvellement, report, bonus, remboursements/litiges et revenu. La recette UI utilise un proxy local sans paiement réel.

Références : [Checkout annuel](https://docs.stripe.com/payments/checkout/yearly-price-display?payment-ui=stripe-hosted), [abonnements via Checkout](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted).
