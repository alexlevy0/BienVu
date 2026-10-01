# Personnalisation avant génération — 1 octobre 2026

## Résultat

Alex demande « Personnaliser » à gauche de la génération et fournit une maquette. Il confirme la narration modifiable et plusieurs styles. Le panneau reprend le studio : résumé du bien, onglets Photos / Style / Voix et texte, sélection/ordre par glisser-déposer ou boutons, ajout de photos, aperçu vertical et réglages avancés. Trois styles plein écran : Éditorial, Minimal et Cinéma. Voix Aoede/Kore/Charon, sous-titres et couleurs propres à la vidéo. Le formulaire reste monté pour conserver les informations quand on revient en arrière.

Une annonce URL complète est copiée en brouillon privé avant édition, sans altérer l'original ou une vidéo existante. La sélection est contrôlée avant réservation, les seuls objets retenus sont vérifiés et figés ; une photo désélectionnée absente ne bloque pas le job. Le texte personnalisé est prononcé exactement sans rédaction OpenAI. Au-delà de 35 secondes d'audio, un échec explicite remplace toute réécriture ou coupure.

Visiteur : styles/voix/sous-titres/narration possibles sur le lien anonyme ; photos récupérées à la génération. Leur sélection avant génération nécessite l'import dans un compte. Les photos manuelles et réglages restent préparables sans compte, mais ce parcours demande toujours une connexion à la création. L'aperçu est **visuel et indicatif**, sans voix synthétisée ni vidéo finale ; choisir une voix n'en lance pas une audition.

## Tests et preuves locales

- `pnpm check` : **219 tests** réussis, TypeScript et frontières. Derniers changements contrôlés par les trois tests personnalisés, TypeScript complet, frontières **191 fichiers** et build final.
- `tests/video-customization.test.ts` : entrées strictes, rejet d'indices étrangers/dupliqués, hashes historiques, copie/rejeu/isolation D1/R2 sans débit ; sélection, texte exact, voix, manifeste et reprise sans nouvel appel. Fournisseurs **simulés** : zéro OpenAI, quatre synthèses ; variante audio trop longue : quatre synthèses, zéro correction, texte version 1 conservé.
- Dernières régressions : **12 tests** des Workflows connecté/anonyme et de la narration D1/R2 réussis après le contrôle des photos sélectionnées ; frontières, types et dry-runs finaux réussis. `git diff --check` sans erreur.
- `node scripts/probe-video-customizer.mjs` : vrai navigateur local, **API et photos de fixture**, 1536/390/320 px sans débordement horizontal. Six photos puis cinq sélectionnées, seconde déplacée en premier, Cinéma, Kore, première phrase modifiée, sous-titres désactivés ; POST avec `[1,0,2,3,4]` et choix exacts. Captures ordinateur/mobile inspectées. Aucun appel Cloudflare/fournisseur de cette sonde.
- `node --import tsx scripts/probe-video-styles.ts` : vraies images Remotion d'ouverture/contact des trois styles, planche inspectée ; **vrai MP4 natif** Cinéma 1080×1920, H.264/AAC, 600 frames à 30 fps, 20,053 s, fast-start, 11 258 534 octets, volume moyen −24,198 dB. Rendu/contrôle 64,617 s ; SHA-256 `1c0f06339e5fac776933e8332154b3db7dfa464fce30199e7c921543617db26c`. Annonce/photos de démonstration ; WAV Google **Aoede déjà validés humainement** réutilisés, textes/hashes recoupés. Aucun nouvel appel texte/voix. Ce MP4 n'est pas un import immobilier réel ni un rendu Cloudflare.
- `pnpm probe:voice --voices` : vraie API Google existante, les trois voix disponibles, **zéro synthèse**. Kore et Charon n'ont pas été nouvellement écoutées.
- Image Docker construite en **Linux amd64** ; contrôle d'exécution x64/Linux, FFmpeg **5.1.9** et Chromium **149.0.7790.0**. Conteneur local de contrôle supprimé automatiquement. Ce contrôle d'image ne représente pas un nouveau rendu Linux complet.

Commandes principales :

