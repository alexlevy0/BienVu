# Développement local

Les sprints 01–03 avancent en local à la demande d'Alex sans attendre la recette Containers du sprint 00. L'architecture retenue reste Next.js/OpenNext et Cloudflare. Cette avance ne valide pas le rendu hébergé ni le transport d’import Cloudflare.

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
pnpm probe:accounts
pnpm probe:imports
```

La première sonde vérifie les pages et le refus serveur des générations. La seconde vérifie réellement les bindings D1/R2 et le cookie sous workerd local, avec un secret opérateur généré localement. Les données de sonde sont nettoyées. Aucune requête de ces sondes ne doit viser le staging pendant la phase locale.

`pnpm dev` ouvre l'interface Next.js à `http://localhost:3000` pour travailler sur le visuel. Cette commande ne remplace pas le build OpenNext et les sondes workerd. Ne pas lancer `pnpm typecheck` pendant `pnpm build:web` : Next régénère ses types durant le build.

`pnpm check` lance le contrôle des frontières de runtime, les tests de contrats/fixtures et D1 local, puis TypeScript sur les packages et tests. Miniflare est épinglé à la version déjà utilisée par Wrangler ; son convertisseur d'options documenté dans les types installés est nécessaire avec cette version 5 alpha.

`node scripts/verify-clean.mjs` vérifie une copie sans `.env`, secrets, `node_modules`, base locale ni build préexistant. Il réutilise le cache pnpm hors ligne, lance l'installation, les contrôles, les migrations deux fois et le build. Le dossier temporaire est supprimé et les preuves restent dans `evidence/local/sprint-01/`.

## Fichiers à versionner

Conserver le code, les migrations, les tests, le lockfile, les modèles de configuration sans secrets et les fixtures synthétiques de `fixtures/imports/`. Les comptes rendus et procédures Markdown de `docs/preuves/` sont versionnés ; leurs journaux, JSON, captures et exports restent locaux. La [politique des preuves](preuves/README.md) précise où retrouver ces archives. `evidence/`, la couverture, les rapports de tests et les journaux sont ignorés, ainsi que les secrets, bases locales et builds déjà exclus. Un nouveau clone doit fonctionner sans ces sorties de recette.

## Interface

