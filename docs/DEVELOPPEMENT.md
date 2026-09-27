# Développement local

Le sprint 01 est réalisé à la demande d'Alex sans attendre la recette Containers du sprint 00. L'architecture retenue reste Next.js/OpenNext et Cloudflare. Cette avance ne valide pas le rendu hébergé.

## Installation et commandes

Node 24.17.0, pnpm 10.33.2 ; versions exactes dans les manifests et le lockfile. Aucun Docker, compte Cloudflare ou crédit API requis pour les fondations.

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm fixtures
pnpm --filter @bienvu/web typegen
pnpm --filter @bienvu/pipeline typegen
pnpm check
pnpm db:migrate
pnpm build:web
pnpm preview
```

Ouvrir `http://localhost:8787`. Dans un second terminal :

```sh
pnpm probe:foundations
pnpm probe:web
```

La première sonde vérifie les pages et le refus serveur des générations. La seconde vérifie réellement les bindings D1/R2 et le cookie sous workerd local, avec un secret opérateur généré localement. Les données de sonde sont nettoyées. Aucune requête de ces sondes ne doit viser le staging pendant la phase locale.

`pnpm dev` ouvre l'interface Next.js à `http://localhost:3000` pour travailler sur le visuel. Cette commande ne remplace pas le build OpenNext et les sondes workerd. Ne pas lancer `pnpm typecheck` pendant `pnpm build:web` : Next régénère ses types durant le build.

`pnpm check` lance le contrôle des frontières de runtime, les tests de contrats/fixtures et D1 local, puis TypeScript sur les packages et tests. Miniflare est épinglé à la version déjà utilisée par Wrangler ; son convertisseur d'options documenté dans les types installés est nécessaire avec cette version 5 alpha.

`node scripts/verify-clean.mjs` vérifie une copie sans `.env`, secrets, `node_modules`, base locale ni build préexistant. Il réutilise le cache pnpm hors ligne, lance l'installation, les contrôles, les migrations deux fois et le build. Le dossier temporaire est supprimé et les preuves restent dans `evidence/local/sprint-01/`.

## Interface

Les routes `/`, `/generer`, `/agence`, `/historique`, `/abonnement` et `/connexion` forment la coque du produit. L'inscription, l'enregistrement de la marque, la génération et le paiement restent explicitement indisponibles. Aucun faux compte, quota attribué ou job de démonstration n'est affiché. Le contrôle du lien ne vérifie que sa syntaxe et ne consulte aucune annonce. `/laboratoire` conserve l'état des preuves du projet.

Les choix commerciaux restent ceux du cadrage : SaaS payant, quotas par abonnement, une vidéo d'essai filigranée après inscription, charte enregistrée et aucun éditeur. Aucun tarif proposé n'est présenté comme une offre achetable.

## Environnements et secrets

| Environnement | Worker web | D1 | R2 | État |
|---|---|---|---|---|
| Local | `bienvu-web-probe-local` | `bienvu-probes-local`, ID nul réservé au local | `bienvu-probes-local` | Émulés sur le poste |
| Staging existant du sprint 00 | `bienvu-web-probe-staging` | `bienvu-s00-staging` | `bienvu-s00-private` | Déployés au sprint 00 ; pas mis à jour au sprint 01 |
| Production proposée | `bienvu-web-production` | `bienvu-production` | `bienvu-media-production` | Aucun service créé, aucun identifiant configuré |

`DB`, `MEDIA` et `ASSETS` sont les bindings web. `PROBE_MODE` identifie l'environnement. `GENERATIONS_ENABLED` vaut `false`. `PROBE_TOKEN` est un secret serveur dans `apps/web/.dev.vars` ; ne jamais l'exposer au client. Le pipeline garde `BROWSER`, `MEDIA`, `PROBE_TOKEN`, `RENDER_TOKEN` et les drapeaux existants, tous les appels réels désactivés. Les secrets de staging restent dans des fichiers distincts ignorés par Git.

