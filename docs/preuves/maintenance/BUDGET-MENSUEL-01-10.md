# Budget mensuel administrable — 01/10/2026

## Demande et diagnostic

Alex demande de doubler le pilote de 50 à 100 € pour reprendre les générations anonymes, puis retient un réglage mensuel uniquement. Avant intervention, septembre était à **44,80 € / 45 € de coupure** ; octobre n’avait ni ligne de budget global ni sous-budget narration. Le renderer conservait également le mois et les cinq tentatives de la recette technique. Modifier uniquement un texte d’interface n’aurait pas permis de reprendre le pipeline.

## Implémentation

- `AdminAction.monthly_budget` : mois UTC courant, enveloppe, coupure, frais d’ouverture uniquement pour un mois absent, pause, révision attendue et motif.
- Enveloppe jusqu’à **100 €**, coupure au plus **95 €**, marge d’au moins **5 €**. Valeurs demandées : **100 €/90 €**.
- Migration `0025_monthly_budget.sql` : capacité accrue sans ouverture automatique, nouvelle table de réglages/révisions, historique administratif copié sans rejouer les actions. Dépenses, jobs, clés étrangères et autres triggers conservés.
- Action D1 atomique et audit immuable : refuse modifications périmées, ancien/futur mois et coupure inférieure aux engagements. Synchronise plafond global, politique anonyme et narration (sous-plafond au plus 25 €, inclus dans les provisions globales).
- Formulaire dans **Super admin → Service & budget** ; ouverture du mois absent, modification des montants, pause et reprise, confirmation avec motif. Autorisation côté serveur, contrôle d’origine et limite d’actions inchangés.
- Le renderer produit vérifie le manifeste figé, le job actif et sa provision D1, y compris les réservations anonymes `unfunded` avant connexion. Il relit le plafond du mois courant et note le rendu déjà provisionné sans ajouter un second coût au total. Ancien journal DO archivé à la première admission du nouveau mois. Limites produit D1 5/jour et 30/mois conservées ; limite de cinq tentatives conservée pour les sondes techniques seules.

## Fixtures locales

**26 tests ciblés réussis** : budget, migration historique, administration, budget mensuel, imports, Workflows compte/anonyme et coordinateur durable. D1 et Durable Objects SQLite exécutés dans workerd local ; import, OpenAI, Google et rendu simulés, aucun appel fournisseur facturable. Tests du montant de coupure, CAS concurrent, historique/audit, mois fermé, pause, manifeste falsifié, réservation libérée, rendu anonyme avant débit, plus de cinq rendus produit, rejeu après redémarrage et absence de double provision.

**2 parcours navigateur à 1536 et 390 px** : 13 onglets existants, nouveau formulaire, marge invalide refusée, modification avec motif, révision envoyée et ouverture du mois absent. Captures desktop/mobile inspectées. API navigateur simulée et session locale signée ; ce n’est pas une écriture authentifiée en production.

Commandes :

```sh
pnpm exec tsx --test --test-concurrency=1 tests/admin.test.ts tests/budget.test.ts tests/monthly-budget.test.ts
pnpm exec tsx --test --test-concurrency=1 tests/video-coordinator.test.ts
pnpm exec tsx --test --test-concurrency=1 tests/budget-migration.test.ts tests/import-budget.test.ts tests/generation-workflow.test.ts tests/trial-workflow.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
node scripts/probe-admin-ui.mjs
```

Les premiers essais ont révélé deux erreurs de fixture/typage, corrigées puis revérifiées. Types de tous les packages et tests, frontières sur 187 fichiers, build final, dry-run et diff réussis. Pas de nouvelle dépendance.

## Vérifications Cloudflare réelles

Base sauvegardée localement avant migration, puis **0025 seule** appliquée sur le binding D1 existant. Octobre ouvert par la même fonction `adminAction`, via l’accès opérateur D1 et sous l’identifiant du compte Super admin confirmé, avec motif explicite. Ce chemin opérateur ne prétend pas simuler une session navigateur authentifiée distante.

- **Octobre 2026** : enveloppe **100 €**, coupure **90 €**, frais fixes provisionnés **8 €**, **82 € disponibles avant coupure**, révision 1, budget ouvert.
- Politique anonyme ouverte, plafond **90 €**, limites **5/jour et 30/mois** ; narration octobre **0 € / 25 €**, ouverte.
- Septembre reste **30,80 € de base + 14 € d’imports = 44,80 €**, coupure **45 €** ; narration **1,20 €/2,50 €**, inchangée.
- **5 jobs, 0 actif, 2 comptes et 0 abonnement**, inchangés ; aucune nouvelle génération de recette. Contrôle des clés étrangères sans anomalie.
- Worker web **`d855751b-fb6c-498c-89d6-cb4346b42a89`**, pipeline **`5a9538a9-ac0e-4a8b-9305-1d93c63c8de9`**, chacun publié à **100 %**. Secrets, bindings et configuration conservés, hors quatre paramètres techniques du mois/enveloppe/coupure/base du pipeline.
- Image Containers existante **`354290e83528a0598ec9e665c95ba38bacb4b02c2971c0c97c9805650686edce`** réutilisée, sans build ni rollout de conteneur. Contrôleur inactif, non suspendu ; conteneur arrêté et **0 instance en cours**. Le journal DO de septembre est conservé jusqu’au prochain rendu, puis archivé.
- Accueil et 14 assets publics en **200**, nouveaux JS/CSS admin en **200** avec empreintes identiques au build. GET et POST budget admin sans session **401**, réponses privées sans cache.

Les exports, cookies, snapshots et logs restent dans `evidence/local/monthly-budget` et `evidence/local/admin`, ignorés par Git. Aucun secret copié dans ce rapport.

## Limites

La configuration distante et l’éligibilité budgétaire d’un nouvel essai URL de 2 € sont vérifiées. **Aucun nouveau MP4 avec import/OpenAI/Google/Containers réels n’a été généré pour cette maintenance.** Le prochain essai humain Turnstile exercera le changement de mois du renderer sur le vrai pipeline. Les quotas individuels, la durée de conservation et les limites de volume restent applicables. Chaque mois suivant doit être ouvert explicitement dans le panneau. Les provisions et la marge ne sont pas des factures rapprochées ; aucune garantie de plafond de facture fournisseur.
