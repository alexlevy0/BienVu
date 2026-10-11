# Lecture pendant l’assemblage — 11 octobre 2026

## Fonctionnement livré

Pendant l’assemblage, le lecteur charge automatiquement les premières secondes et affiche ses commandes de lecture dès que le flux est disponible. Aucun bouton d’activation intermédiaire : la lecture reste volontaire dans le lecteur. Le flux avance par segments de deux secondes. Lorsque le bloc suivant manque, le lecteur garde la dernière image et affiche « Assemblage de la suite… ». Il reprend sans revenir au début ; une pause volontaire reste une pause.

Les photos, animations Runway, carte, voix et avatar doivent être préparés avant cette étape. Le streaming ne supprime donc pas cette attente initiale. Le démarrage de la lecture est volontaire. Le MP4 complet et son téléchargement restent disponibles à la fin. Une interruption du flux peut être récupérée par le MP4 final en conservant la position de lecture.

## Architecture et protections

- Remotion 4.0.529 et quatre frames parallèles sont conservés. Le mix audio exact est préparé avant le rendu des images. Les images sont rendues une seule fois, avec le même encodeur épinglé et des fragments MP4 fermés tous les 60 frames.
- Un lecteur serveur suit ce fichier avec un descripteur ouvert, y compris si Remotion efface son répertoire temporaire. FFmpeg convertit les paquets H.264 existants en HLS avec le son. Seul l’aperçu anonyme subit une conversion avec filigrane, en `veryfast` comme l’ancienne conversion finale.
- Les segments terminés sont transférés en R2 avec leur SHA-256 contrôlé. Le manifeste n’est publié qu’après les objets qu’il référence ; les reprises ne peuvent pas réduire la liste ni remplacer un segment déjà publié. Les sondes du contrôleur passent à deux secondes.
- Les routes `/api/generations/[id]/stream` et `/api/trial/[id]/stream` vérifient respectivement l’agence connectée et la session anonyme. Aucun média maître anonyme n’est exposé par ce flux. Les essais avec filigrane le conservent également.
- Contrats bornés : noms de fichiers séquentiels, pas d’URL ni de chemin libre, au plus 20 segments/60 MiB au total, et 16 MiB par segment, durée validée contre le manifeste figé. État échoué ou droit expiré : accès fermé. Réponses privées sans cache partagé.
- Les objets dérivés sont sous `progressive/`, avec expiration R2 à un jour et refus des manifestes de plus de 24 heures. Les deux règles de cycle de vie existantes sont conservées. Les MP4 permanents sont ailleurs.
- HLS.js 1.7.3 est chargé automatiquement à la disponibilité du premier segment ; la première image est préchargée sans démarrer la lecture. Il est utilisé lorsque MediaSource est disponible ; la lecture native sert de repli. Les moteurs et requêtes sont arrêtés à la sortie du composant. Un échec de la prévisualisation ne relance pas le rendu et ne doit pas bloquer le MP4.
- Aucune migration SQL, aucun nouveau service fournisseur ni nouveau tarif de crédits produit.

## Recette

Deux tests progressifs avec workerd, D1 et R2 : intégrité, publication atomique, reprise, accès d’une autre agence refusé, chemins rejetés, droits de filigrane, durée complète, manifeste complet non réversible et fermeture sur échec. Deux tests du contrôleur vidéo passent aussi. Les cinq tests existants de stockage/admission/préparation/contrôleur avaient passé en début de recette. Types renderer/pipeline/web/tests, frontières sur 516 fichiers, build OpenNext et bundle de production du pipeline passent.

Deux rendus réels de l’image finale sur Cloudflare standard-4, utilisateur Linux non privilégié, quatre frames parallèles. Médias déjà stockés réutilisés : aucun nouvel appel d’import, Cartesia, Runway ou HeyGen, ni génération cliente créée. La source chargée dans le conteneur est comparée au dépôt par SHA-256.