`scripts/prepare-staging.mjs` prépare les configurations du sprint 00 uniquement, à partir d'un identifiant D1 explicite. Il ne déploie rien. Ne pas réutiliser la base ou le bucket de staging pour la production. R2 reste privé, sans `r2.dev` ni domaine public. Aucun accès direct R2 n'est exposé par la coque produit.

## Base et contrats

Les migrations préparent agences, annonces, médias, jobs, allocations, réservations, trace minimale d'essai, intentions de lancement, abonnements, événements de coût et arrêt des générations. Les liens métier utilisent des clés étrangères comprenant `agency_id`. Les index protègent l'idempotence et l'unicité du job actif. La migration `0003` rend exacte la comparaison du préfixe d'agence dans une clé média, même si l'identifiant contient `_`.

Les références jobs/réservations sont validées en fin de batch. Le test D1 utilise le vrai moteur local et prouve l'annulation complète d'un batch en erreur. Le flux métier de réservation/consommation/libération et les webhooks seront intégrés aux sprints 07–08 ; ces tables ne signifient pas qu'un quota public fonctionne déjà. Le schéma d'authentification du fournisseur reste au sprint 02 ; `owner_user_id` est son futur lien serveur.

`NormalizedListing` conserve les faits `verified`, `missing` ou `conflicting`. `GeneratableListing` exige identité vérifiée et trois photos distinctes ; il bloque les contradictions. Le prix est en centimes EUR, la surface en m² et le loyer explicitement mensuel avec indication des charges. `RenderManifest` vérifie portée des fichiers, références, dimensions, durée audio et filigrane d'essai. Les décisions de droits viendront du serveur authentifié, jamais du navigateur.

Les schémas du sprint 00 sont conservés pour ne pas casser ses sondes ; ils ne doivent pas être confondus avec le contrat produit. Les fixtures métier sont dans `fixtures/contracts.ts`, clairement synthétiques et jamais présentées comme un import réel. La validation d'URL du contrat est syntaxique : la protection DNS/redirections/sous-requêtes reste obligatoire au transport.

## Observabilité et arrêt

Les API créent leur propre UUID de requête et le renvoient via `X-Request-ID`. Les diagnostics acceptent seulement des champs connus : identifiant, état, durée, code, job et étape. Pas de headers, cookies, corps, URL ni stack dans les journaux applicatifs. La configuration Workers masque les query strings et désactive les journaux automatiques d'invocation ; les traces sont échantillonnées à 1 %. La diffusion distante de ces réglages n'a pas été faite.

`POST /api/generations` refuse toute création : `503 GENERATIONS_PAUSED` par défaut. Il faudrait à la fois `GENERATIONS_ENABLED=true` et `generation_control.enabled=1` pour passer la barrière de pause ; même dans ce cas, la route renvoie `401` tant que l'authentification n'est pas intégrée. Elle ne réserve aucun droit et n'appelle aucun fournisseur.

```sh
pnpm generations:pause
```

Cette commande coupe les générations dans la base **locale** ; aucun accès distant. Le journal de coûts est persistant, typé, dédupliqué, et refuse un replay contenant un montant différent. Estimation, réconciliation, frais fixes et prépaiement restent distincts ; aucun solde financier fiable ne peut être déduit d'un simple cumul de ces catégories.

## CI et limites

`.github/workflows/ci.yml` reproduit les contrôles locaux et le build, puis les sondes workerd, sans secrets externes ni déploiement. Aucun rendu Docker/Containers ou appel Browser Run, IA, TTS ou Stripe. La configuration GitHub Actions n'est considérée exécutée que si un résultat distant existe ; un passage local n'est pas un résultat GitHub.

Références vérifiées pour cette tranche : [clés étrangères D1](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/), [migrations D1](https://developers.cloudflare.com/d1/reference/migrations/), [journaux Workers](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) et [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/). La syntaxe exacte a aussi été contrôlée dans Wrangler 4.142.0 et les types Miniflare installés.
