# Galerie complète dans les vidéos — 1 octobre 2026

## Résultat et limites

Alex souhaite inclure les huit photos d'une annonce Orpi. Le pipeline d'import accepte déjà jusqu'à 12 photos distinctes, mais la préparation vidéo ne conservait que les 3–6 choisies dans les scènes de narration. Lecture réelle de D1 avant correction : les deux derniers jobs réussis avaient **12/7 photos importées et 5/5 photos dans leur manifeste vidéo**.

Les nouvelles préparations copient maintenant toutes les photos de l'annonce normalisée et figent leur défilement dans `photoTimeline`. Le nombre de scènes et de pistes vocales reste de 4 à 6. Chaque photo défile une fois dans l'ordre d'import ; les durées entières couvrent exactement toute la narration. Le modèle plein écran utilise un fond photographique indépendant des scènes parlées, avec zoom et fondu de huit frames. Le choix des sous-titres, le contact et les droits au filigrane sont conservés.

**Limites conservées :** 3–12 photos, 20–35 secondes, 70 Mio de médias dans le manifeste, import borné à 50 Mio / 20 requêtes / 60 s. Une galerie avec huit photos effectivement importées est intégralement utilisée. Ce changement ne garantit ni la récupération d'une image inaccessible ni une galerie illimitée. Aucune modification des MP4 historiques ou resynthèse de leur narration. Propriété facultative sans défaut : les anciens JSON restent lisibles avec leur hash initial. Le code `/1` conserve son comportement.

Fichiers : `packages/contracts/src/video.ts`, `apps/pipeline/src/video-manifest.ts`, `packages/video/src/photo-timeline.ts`/`listing.tsx`, fixtures et sondes vidéo, tests import/vidéo/stockage. Aucun schéma D1, quota client, prix ou paramètre fournisseur modifié pour cette tranche. Les modifications précédentes restent présentes.

## Recette locale

- **20 tests ciblés réussis** : import de huit images via transport synthétique avec les limites habituelles ; contrat/timing pour 3, 8 et 12 photos ; chaque frame attribuée, premier/dernier frame de chaque passage et somme exacte, rejet des omissions, doublons, ordre étranger, photo étrangère et durée invalide ; anciennes empreintes, droits, idempotence/reprise, Workflow et stockage.
- D1/R2 locaux dans Miniflare : préparation d'une annonce à huit photos, copie de toute la galerie, manifeste figé et concurrent, isolation. Retrait puis altération de la huitième photo, absente du plan parlé : refus `VIDEO_ASSET_MISSING` puis `VIDEO_ASSET_HASH_MISMATCH`, reprise après restauration réussie. Fournisseurs de ce test simulés. La dernière variante de ce test a été réexécutée séparément avec succès.
- TypeScript complet puis dernier contrôle des tests, frontières (187 fichiers), bundle Remotion, builds web/image, dry-runs web/pipeline et diff vérifiés. La dernière variante du test de stockage des générations utilise aussi huit photos : vignette privée, téléchargement et partage volontaire relus avec succès. Elle a mis 264,60 s pendant le build web ; la contention mémoire du Mac a été levée en arrêtant temporairement Docker Desktop sans conteneur local actif. Ce délai n'est pas une performance applicative distante.
- **Un vrai MP4 Remotion/FFmpeg natif** : 1080×1920, 600 frames à 30 fps, H.264/AAC, 20,053 s, fast-start, 13 972 916 octets, volume moyen −24,198 dB ; rendu et contrôle 82,89 s. SHA-256 `03717969102c481a6af6211ef8e5a0ea76c1572a5e369976214819b1394c95d9`. Huit PNG aux frames 37/112/187/262/337/412/487/562 et planche de contact inspectés : les huit images sont visibles, texte lisible et carte de contact présente.
- Ce MP4 est une **fixture d'annonce**, avec sept photos de démonstration et une variante miroir pour la huitième. La voix est celle des cinq WAV Google déjà validés à l'écoute, leurs hashes et textes sont recoupés avant copie ; **0 nouvel appel texte/voix**. Ce n'est pas un nouvel import Orpi réel ni un MP4 Cloudflare. Le premier lancement de la sonde exigeait par erreur quatre WAV, alors que la narration validée en possède cinq ; assertion corrigée vers la plage contractuelle 4–6 et sonde réussie. Aucun rendu n'avait commencé lors de cet échec.

Commandes :