| Cas réel de 20 s | Premier segment observé | MP4 vérifié | Flux |
|---|---:|---:|---|
| 12 photos et carte satellite, aperçu anonyme | 22,36 s | 53,18 s | 10 × 2 s, son et filigrane |
| 12 photos, carte et avatar continu | 41,11 s | 77,19 s | 10 × 2 s, son |

Temps depuis le lancement de l’assemblage, hors préparation des fournisseurs, démarrage du conteneur et transfert de ses sources. Observation par sondes, donc précision limitée à leur intervalle et au réseau. Ces mesures ne constituent pas une promesse de délai pour toutes les annonces.

Masters H.264/AAC, 1080 × 1920, 600 frames à 30 fps, fast-start et sommes SHA-256 validés. L’aperçu anonyme final réutilise les segments filigranés par simple remux, sans deuxième conversion ; durée 20,032 s. La carte et l’avatar sont des médias réels précédemment préparés, sans nouvelle génération de fournisseur.

Les vrais segments téléchargés servent ensuite à la recette des composants à 1 536, 390 et 320 px : démarrage au premier bloc, attente autour de 1,95 s, reprise du bloc suivant, pause manuelle conservée, récupération par le MP4 avec position conservée et absence de débordement. Captures desktop/mobile inspectées, filigrane visible. Fin et relecture d’un flux complet également contrôlées. Les essais mobiles utilisent Chromium avec dimensions et interactions mobiles ; Safari/iPhone natif reste à confirmer sur appareil.

Une première méthode remplaçant l’encodeur Remotion par FFmpeg système a été rejetée : lenteur et échec du mux final. Un second essai a été interrompu par le déploiement progressif de l’image de test ; le motif Cloudflare a été retrouvé. Ces essais ne sont pas présentés comme des recettes réussies. La dernière recette attend la fin du déploiement et vérifie le code effectivement chargé.

Calcul brut conservateur des deux sessions finales : **0,01811 USD**, avant quotas inclus, opérations, taxes et conversion monétaire. Deux essais préparatoires ont aussi utilisé le conteneur ; borne globale prudente de **0,20 USD** pour la recette, avec arrêts bornés. Aucun débit de crédits utilisateur ni appel de génération fournisseur. Ce calcul ne représente pas une facture Cloudflare.

## Première publication et exploitation

Web `0dd0611a-9d05-408c-9b82-0238f90119b0` et pipeline `9b8ea5e8-eb42-4d01-b27d-f156e3124127`, à 100 %. Image finale `sha256:a4fed511b079581fe55654be33fc9118ba933afc846322c34188fcac821cc92f`, dérivée de l’image de production vérifiée avec remplacement des seules sources renderer/contrats. La composition et les dépendances natives épinglées sont conservées ; un rebuild complet avec le Dockerfile standard reste possible, mais celui de cette recette a été arrêté pendant le bundling, avant le recours à l’image dérivée. Application renderer version 29, quatre vCPU/12 GiB/20 GB et une seule instance.

Admissions temporairement suspendues au repos pendant la mise à jour de l’image, puis restaurées à leur valeur précédente après sa fin, sans interrompre de job client. Le contrôle après publication a détecté le nom local du Workflow dans la configuration générique : il a été réconcilié avec `bienvu-generation-development` et republié sans relancer la mise à jour Containers. Les 60 bindings web et 32 pipeline sont comparés à leur état initial et conservés ; seuls les identifiants de release/symboles PostHog changent normalement au build. Budget d’octobre inchangé. Sourcemaps privées Next/Worker envoyées à PostHog, aucune source native dans le bundle web.

Worker et application du banc de test supprimés, absence vérifiée. Les preuves privées, journaux, vidéos et configurations réconciliées sont sous `evidence/local/progressive-video/`. Aucun secret versionné ; aucun commit/push dans cette livraison.

En cas de régression, le lecteur peut attendre le MP4 final lorsque le flux manque. Pour un retour complet, utiliser la version précédente du Worker web et restaurer ensemble le pipeline `fea4eaa8-cf67-4532-b906-5b3de07eba79` et son image `sha256:39025077f12199e18e37b01dde26c91d5659cc64210cf3102cf9b6ed0e21f827`, au repos et avec les bindings courants. Un rollback de Worker seul ne restaure pas l’image Containers. La règle `progressive/` peut rester pour nettoyer les objets temporaires.

