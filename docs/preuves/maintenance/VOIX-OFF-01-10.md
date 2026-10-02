# Voix facultative et sous-titres liés — 01/10/2026

## Comportement livré

« Voix off » est un bouton activé par défaut. Sa désactivation coupe aussi les sous-titres ; leur bouton et leur case sont indisponibles tant que la voix est coupée. Réactiver la voix permet de sélectionner à nouveau les sous-titres. Le réglage est partagé avec Personnaliser → Voix et texte et conservé dans `sessionStorage`, y compris pendant la connexion de l'invité dans le même onglet.

La demande stricte accepte `voiceEnabled?: boolean` pour URL et annonce manuelle. Le parcours anonyme conserve ce champ. Le serveur force les sous-titres à `false` si la voix est coupée. Aucune synthèse Google, authentification TTS ou piste WAV n'est alors nécessaire ; le texte demeure disponible pour le montage. La durée visuelle est bornée à 20–35 secondes. Quota, filigrane, galerie, ordre des photos et clips Runway restent applicables.

Les manifestes silencieux portent `audio: []`, `audioAssetId: null` sur chaque scène, `voiceEnabled: false`, `subtitlesEnabled: false`. Le renderer produit un MP4 sans flux audio et son dérivé filigrané n'en introduit aucun. Les rapports indiquent `audioCodec: null`, `meanVolumeDb: null`. Les entrées et manifestes anciens omettent le nouveau champ et conservent leurs hashes ainsi que le rendu vocal.

## Fichiers principaux

- Contrats : `product.ts`, `generation.ts`, `narration.ts`, `video.ts` ; vue publique DB dans `generation.ts`.
- Pipeline : providers, Workflow, préparation de narration/manifeste et validation du rapport renderer.
- UI : préférence partagée, saisie principale, formulaire manuel, Personnaliser, essai anonyme et progression de création.
- Rendu : `packages/video/src/listing.tsx` et `apps/renderer/src/listing-render.ts`.
- Tests : `voice-toggle.test.ts`, `trial-api.test.ts`, `generation-workflow.test.ts` et son fournisseur/renderer de fixture.
- Sondes : `probe-video-customizer.mjs`, `probe-voice-disabled.ts`, `probe-voice-disabled-linux.mjs`.

## Vérifications effectuées

Commandes depuis la racine du dépôt, avec Node 24 et pnpm 10 :

```sh
pnpm test
pnpm exec tsx --test --test-concurrency=2 tests/voice-toggle.test.ts tests/trial-api.test.ts
pnpm exec tsx --test --test-concurrency=1 tests/generation-workflow.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm --filter @bienvu/renderer bundle
pnpm exec tsx scripts/probe-voice-disabled.ts
docker build --platform linux/amd64 -t bienvu-renderer:voice-toggle-20261001 -f evidence/local/voice-toggle/Dockerfile .
node --import tsx scripts/probe-voice-disabled-linux.mjs
pnpm build:web
pnpm --filter @bienvu/web exec next start -p 3020
node scripts/probe-video-customizer.mjs
```

- Suite complète : **228 tests réussis**. Après la dernière précision, **5 tests ciblés** et **2 scénarios Workflow** avec/sans voix réussis. Workerd et D1/R2 locaux réels, fournisseurs et stockage MP4 du Workflow simulés ; reprise après interruption, un seul crédit consommé, aucun appel TTS en mode silencieux.
- Types et frontières réussis. Bundle renderer et build OpenNext réussis. Le build garde ses avertissements PNG préexistants ; aucun nouveau blocage.
- UI à **1536, 390 et 320 px**, API de fixture : voix et sous-titres coupés, sous-titres bloqués, préférence après rechargement, panneau synchronisé et requête envoyée avec les deux booléens à `false`. Ordre des photos, narration et style conservés ; pas de débordement.
- **Véritable master natif** : 20 s, 600 frames, 1080 × 1920, H.264/30 fps, faststart, **9 936 791 octets**, hash `a906d75e5066b28e20abea98dc99edd93203260d0121c1c0e4860fc20c2f4936`. FFprobe constate un flux vidéo et aucun flux audio.
- **Véritable dérivé Linux filigrané** : 20 s, même format, **5 379 027 octets**, hash `605d5e7d0f11622f12e4e1425aba4d9fe7c2c08b867d8b7c55020383433af4cd`, aucun flux audio. Image Linux/amd64, utilisateur `node`, réseau désactivé, 2 CPU et 3 Gio. Assets et Range contrôlés ; trois frames du montage final rendues et inspectées, textes du bien et contact lisibles sans sous-titres.

Les photos et l'annonce de cette recette sont fictives ; le clip réel Runway est réutilisé depuis la recette précédente, sans nouvelle création. Le master complet est rendu sur macOS ; Linux produit réellement le dérivé et les images fixes, sans prétendre avoir rerendu le master complet.

## Publication et limites

L'image publiée est `registry.cloudflare.com/5fd251f918593d6bd7594889c4ec8343/bienvu-renderer@sha256:f5202ad63817d8be7014d308dbd62e01a5fa418800d071070b7120a651cade35`. La configuration opérateur correcte est `apps/pipeline/wrangler.staging.runway-generation.jsonc`, reliée à la base produit existante. Le déploiement conserve les variables par `--keep-vars`; aucune migration ou remise à zéro n'est requise.

Publication pipeline `226efedb-f086-4f2b-97fc-1a55f27dfbdb` et web `8937e00b-97d5-4585-b631-c3914a36070f` à 100 %, renderer v10. Accueil 200, 16 fichiers statiques vérifiés par hash, API admin anonyme 401, bindings/secrets/capacité inchangés et zéro job actif. Contrôle Chrome réel à 1536/390/320 px : « Voix off », désactivation couplée des sous-titres, préférence après actualisation et aucune écriture API/génération. Registre de base octobre inchangé à 25,05 € avec plafond de 90 € ; ces provisions ne sont pas une facture totale. Versions et synthèse également consignées dans SUIVI. Aucun commit/push. Journaux, rapports, captures et MP4 restent privés et ignorés dans `evidence/local/voice-toggle/`; le rapport UI de fixture est dans `evidence/local/video-customizer/`.

**Aucune nouvelle création OpenAI, Google TTS ou Runway ; aucun essai produit ni débit de quota déclenché.** Provisions de fournisseur inchangées ; la facture Cloudflare n'est pas rapprochée. Une nouvelle génération complète silencieuse sur Cloudflare sera à vérifier lors du prochain essai utilisateur. Cela reste distinct du Workflow local et du MP4 réel local, même si le code et l'image sont publiés.

Premier essai natif du dérivé interrompu : le FFmpeg réduit livré par Remotion sur macOS n'a pas le filtre `overlay`. Le master silencieux était correct. Le dérivé final a donc été produit et vérifié avec le FFmpeg complet de l'image Linux, puis le conteneur local de recette supprimé.
