# Transport natif des imports sur Cloudflare

Décision du 28 septembre 2026, pour terminer le sprint 03 demandé par Alex. Le SaaS, l'authentification, D1 et R2 restent sur Cloudflare. Aucun nouvel hébergeur ni service d'IA.

Le transport Node déjà éprouvé en local épingle l'adresse IP validée lors de l'ouverture TLS, conserve le nom de domaine pour SNI/certificat, contrôle chaque redirection et décode réellement les photos avec Sharp. Le `fetch` Workers standard n'offre pas ce port d'épinglage. Les sockets TCP Workers ne peuvent pas joindre toutes les IP Cloudflare, ce qui exclut leur remplacement général pour les sites d'agences. Le chemin sûr est donc un petit **Cloudflare Container privé**, séparé du renderer vidéo.

`apps/importer` héberge uniquement ce transport et le réencodage raster. `apps/pipeline/src/import-worker.ts` l'appelle ; `apps/web` utilise un Service Binding authentifié. Aucun code Node/Sharp n'entre dans le bundle web. Cette décision étend la règle initiale des Dockerfiles réservés au rendu : il existe désormais un Dockerfile de traitement des imports, sans orchestrateur externe.

## Bornes

- Une instance `basic` au maximum : 0,25 vCPU, 1 GiB RAM, 4 GB disque provisionnés. Sommeil après 30 secondes d'inactivité, état/lifecycle lisibles sans la réveiller.
- Deux ressources natives simultanées ; Sharp utilise un thread, 32 MiB de cache. Images JPEG/PNG/WebP, 10 MiB et 16 mégapixels en entrée, réencodage JPEG sans métadonnées, côté maximal 2 048 px. Délai natif 20 s, réseau 12 s.
- Une tentative Browser Run par import, un slot global avec bail. Tout trafic autorisé passe par le transport épinglé ; pas de `route.fetch()` ni de `route.continue()`, pas de cookies sources, pas de service workers, WebSocket, téléchargement ou page secondaire.
- 5 imports/jour UTC et 30/mois partagés entre URL et saisie manuelle. Une réservation de 0,50 € précède les ressources payantes, conservée en cas d'échec et après purge. Registre D1 mensuel explicite, fermé si absent ou en pause ; pas de renouvellement automatique du budget.
- 48 ressources natives et 50 MiB réservés maximum par import, y compris les erreurs dont les octets sont inconnus. Les garde-fous de l'extracteur sont plus stricts (20 ressources nominales, 60 s).
- Cron toutes les dix minutes : imports échoués, abandonnés ou expirés, uniquement après fin du bail + 5 min ; refus si un job référence l'annonce. Le compteur et le registre de coûts ne sont jamais remboursés par la purge.

Les routes `/operator/*` exigent un secret distinct. Les cinq sondes fermées de recette et trois images synthétiques exigent en plus `IMPORT_PROBES_ENABLED=true`, retiré après recette. Chaque cas est réservé en R2 avant exécution, une fois par mois ; deux provisions de 0,50 € couvrent respectivement les quatre cycles Browser Run et les refus réseau. Ce contenu synthétique ne prouve pas la compatibilité d'une agence réelle.

## Références consultées

- [Sockets TCP Workers et restrictions](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)
- [Classe Container et cycle de vie](https://developers.cloudflare.com/containers/reference/container-class/)
- [Types et limites Containers](https://developers.cloudflare.com/containers/platform/limits/)
- [Prix Containers](https://developers.cloudflare.com/containers/platform/pricing/)
- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)

Le coût brut théorique d'une période active peut être majoré par `secondes × (0,25 × 0,000020 + 1 × 0,0000025 + 4 × 0,00000007)` USD, avant allocations, autres services, transfert, taxe et conversion. Ce calcul n'est pas une facture ; ne pas déduire les allocations incluses plusieurs fois entre renderer et importeur.