## Correction du lecteur et des vues détaillées — 11 octobre 2026

Le lecteur natif remplace le bouton « Voir la vidéo en cours d’assemblage ». HLS est attaché dès la disponibilité du flux et charge la première image avant toute interaction. Les commandes deviennent directement utilisables. L’arrivée du MP4 avant la première lecture conserve la pause ; après un démarrage, elle conserve un flux sain sans retour au début. Le repli après attente ou erreur restaure la position et l’intention de lecture. Le démontage annule les imports en attente et détruit le moteur.

La génération cliente la plus récente terminait bien son MP4 mais ne publiait aucun objet `progressive/`. Un rejeu isolé avec ses médias existants reproduit le motif : `VIDEO_STREAM_INVALID`, premier segment satellite de **8 628 636 octets**, au-dessus de l’ancien plafond de 8 MiB. Le plafond par segment passe à **16 MiB**, avec la même constante partagée entre lecture renderer et contrat. Le plafond total reste à **60 MiB**, avec 20 segments au maximum, durées, SHA-256, droits et chemins toujours contrôlés. Aucun réglage de qualité du MP4 n’est abaissé.

**Validation :** trois tests ciblés passent, dont lecture/hash d’un segment de cette taille, refus d’un segment de plus de 16 MiB et du dépassement du total. Types web/pipeline/renderer/tests, frontières 516 fichiers et build OpenNext passent. Les composants réels sont contrôlés à 1 536, 390 et 320 px avec des segments réels : première image sans clic, commandes natives, lecture volontaire, attente/reprise, pause conservée, repli avec position et fin/relecture. Un clic sur la commande native et l’arrivée du MP4 avant la première lecture sont également vérifiés. Captures inspectées ; Safari/iPhone natif reste à confirmer sur appareil.

Le même assemblage de **40 secondes** est rejoué sur Cloudflare standard-4 avec quatre frames parallèles, sans nouvel appel fournisseur. Le test utilise les objets source existants et un préfixe R2 de recette isolé, sans créer de job ou de session cliente en D1. Après correction : première publication R2 observée à **24,57 s**, flux complet et MP4 observés à **80,06 s**, **20 segments de 2 s**, **32 557 652 octets** au total, master de 1 200 frames avec audio vérifié. Les **21 objets de test** sont supprimés. Deux rejeux avant correction avaient reproduit le rejet ; ils ne sont pas comptés comme réussis. Estimation brute haute du calcul des trois sessions : **0,02855 USD**, avant quotas inclus, opérations et taxes. Aucun crédit utilisateur, import ou appel Cartesia/Runway/HeyGen.

Web **f2a3297f-5bd2-4599-adb7-3e79e54cbab4** et pipeline **b2851d0b-0d06-432a-9668-bc9a4061fb97**. Nouvelle image **sha256:92469edf5900af95d75ff52c4ba89be827c73ff46ed951faa4673398b3ed8aa5**, dérivée de l’image précédente avec les sources renderer/contrats à jour. Configurations réconciliées, Workflow de production conservé, sourcemaps privées web envoyées à PostHog. Les preuves et journaux privés sont sous `evidence/local/progressive-video-ready/`. Aucun commit/push dans cette correction.

Contrôle final après publication : les deux Workers sont à **100 %**, **60 bindings web et 32 pipeline conservés** (hors identifiants normaux de release/symboles). Renderer version **30**, quatre vCPU/12 GiB et une instance maximum, mise à jour terminée. Admissions suspendues uniquement au repos pour la mise à jour de l’image, puis rétablies ; aucun job interrompu. Budget d’octobre inchangé. Chunk du lecteur servi par bienvu.online identique au build par SHA-256, ancien bouton absent ; routes de flux anonymes/sans session refusées. Worker et application de recette supprimés. La capture des journaux historiques via l’API Observability n’était pas autorisée par l’OAuth existant ; le diagnostic a été établi par les objets R2 absents et les rejeux isolés réels.