Pour s’inscrire sans confirmer une adresse en développement, utiliser `AUTH_EMAIL_VERIFICATION_BYPASS=true` dans `apps/web/.dev.vars`, puis redémarrer `pnpm preview`. Le compte est marqué vérifié et connecté automatiquement. La valeur versionnée reste `false` ; le bypass ne fonctionne que sur localhost/127.0.0.1 en mode local. [Configuration et recette](AUTHENTIFICATION.md#bypass-de-vérification-pour-le-développement).

L’authentification propose maintenant e-mail/mot de passe **et** Google, sur demande d’Alex. Le binding `AUTH_EMAIL` s’ajoute aux bindings web. Sa configuration locale capture les messages sans les envoyer : ouvrir le fichier `Text: …/email-text/….txt` indiqué par Wrangler pour confirmer l’adresse. La sonde `probe:auth-email` nécessite le journal du serveur via `BIENVU_PREVIEW_LOG` ; procédure et limites dans [AUTHENTIFICATION.md](AUTHENTIFICATION.md). La migration `0005_auth_mail_limits.sql` ajoute les plafonds d’envoi. `AUTH_EMAIL_MODE` et `AUTH_EMAIL_FROM` sont publics côté configuration, les jetons des messages restent secrets. En staging, le script de préparation ferme l’envoi par défaut ; un expéditeur vérifié et Workers Paid sont nécessaires.

Les routes `/`, `/generer`, `/agence`, `/historique`, `/abonnement` et `/connexion` forment la coque du produit. Les comptes et la marque sont implémentés au sprint 02 ; le bouton Google attend ses identifiants OAuth. Le sprint 03 ajoute un import authentifié réel en local, avec galerie privée et relecture des résultats. Lancer `pnpm dev:imports` en plus du preview ; le pont natif ne fonctionne que sur loopback avec son secret local. Les sondes utilisent explicitement des comptes synthétiques nettoyés ensuite. La génération et le paiement restent indisponibles, sans quota attribué ni job de démonstration. `/laboratoire` conserve les preuves techniques du sprint 00. [Configuration, limites et purge des imports](IMPORTS.md).

Les choix commerciaux restent ceux du cadrage : SaaS payant, quotas par abonnement, une vidéo d'essai filigranée après inscription, charte enregistrée et aucun éditeur. Aucun tarif proposé n'est présenté comme une offre achetable.

## Environnements et secrets

| Environnement | Worker web | D1 | R2 | État |
|---|---|---|---|---|
| Local | `bienvu-web-probe-local` | `bienvu-probes-local`, ID nul réservé au local | `bienvu-probes-local` | Émulés sur le poste |
| Staging existant du sprint 00 | `bienvu-web-probe-staging` | `bienvu-s00-staging` | `bienvu-s00-private` | Déployés au sprint 00 ; pas mis à jour aux sprints 01–03 |
| Production proposée | `bienvu-web-production` | `bienvu-production` | `bienvu-media-production` | Aucun service créé, aucun identifiant configuré |

`DB`, `MEDIA` et `ASSETS` sont les bindings web. `PROBE_MODE` identifie l'environnement. `GENERATIONS_ENABLED` vaut `false`. `PROBE_TOKEN` est un secret serveur dans `apps/web/.dev.vars` ; ne jamais l'exposer au client. Le pipeline garde `BROWSER`, `MEDIA`, `PROBE_TOKEN`, `RENDER_TOKEN` et les drapeaux existants, tous les appels réels désactivés. Les secrets de staging restent dans des fichiers distincts ignorés par Git.

`scripts/prepare-staging.mjs` prépare les configurations à partir d'un identifiant D1 explicite et, pour l'authentification, d'une origine HTTPS dédiée. Il ne déploie rien. Ne pas réutiliser la base ou le bucket de staging pour la production. R2 reste privé, sans `r2.dev` ni domaine public. Aucun accès direct R2 n'est exposé par la coque produit.

`IMPORT_MODE` reste `disabled` dans les configurations versionnées et de staging. `setup:local` ajoute `IMPORT_MODE=local` et un `LOCAL_IMPORT_TOKEN` aléatoire dans `.dev.vars`. La migration `0006_private_imports.sql` crée imports, journal de fichiers et plafonds persistants ; `pnpm imports:cleanup` purge uniquement la base et les objets locaux éligibles. L’authentification existante continue de s’appliquer aux photos et annonces. Aucun module Sharp ou HTTPS Node n’est importé dans le Worker.

## Base et contrats

Les migrations préparent agences, annonces, médias, jobs, allocations, réservations, trace minimale d'essai, intentions de lancement, abonnements, événements de coût et arrêt des générations. Les liens métier utilisent des clés étrangères comprenant `agency_id`. Les index protègent l'idempotence et l'unicité du job actif. La migration `0003` rend exacte la comparaison du préfixe d'agence dans une clé média, même si l'identifiant contient `_`.

Les références jobs/réservations sont validées en fin de batch. Le test D1 utilise le vrai moteur local et prouve l'annulation complète d'un batch en erreur. Le flux métier de réservation/consommation/libération et les webhooks seront intégrés aux sprints 07–08 ; ces tables ne signifient pas qu'un quota public fonctionne déjà. La migration `0004` ajoute Better Auth, les protections des logos et la limitation des écritures. `owner_user_id` est déduit de la session vérifiée ; les identifiants fournis par le client sont refusés. Configuration et recette OAuth restante : [AUTHENTIFICATION.md](AUTHENTIFICATION.md).

`NormalizedListing` conserve les faits `verified`, `missing` ou `conflicting`. `GeneratableListing` exige identité vérifiée et trois photos distinctes ; il bloque les contradictions. Le prix est en centimes EUR, la surface en m² et le loyer explicitement mensuel avec indication des charges. `RenderManifest` vérifie portée des fichiers, références, dimensions, durée audio et filigrane d'essai. Les décisions de droits viendront du serveur authentifié, jamais du navigateur.

Les schémas du sprint 00 sont conservés pour ne pas casser ses sondes ; ils ne doivent pas être confondus avec le contrat produit. Les fixtures métier sont dans `fixtures/contracts.ts`, clairement synthétiques et jamais présentées comme un import réel. La validation d'URL du contrat est syntaxique : la protection DNS/redirections/sous-requêtes reste obligatoire au transport.

## Observabilité et arrêt

Les API créent leur propre UUID de requête et le renvoient via `X-Request-ID`. Les diagnostics acceptent seulement des champs connus : identifiant, état, durée, code, job et étape. Pas de headers, cookies, corps, URL ni stack dans les journaux applicatifs. La configuration Workers masque les query strings et désactive les journaux automatiques d'invocation ; les traces sont échantillonnées à 1 %. La diffusion distante de ces réglages n'a pas été faite.

`POST /api/generations` refuse toute création : `503 GENERATIONS_PAUSED` par défaut. Il faudrait à la fois `GENERATIONS_ENABLED=true` et `generation_control.enabled=1` pour passer la barrière de pause ; même dans ce cas, la route renvoie `401` tant que le pipeline de génération n'est pas branché aux sessions produit. Elle ne réserve aucun droit et n'appelle aucun fournisseur.

```sh
pnpm generations:pause
```

Cette commande coupe les générations dans la base **locale** ; aucun accès distant. Le journal de coûts est persistant, typé, dédupliqué, et refuse un replay contenant un montant différent. Estimation, réconciliation, frais fixes et prépaiement restent distincts ; aucun solde financier fiable ne peut être déduit d'un simple cumul de ces catégories.

## CI et limites

`.github/workflows/ci.yml` reproduit les contrôles locaux et le build, puis les sondes workerd, sans secrets externes ni déploiement. Aucun rendu Docker/Containers ou appel Browser Run, IA, TTS ou Stripe. La configuration GitHub Actions n'est considérée exécutée que si un résultat distant existe ; un passage local n'est pas un résultat GitHub.

Références vérifiées pour cette tranche : [clés étrangères D1](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), [batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/), [migrations D1](https://developers.cloudflare.com/d1/reference/migrations/), [journaux Workers](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) et [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/). La syntaxe exacte a aussi été contrôlée dans Wrangler 4.142.0 et les types Miniflare installés.

Les secrets `BETTER_AUTH_SECRET` et `GOOGLE_CLIENT_SECRET` restent côté serveur. `BETTER_AUTH_URL` est une origine exacte ; `GOOGLE_CLIENT_ID` identifie le client OAuth. La sonde comptes fonctionne sans accès Google. Consulter [le rapport du sprint 02](preuves/sprint-02/RAPPORT.md) pour distinguer ces fixtures de la connexion réelle encore non validée.
