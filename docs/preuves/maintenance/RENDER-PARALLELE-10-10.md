# Nouveaux rendus sur deux cœurs — 10 octobre 2026

## Livraison

Après approbation d’Alex et [comparaison réelle](RENDER-CPU-10-10.md), les nouvelles générations utilisent **2 vCPU / 8 GiB / 16 GB**, instance Cloudflare `standard-3`, avec **`concurrency: 2`** dans `renderListingVideo`.

Un seul job vidéo reste actif à la fois, avec `max_instances: 1`. Les deux unités parallèles sont des frames Remotion ; ce changement ne lance pas deux générations utilisateur. Résolution, 30 fps, H.264, CRF 21, AAC 192 kbit/s, durée, narration, avatar, carte et aperçu filigrané conservent leurs règles. Aucun MP4 existant n’est recalculé et aucun tarif en crédits ne change.

Les estimations de fin de session prennent désormais 8 GiB de mémoire et 16 GB de disque, avec un plafond de CPU égal à deux cœurs occupés pendant toute la session. La fonction commune garde son ancien calcul par défaut pour les sondes synthétiques à un cœur. Le montant journalisé est une estimation brute supérieure, pas une facture, sans déduction des allocations mensuelles.

## Vérifications

- **31 tests ciblés passent** : budget, contrôleur de rendu, processus enfant, stockage d’artefacts dans workerd, Workflow de génération et serveur vidéo. `pnpm check:boundaries` et les typechecks renderer/pipeline passent ; types des bindings régénérés sans changement des déclarations suivies.
- Bundle de production contrôlé par `wrangler deploy --dry-run --keep-vars --strict --containers-rollout none`.
- Image Linux amd64 construite à partir de l’image de production épinglée. Empreinte de l’ancien fichier vérifiée avant remplacement ; seul le fichier de rendu change pour activer le parallélisme. Le fichier livré correspond exactement au dépôt et s’exécute toujours comme utilisateur non privilégié.
- **Deux vrais rendus Cloudflare avec l’entrée de production normale**, sur les médias du benchmark : vidéo anonyme de 20 s avec carte et douze photos, puis vidéo de 20 s avec avatar pendant toute la durée. Aucun nouvel appel OpenAI, Cartesia, Runway ou HeyGen, aucun nouvel import ou job client, aucune consommation de crédits produit. Conteneur temporaire privé, sorties réseau désactivées, sources R2 lues sans écriture.
- Masters et aperçu filigrané **identiques octet pour octet aux sorties à deux cœurs du benchmark**, déjà contrôlées visuellement et par SSIM/audio. Dimensions 1080 × 1920, 600 frames, H.264/AAC, fast-start, SHA-256 au téléchargement et contrôles audio du moteur validés.

| Cas | Master + vérification | Aperçu filigrané | Total moteur |
|---|---:|---:|---:|
| Classique anonyme | 71,31 s | 26,12 s | 97,43 s |
| Avatar continu | 108,12 s | — | 108,12 s |

Ces contrôles confirment le fonctionnement de l’image livrée. Ils ne mesurent pas le délai total du Workflow, l’import ou la génération chez les fournisseurs. Les durées varient selon le contenu et les ressources disponibles ; la comparaison précédente reste la référence pour le gain observé.

Plafond estimé de calcul des deux sessions de contrôle, démarrage et récupération compris : **0,01675 USD**, avant quotas inclus, opérations R2/Workers/DO, taxes et change. Le CPU est volontairement majoré à 100 % sur les deux cœurs pendant toute la session. Aucun frais fournisseur IA supplémentaire. [Tarifs Containers](https://developers.cloudflare.com/containers/platform/pricing/).

## Déploiement et protection

La production était au repos avant la bascule : aucun job actif dans D1, instance `generation-single-slot-v1` inactive. Déploiement avec les variables distantes préservées et `--strict`, sans migration ni modification des secrets.

- Worker : `bienvu-generation-development`, version **`fd07598c-865d-4020-b7a3-38c43aa1486b`**, trafic **100 %**.
- Application Containers : `a0302315-6859-4e3c-9254-891604aee659`, version **27**, ressources **2 / 8192 MiB / 16000 MB**, maximum **1** instance. Bascule terminée et santé confirmée via API.
- Image : `bienvu-renderer@sha256:9d4fd549b023fdb754ee04ee52e5ddb85a9aaebb32c7d6cfe21c30f5c94e3055`.
- **32 bindings conservés exactement**, budget mensuel inchangé et les deux rapports/objets originaux préservés. Le Worker web n’est pas redéployé.
- Worker temporaire `bienvu-render-two-cpu-check-20261010` et son application Containers supprimés, absence vérifiée. Ancienne et nouvelle images conservées. Docker local arrêté après les contrôles.

Les configurations génériques suivies `wrangler.generation.jsonc` et `wrangler.video.jsonc` utilisent `standard-3`. Les configurations opérateur ignorées `wrangler.staging.two-cpu-generation.jsonc` et `wrangler.staging.default-map-generation.jsonc` portent la nouvelle image épinglée et les variables réellement déployées.

Retour arrière : restaurer le code précédent et sa configuration opérateur sauvegardée, avec `standard-2` et l’image `35b63227…`, après vérification qu’aucun rendu n’est actif ; conserver D1, R2, secrets et variables. Une restauration du seul Worker ne suffit pas à rétablir la configuration du conteneur.

Preuves privées ignorées : `evidence/local/render-two-cpu/` — image, scripts de contrôle, MP4, rapports, chronométrages, variables/bindings avant déploiement, ressources, bascule, protection des originaux et nettoyage. Aucun secret ou média privé versionné.
