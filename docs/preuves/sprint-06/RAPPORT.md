# Sprint 06 — vidéo de marque, 28 septembre 2026

**État actuel : sprint terminé.** La réserve de lecture distante des essais historiques ci-dessous est levée par la confirmation humaine du nouveau MP4 Cloudflare au sprint 07 ; voir la note de clôture en fin de rapport. Téléphone physique/Safari non vérifiés.

**Résultat : rendu réel Cloudflare, R2 privé, lecture et persistance validés. Toutes les tâches 06.1–06.6 sont livrées et vérifiées ; confirmation humaine du MP4 distant et téléphone physique encore non reçues.** Le premier échec et ses coûts restent conservés ci-dessous. Le sprint 05 et la vidéo locale ont déjà été approuvés par Alex. La recette distante utilise réellement cette nouvelle composition, pas la vidéo technique du sprint 00.

## Périmètre livré

`BienVuListing` assemble cinq scènes à partir du manifeste serveur version 2 : photos entières, mouvement léger, voix mesurée, sous-titres par phrase, marque, logo et coordonnées. Export 1080 × 1920, 30 fps, H.264/AAC. L'essai porte un filigrane dans les pixels ; la variante payante conserve uniquement la marque d'agence et la mention de voix synthétique. Aucun éditeur ajouté.

Préparation depuis la réservation et la narration existantes, snapshot D1 immuable, copie/vérification des médias sous le préfixe du job. Node et Chromium ne reçoivent aucune URL d'annonce ni secret fournisseur. Statut durable, acceptation rapide, idempotence, transfert R2 privé avec checksum, nettoyage et arrêt bornés. [Architecture et protocole](../../VIDEO.md).

Le Workflow, les transitions du job public, la consommation définitive du quota et l'aperçu/téléchargement dans l'application restent au sprint 07. La génération publique et la facturation ne sont pas ouvertes.

## Nature des preuves

| Vérification | Ce qui est réel | Ce qui est une fixture / limite |
|---|---|---|
| Tests automatiques | Node, workerd, D1/R2 et Durable Objects SQLite locaux | Images géométriques, signal audio, moteur MP4 simulé dans les tests du contrôleur |
| MP4 natifs | Remotion/Chromium, encodage H.264/AAC, voix Google déjà produite et approuvée | Annonce manuelle et trois images synthétiques reprises de l'accueil ; aucune annonce réelle extraite |
| Recette visuelle | Frames de la composition et du vrai MP4 inspectées | Variante textes longs visuelle uniquement : sa voix réutilisée ne correspond pas aux textes modifiés |
| Lecture navigateur | Vrai décodage intégral des MP4 local et Cloudflare dans Chromium 149 | Vue mobile **émulée** 390 × 844 ; pas d'appareil physique ni Safari/iOS validés |
| Cloudflare | Vrai rendu Remotion/Chromium/FFmpeg dans Containers, Worker/DO, publication R2, arrêt et relecture après déploiement | Annonce/photos synthétiques dans la base isolée, WAV Google réels réutilisés ; aucune extraction nouvelle |

Aucun appel OpenAI, Google TTS, import de portail ou génération d'image supplémentaire. Les cinq WAV sont ceux de la [comparaison de naturel du sprint 05](../sprint-05/NATUREL.md), relus par empreinte. Après lecture du MP4 local avec filigrane présenté dans la conversation, **Alex répond : « Oui, image et voix sont bonnes »**. Cette première validation était locale. Le MP4 Cloudflare est désormais disponible et présenté à Alex ; son retour distinct reste en attente.

## Exports natifs et inspection

| Mesure | Essai avec filigrane | Variante payante |
|---|---:|---:|
| Frames | 600 | 600 |
| Durée FFprobe | 20,053333 s | 20,053333 s |
| Dimensions / fréquence | 1080 × 1920 / 30 fps | Identiques |
| Codecs | H.264 / AAC | Identiques |
| Taille | 6 687 091 octets | 7 031 771 octets |
| Audio décodé RMS | −24,198 dB environ | Identique |
| `moov` avant `mdat` | Oui | Oui |
| Filigrane dans le MP4 | Oui | Non |

Empreinte essai : `e831fd4421dcaf41182ed2b64e65d3837fd36edddf289f51780dcd466a58663a`.

Empreinte payante : `5817646469d675f7d02a04b3d83f68fc2f54ed180141f2acf8ab6abead19792c`.

