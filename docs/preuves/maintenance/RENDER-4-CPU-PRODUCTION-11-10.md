# Assemblage de production sur quatre cœurs — 11 octobre 2026

## Livraison

Après accord d’Alex et [dix rendus comparatifs](RENDER-4-CPU-11-10.md), les nouvelles générations utilisent **4 vCPU / 12 GiB / 20 GB**, instance Cloudflare **standard-4**, avec **concurrency: 4** dans renderListingVideo.

Le parallélisme concerne quatre frames Remotion. Le contrôleur conserve un seul job utilisateur à la fois et max_instances: 1. Les formats, la résolution, les 30 fps, H.264/CRF 21/AAC 192 kbit/s, la narration, les cartes, les avatars et le filigrane conservent leurs règles. Aucun MP4 existant n’est recalculé et aucun tarif en crédits n’est modifié.

Les estimations de fin de session prennent désormais 12 GiB de mémoire, 20 GB de disque et une majoration à quatre cœurs occupés pendant toute la session. Les calculs historiques à une ou deux unités gardent leurs ressources d’origine. Les allocations incluses restent exclues de l’estimation brute ; il ne s’agit pas d’une facture.

## Vérifications

- **32 tests ciblés validés** : budget, contrôleur durable, processus de rendu, stockage R2 dans workerd, Workflow de génération et serveur/manifeste vidéo. La nouvelle assertion monétaire utilise une tolérance numérique après correction d’une égalité stricte sensible aux flottants. Les autres contrôles n’ont pas été modifiés.
- Frontières du monorepo, typechecks renderer/pipeline et TypeScript des tests passent. Types VideoEnv régénérés sans changement des déclarations suivies.
- Bundle de production validé par Wrangler deploy --dry-run --keep-vars --strict --containers-rollout none.
- Image Linux amd64 construite depuis l’image de production épinglée : empreinte du fichier de base contrôlée, puis remplacement du seul fichier listing-render.ts. Le fichier livré correspond exactement au dépôt ; l’utilisateur de rendu reste non privilégié (UID 1000).
- **Deux rendus Cloudflare réels sur la nouvelle image, via son serveur de production normal**, dans une application temporaire à quatre cœurs : classique anonyme et avatar continu, chacun 20 s / 600 frames / 1080 × 1920 / 12 photos / carte satellite. Sources R2 lues sans écriture, réseau du conteneur désactivé, aucune base D1 liée au Worker de test, au plus deux rendus bornés à 600 s chacun. La seule liaison au contrôleur de production expose temporairement une lecture de son état, protégée par un secret opérateur et une expiration.
- Masters et aperçu filigrané **identiques octet pour octet aux sorties à quatre cœurs du benchmark**, déjà vérifiées visuellement, par SSIM complet et audio. SHA-256, dimensions, 600 frames, H.264/AAC, fast-start et contrôles audio du moteur validés. Le contrôle distant vérifie aussi le fichier source et concurrency: 4 dans l’image réelle.

| Contrôle          | Master + vérification | Aperçu filigrané | Total moteur |
| ----------------- | --------------------: | ---------------: | -----------: |
| Classique anonyme |               40,62 s |          22,44 s |      63,07 s |
| Avatar continu    |               59,82 s |                — |      59,82 s |

Ces deux contrôles vérifient le fonctionnement de l’image livrée ; leurs durées ne remplacent pas la campagne comparative et ne représentent pas le délai total de génération.

Plafond conservateur de calcul des deux sessions, démarrage/transferts/récupération compris : **0,02193 USD**, avant quotas inclus, frais R2/Workers/DO, taxes et change. Aucun appel OpenAI, Cartesia, Runway ou HeyGen, aucune consommation de crédits utilisateur. Le plafond de contrôle était 0,15 USD de calcul. [Tarifs Containers](https://developers.cloudflare.com/containers/platform/pricing/).

## Production

Au dernier contrôle précédant la bascule : aucun job D1 actif et contrôleur generation-single-slot-v1 au repos. Variables distantes réconciliées avant déploiement, secrets préservés, sans migration ni redéploiement web.
- Worker : **bienvu-generation-development**, version **fea4eaa8-cf67-4532-b906-5b3de07eba79**, trafic **100 %**.
- Application Containers : **a0302315-6859-4e3c-9254-891604aee659**, version **28**, ressources **4 / 12288 MiB / 20000 MB**, maximum **1** instance. Bascule terminée ; santé confirmée via API, aucune erreur.
- Image : **bienvu-renderer@sha256:39025077f12199e18e37b01dde26c91d5659cc64210cf3102cf9b6ed0e21f827**.
- **32 bindings conservés exactement**, budget mensuel inchangé et les deux artefacts originaux préservés.
- Configurations génériques suivies : wrangler.generation.jsonc et wrangler.video.jsonc sur standard-4. Configuration opérateur actuelle ignorée : wrangler.staging.four-cpu-generation.jsonc ; les alias two-cpu et default-map ont également été actualisés pour éviter qu’un prochain déploiement remette l’ancien moteur.

Retour arrière : restaurer le Worker **fd07598c-865d-4020-b7a3-38c43aa1486b**, ainsi que standard-3 et l’image **sha256:9d4fd549b023fdb754ee04ee52e5ddb85a9aaebb32c7d6cfe21c30f5c94e3055**, après vérification de l’absence de génération active. Configuration précédente sauvegardée dans evidence/local/render-four-cpu-production/rollback-config.jsonc. Un retour arrière du seul Worker ne rétablit pas les ressources du conteneur ; conserver les bases, médias, secrets et variables.

Preuves privées ignorées : evidence/local/render-four-cpu-production/ — configuration initiale, image, serveur de contrôle, deux MP4/aperçu, rapports, coûts majorés, logs de déploiement, contrôles de production et nettoyage. Aucun secret ni média privé versionné.

L’environnement de contrôle a été supprimé : Worker bienvu-render-four-cpu-check-20261011 et application Containers a03b2f37-a3d4-4567-a37a-1ffb9f122f29, absence vérifiée par API. La production reste sur quatre cœurs après ce nettoyage ; les images partagées sont conservées.