```sh
pnpm exec tsx --test --test-concurrency=1 tests/import-network.test.ts tests/video.test.ts tests/video-storage.test.ts tests/video-coordinator.test.ts tests/generation-workflow.test.ts tests/generation-storage.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm --filter @bienvu/renderer bundle
# macOS : définir les chemins FFmpeg/ffprobe fournis par @remotion/compositor-darwin-<arch>.
node --import tsx scripts/probe-photo-gallery.ts
docker build --platform linux/amd64 -f apps/renderer/Dockerfile -t bienvu-renderer:gallery-20261001 .
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.product-generation.jsonc --keep-vars --strict --dry-run --containers-rollout none
git diff --check
```

Les médias, manifestes, journaux et instantanés privés sont ignorés sous `evidence/local/all-photos` et `evidence/local/sprint-06/eight-photos-20261001`. Le serveur Linux peut être testé avec `probe-video-container.mjs` sur une VM d'au moins 6 Gio ; la VM Docker du Mac est limitée à 4 Gio. La construction amd64 n'est pas revendiquée comme ce test de rendu Linux.

## Publication et vérification distante

- Pipeline **bienvu-generation-development**, version **`c4ff189c-6177-4eee-8802-1ecd5fd2e6a6`**, **100 %**. Image amd64 poussée, digest **`60e2c46f252b628627e8f8912782cd8b6094a8f4b97833f30fd8e3ac16f78ead`**, application existante **`a0302315-6859-4e3c-9254-891604aee659`**, ressources et maximum d'une instance conservés. Bindings/variables/secrets du pipeline comparés avant/après, identiques.
- Rollout **`d8440ae2-9568-49a8-a766-4e8e2346e1c0`** suivi jusqu'à **`completed`**, **100 %** de la nouvelle image et zéro ancienne version. L'image effective de l'application correspond au digest publié. [Documentation du rollout](https://developers.cloudflare.com/containers/configuration/rollouts/). Le GET opérateur confirme ensuite **aucun rendu actif, processus conteneur `stopped`**. La première liste contient encore une VM de la nouvelle version avec `container_status: stopped` ; le contrôle final après sa libération retourne **zéro instance physique**, admission toujours activée. Aucun nouveau MP4 Cloudflare n'est déduit du préchauffage ou du rollout.
- Web **bienvu-web-probe-staging**, domaine **bienvu.online**, version **`8ee1383f-8cb5-4ffc-a5a6-abe3c794237b`**, **100 %**. Le web est aussi publié avec le contrat étendu : il valide `VideoManifest` pour les vignettes privées et publiques. Bindings/variables/secrets comparés à la publication précédente, identiques. Accueil et Explorer **200**, leurs **14 CSS/JS** d'accueil identiques au build local par SHA-256 ; API générations/admin sans session **401**. La première sonde demandait par erreur `/api/admin/overview` (route inexistante, 404), corrigée vers `/api/admin` puis vérifiée ; aucune opération admin réalisée par cette sonde. Docker Desktop restauré après les builds/contrôles, zéro conteneur local actif.
- Admission brièvement suspendue dans `generation_control` avant publication alors qu'aucun job n'était actif ; état antérieur conservé et **générations rouvertes** après contrôle de l'image et du web. Ni quotas ni compteurs remis à zéro. Quatre manifestes D1 historiques lus avec le nouveau contrat et hashes inchangés ; **six jobs, aucun actif**, conservés. Aucune mutation de leur vidéo.
- Budget d'octobre avant/après **10,50 € engagés / 90 € de coupure / 100 € d'enveloppe** ; septembre **44,80 €/45 €** conservé. Cette recette n'a ajouté aucune provision, import, génération ou appel OpenAI/Google du projet. Les opérations de déploiement/D1/R2 et de préchauffage de la plateforme restent du trafic d'infrastructure à rapprocher avec Cloudflare ; ces montants sont des provisions et non une facture rapprochée.

**Vérification restante précisément délimitée :** lors d'une prochaine génération autorisée sur le domaine, ouvrir une annonce dont la galerie normalisée contient huit photos, relire le manifeste avec huit entrées `photos` et huit entrées `photoTimeline`, puis vérifier le MP4 Cloudflare (huit images visibles, voix complète, sous-titres selon le choix, carte de contact, filigrane selon les droits). Les vrais 600 frames locaux, l'image publiée et la fin du rollout sont vérifiés ; aucun nouveau MP4 distant à huit photos n'est revendiqué pour cette maintenance. Aucun accès externe manquant ; recette fournisseur supplémentaire non lancée afin de garder les essais payants rares.