Le petit dépassement de 20 s provient du conteneur AAC ; les 600 frames de la timeline sont contrôlées. Durées de calcul non représentatives d'une production : essai natif 125,6 s ; dernier export payant 859,4 s sur un Mac alors fortement ralenti par Docker. Le CLI natif direct n'a pas le timeout de 540 s du service enfant ; ce dernier reste impératif dans le serveur de rendu.

L'essai natif précède le dernier ajustement du chargement de police et de l'alignement du titre ; la variante payante et les six captures de textes longs utilisent le code final de composition. Frames 15, 135, 267, 352, 445 et 599 : prix, nom d'agence de 100 caractères, contact long, logos clair/sombre, charte peu contrastée, photos horizontale/verticales, sous-titres et fin. Les photos de premier plan restent entières ; fond flouté issu de la même image. Pas de texte tronqué observé sur cet échantillon.

Lecture de la variante payante sur ordinateur et mobile émulé : `ended=true`, 600 frames décodées, zéro frame perdue, 474 701 octets audio décodés, volume 1, piste non muette, aucune erreur et aucun débordement horizontal. Cela contrôle la lecture technique. La validation humaine distincte porte sur le MP4 local d’essai présenté à Alex : image et voix approuvées. Tentatives d'ouverture dans le navigateur Codex interrompues par timeout ; aucune réussite de ce navigateur n'est revendiquée.

Preuves ignorées : `evidence/local/sprint-06/job-video-trial/`, `job-video-paid/`, `visual-long-text/` et `playback/`. Les MP4 se lisent directement, indépendamment du lecteur BienVu ; `pnpm preview:video` sert les fichiers explicitement autorisés sur `127.0.0.1:8795`.

## Premier essai Cloudflare et fermeture — historique

Worker `bienvu-video-staging`, une instance `standard-2` au maximum, Internet du conteneur désactivé. Migration `0012_video_manifests.sql` appliquée à la D1 **isolée** de recette `bienvu-narration-probe-staging`. La base applicative publique n’était pas encore migrée vers 0012 à cet instant ; voir la reprise ci-dessous. R2 reste privé ; les objets de fixture sont distincts des données d'Alex.

À **20:42:49 UTC**, deux demandes concurrentes obtiennent `202` en **695 ms** au total, avec le même identifiant `0460a41e0aea86473b8c31ed7a114cc7d9dec7cbba460fefcf0ce2c2e87970ce`. Une seule réservation de 0,50 € et un seul slot durable. Requête sans jeton : 401 ; tentative de fournir `watermarked:false` : 400 ; manifeste préparé avec `trial` et `watermarked:true` issus de la réservation serveur.

À **20:43:15 UTC**, état `failed / VIDEO_CONTAINER_REJECTED`, avant `starting` : aucun calcul vidéo accepté ni MP4 publié. Le conteneur avait été observé `running`, sans callback de service prêt enregistré, puis arrêté. Le refus initial n'enregistrait pas le statut HTTP ni le détail du SDK : **la cause précise ne peut donc pas être certifiée**. La même image accepte le même manifeste par HTTP dans Docker local. La lecture de Workers Observability via l'OAuth existant est refusée **403**.

