# Fiabilité des crons — 23 octobre 2026

Sprint : isolation des tâches planifiées et équité de la réconciliation, sur la branche `codex/cron-reliability`. Périmètre autorisé : corrections et tests locaux ; narration exclue.

## Résultat utilisable

- Web quotidien : les neuf purges restent séquentielles, mais une erreur ne supprime plus les suivantes.
- Web minute : les six tâches restent concurrentes ; l’exécution attend tous les résultats et signale tous les échecs, pas uniquement le premier.
- Génération : les six opérations restent dans leur ordre actuel, avec récupération avant nettoyage. Une erreur de synchronisation Runway ne bloque plus réconciliation, avatars et purges. La lecture du solde reste indicative ; les garde-fous conservateurs de la file ne changent pas.
- Import : une seule tâche de purge existe ; son échec passe par le même diagnostic structuré.

Chaque invocation rejette après la fin des tâches si au moins une échoue. Le handler attend la promesse de l’orchestration, conformément à la [sémantique officielle des Scheduled Handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/#methods). Aucune nouvelle tentative automatique de toute l’invocation n’est ajoutée.

## Fichiers et décisions

`packages/observability/src/scheduled.ts` fournit l’exécution isolée, les listes blanches et l’envoi des exceptions via `posthog-node/edge` **5.55.1**, identique à la version web existante. Le package partagé déclare cette dépendance ; aucun nouveau paquet ni changement de version dans le lockfile, seulement ce lien supplémentaire. Pas d’API Node dans ce chemin. Une nouvelle exception ne contient que Worker, tâche et code sûr, jamais le message/cause du fournisseur ; son empreinte distingue Worker/tâche/code. Profils personnels et géolocalisation désactivés. Les échecs de livraison sont absorbés et journalisés. Les variables existantes contrôlent l’activation ; aucune variable ni aucun secret distant n’est modifié.

`reconcileBatch` écrit un curseur séparé avant chaque tentative et continue même après une erreur de lecture du job. Le lot reste borné à dix candidats, avec priorité aux lignes jamais contrôlées puis au contrôle le plus ancien. Les échecs HTTP de consultation du rendu sont désormais considérés comme des échecs de contrôle. Le lot ne masque plus ses erreurs : il les signale après toutes les lignes.

Migration **`0085_generation_reconciliation.sql`**, uniquement additive : table `generation_reconciliation_attempts(job_id,last_attempt_at)`, clé étrangère vers le job de génération et suppression en cascade. Création `IF NOT EXISTS`, répétée en recette. Aucun ancien SQL modifié. Publication future : migration sur la base cible **avant** le nouveau Worker de génération. Un retour au code précédent peut laisser la table en place.

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

## Limites et livraison

Coût des essais fournisseurs : **0 €**, fixtures et bindings locaux uniquement. Aucun commit, push, déploiement, migration distante ni appel fournisseur réel pour cette demande. La migration 0085 et les Workers doivent encore être publiés ensemble avant que la production bénéficie du correctif.
