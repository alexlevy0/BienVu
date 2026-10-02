# Imports : plafonds doublés — 2 octobre 2026

Alex demande de doubler la limite d’import pour lever le blocage du site. La lecture Cloudflare constate **10 imports le 1er octobre UTC**, soit le plafond quotidien précédent. Le compte d’Alex conserve 14 dossiers, sous la borne de stockage de 30 ; le budget financier n’est pas suspendu et dispose de marge.

## Changement

- Migration additive `packages/db/migrations/0029_double_import_limits.sql` : imports URL **20/jour UTC et 60/mois UTC**, partagés entre agences. Aucun compteur remis à zéro ; les uploads personnels restent hors de ce compteur.
- `packages/db/src/generation.ts` : mêmes seuils dans `generationRights.importRetryAt`, utilisés par l’accueil et l’admission serveur avant une réservation vidéo.
- `apps/web/components/admin-panel.tsx` : affichage des plafonds 20 et 60 dans « Limites et usage ».
- Tests des migrations, stockage d’imports, budget hébergé et admission mis à jour ; documentation courante des imports, contrats et saisies manuelles alignée.

Les quotas vidéo des abonnements, plafonds financiers, capacité de 30 dossiers par agence et bornes de ressources par dossier restent applicables. Augmenter le quota d’import ne garantit pas l’accès aux portails refusant l’extraction.

## Vérifications locales sur fixtures

```sh
pnpm exec tsx --test --test-concurrency=2 tests/import-limit-migration.test.ts tests/import-storage.test.ts tests/import-budget.test.ts tests/generation-storage.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.runway-generation.jsonc --dry-run --containers-rollout none --outdir out/import-limit-generation
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --dry-run --outdir out/import-limit-web
```

**13 tests réussis**. Vingt imports admis parmi 22 insertions concurrentes ; le 21e refusé, compteur conservé après échec/purge. Migration `0029` vérifiée sur des compteurs historiques : imports 11–20 accessibles, 60e mensuel admis, 61e refusé, droits de l’interface synchronisés, renouvellement UTC quotidien/mensuel et idempotence conservés. Upload manuel permis au plafond de scraping ; budget financier et stockage restent bornés. L’ancien test de migration `0010` conserve ses valeurs historiques. Typage complet et frontières de 193 fichiers réussis. Build Next/OpenNext et dry-runs réussis ; un second build aligne l’affichage de l’admin découvert pendant la revue.

## Vérifications réelles Cloudflare

OAuth Wrangler du compte d’Alex vérifié ; D1 cible **`0219384e-d439-4421-840e-32c551afdb0d`**, domaine **bienvu.online**. Une seule migration distante, `0029`, appliquée avec succès. Worker de génération **`882f29a7-d5bc-4aca-8b56-43027a872f84`** à 100 %, avec `--keep-vars --containers-rollout none`. L’image du renderer reste **`f5202ad6…ade35`** ; pas de build ni mise à jour Containers.

Première publication web **`7d9d0d21-ef9a-4dac-a734-e52347addfcd`** à 100 %. `node scripts/probe-import-limits-cloudflare.mjs` crée une identité vérifiée synthétique isolée, utilise la vraie connexion HTTP et relit `/api/me` : **200, `importRetryAt: null`, usage 10/20 quotidien et 10/60 mensuel**. Le trigger réellement déployé contient les deux nouveaux seuils. Identité, session, agence et allocations de recette nettoyées ; aucun import créé, média envoyé, e-mail, appel IA ou job vidéo déclenché par cette sonde. Bindings, secrets et variables identiques aux instantanés précédents.

Publication web définitive avec affichage de l’admin : **`0d172823-ea86-4cea-a687-a838fa01bd96`**, après le second build et un nouveau dry-run. La sonde d’API est rejouée sur cette version : **200 et `importRetryAt: null`**, compteur désormais **11/20 quotidien et 11/60 mensuel**, avec activité du site pendant la publication. L’asset public du panneau admin répond 200 et son SHA-256 correspond au build contenant les plafonds 20 et 60. Les deux versions finales sont à 100 %, bindings identiques, zéro identité de recette restante.

La sonde valide le déblocage de l’API publiée, pas une nouvelle extraction de portail ni une génération complète. Les refus à 20 et 60 sont testés sur D1 local, sans remplir artificiellement les compteurs de production. Traces techniques sous `evidence/local/import-limit/`, ignorées par Git.

## Budget

Pas de hausse du budget financier demandée ici : enveloppe **100 €**, coupure **90 €** conservées. Lecture intermédiaire du registre : base octobre **26,55 €** et provisions d’import **5,50 €**, soit **32,05 €**. Au contrôle final de 22:39 UTC : base **28,05 €** + imports **6 €** = **34,05 €**, les registres ayant évolué avec l’activité du site. Cette maintenance ne réserve aucun coût d’import/vidéo/fournisseur et ne réinitialise aucun journal. Les opérations Workers/D1 restent dans l’hébergement existant ; facture réelle non rapprochée.
