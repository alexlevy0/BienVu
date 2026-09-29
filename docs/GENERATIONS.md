# Génération durable — accès de développement

Sprint 07 : URL ou annonce manuelle sauvegardée → import → texte → voix → rendu → vidéo privée. L'essai public et Stripe restent au sprint 08. Aucun éditeur vidéo n'est ajouté.

## Admission et droits

`POST /api/generations` accepte exactement `{url}` ou `{listingId}`, avec `Idempotency-Key` (16–128 caractères). La session vérifiée détermine l'agence ; origine et corps sont contrôlés. Le service privé nécessite aussi un secret serveur. Même clé/corps = même job, y compris après pause ; une autre entrée avec la même clé reçoit 409.

La migration 0014 ne donne aucun droit par défaut. `generation_access` référence une allocation de développement créée par l'opérateur. L'admission vérifie la propriété, le contrat et les photos de l'annonce sauvegardée ; le Workflow relit leurs octets et empreintes avant les fournisseurs. La marque est figée à l'admission. Une transaction SQL réserve simultanément un crédit, le job, 1,20 € de provision, et l'intention de lancement. Un slot global protège cette phase de développement, avec 5 admissions/jour UTC et 30/mois au maximum. Les imports conservent leur limite distincte de 10/jour UTC et 30/mois. Si le plafond d’import est déjà atteint, une admission URL est refusée avant la provision vidéo. `GET /api/me` expose `importRetryAt` pour afficher la date de reprise ; une annonce sauvegardée peut être réutilisée sans nouvel import. Une saisie manuelle nouvelle reste soumise au plafond d’import.

Le budget de 1,20 € couvre au maximum 0,70 € de texte/voix (14 appels de 0,05 €) et 0,50 € de rendu. L'import URL réserve séparément 0,50 € avant le réseau. Ces provisions restent comptées après échec : libérer un crédit vidéo ne rembourse pas les fournisseurs. Les plafonds D1, narration et renderer se cumulent ; aucune gratuité supposée ne crée un crédit.

## Exécution et reprise

`GenerationWorkflow` utilise un identifiant `generation-<jobId>`. L'intention D1 est créée avant `createBatch`, idempotent côté Cloudflare ; le cron de cinq minutes réconcilie au plus dix candidats. Une perte de réponse au lancement ne recrée ni le job ni son allocation.

Les étapes sont durables. La narration conserve son snapshot, son script, son journal d'appels et ses WAV vérifiés. Une réponse fournisseur incertaine n'est pas rappelée aveuglément. Le rendu utilise un manifeste immuable, copie les assets sous la clé du job et n'accepte jamais une URL arbitraire. Le Workflow soumet le rendu puis attend par `step.sleep`, sans garder ouverte une requête du site. Une reprise de transport au maximum ; aucun nouveau calcul automatique après perte du conteneur. Délai global 15 minutes, rendu borné à 10 minutes, processus d'encodage borné à 540 secondes.

Le cron peut publier un MP4 déjà terminé sans reprendre le calcul. À l'expiration, il arrête le calcul avant de libérer le quota. Si l'arrêt n'est pas confirmé, la réservation reste détenue pour une prochaine réconciliation. Un identifiant annulé est conservé comme tombstone dans le contrôleur : une soumission tardive ne redémarre pas le rendu. D1 interdit de rouvrir un job terminal. Publication de l'artefact et consommation définitive du crédit sont atomiques.

## Interface et médias

`/generer` propose l'URL et le formulaire manuel dépliable, affiche les étapes réelles, retrouve le dernier job et permet de fermer la page. Le bouton de saisie manuelle annonce explicitement la création de la vidéo lorsque l'agence est autorisée. Les annonces sauvegardées restent utilisables.

`/historique` utilise une pagination par date/id (20 résultats), affiche les traitements en cours et lit le MP4 privé. `GET/HEAD /api/generations/:id/video` contrôle agence, statut prêt, crédit consommé, date d'expiration, taille et empreinte R2. Range simple/suffixe, 206 et 416 sont pris en charge. Le téléchargement sert exactement le même objet et ne déclenche aucun fournisseur. Disponibilité annoncée : sept jours ; voix synthétique explicitement indiquée. Le téléphone physique/Safari reste distinct de la recette Chromium mobile émulée.

## Exploitation

- `pnpm generations:pause` : D1 locale ; ajouter `--remote` pour mettre explicitement en pause les nouvelles étapes sur bienvu.online. Les vidéos prêtes restent lisibles.
- `POST /operator/pause` et `/operator/reconcile` sur le service de génération nécessitent le secret interne. Le web ne relaie pas ces routes. `/operator/state` expose uniquement à l'opérateur le slot, le budget, l'état du conteneur et sa dernière durée.
- Les tables `generation_runs`, `jobs`, `job_launch_intents`, `narration_calls`, `hosted_import_costs` et `generation_artifacts` rendent consultables entrée figée, étape, dates, erreur, réservations et mesures fournisseurs. Les journaux ne publient ni clé, ni prompt, ni coordonnées.
- `pnpm probe:generations status` inspecte uniquement la campagne isolée décrite dans son fichier local ignoré. `scripts/deploy-generations-development.mjs` documente le déploiement contrôlé de septembre, sans recharger une allocation existante ; il refuse un autre mois.
- Les configurations distantes, identifiants, comptes de recette et vidéos sont ignorés par Git. Les migrations et rapports expurgés sont versionnables. Les sprints 08/09 doivent encore gérer abonnement, essai unique public et exploitation commerciale.

Sources officielles consultées le 28/09 : [règles de Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/), [API Workers](https://developers.cloudflare.com/workflows/build/workers-api/), [limites](https://developers.cloudflare.com/workflows/reference/limits/), [tarification](https://developers.cloudflare.com/workflows/reference/pricing/). Workflows n'est pas supposé gratuit : requêtes, CPU et stockage sont inclus dans les provisions de la campagne.
