# Rendu vidéo privé — sprint 06

Le modèle `BienVuListing` assemble les photos, la voix mesurée au sprint 05, les sous-titres par phrase et la marque enregistrée. Il exporte un MP4 vertical 1080 × 1920, 30 fps, H.264/AAC, de 20 à 35 secondes. Le parcours public de génération, le Workflow et la consommation finale du quota restent au sprint 07/08. Ce service ne remplace pas ce parcours et n'ouvre pas les générations sur bienvu.online.

## Manifeste et droits

`prepareJobVideo` reçoit uniquement l'agence et le job du contexte serveur. Il vérifie la réservation, l'allocation essai/payante, la tentative active et la narration préparée. Le script est recoupé avec le catalogue factuel et son snapshot. Photos et logo sont copiés sous le préfixe du job après contrôle de taille et SHA-256 ; les WAV restent ceux de la narration validée. Aucun appel OpenAI/Google n'est nécessaire pour rendre une narration existante.

La migration **0012_video_manifests.sql** fige le JSON, les sources et son empreinte dans D1. Un trigger refuse leur modification. Les reprises de copie utilisent ce même snapshot, et non une nouvelle marque ou de nouveaux droits. Chaque agence ne peut retrouver que ses propres manifestes. Conservation prévue : 30 jours ; la purge complète des jobs/résultats sera intégrée au parcours et à l'exploitation, elle n'est pas annoncée comme automatique ici.

`VideoManifest` version 2 contient les scènes, les pistes, les durées en frames, le contact choisi et `rights`. Le type historique `trial` impose `watermarked: true`, `paid` et `free` imposent `false`. Les anciens essais gardent leur sortie marquée. Depuis le 29/09, `anonymous` produit un master propre privé et une dérivée FFmpeg filigranée : deux rapports et deux objets valides sont requis, AAC identique et aucune resynthèse. Le contact `none` est réservé à l’habillage neutre BienVu. [Implémentation, coûts et limites locales](ESSAI-ANONYME.md). La provenance de la voix reste dans le manifeste serveur ; la phrase « Voix de synthèse générée par intelligence artificielle. » n'est plus incrustée dans les images de la vidéo à la demande d'Alex. Un contact de plus de 180 caractères est refusé, plutôt que tronqué sur la carte finale.

## Composition et contrôle du MP4

