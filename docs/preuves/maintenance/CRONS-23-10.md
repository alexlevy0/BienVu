# Fiabilité des crons — 23 octobre 2026

Sprint : isolation des tâches planifiées et équité de la réconciliation, préparé sur la branche `codex/cron-reliability`. Corrections et tests locaux, puis commit, push et publication avec 0085 autorisés explicitement ; narration exclue.

## Résultat utilisable

- Web quotidien : les neuf purges restent séquentielles, mais une erreur ne supprime plus les suivantes.
- Web minute : les six tâches restent concurrentes ; l’exécution attend tous les résultats et signale tous les échecs, pas uniquement le premier.
- Génération : les six opérations restent dans leur ordre actuel, avec récupération avant nettoyage. Une erreur de synchronisation Runway ne bloque plus réconciliation, avatars et purges. La lecture du solde reste indicative ; les garde-fous conservateurs de la file ne changent pas.
- Import : une seule tâche de purge existe ; son échec passe par le même diagnostic structuré.

Chaque invocation rejette après la fin des tâches si au moins une échoue. Le handler attend la promesse de l’orchestration, conformément à la [sémantique officielle des Scheduled Handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/#methods). Aucune nouvelle tentative automatique de toute l’invocation n’est ajoutée.

## Fichiers et décisions

`packages/observability/src/scheduled.ts` fournit l’exécution isolée, les listes blanches et l’envoi des exceptions via `posthog-node/edge` **5.55.1**, identique à la version web existante. Le package partagé déclare cette dépendance ; aucun nouveau paquet ni changement de version dans le lockfile, seulement ce lien supplémentaire. Pas d’API Node dans ce chemin. Une nouvelle exception ne contient que Worker, tâche et code sûr, jamais le message/cause du fournisseur ; son empreinte distingue Worker/tâche/code. Profils personnels et géolocalisation désactivés. Les échecs de livraison sont absorbés et journalisés. Les variables existantes contrôlent l’activation ; aucune variable ni aucun secret distant n’est modifié.

`reconcileBatch` écrit un curseur séparé avant chaque tentative et continue même après une erreur de lecture du job. Le lot reste borné à dix candidats, avec priorité aux lignes jamais contrôlées puis au contrôle le plus ancien. Les échecs HTTP de consultation du rendu sont désormais considérés comme des échecs de contrôle. Le lot ne masque plus ses erreurs : il les signale après toutes les lignes.

Migration **`0085_generation_reconciliation.sql`**, uniquement additive : table `generation_reconciliation_attempts(job_id,last_attempt_at)`, clé étrangère vers le job de génération et suppression en cascade. Création `IF NOT EXISTS`, répétée en recette. Aucun ancien SQL modifié. La migration est appliquée sur la base cible **avant** le nouveau Worker de génération. Un retour au code précédent peut laisser la table en place.

Le corps de `GenerationWorkflow` est comparé octet pour octet à `HEAD` : inchangé. Étapes, noms, retries et connecteurs de narration restent identiques. La réconciliation continue à utiliser les intentions de lancement et les checkpoints existants ; aucun nouveau débit, réservation ni appel fournisseur n’est introduit.

## Tests et résultats

Les neuf nouveaux tests couvrent :
- Neuf tâches échouées : neuf diagnostics et neuf événements d’exception, sans limite silencieuse à cinq ni contenu privé.
- Télémétrie indisponible : les tâches suivantes s’exécutent quand même.
- Tâches concurrentes : attente d’une tâche lente et collecte de deux échecs, dont un synchrone.
- Vrais handlers web quotidien/minute dans workerd : échec au milieu, autres tâches tentées et invocation marquée en échec.
- Vrai handler de génération dans workerd : échec au milieu puis échec de Runway en tête ; réconciliation et nettoyage toujours tentés.
- Vrai handler d’import dans workerd : purge en échec correctement signalée.
- D1 réel local : onze générations, dix erreurs persistantes dont une erreur de lecture D1. La onzième est lancée au deuxième passage et une seule fois ; les autres lignes continuent à tourner. Allocations, réservations, budget, journal de narration et dates métier inchangés. Migration répétée et clés étrangères valides.

Les tâches métier des tests de handlers sont remplacées à leur frontière d’import ; les handlers, l’orchestration et le SDK edge sont réels. Le test d’équité utilise les vraies migrations, admissions et lectures D1, avec un lancement de Workflow simulé. Les requêtes sortantes PostHog sont interceptées localement. Aucun fournisseur payant, email ni événement synthétique envoyé à un compte réel.

**914 cas distincts validés, dont neuf nouveaux**. Premier `pnpm check` : **914/914** tests réussis, puis arrêt sur le typage du nouveau banc de test (API Miniflare et méthodes de tableau ES2023 dans un projet ES2022). Typage corrigé ; reprise ciblée **9/9**, puis nouveau passage complet **895/914**. Les **19 échecs** de ce second passage contiennent tous `connect EADDRNOTAVAIL 127.0.0.1`, dans les tests Runway, SEO et vitrines. Les trois fichiers concernés ont été rejoués avec `--test-concurrency=1` : **39/39**, sans échec. Il s’agit de connexions du banc local, sans appel Runway réel. Les deux commandes `pnpm check` ne sont donc pas enregistrées comme des exécutions intégrales vertes.

Résultats finaux : `pnpm typecheck` complet (workspaces et tests), lint sans avertissement, formatage et frontières réussis. Compilation autonome du module de télémétrie avec `platform: browser`, sans externalisation Node : réussie. Installation figée hors ligne et audit des dépendances réussis, aucune vulnérabilité connue remontée par le registre.

Build Next/OpenNext final réussi via `pnpm --filter @bienvu/web build:worker`, avec `WEBPACK=1`, release locale `cron-local-ffa5812` et clé personnelle PostHog retirée de l’environnement : même compilation de production que le script racine, sans envoi de sourcemaps à un compte réel. L’avertissement esbuild tiers `fast-png` sur `??` reste non bloquant et préexistait. Aucun nouveau build n’est annoncé comme publié.

Commandes et rapports bruts conservés sous `evidence/local/cron-reliability/`, ignorés par Git : passages complets, reprise ciblée, reprise série, types, build et contrôle du périmètre.

## Publication vérifiée

Commit **`e88b39c7f6a59fcd452d977513a493e48f94bbab`** poussé sur `main`, release web **`e88b39c7f6a5`** publiée sur `bienvu.online`. Build racine `pnpm build:web` réussi avec sourcemaps privées PostHog EU, puis préparation du module final et publication `no_bundle`, `--keep-vars --strict`. Les deux Workers de pipeline sont publiés avec `--containers-rollout none` et les images immuables existantes.

Versions actives à **100 %**, modules distants identiques par SHA-256 aux bundles locaux vérifiés :

| Worker                          | Version Cloudflare                     | Bindings / secrets |
| ------------------------------- | -------------------------------------- | ------------------ |
| `bienvu-web-probe-staging`      | `e0b330df-b246-4eb6-ba98-129cfb7f53e8` | 64 / 23            |
| `bienvu-generation-development` | `0803893d-e2a5-40ae-af7e-2243fe281dcb` | 36 / 10            |
| `bienvu-import-staging`         | `5ed80873-a357-4754-a9b3-b485fb89c277` | 9 / 2              |

Configuration distante, secrets, domaines et crons comparés aux relevés précédant la publication : conservés, hors les deux identifiants web de release/sourcemap attendus. Renderer **v37**, import **v8** et les autres conteneurs inchangés. Workers mail et narration non redéployés ; version narration toujours **`65002047-58a8-4501-8a19-92b7bc627bf4`**. Le corps de `GenerationWorkflow` reste identique à celui de `ffa5812` (SHA-256 **`82aa4d266475f48967a40480ebf03c53d0da45db6b3d52e829331361243c6f8c`**).

Avant migration : seule 0085 en attente, aucun job actif. Sauvegarde SQL complète de D1 **`bienvu-s00-staging`**, **9 963 783 octets**, SHA-256 **`fce942bf816477da365002f48b92bd026d04d6b85341e8f80641057f01b83d19`**. Restauration SQLite et application répétée de 0085 : **164 tables / 9 455 lignes** existantes identiques, passage à **165 tables**, intégrité et clés étrangères valides. Application distante par le journal Wrangler : 0085 enregistrée **une seule fois**, table et clé étrangère conformes, aucun échec `foreign_key_check`. Schémas des **163 tables métier** existantes conservés ; **16 tables / 424 lignes** de crédits, budgets, jobs, intentions de lancement et narration comparées avant/après : identiques. Publication inscrite dans l’historique du superadmin.

Contrôles du domaine : pages **200**, accès privés **401**, redirection Beta **302**, release HTML/RSC cohérente, deux scripts publics identiques aux assets locaux et leurs maps **404**. **51 pages SEO** validées. Recette Chromium à **1536 et 390 px**, mensuel/annuel : aucun débordement ni erreur JavaScript. Offres inchangées, dont Solo **50 € / 50 crédits** ; Stripe reste en mode test.

Observation passive des journaux pendant cinquante secondes : une invocation naturelle du cron web minute sur la version publiée, résultat **`ok`**, aucune exception. Aucune invocation génération/import dans cette courte fenêtre ; cela ne constitue pas une recette distante de ces deux crons ni de la purge web quotidienne. Leur isolation et la rotation sont couvertes par les tests locaux workerd/D1 décrits plus haut.

[CI sécurité du commit publié](https://github.com/alexlevy0/BienVu/actions/runs/40028741843) réussie. [CI fonctionnelle](https://github.com/alexlevy0/BienVu/actions/runs/40028741868) intégralement réussie : **914/914 tests**, typage, migrations rejouées, build et sondes du Worker validés.

Preuves et configurations privées ignorées sous `evidence/local/cron-deploy/` : sauvegarde, répétition de migration, relevés Cloudflare, builds, comparaisons des modules/configurations, invariants D1, sondes et captures navigateur. Coût des essais fournisseurs : **0 €**. Aucun appel de génération payant ni envoi d’email déclenché pour la recette. Les crons distants ne sont pas invoqués artificiellement et les erreurs historiques PostHog ne sont pas déclarées résolues par cette publication.