Correction de robustesse préparée : attente explicite du démarrage (30 s pour obtenir l'instance, 60 s pour le port, annulation à 90 s), diagnostic limité au code/phase/statut HTTP, au plus trois reprises des réponses transitoires avant le calcul. Le SDK utilisé attendait par défaut 8 s pour obtenir l'instance et 20 s pour le port. Une reprise de `staging` reste distincte d'un nouveau rendu ; aucune relance après une perte ambiguë du calcul. Tests workerd : 503 puis succès avec un seul lancement, et 503 persistant avec échec après trois essais, coût conservé.

Version corrigée déployée **désactivée** : `ddb0aee4-6bbf-43d5-9eb8-21fb17db739b`. Contrôle après redéploiement à **20:51 UTC** : ancien échec relu, pause durable vraie, slot libre, conteneur `stopped`, un essai / 50 centimes conservés. Nouvelle demande refusée 503, fichier absent 409, statut privé sans jeton 401. **Pas de seconde tentative distante ni de remise à zéro.** Ces corrections n’avaient pas encore été éprouvées par un nouveau démarrage distant à cet instant.

Contrôle de fermeture complété à **20:57:59 UTC** : préparation également refusée 503 ; états et budget inchangés.

Image utilisée : `bienvu-video:sprint-06-final`, Linux amd64, digest registre `sha256:9b73380821c61a6dc2f170c5d54fab13dce539861fbb9a039f3f0cbe23ed29e0`.

Le build initial de dépendances a réussi. Une reconstruction fraîche suivante a échoué sur `ECONNRESET` vers npm ; un build avait aussi été interrompu pendant un `chown` trop large. Docker était bloqué, sans conteneur actif, puis a été redémarré. L'image finale reprend le cache de dépendances après comparaison **identique** du lockfile et des manifestes renderer/contracts/video/voice ; les sources finales ont été recopiées et le bundle recréé sans réseau. Ce chemin n'est pas présenté comme un nouveau téléchargement complet réussi. Le Dockerfile versionné conserve l'installation gelée et ne rend modifiable que `evidence`.

Deux seeds D1 refusés avant le test ont été corrigés après rollback vérifié : logo d'agence référencé avant son asset, puis identifiant synthétique trop long pour une ancienne contrainte `LIKE` de D1. La fixture utilise désormais un identifiant d'agence de 32 caractères. Les UUID de 36 caractères de l'application restent dans cette limite ; la contrainte héritée pour des identifiants arbitrairement plus longs n'est pas élargie ici.

## Contrôles locaux

- `pnpm check` final après reprise : **156 tests réussis**, TypeScript applications/packages/tests et frontières sur **100 fichiers**. Aucun fournisseur externe dans la suite.
- Tests du serveur : manifeste/empreintes, médias absents ou modifiés, idempotence concurrente, limite de slot, accès Range, reprise sur disque, crash explicite et nettoyage.
- D1/R2 locaux : identité agence/job, droit figé depuis la réservation, préparation concurrente, rejet des tentatives périmées et quotas non consommés par la préparation seule.
- Durable Objects : SQLite persistant, réservation unique, reprise de publication après restart sans second calcul, arrêt, timeout, panne et démarrage transitoire. **Le calcul MP4 y est simulé.**
- Bundle Remotion et image Linux construits ; MP4 natifs réels, FFprobe, décodage audio, captures et lecture Chromium décrits ci-dessus.

### Service Docker Linux : timeout réel, pas de MP4 validé

La sonde `pnpm probe:video:container` a utilisé la même image **linux/amd64**, réseau `none`, plafond 1 vCPU / 6 Gio, sans appel fournisseur. Acceptation HTTP et staging passent, puis le service entre réellement en calcul à 20:49:25 UTC. Le processus de rendu atteint la limite de **540 s** : statut explicite `failed / RENDER_PROCESS_TIMEOUT`, pas de MP4 validé. Le conteneur de la sonde est arrêté et supprimé par son nettoyage.

La VM Docker du Mac est configurée avec seulement **4 096 Mio**, malgré le plafond de 6 Gio passé au conteneur ; cette recette n'a donc pas les ressources d'un `standard-2` distant et utilise une image amd64 sur le Mac. La sonde vérifie désormais avant lancement une image amd64 et au moins 6 Gio disponibles dans Docker. Aucun réglage matériel Docker modifié ni second calcul lancé. Cette observation ne certifie pas la cause du timeout et ne permet pas de prévoir la durée Cloudflare. Les exports natifs réussis, le timeout Linux local et l'échec de démarrage distant sont trois résultats distincts.

Contrôles finaux : `git diff --check`, syntaxe des quatre sondes `.mjs`, **284 liens documentaires relatifs** sans cible manquante ; recherche dans **350 fichiers candidats Git**, sans secret effectif détecté. Les marqueurs PEM présents sont le parseur et des clés générées dynamiquement par les tests, pas des clés privées versionnées. Journaux, MP4, captures, environnements et secrets sont ignorés. Le lecteur loopback de recette est arrêté après vérification.

## Budget et vérifications restantes à 20:58 UTC — historique

Avant cette tranche : 24,15 € de provisions. **0,60 € ajoutés avant l'essai** : 0,50 € pour une tentative Containers et 0,10 € pour Worker/D1/R2. Total **24,75 €**, dont le compteur de 0,50 € fait déjà partie. Base globale D1 1 875 centimes + imports 600 centimes. **0,25 € avant la coupure de 25 € ; 5,25 € sur le maximum mensuel de 30 €.**

L'échec conserve sa réservation. Facture, taxes, change et consommation exacte du démarrage non rapprochés ; callback de durée absent. Aucun coût par vidéo distante utilisable calculable puisqu'aucune vidéo du sprint 06 n'a abouti à distance. Pas de réaffectation de l'enveloppe Google/OpenAI ni de remise à zéro des anciens compteurs.

À cet instant, la suite prévue était :

1. Rapprocher le budget avec la consommation réelle, ou faire confirmer une modification du seuil de recette avant de réserver une autre tentative. Conserver ce premier échec et ses coûts ; ne pas changer le nom du contrôleur pour contourner sa limite.
2. Après réarmement opérateur explicite et borné, vérifier le démarrage corrigé avec logs, puis rendre le même type de manifeste sur Containers. Collecter le vrai MP4 depuis R2, comparer SHA/poids/Range et relire le résultat après redéploiement sans nouveau calcul.
3. Lire ce fichier distant sur ordinateur et téléphone, inspecter les frames et valider à l'écoute le début/la fin des phrases et la conclusion. Une émulation mobile ou un son décodé ne remplace pas l'écoute demandée.
4. Remettre le service en pause, confirmer l'arrêt et reporter version, mesures et budget. Les lignes 06.5/06.6 restent ouvertes pour cette recette distante.

Aucun commit ni push effectué pour cette tranche. Les sorties brutes et credentials restent ignorés ; ce compte rendu est versionnable.

## Reprise autorisée avec une enveloppe de 40 €

Alex autorise **10 € supplémentaires** le 28/09/2026. Nouveau plafond mensuel **40 €**, coupure préventive **35 €**. Migrations `0012`/`0013` désormais appliquées à la base applicative et à la base isolée ; aucune donnée client ni allocation modifiée. La migration 0013 seule conserve les montants/pauses existants, vérification automatisée sur D1 local ; après migration distante, base globale toujours 1 875 centimes, coûts import 600, compteurs 10 ce jour / 11 ce mois. Hausse du mois ensuite effectuée explicitement : base **2 035 centimes**, plafond **3 500**, engagement prudent **2 635**.

Les **1,60 € ajoutés** couvrent trois reprises au maximum à 0,50 € chacune et 0,10 € d’infrastructure. Aucun remboursement artificiel des provisions précédentes ou inutilisées, aucun nouvel appel Google/OpenAI. La dépense réellement facturée reste distincte et non rapprochée. Marge **13,65 € sur 40 €**, dont **8,65 € avant coupure**.

Reprise opérateur explicite sur le même contrôleur et le même manifeste : identifiant de l’échec figé dans la configuration, ancien résultat archivé dans SQLite, compteur historique conservé. Deux demandes concurrentes à **21:11:09 UTC** donnent `202` en **117 ms** : **tentative 2**, provision durable cumulée de **1 €** incluse dans les campagnes. Service disponible environ 3 s après le début du démarrage observé ; le vrai rendu commence à 21:11:18 UTC. Aucun diagnostic de boot en erreur. Le nom du contrôleur, le manifeste, les droits et l’image restent identiques.

Version de reprise : `6b54ff2b-b07d-4306-98c4-2342b603911b`. **156 tests réussis** avec types et frontières : migration conservatrice, reprise concurrente, rejeu d’une intention ancienne sans nouvelle dépense, historique d’échec intact et refus d’une intention périmée. Les tests du contrôleur simulent toujours le moteur MP4 ; la preuve distante ci-dessous est séparée.

### MP4 Cloudflare produit et vérifié

Le calcul se termine à **21:14:08 UTC** ; publication R2 et arrêt automatique à **21:14:11 UTC**. Délai acceptation → résultat prêt : **181,83 s**, dont **169,57 s** mesurés de rendu/vérification. Démarrage/activité/arrêt observés : **177,709 s**. Instance inchangée `standard-2`, une seule active, aucun accès Internet sortant.

| Mesure du fichier téléchargé depuis R2 | Résultat |
|---|---:|
| Dimensions / fréquence | 1080 × 1920 / 30 fps |
| Frames | 600 |
| Codecs | H.264 / AAC |
| Durée FFprobe Linux | 20,054 s |
| Durée du lecteur | 20,053333 s |
| Taille | 6 724 146 octets |
| Audio décodé RMS | −24,198 dBFS |
| MP4 streaming / filigrane intégré | Oui / oui |
| SHA-256 | `5d0e5d4b186e3c33965b97e58dbc1a37266a5fd34418b051ea8d04baccf69eaf` |

Le MP4 téléchargé est identique au hash/poids du rapport serveur. Relecture indépendante FFprobe sur le Mac ; frames **15, 135, 267, 352, 445, 599** extraites du vrai fichier et inspectées : photos complètes, prix/surface, logo, sous-titres, coordonnées finales et filigrane visibles, aucun texte coupé observé. La grille locale de textes longs/logos clairs et sombres reste une preuve distincte.

Lecture Chromium desktop 1440 × 1000 et mobile **émulé** 390 × 844, jusqu’à `ended=true` : **600 frames** dans chaque cas, **1 frame perdue sur desktop / 0 sur mobile**, 474 701 octets audio décodés, volume 1, piste non muette, aucune erreur ni débordement. La piste AAC distante n’est pas identique octet pour octet à celle du MP4 local approuvé ; après décodage commun en PCM 16 kHz, les deux ont **320 853 échantillons**, une corrélation de **0,999999704** et une différence RMS de **−86,47 dBFS**. Cela confirme la conservation du signal et de la timeline, sans prétendre remplacer une écoute humaine du nouveau fichier.

L’export Cloudflare est présenté dans la conversation. **Retour humain distant en attente ; aucun téléphone physique ou Safari/iOS annoncé validé.** Le contrôle mobile décrit ici est uniquement une émulation. Aucune seconde génération n’est nécessaire pour cette vérification : utiliser le fichier déjà produit.

### Persistance, fermeture et coût

Avant fermeture, `POST /render` relit le même résultat avec **200**, même empreinte, aucune tentative ni provision supplémentaire. Historique durable : tentative 1 en échec, tentative 2 prête. Fichier R2 200, plage de 1 024 octets 206, hash vérifié ; les deux tentatives comptent **1 €** dans les campagnes déjà provisionnées.

Après pause et redéploiement **`f117ae8e-5ea2-48d2-8242-aa77118694a6`**, contrôle final à **2026-09-28T21:15:51.810Z** : même MP4 et même budget, historique inchangé ; état privé 200, fichier 200, HEAD 200, plage 206, plage hors fichier 416. Sans jeton : 401. Préparation, rendu et reprise : **503**. Slot libre, pause durable vraie, conteneur arrêté. Les annulations d’alarmes observées à l’arrêt ne modifient pas le résultat prêt. Aucun Docker lancé restant ; lecteur local et suivi de logs arrêtés.

Borne de calcul brut de cette session, en supposant le CPU occupé sur toute l’activité : **0,0063691 USD**, avant inclusions, taxes et autres services. Ce n’est pas une facture ni le coût complet d’une vidéo en production. La provision supplémentaire globale reste **1,60 €**, même si une seule des trois reprises prévues a été utilisée. Cumul **26,35 €**, marge **13,65 € sur 40 €**, coupure **35 €**. Tous les imports et anciennes dépenses sont conservés ; aucun appel texte/voix nouveau.

Commandes réellement exécutées pour la reprise : `pnpm check` (156/156 et types), types Wrangler, migrations D1 distantes, `fund-resume`, `prepare-retry`, déploiement, `retry`, `status`, `diagnostic`, `collect`, `node scripts/probe-video-playback.mjs`, `pause`, redéploiement et `verify`. Le premier filtre `select` pour extraire les frames n’est pas fourni par le FFmpeg local embarqué ; extraction effectuée avec seek `-ss`, sans modifier ni réencoder le MP4. Les sources et versions applicatives sont conservées, aucune nouvelle dépendance.

Preuves privées : `evidence/remote/sprint-06/` (`attempt-1.json`, `resume-budget.json`, `run.json`, `final-budget.json`, `video-cloudflare.mp4`, `frames/`, `playback/`, `audio-comparison.json`, `human-review.json`, journaux de migrations/déploiements). Aucune de ces preuves brutes ni aucun secret n’entre dans Git.

Contrôle Git final de la reprise : `git diff --check` et syntaxe des sondes réussis ; **352 fichiers candidats**, dont **346 textuels inspectés**, aucun secret détecté ; **283 liens relatifs** valides. Les fichiers vidéo, preuves brutes et credentials restent ignorés. Aucun commit/push réalisé.

## Validation humaine complémentaire — 28/09

Pendant le sprint 07, Alex confirme « Oui, image et voix sont bonnes » après lecture du nouvel export de 20 secondes produit entièrement sur Cloudflare depuis une vraie annonce Century 21. Cette confirmation complète la recette du même renderer et clôt la réserve de lecture distante du sprint 06. Elle ne prétend pas être une nouvelle lecture du premier fichier d’essai, ni un test sur téléphone physique. [Recette du parcours](../sprint-07/RAPPORT.md).
