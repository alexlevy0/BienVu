# Comparaison de l’assemblage sur 2 et 4 vCPU — 11 octobre 2026

## Résultat

Dix rendus Cloudflare réels montrent un assemblage **39 % plus rapide sur le classique anonyme** et **51 % plus rapide avec avatar**, en passant de **2 vCPU / parallélisme 2** à **4 vCPU / parallélisme 4**. Le coût de calcul estimé du moteur baisse respectivement de **4,8 % et 12,8 %** avant les allocations incluses. L’intérêt principal est le délai gagné ; l’économie absolue reste petite.

| Cas, moyenne de deux passages | 2 vCPU / 2 frames | 4 vCPU / 4 frames | Temps gagné | Calcul estimé pour 1 000 rendus, 2 → 4 vCPU |
| ----------------------------- | ----------------: | ----------------: | ----------: | ------------------------------------------: |
| Classique + aperçu filigrané  |          114,33 s |           69,76 s |      39,0 % |                             6,26 → 5,96 USD |
| Avatar continu                |          131,09 s |           64,66 s |      50,7 % |                             7,60 → 6,62 USD |

Le classique inclut la création de l’aperçu filigrané : son master seul passe en moyenne de **85,56 à 44,52 s**. Les coûts du tableau couvrent tout le moteur, aperçu compris ; les compteurs CPU ne séparent pas les deux fichiers. Le délai total de génération inclut d’autres étapes et n’est pas mesuré par ce banc.

## Bilan du passage d’un à quatre cœurs

Comparaison directe des moyennes des deux passages classiques à **1 vCPU / parallélisme 1** de la [première campagne](RENDER-CPU-10-10.md) et des deux passages à **4 vCPU / parallélisme 4** de cette campagne : même manifeste de 20 secondes, douze photos, carte satellite et réglages de qualité.

| Assemblage classique    | 1 cœur / parallélisme 1 | 4 cœurs / parallélisme 4 |               Réduction de durée |
| ----------------------- | ----------------------: | -----------------------: | -------------------------------: |
| MP4 principal seul      |                126,30 s |                  44,52 s | **64,7 %**, soit 81,77 s gagnées |
| MP4 et aperçu filigrané |                155,40 s |                  69,76 s | **55,1 %**, soit 85,64 s gagnées |

Calcul : `(durée à un cœur − durée à quatre cœurs) / durée à un cœur × 100`. Les mesures proviennent de **deux campagnes distinctes**, avec une variabilité de l’infrastructure observable sur les passages à deux cœurs. C’est un gain constaté sur ce cas, pas une comparaison réalisée dans une même campagne, une addition des pourcentages successifs, ni une garantie pour chaque vidéo. Import, génération de voix/animations/avatar, démarrage, transferts et stockage final ne sont pas inclus.

## Méthode