```sh
pnpm check
pnpm exec tsx --test tests/video-customization.test.ts
pnpm exec tsx --test --test-concurrency=1 tests/generation-workflow.test.ts tests/narration-storage.test.ts tests/trial-workflow.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
# Serveur Next local sur 3020 ; APIs intégralement simulées par la sonde.
node scripts/probe-video-customizer.mjs
node --import tsx scripts/probe-video-styles.ts
pnpm probe:voice --voices
docker build --platform linux/amd64 -f apps/renderer/Dockerfile -t bienvu-renderer:customizer-20261001 .
pnpm exec wrangler containers push bienvu-renderer:customizer-20261001 --config apps/pipeline/wrangler.staging.partial-generation.jsonc
pnpm exec wrangler deploy --config apps/pipeline/wrangler.staging.customizer-generation.jsonc --keep-vars --strict --containers-rollout immediate
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars --strict
```

Preuves brutes ignorées : `evidence/local/video-customizer/` (captures, planche, rapports), `evidence/local/sprint-06/style-{editorial,minimal,cinematic}-20261001/` (manifestes/médias), `evidence/remote/video-customizer/` (état/configuration). Aucun secret ou média privé ajouté aux fichiers suivis.

## Publication

- Pipeline **`b720fc42-4a0e-4b2e-b175-536e9ab8684c`** à **100 %** ; renderer existant `a0302315-6859-4e3c-9254-891604aee659`, version **7**, même maximum d'une instance / 1 vCPU / 6 Gio / 12 Go. Image effective **`8916004306a45e463530588f5c6e857799a3203578120510650a74b959b4150c`**, rollout **`bef14567-6726-4178-b809-52d9c8d5b68e`** terminé à **100 %**, une instance saine sans erreur. Le fichier opérateur local épingle le nouveau digest. Aucun nouveau MP4 n'est déduit de ce contrôle de santé.
- Web **`696c025c-35d6-4356-b91d-f464bb02502f`** à **100 %** sur **bienvu.online**. Accueil réel **200**, bouton et panneau présents dans le build servi ; **16 assets CSS/JS** en 200, SHA-256 identiques au build local, classes des nouveaux contrôles/styles retrouvées. API générations/admin et nouvelle copie de personnalisation sans session **401**. Variables, bindings et noms de secrets web/pipeline comparés avant/après : identiques. Aucun changement de compte, quota, allocation, facturation ou migration.
- **Vrai navigateur sur le domaine, sans APIs simulées** : visiteur sans session, lien de forme Orpi saisi sans import, ouverture de Personnaliser, trois styles disponibles, choix Minimal appliqué à l'aperçu, trois voix présentes ; capture inspectée à 1536 px, aucun débordement horizontal. **Zéro POST, zéro vidéo générée**, navigateur fermé. Les photos et faits d'une annonce réelle ne sont pas déduits de cette ouverture du panneau. Le 401 de `/api/me` correspond à l'absence normale de compte connecté.
- Registre d'octobre : **13,50 € avant → 14,00 € après**, coupure **90 €**, enveloppe **100 €**, aucune génération active avant/après. D1 montre une provision d'import manuel de **0,50 € à 16:25:35 UTC**, pendant la fenêtre de travail, avant la publication du nouveau pipeline ; zéro requête externe et zéro Browser Run comptés pour cette préparation. Cette tâche n'a émis aucun upload/import distant ni lancé de génération réelle ; la provision parallèle est conservée, sans attribution inventée à un appel modèle. Pas de nouvel appel OpenAI/Google de synthèse pour la recette ; liste Google seule consultée. Les opérations de publication/préchauffage restent du trafic d'infrastructure, non une facture rapprochée.
- Serveur Next de recette arrêté, navigateur headless fermé, conteneur Docker de contrôle supprimé ; aucun conteneur local actif. Docker Desktop et les autres applications restent disponibles. État local conservé, sans commit/push automatique pour cette demande.

## Vérification distante restante

Sur une prochaine génération autorisée, importer une annonce dans le compte puis personnaliser : déplacer la seconde photo en premier, désélectionner une photo, choisir Minimal ou Cinéma et une voix, modifier une phrase, puis générer. Contrôler le MP4 Cloudflare : ordre/absence de la photo, style, phrase exacte, voix choisie, sous-titres, carte de contact et droits au filigrane. Les fixtures UI/D1/R2, le vrai rendu natif et la publication sont des preuves distinctes ; aucun nouveau job Cloudflare personnalisé n'est déduit de leur réussite.
