# Sprint 00 — reprise avec Workers Paid

28 septembre 2026, Europe/Paris. Alex confirme un abonnement Cloudflare de 5 €. **Faisabilité technique Containers → R2 démontrée** : après quatre échecs, la cinquième tentative produit un MP4 de 30 s. Le même fichier est récupéré après correction du transfert, sans sixième rendu. Alex confirme sa lecture et son audio. Le conteneur est arrêté et les appels payants désactivés. **Facture réelle non consultée ; rapprochement financier restant.**

## Accès et périmètre

Wrangler 4.142.0 connecté au compte existant. Application `bienvu-render-probe-staging-renderer`, un seul `standard-2` (1 vCPU, 6 GiB, 12 GB), Worker `bienvu-render-probe-staging`, R2 `bienvu-s00-private`. Le déploiement réussi prouve l’accès Containers. R2 public désactivé, aucun domaine associé, rétention du préfixe `probes/` à 30 jours. Les Workers web/import existants et les bases des sprints 01–03 ne sont pas redéployés. Précontrôles (`docs/preuves/sprint-00/paid-resume/preflight.json`).

Images et signal sonore synthétiques ; aucun TTS, appel OpenAI, e-mail réel ou nouvelle collecte immobilière. Les requêtes Containers, les démarrages, les échecs et les arrêts sont **réels chez Cloudflare**. Les tests locaux ne sont pas présentés comme des rendus distants.

## Résultats constatés

| Tentative | Fixture | Résultat |
|---|---|---|
| `remote-short-20260928-01` | 6 s | Acceptée après 2,277 s ; lecture de statut en timeout. Après ajout du délai interne, `RENDER_STATE_LOST`. Aucun MP4 validé. |
| `remote-short-20260928-02` | 6 s | Accusé consommé et délai interne borné ; même perte de réponse. |
| `remote-short-20260928-03` | 6 s | Transport Worker → Durable Object passé en HTTP ; même échec. RPC n’est donc pas la cause démontrée. |
| `remote-short-20260928-04` | 6 s | Diagnostic exécuté dans le conteneur : même `/health` sur `127.0.0.1` ne répond pas, aucun fichier de rendu ni processus Chromium observé. |
| `remote-target-20260928-05` | 30 s | Nouvelle image avec calcul isolé : rendu vérifié en 105,940 s. Premier transfert R2 refusé ; récupération du même MP4 après correction du flux, empreinte vérifiée, aucun nouveau calcul. |

Tentatives conservées (`docs/preuves/sprint-00/paid-resume/attempts-before-final.json`), événements sans en-têtes ni données de connexion (`docs/preuves/sprint-00/paid-resume/diagnostic-events-sanitized.json`), diagnostic interne (`docs/preuves/sprint-00/paid-resume/exec-diagnostic.json`). Le SSH Wrangler et l’API de consultation des journaux n’ont pas permis une inspection : connexion SSH refusée, API observabilité 403. L’API des métriques reste accessible.

Les quatre premiers cycles se sont arrêtés : intervalles des hooks de 267,551 s, 60,428 s, 60,308 s et 60,287 s. Le dernier dure 300,184 s, dont le diagnostic du transfert et le sommeil final. Total des cinq intervalles : 748,758 s. Ils excluent un éventuel démarrage antérieur aux hooks et ne constituent pas une facture. Réservations conservées : 5 × 0,50 €. Arrêt final (`docs/preuves/sprint-00/paid-resume/controls-shutdown.json`).

## MP4 distant et arrêt vérifiés

Image réellement déployée : `sha256:c29ff3a2f658360229f362d21f3c9910bd1cb552ef6049ebf3e744fd04c9d8d1`, application version 2. Configuration fournisseur (`docs/preuves/sprint-00/paid-resume/application-process.json`). L’acceptation initiale prend 2,350 s ; le renderer mesure 105,940 s de calcul/vérification. Le premier état durable `ready` arrive après environ 272 s, **corrections de transfert comprises** : ce délai n’est pas une mesure de performance normale du pipeline.