- Image de production commune à tous les essais : `bienvu-renderer@sha256:9d4fd549b023fdb754ee04ee52e5ddb85a9aaebb32c7d6cfe21c30f5c94e3055`. Deux manifestes existants de **20 s / 600 frames / 1080 × 1920 / 30 fps**, douze photos et une carte satellite ; le second possède un avatar HeyGen présent pendant toute la vidéo.
- Réglages conservés : Remotion 4.0.529, H.264 au preset `medium`, CRF 21, AAC 192 kbit/s. L’aperçu anonyme reste une dérivée FFmpeg avec un thread d’encodage. Aucun nouvel appel OpenAI, Cartesia, Runway ou HeyGen, aucun import, job client ou débit de crédit.
- Deux applications Containers privées et temporaires, une instance maximum par application : `standard-3` (**2 / 8 GiB / 16 GB**) et `standard-4` (**4 / 12 GiB / 20 GB**). Essais en série, ordre alterné. Deux passages par combinaison principale/cas, puis un contrôle de chaque cas à quatre cœurs avec le parallélisme resté à deux.
- L’image et le code produit sont intacts. Une copie temporaire du code dans le disque du conteneur ajuste le parallélisme et relève temps/CPU. Le Worker ne possède aucun binding D1 ; le code lit les assets R2 attendus sans écriture, avec sorties réseau du conteneur désactivées, authentification et plafonds de tentatives/durée. Enveloppe de calcul annoncée : **0,25 USD estimés maximum**.
- Le CPU actif est estimé par les compteurs Linux `/proc/stat`, cumulés sur les vCPU, à 100 ticks/s. La RAM et le disque sont multipliés par la durée du moteur. Tarifs utilisés : **0,000020 USD/vCPU-s**, **0,0000025 USD/GiB-s**, **0,00000007 USD/GB-s**. Ce sont des estimations brutes, pas une facture Cloudflare, sans quotas partagés, frais R2/Workers/DO, taxes ou change. [Tarifs Containers](https://developers.cloudflare.com/containers/platform/pricing/).

## Mesures individuelles

| Cas                 | CPU / parallélisme | Rendu + vérification |     CPU actif | Calcul estimé en USD |
| ------------------- | ------------------ | -------------------: | ------------: | -------------------: |
| Classique A         | 2 / 2              |             113,37 s | 188,95 vCPU-s |             0,006173 |
| Classique B         | 2 / 2              |             115,30 s | 195,68 vCPU-s |             0,006349 |
| Classique A         | 4 / 4              |              70,63 s | 190,77 vCPU-s |             0,006033 |
| Classique B         | 4 / 4              |              68,89 s | 186,02 vCPU-s |             0,005883 |
| Avatar A            | 2 / 2              |             128,78 s | 236,12 vCPU-s |             0,007442 |
| Avatar B            | 2 / 2              |             133,39 s | 246,78 vCPU-s |             0,007753 |
| Avatar A            | 4 / 4              |              65,06 s | 230,90 vCPU-s |             0,006661 |
| Avatar B            | 4 / 4              |              64,25 s | 228,50 vCPU-s |             0,006587 |
| Classique, contrôle | 4 / 2              |              76,25 s | 185,25 vCPU-s |             0,006099 |
| Avatar, contrôle    | 4 / 2              |              73,98 s | 218,88 vCPU-s |             0,006701 |

Les contrôles confirment que le parallélisme quatre est utile : il est plus rapide et légèrement moins coûteux que le parallélisme deux sur ces machines à quatre cœurs. Doubler la capacité ne signifie pas payer quatre cœurs occupés en permanence : le travail CPU cumulé reste voisin, alors que RAM/disque sont provisionnés moins longtemps.

En comptant démarrage, transferts et récupération des fichiers, l’estimation conservatrice par session baisse de **15,9 %** sur le classique et **5,5 %** sur l’avatar. Le premier démarrage à deux cœurs prend **37,74 s**, contre des démarrages ultérieurs de 1,6 à 10,1 s ; cette variabilité rend la comparaison de session moins représentative du seul matériel. Le tableau principal exclut cette préparation. Les durées à deux cœurs diffèrent aussi des campagnes précédentes : comparer les réglages dans une même campagne, sans enchaîner leurs pourcentages comme une promesse globale.

## Qualité, coût et protection

**10/10 masters validés** : H.264/AAC, 600 frames, 30 fps, 1080 × 1920, durée 20,053 s, fast-start et SHA-256 contrôlés. Similarité SSIM complète **≥ 0,992185** par rapport au même cas à deux cœurs ; audio décodé identique dans chaque cas. Les répétitions et contrôles à quatre cœurs donnent le même MP4 pour un même cas. Comparaisons visuelles à 5/17 s et 5/15 s inspectées : cadrage, transitions et avatar conservés. Les cinq aperçus filigranés passent les vérifications du renderer et leur SHA au téléchargement.

Les dix sessions représentent **0,07505 USD de calcul estimé conservateur**, ou **0,09089 USD** en supposant tous les cœurs occupés à 100 % pendant toute leur session, préparation et récupération comprises. Aucun essai distant en échec, aucun frais fournisseur IA supplémentaire. L’ensemble reste sous 0,10 USD de calcul avant allocations incluses.

Le Worker temporaire `bienvu-render-four-cpu-benchmark-20261010` et ses **deux applications Containers** sont supprimés, absence vérifiée par API. Les images partagées sont conservées. La production reste à **2 vCPU**, avec le même Worker **`fd07598c-865d-4020-b7a3-38c43aa1486b`**, la même image, le même budget et les deux artefacts originaux intacts. Aucun changement fonctionnel, commit ou push pendant cette comparaison.

Preuves privées ignorées : `evidence/local/render-four-cpu/` — scripts, manifestes référencés, MP4, rapports, chronométrages, compteurs CPU, SSIM/audio, captures, configuration initiale et nettoyage. Aucun secret ou média privé versionné.

## Recommandation

Adopter **4 vCPU avec quatre frames en parallèle** pour réduire l’attente, en gardant les paramètres de qualité. L’économie de calcul est observée sur deux cas, avec deux passages chacun ; elle ne garantit pas le même gain sur toutes les vidéos. Les clips Runway multiples, la carte 3D et les avatars transparents nécessitent des mesures complémentaires si leurs performances deviennent un problème. La comparaison recommande ce changement et ne l’applique pas à la production.

La bascule a ensuite été autorisée et réalisée : [livraison de production sur quatre cœurs](RENDER-4-CPU-PRODUCTION-11-10.md).