- Le nouveau modèle `bienvu-vertical/2` place chaque photo en plein cadre vertical (`object-fit: cover`), avec un léger zoom, un voile de contraste et de grands titres, prix et repères. Les photos horizontales sont recadrées au centre ; aucune partie inventée. Le manifeste ajoute un bloc de présentation construit uniquement avec les faits vérifiés ou saisis par l'utilisateur. Un fait absent n'est pas affiché. Le modèle `/1` et l'empreinte de ses manifestes existants restent lisibles ; il conserve sa photo entière dans un cadre, avec arrière-plan flouté et mouvement de 1,5 %.
- Marque, logo clair/sombre avec fond adapté, couleurs de la charte en accents ; textes sombres/clairs sur fonds contrôlés pour ne pas dépendre du contraste de la charte. Police locale, aucune requête vers un CDN pendant le rendu.
- Titres en Anton, police locale sous [licence OFL](https://github.com/google/fonts/tree/main/ofl/anton) ; informations et sous-titres en Inter Tight. La phrase de provenance vocale reste dans les données du job et n'occupe plus de bandeau en bas de l'image. Les filigranes d'essai restent obligatoires.
- Marges prévues pour les interfaces sociales : 88 px à gauche, 160 px à droite, environ 190 px en haut et 320 px en bas. Les overlays des plateformes peuvent évoluer : ces marges ne constituent pas une certification de toutes les interfaces.
- Timeline dérivée des WAV mesurés, aucune phrase coupée. Sous-titres par phrase ou groupes de texte ; pas d'alignement mot à mot. Les groupes longs sont répartis dans la durée de leur piste. La carte finale reste affichée après la voix.
- Vérification du vrai fichier par FFprobe : 1080 × 1920, 30 fps, nombre de frames, deux pistes H.264/AAC, durée ±120 ms, taille ≤50 Mio. Décodage AAC en PCM pour mesurer le niveau sonore. `moov` avant `mdat`, remux `faststart` si nécessaire, puis SHA-256.

Le Node interne ne reçoit ni URL extérieure ni code client. Les assets sont transférés par l'opérateur durable depuis R2, et revérifiés dans Node : empreinte, taille, format raster, dimensions, 40 mégapixels maximum et durées PCM exactes. Chromium ne voit qu'un serveur loopback à liste fermée avec chemin aléatoire. Le conteneur a son accès Internet désactivé.

## Protocole et reprise

Le Worker opérateur est protégé par `PROBE_TOKEN`, limité à `VIDEO_AGENCY_ID` / `VIDEO_JOB_ID`. Le service Node utilise un autre secret `RENDER_TOKEN`. Aucun secret ne va dans le manifeste, l'image Docker ou une URL de lecteur.

| Route Worker | Effet |
|---|---|
| `POST /prepare` sans corps | Fige le manifeste et prépare ses médias |
| `GET /manifest` | Lit le manifeste privé |
| `POST /render` sans corps | Réserve le budget atomiquement et accepte rapidement le rendu |
| `GET /status` | Lit le statut et réconcilie un traitement actif |
| `GET/HEAD /file` | Sert le MP4 privé depuis R2, avec plages HTTP |
| `GET /state` | Slot, budget durable, état du conteneur, mesures et diagnostic de démarrage |
| `POST /retry` sans corps | Reprise opérateur explicite d’un échec précis, nouvelle provision et historique conservé |
| `GET /attempts` | Historique privé des tentatives du même manifeste |
| `GET /diagnostic` | Lecture bornée des processus et du port du conteneur déjà actif ; ne le démarre jamais |
| `POST /pause` | Interdit les nouveaux rendus ; le résultat existant reste lisible |

Le contrôleur `VideoRenderer` utilise SQLite Durable Objects et les callbacks persistants `Container.schedule`, sans remplacer l'alarme du SDK. États : `accepted → staging → starting → rendering → publishing → ready`, ou `failed`. Un slot borne les coûts de recette ; ce n'est pas une file de production multi-agences.

L'identifiant est le SHA-256 du manifeste normalisé. Les POST concurrents retrouvent le même traitement et la même réservation. L'état `starting` est enregistré avant le calcul : une perte du conteneur après cette étape devient un échec explicite, sans nouveau calcul aveugle. Après upload R2, une reprise de `publishing` vérifie les métadonnées et finalise sans renderer. Clé finale : `agencies/{agencyId}/jobs/{jobId}/video/{manifestHash}.mp4` ; checksum imposé pendant le transfert borné, puis taille relue.

Le processus de rendu et ses enfants sont arrêtés après 540 s ; le contrôleur ferme un traitement dépassant 600 s. Démarrage explicite borné : 30 s pour obtenir une instance, 60 s pour son port, annulation à 90 s. Au plus trois reprises de transport ou de réponses transitoires pendant le staging, aucune seconde dépense annulant la précédente. Le diagnostic de démarrage conserve phase, code/statut HTTP et message expurgé ; une commande fixe sans shell inspecte les noms de processus, répertoires et disponibilité du port. Elle ne lit ni variables secrètes ni arguments de processus. Les fichiers temporaires sont nettoyés, le conteneur arrêté après publication ou échec. Un rendu actif renouvelle son délai d'activité. Les erreurs et le budget restent conservés après arrêt.

## Vérifier en local

```sh
pnpm check
pnpm --filter @bienvu/renderer bundle
# Nécessite les pistes Google déjà validées dans evidence/remote/sprint-05/naturalness/.
pnpm fixtures:video
pnpm render:video evidence/local/sprint-06/job-video-trial
pnpm render:video evidence/local/sprint-06/job-video-paid
# Inspection de frames sans nouveau calcul fournisseur :
pnpm render:video evidence/local/sprint-06/job-video-trial stills
# Nouveau modèle plein cadre : photos de démonstration et WAV déjà validés,
# sans nouvel appel fournisseur.
pnpm exec tsx -e "import {makeVideoFixture} from './scripts/video-fixtures.ts'; makeVideoFixture('paid','s06-editorial','job-video-editorial-paid','bienvu-vertical/2').then(r=>console.log(r.directory))"
pnpm render:video evidence/local/sprint-06/job-video-editorial-paid
```

Les tests automatiques ne dépendent pas de ces preuves ignorées : `fixtures/video.ts` crée des aplats et un signal audio. `video-storage.test.ts` utilise D1/R2 locaux ; `video-coordinator.test.ts` redémarre un vrai runtime workerd avec Durable Objects SQLite et R2, mais **simule le moteur MP4**. `video.test.ts` exerce le serveur Node, l'idempotence, les fichiers corrompus et la reprise. Ces tests ne prouvent ni l'export Remotion ni le rendu Containers distant ; les MP4 et la recette séparée le vérifient.

## Recette Cloudflare bornée

Configuration générique désactivée : `apps/pipeline/wrangler.video.jsonc`. Configuration opérateur ignorée : `wrangler.staging.video.jsonc`. Variables `VIDEO_ENABLED`, `VIDEO_AGENCY_ID`, `VIDEO_JOB_ID`, `VIDEO_BUDGET_MONTH`, `VIDEO_OTHER_CENTS`, `VIDEO_MAX_ATTEMPTS`, `VIDEO_CEILING_CENTS`, `VIDEO_ENVELOPE_CENTS`, `VIDEO_RETRY_FAILED_AT`. Instance `standard-2`, maximum une instance. Les types du binding sont générés par `pnpm --filter @bienvu/pipeline typegen`.

La commande `pnpm probe:video:cloudflare` expose les étapes `configure`, `reserve`, `seed`, `secrets`, `enable`, `run`, `status`, `collect`, `pause`, `verify`, ainsi que `fund-resume`, `prepare-retry`, `retry` et `diagnostic`. Elle crée une fixture sur la base **isolée** `bienvu-narration-probe-staging`, emploie les anciens WAV approuvés et refuse de relancer un calcul par un simple rejeu de campagne. Avant tout nouveau test, rapprocher son journal, le budget global et la facture ; **ne pas effacer l'état ni changer l'identité du contrôleur pour contourner le plafond**.

La reprise autorisée le 28/09 élève l’enveloppe mensuelle à **40 €**, coupure **35 €**. Appliquer d’abord la migration `0013_budget_envelope_40.sql`, qui préserve tous les anciens montants/pauses, puis `fund-resume` : réservation globale de 1,60 € pour trois nouvelles tentatives maximum et l’infrastructure. Cette commande unique refuse un second financement. `prepare-retry` contrôle un échec, un slot libre et un conteneur arrêté, puis fige son `updatedAt` dans la configuration opérateur. Après déploiement, `retry` envoie deux POST concurrents : une seule nouvelle réservation, même manifeste et même identifiant, ancien résultat archivé. Le timestamp rend tout rejeu idempotent, même si cette reprise échoue ensuite. `GET /status` et `POST /render` ne réarment jamais un échec. Ne pas redéployer pendant un calcul actif.

Déployer d'abord avec `VIDEO_ENABLED=false`, appliquer les migrations, transmettre les deux secrets par stdin, puis déployer l'activation préparée. Le `run` envoie deux demandes du même rendu. Après collecte, ou après un échec, pause durable et déploiement avec `VIDEO_ENABLED=false`, puis `verify`. Ce dernier contrôle aussi un échec conservé et un fichier absent, sans annoncer de MP4 validé. Journaux/MP4/secrets sont ignorés et privés ; les résultats publiables sont dans le [rapport du sprint](preuves/sprint-06/RAPPORT.md).

Sources techniques consultées : [Remotion renderMedia](https://www.remotion.dev/docs/renderer/render-media), [Sequence](https://www.remotion.dev/docs/sequence), [API Container et callbacks persistants](https://developers.cloudflare.com/containers/reference/container-class/).

## État de la recette

La reprise du 28/09 a produit le vrai MP4 sur Containers en 169,57 s : 600 frames, 20,054 s, H.264/AAC. R2 privé, hash, streaming, rejeu sans dépense et persistance après redéploiement vérifiés. Lecture intégrale sur Chromium desktop et mobile émulé, frames inspectées ; écoute humaine du nouveau fichier et téléphone physique non encore confirmés. Ancien échec conservé. Service **désactivé et en pause**, conteneur arrêté. Provisions **26,35 € sur 40 €**, coupure **35 €**. [Mesures, commandes et limites](preuves/sprint-06/RAPPORT.md).

Recette locale du même serveur Linux, sans réseau extérieur : construire une image **linux/amd64** avec le Dockerfile, puis `pnpm probe:video:container evidence/local/sprint-06/job-video-trial <tag-image>`. La sonde exige d'abord au moins 6 Gio disponibles dans Docker, borne le conteneur à 1 vCPU/6 Gio, vérifie authentification, acceptation, assets, vrai rendu, hash, Range et rejeu ; elle arrête son propre conteneur dans `finally`. Elle ne remplace pas Containers distant. Sorties sous `evidence/local/sprint-06/container/`.

`pnpm preview:video`, puis `node scripts/probe-video-playback.mjs --local` pour la variante payante ou `--docker` pour l'export Linux local. Sans option, la sonde exige le MP4 distant déjà téléchargé et vérifié. L'émulation mobile Chromium n'est pas une validation sur téléphone physique.