- H.264/AAC, 1080×1920, 30 fps, 900 images ; durée du conteneur MP4 30,059 s ; 2 505 065 octets.
- SHA-256 : `048cf189ddd53dcce09e924358c082648d3a3a12848e7edcdf4cbc861a3fff45`, vérifié au dépôt R2 et après téléchargement.
- AAC décodé en PCM : −32,76 dBFS ; il s’agit d’un signal de recette, aucune voix off générée.
- Lecture pendant le démarrage : `accepted` conservé. Travail concurrent : 409 `RENDER_BUSY`. Lectures concurrentes du résultat terminé : même empreinte ; rejeu sans nouveau rendu ; fixture contradictoire refusée.
- Sixième identifiant refusé par 409 `SPRINT_RENDER_LIMIT`, sans démarrage ni réservation supplémentaire. Pause persistante puis `ALLOW_PAID_PROBES=false` ; nouveau travail refusé par 503 ; accès sans secret refusé par 401.
- Après sommeil, téléchargement du fichier privé réussi et état `stopped` inchangé. Aucun conteneur Docker local laissé actif.

Premier échec de transfert conservé (`docs/preuves/sprint-00/paid-resume/target-transfer-failed.json`), récupération et contrôles (`docs/preuves/sprint-00/paid-resume/target-recovered.json`), démarrage et concurrence (`docs/preuves/sprint-00/paid-resume/observe-final.json`), plafond et pause (`docs/preuves/sprint-00/paid-resume/controls-limit.json`). Les durées `acceptanceMs`/`completionMs` de la sonde de récupération concernent un **rejeu du résultat déjà calculé**, pas un deuxième rendu rapide.

Images du MP4 distant vues à 1, 15 et 29 s : textes et filigrane lisibles, pas de découpe observée. Alex répond **« Oui, image et son fonctionnent »** à la question portant sur la lecture des 30 secondes et le signal sonore de ce fichier précis. Recette humaine (`docs/preuves/sprint-00/paid-resume/human-review.json`). MP4 conservé hors Git : `evidence/remote/remote-target-20260928-05.mp4` ; objet privé `probes/renders/remote-target-20260928-05.mp4`, soumis à la rétention de 30 jours.

## Corrections et contrôles locaux

Appels internes au conteneur limités à 30 s, accusé d’acceptation consommé et validé, réponse de nettoyage libérée, journaux structurés de statut, transport HTTP pour les routes HTTP. La sonde attend l’échec interne avant son propre timeout et vérifie les lectures concurrentes d’un résultat, le refus sans jeton et les rejeux contradictoires.

Le serveur de rendu lance désormais le calcul dans un processus Node séparé. Il reste disponible pour servir le statut même si le calcul bloque ; une limite de 540 s tue le groupe de processus, et l’arrêt du serveur annule le calcul. Les erreurs et les 4 000 derniers caractères de diagnostic sont bornés. La nouvelle image réussit chez Cloudflare ; la cause précise du blocage initial n’est pas établie. Le diagnostic interne de la nouvelle image reçoit un HTTP 401 de `/health`, car le processus `exec` ne dispose pas du jeton de démarrage ; les lectures de statut authentifiées passent, et ce 401 démontre seulement que le serveur répond.

Le proxy Containers transforme le flux téléchargé : R2 refuse sa longueur inconnue, puis `pipeTo` entre deux flux transformés est refusé par le runtime distant. `storeRenderArtifact` copie donc les blocs avec lecteur/rédacteur vers un `FixedLengthStream`, borné par la taille validée, et laisse R2 vérifier SHA-256. Aucune mise en mémoire du MP4 complet. La correction du contrôleur est déployée sans reconstruire ni relancer le renderer. Événements expurgés (`docs/preuves/sprint-00/paid-resume/events-final-sanitized.json`), [API de flux Workers](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/).

La même image initiale répond aux requêtes HTTP dans Docker local ; le conteneur de diagnostic a été supprimé. Avec le nouveau serveur, un vrai MP4 **local** de 6 s est produit et vérifié en 81,741 s, avec un `/health` pendant le calcul en **2 ms**. H.264/AAC, 1080×1920, 30 fps, 735 464 octets, piste audio décodée à −32,79 dBFS. Preuve native (`docs/preuves/sprint-00/paid-resume/native-process-proof.json`).

