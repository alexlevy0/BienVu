# Durée de vidéo et options barrées — 02/10/2026

## Comportement

Le compositeur barre « Voix off » et « Sous-titres » quand leurs options sont coupées. Couper la voix coupe toujours les sous-titres et bloque leur réactivation. Le menu à droite propose 20, 30 et 40 secondes ; défaut 20, préférence conservée dans le même onglet. Les parcours URL, annonce manuelle et anonyme transmettent `durationSeconds`. Personnaliser adapte son aperçu indicatif à cette valeur.

Le serveur refuse toute autre valeur ou tout type non numérique. Admission et idempotence incluent le choix. Narration et manifeste figent exactement 600, 900 ou 1 200 frames à 30 fps, voix activée ou coupée. Les WAV complets sont conservés ; l’unique raccourcissement automatique existant reste borné et ne modifie jamais une narration personnalisée. Le surplus de temps est réparti sur la visite plutôt que sur la seule carte finale. Le transcodage du filigrane dispose de 120, 180 ou 240 secondes selon la durée validée. Les requêtes et manifestes historiques sans durée explicite conservent leurs empreintes et leur rythme automatique.

## Code

- Contrats partagés : `product.ts`, `narration.ts`, `video.ts`, `generation.ts`.
- Pipeline : `narration.ts`, `video-manifest.ts` ; rendu et contrôle du MP4 acceptent 40 s.
- Interface : préférence partagée, compositeur, requête anonyme, formulaire manuel et Personnaliser ; styles barrés et menu natif accessible au clavier.
- Recette : `tests/video-duration.test.ts`, `tests/trial-api.test.ts`, `scripts/probe-video-customizer.mjs`, `scripts/probe-video-duration-render.ts`, `scripts/probe-video-duration-linux.mjs`, `scripts/probe-video-duration-live-ui.mjs`, `scripts/probe-video-duration-watermark.ts`.

## Contrôles locaux effectués

```sh
pnpm exec tsx --test --test-concurrency=2 tests/video-duration.test.ts tests/voice-toggle.test.ts tests/voice.test.ts tests/narration-storage.test.ts tests/video-storage.test.ts tests/trial-api.test.ts
pnpm test
pnpm typecheck
pnpm check:boundaries
pnpm --filter @bienvu/web dev --port 3020
node scripts/probe-video-customizer.mjs
pnpm --filter @bienvu/renderer bundle
pnpm exec tsx scripts/probe-video-duration-render.ts
docker build --platform linux/amd64 -t bienvu-renderer:duration-20261002 -f evidence/local/video-duration/Dockerfile .
node --import tsx scripts/probe-video-duration-linux.mjs --verify-only
docker build --platform linux/arm64 -t bienvu-ffmpeg:duration-test-20261002 -f evidence/local/video-duration/Dockerfile.ffmpeg-native .
pnpm exec tsx scripts/probe-video-duration-watermark.ts
pnpm build:web
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --dry-run --keep-vars
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.runway-generation.jsonc --dry-run --containers-rollout none --keep-vars
pnpm exec wrangler containers push bienvu-renderer:duration-20261002
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.runway-generation.jsonc --containers-rollout immediate --keep-vars
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars
node scripts/probe-video-duration-live-ui.mjs
```

- **33 tests ciblés** puis **238 tests complets** réussis. D1/R2 et workerd locaux réels ; OpenAI, Google et admissions de cette recette sont simulés. Les six combinaisons 20/30/40 avec/sans voix conservent la galerie de huit photos, le cache et l’empreinte de reprise ; aucun TTS lorsque la voix est coupée. La durée différente sur la même clé est refusée, y compris pour l’API anonyme.
- Typage complet et frontières **193 fichiers** réussis.
- Chrome de fixture à 1536, 390 et 320 px : défaut 20, choix et persistance 40, libellés barrés/couplage, panneau synchronisé, requête réellement envoyée avec `durationSeconds: 40`, menu bloqué pendant le job. Aucun débordement ; captures inspectées.
- **Vrai MP4 natif** sur annonce fictive, photos et pistes/clip réutilisés : **1 200 frames**, 1080 × 1920, 30 fps, H.264/AAC, faststart, métadonnée conteneur **40,064 s** (arrondi AAC, tolérance ±120 ms). Taille **22 152 701 octets**, SHA-256 **`c9dcf79e8f2950ddc792f0d7ad1339cb4513f23b257ca9f66188b4d30275b355`**, rendu/vérification **177,62 s**. Frames médiane et carte de contact finale inspectées. Ce contrôle n’est pas une nouvelle écoute humaine.

