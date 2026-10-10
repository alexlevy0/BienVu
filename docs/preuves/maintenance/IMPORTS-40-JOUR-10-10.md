# Imports par lien : 40 tentatives par jour — 10/10/2026

## Modification

Les imports par lien passent de **20 à 40 tentatives par jour UTC**, pour l’ensemble des agences. Le plafond mensuel reste **300 par mois UTC**. Le contrat `URL_IMPORT_QUOTAS` synchronise les droits de création et l’affichage du superadmin ; la migration `0065_daily_import_allowance.sql` remplace uniquement le trigger d’admission atomique.

Les tentatives déjà comptées sont conservées. Les échecs continuent à compter, les reprises idempotentes n’ajoutent pas de tentative et les projets manuels restent hors du compteur. Le verrou d’import simultané par agence, les budgets financiers, les crédits et les autres limites restent appliqués.

## Tests

- Migration sur une base contenant 20 tentatives du jour : ancien plafond bloquant, compteurs identiques après migration, imports 21–40 autorisés.
- Deux agences concurrentes pour la dernière place : une admission, un refus ; 41e tentative refusée et renouvellement à minuit UTC.
- Imports d’estimation, échecs et reprises : aucun remboursement ou double comptage du quota.
- Quota mensuel : dernière place 300 atomique, refus de la 301e tentative et renouvellement au mois suivant.
- Admission de génération, ressources financières et suppression d’imports vérifiées avec la nouvelle limite.
- Les tests historiques de 0029 et 0053 conservent leurs anciennes limites de 20/jour. Les fixtures des tests actuels utilisent le contrat partagé ; le test concurrent dispose d’agences distinctes pour respecter aussi leur verrou individuel.

La batterie complète initiale a exécuté **623 tests** : 620 réussis et trois échecs de fixtures (une clé d’idempotence trop courte et le test de concurrence utilisant seulement 22 agences, avec échec de son parent). Ces fixtures ont été corrigées. Les cinq fichiers concernés ont ensuite été rejoués : **17/17 tests réussis**, zéro échec. Aucun autre échec dans la batterie complète initiale. `pnpm typecheck`, `pnpm check:boundaries` (484 fichiers), migrations locales répétées, build OpenNext et dry-run des deux Workers réussis.

## Mise en ligne

Bookmark D1 enregistré avant la migration. Migration **0065** appliquée sur `bienvu-s00-staging` : compteurs, budgets et nombres de lignes des imports, médias, générations, jobs, allocations, réservations et coûts identiques avant/après. Trigger distant relu : **40/jour et 300/mois**.

Déploiements à 100 % avec `--keep-vars --strict` :

- Web : `54fb4dff-e696-4e45-9053-e4b6a967dc70`, **56 bindings conservés**.
- Génération : `5fa8752d-caa8-4778-b055-c8ab1da28688`, **32 bindings conservés**, conteneur de rendu inchangé (`--containers-rollout none`).

Home et superadmin accessibles en HTTP 200, bundle du superadmin relu avec le quota 40/300. API privées sans session en 401. Aucun import de portail réel ni appel fournisseur payant pour la recette.

Preuves locales et distantes ignorées par Git : `evidence/local/daily-import-40-2026-10-10/`.