Première vérification : 91 tests réussis (`docs/preuves/sprint-00/paid-resume/check-process.log`), frontières et types. Deux tests de processus vérifient un enfant bloqué, l’annulation, une sortie en erreur et un diagnostic borné. Le contrôle R2 supplémentaire s’exécute dans workerd local avec de vrais flux transformés et le stockage R2 local : succès, taille trop courte/trop longue et empreinte erronée. Régression ciblée (`docs/preuves/sprint-00/paid-resume/render-artifact-test.log`).

La première suite élargie échoue sur une connexion Miniflare réinitialisée et le délai de démarrage d’un enfant ; le Mac utilise alors environ 12,9 Go de swap. Les fichiers de tests sont désormais limités à deux exécutions simultanées. **96 tests réussis** après cette limitation ; types et frontières contrôlés dans le journal final (`docs/preuves/sprint-00/paid-resume/check-final.log`). L’échec sous charge (`docs/preuves/sprint-00/paid-resume/check-parallel-failed.log`) reste conservé. Aucun test CI GitHub exécuté pendant cette reprise.

## Budget

5 € déclarés par Alex ; provision fixe de 8 €, dont 3 € de marge de rapprochement, et 0,50 € par tentative. Les cinq tentatives portent l’engagement applicatif prudent à **10,50 €** et laissent **19,50 €** dans l’enveloppe de 30 €. Il ne s’agit pas de dépenses facturées. Plan et bornes (`docs/preuves/sprint-00/paid-resume/plan.json`), état final (`docs/preuves/sprint-00/paid-resume/controls-shutdown.json`).

Les métriques mensuelles Containers étaient vides avant la recette. Elles arrivent avec retard ; relevé avant le dernier essai (`docs/preuves/sprint-00/paid-resume/usage-before-final.json`). CPU, mémoire et disque provisionnés sont à comparer aux [tarifs Containers](https://developers.cloudflare.com/containers/platform/pricing/) ; le [jeu de données d’usage](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-container-metrics/) inclut les ressources de la micro-VM. L’accès aux abonnements/factures est refusé (403) et le navigateur n’est pas connecté : **facture non consultée**, aucun total TTC certifié.

Au relevé final de 08:36 UTC, le fournisseur retourne 8,2 vCPU-s, environ 2 400,079 GiB-s de mémoire et 4 800,158 GB-s de disque. Ces données ne sont pas encore rapprochées avec les cinq cycles ; leur complétude n’est pas confirmée. Ce seul relevé représente environ **0,00650 USD bruts**, avec **0 USD de dépassement estimé** sur les allocations Containers observées. L’hypothèse conservatrice de CPU plein sur les 748,758 s mesurées par les hooks donne **0,02684 USD de calcul brut**, hors démarrage antérieur aux hooks et autres frais. Ni l’un ni l’autre n’est le coût final TTC de la campagne. Calculs et exclusions (`docs/preuves/sprint-00/paid-resume/budget-final.json`), relevé fournisseur (`docs/preuves/sprint-00/paid-resume/usage-final.json`).

Le déploiement final (`docs/preuves/sprint-00/paid-resume/deployment-final.json`) conserve les nouveaux essais désactivés ; nettoyage et état arrêté (`docs/preuves/sprint-00/paid-resume/cleanup-final.json`). Le forfait reste actif sur le compte d’Alex ; cette recette ne le résilie pas.

## Limites restantes

La faisabilité technique du sprint 00 est démontrée sur ce cas synthétique. Un seul rendu distant abouti ne mesure pas la fiabilité statistique ni le coût d’une annonce réelle avec TTS. Le total fournisseur et la facture doivent être rapprochés avec les allocations du compte, les frais fixes, les autres services et les taxes ; voir le relevé financier final. Les sprints 01–03 ne sont pas déployés par cette recette.

Les cinq tentatives sont consommées : **ne pas remettre les compteurs à zéro pour poursuivre les essais**. Une nouvelle campagne doit avoir un périmètre et un budget explicites. La comparaison standard-3 reste un scénario non exécuté : 2 vCPU/8 GiB/16 GB, 0,0073344 USD pour 120 s à CPU plein, contre 0,0043008 USD en standard-2, hors forfait et autres frais. Aucune autre taille ou plateforme activée.