## Linux et publication

- **Image de production Linux/amd64** : contrat de 1 200 frames accepté, assets privés et Range contrôlés, master H.264/AAC de 40,064 s vérifié par son FFprobe/FFmpeg et carte finale rendue à la frame 1 190. Réseau du conteneur coupé, utilisateur `node`, 2 CPU/3 Gio ; aucun nouveau master ni aperçu produit par cette vérification AMD64.
- **Véritable aperçu Linux/arm64 natif** : le helper `createWatermarkedPreview` du renderer exécute réellement son transcodage FFmpeg dans un conteneur Debian/Node ARM64, sans émulation x86. **1 200 frames**, 40,064 s, H.264/AAC, faststart, **9 794 065 octets**, SHA-256 **`c70545ad20dfe3ce7aa07c5dfb4aeabade5caeeaf4ca023da61cea826644a62f`**, transcodage et vérification **141,60 s**. La frame extraite à 39 s est inspectée : filigrane visible, informations et contact lisibles. Ce conteneur de recette ARM64 n’est pas l’image de production AMD64 ; les deux vérifications sont distinctes.
- Bundle renderer, build OpenNext et deux dry-runs réussis. Avertissements PNG préexistants du build conservés.
- **Publication réelle** : génération **`2d7d7926-d3e8-4f5b-88fe-12bb141a1bfa`**, web **`911e962a-c5b5-4ad3-a71a-c11c9956627f`**, chacun à **100 %**. Renderer **v11**, image **`registry.cloudflare.com/5fd251f918593d6bd7594889c4ec8343/bienvu-renderer@sha256:f43c3756ced2247cba08a35e003c47b5a8c0644ded8594aafd3ad992fa699b8c`**. Capacité conservée : un `standard-2`, 1 CPU/6 Gio, disque 12 Go. Même D1/R2/Workflow/DO ; tous les bindings, secrets et variables web/pipeline comparés à l’état antérieur et inchangés.
- Accueil HTTP **200**, **16 assets statiques comparés par hash**, API `/api/admin` anonyme **401**, aucun job actif lors des contrôles de déploiement.
- **Chrome sur le site publié** à 1536, 390 et 320 px : défaut 20, choix 30/40, libellés barrés/restaurés, sous-titres dépendant de la voix, choix après actualisation, aucun débordement. **Aucune requête API d’écriture ni génération déclenchée** par cette sonde.

Aucun essai produit de 40 s n’a été déclenché sur Cloudflare. Une génération complète nouvelle, en particulier son aperçu anonyme de 40 s sur Containers AMD64, reste à observer lors du prochain essai utilisateur. Cela n’empêche pas la publication des contrats, du renderer et de l’interface vérifiés ci-dessus ; cela ne constitue pas une recette Cloudflare complète de 40 s.

Deux contrôles complets Linux/amd64 émulés sur le Mac ont dépassé le délai de transcodage (120 s puis 240 s) ; aucun de leurs aperçus partiels n’est déclaré valide. La limite de production est désormais proportionnelle à la durée, bornée à 240 s par les 1 200 frames et par les limites générales du job. Le contrôle AMD64 a ensuite été limité explicitement au master, aux assets et à la carte finale ; le véritable aperçu complet a été produit en ARM64 natif comme détaillé ci-dessus. Les conteneurs locaux de recette sont supprimés.

## Budget et limites

Aucun appel OpenAI, Google TTS ou Runway supplémentaire, aucun import ou débit de quota client. Registre distant avant/après intervention inchangé : base octobre 28,05 € + imports 6,50 € = **34,55 € provisionnés**, enveloppe 100 € / coupure 90 € conservées. Les provisions ne sont pas une facture totale et l’infrastructure Cloudflare n’est pas rapprochée ici. La reconstruction/push/déploiement du renderer ne déclenche pas de vidéo produit.

Artefacts privés ignorés : `evidence/local/video-duration/`, captures de fixture dans `evidence/local/video-customizer/`. Aucun commit/push.
