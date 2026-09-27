# Sprint 08 — Abonnements, quotas et essai gratuit

**Dépendance : sprint 07. Statut initial : à faire.**

## Objectif

Rendre l'accès commercial fiable : une vidéo d'essai réussie avec filigrane après inscription, puis plusieurs abonnements avec quotas par période payée. Les montants proposés restent des hypothèses et sont implémentés en environnement Stripe test.

Références : [CONTRATS.md](../CONTRATS.md), [BUDGET-ET-OFFRES.md](../BUDGET-ET-OFFRES.md), documentation Stripe dans [SOURCES.md](../SOURCES.md).

## Travail à réaliser

- [ ] **08.1 — Configurer le catalogue.** Définir prix et quotas côté serveur avec identifiants Stripe test. Le client envoie seulement un code d'offre autorisé. Afficher période, quota disponible, réservations en cours et date de renouvellement.
- [ ] **08.2 — Intégrer Checkout et le portail.** Créer les sessions pour le client Stripe de l'agence authentifiée. Le retour de Checkout n'accorde aucun droit à lui seul. Configurer les changements de palier au prochain renouvellement ; si le portail ne permet pas exactement cette règle, restreindre sa fonction et implémenter le chemin documenté nécessaire, sans introduire une proratisation implicite.
- [ ] **08.3 — Traiter les événements durablement.** Vérifier la signature sur le corps brut, dédupliquer les événements, persister le travail avant acquittement et réconcilier l'état Stripe courant. Accorder une allocation seulement à partir d'une période réellement réglée. Résister à un événement livré plusieurs fois ou hors ordre.
- [ ] **08.4 — Rendre les réservations atomiques.** Prouver sur D1 la réservation, la création de job, la consommation au succès et la libération après échec. Un dépassement ou une condition échouée annule toute l'opération. Conserver l'ancienne allocation pour les jobs traversant un renouvellement. La contrainte d'un seul job actif par agence doit aussi résister aux requêtes concurrentes.
- [ ] **08.5 — Accorder l'essai une seule fois.** Relier l'essai à l'identité et à l'agence. L'échec libère son unité ; le premier succès l'épuise. Supprimer une vidéo ou recréer une agence ne réinitialise pas ce droit. Prévoir des limites de fréquence et le plafond global de dépenses pour borner les comptes abusifs, sans prétendre identifier une personne physique de façon infaillible.
- [ ] **08.6 — Figer les droits du rendu.** Une génération d'essai porte toujours son filigrane. L'abonnement ne retire pas le filigrane d'un fichier déjà produit. Proposer une nouvelle génération payante explicite pour la version sans filigrane. Aperçus, téléchargements et reprises internes du même job ne débitent pas à nouveau.
- [ ] **08.7 — Gérer les changements de cycle.** Tester impayé, paiement tardif, annulation à échéance, résiliation et changement de palier. Les droits suivent la période payée. Définir le traitement des remboursements sans inventer une politique commerciale ni déclencher un remboursement automatique.

## Critères d'acceptation

1. Avec une unité restante, deux demandes simultanées ne peuvent pas obtenir deux générations ; la limite d'agence ne masque pas un défaut d'atomicité du quota.
2. Un webhook dupliqué ou retardé n'accorde pas deux allocations et ne réactive pas un ancien état.
3. Un job commencé avant renouvellement et terminé après consomme son allocation d'origine.
4. Un crash au succès et un échec libéré deux fois n'altèrent pas le solde.
5. L'essai reste épuisé après suppression de sa vidéo ; son export ne donne pas accès à une version sans filigrane.
6. Aucun droit n'est accordé par un montant, une agence ou un statut envoyé librement par le navigateur.
7. La pause budgétaire interdit toute nouvelle dépense même si le client dispose de crédits.

## Livrables et fin du sprint

Catalogue configurable, Checkout/portail test, webhooks, allocations et tests concurrents/intégration. Mettre à jour [SUIVI.md](../SUIVI.md). Livrer les écrans commerciaux concrets pour revue ; ne pas activer des prix réels non validés.
