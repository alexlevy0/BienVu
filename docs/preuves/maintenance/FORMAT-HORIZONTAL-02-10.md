# Format horizontal 16:9 — 2 octobre 2026

Demande : rendre le bouton Vertical 9:16 basculable et produire un véritable MP4 horizontal lorsque Horizontal 16:9 est choisi.

## Implémentation

- Bouton avec icône et libellé adaptés, préférence conservée dans l’onglet ; valeur par défaut verticale, choix bloqué pendant la génération.
- Format transmis aux parcours URL, manuel et anonyme, y compris la soumission automatique après Turnstile. Personnaliser, conversation, lecteurs privés et page publique respectent l’orientation.
- Les descriptifs des offres et des conditions d’utilisation mentionnent les deux formats ; tarifs et quotas ne sont pas modifiés.
- Champ facultatif `aspectRatio` dans les contrats et l’entrée immuable ; absence sans défaut injecté pour préserver les empreintes historiques. Vue du job alimentée par cette entrée. Aucune migration D1 ni conversion des anciens résultats.
- Nouveau template `bienvu-horizontal/1`, canevas 1920 × 1080 dans Remotion, trois styles avec titres, sous-titres et contact adaptés. La galerie et les clips couvrent le cadre par recadrage au centre ; aucun contenu inventé.
- Les clips Runway futurs demandent `1280:720` au lieu de `720:1280`, sans changement du modèle, du nombre de clips ni de leur durée/coût prévu. Contrat OpenAPI officiel vérifié ; aucun nouvel appel Runway réel pour cette recette. Un clip vertical déjà payé reste réutilisable par recadrage.
- Renderer et coordinateur contrôlent les dimensions du manifeste sur le master et son aperçu filigrané. Les résultats carrés, les formats contradictoires et les rapports d’un autre format sont refusés.

## Vérifications locales

Commandes : `pnpm typecheck`, `pnpm --filter @bienvu/renderer bundle`, tests ciblés format/durée/coordinateur/essai, `node --import tsx scripts/probe-video-format-render.ts`, `node scripts/probe-video-format-ui.mjs`, build OpenNext et image Linux amd64.

Un véritable MP4 natif est produit sur une annonce fictive avec des WAV et un clip Runway déjà payés : **1920 × 1080, 600 frames, 30 fps, 20,053333 s, H.264/AAC, faststart, 8 313 668 octets**, volume moyen −27,04 dBFS, rendu et contrôle en 76,50 s. SHA-256 `9fac7d59cd0554848f9b44c9d8b551ccef43299af8720281f28d372232a11cc4`, manifeste `74eb9eb52e9b6bfcf6b04a0ae9c25cfde5d4165d17ce2edf2cf517b5e50e875f`. La vérification volontaire avec les dimensions verticales est refusée.

Neuf images sont rendues dans les trois styles aux frames 30/300/590 ; ouverture éditoriale et contacts minimaliste/cinématique inspectés. Dans l’image Linux amd64, sans réseau et sous utilisateur 1000, le master natif est revalidé, les médias et leur accès par plages sont contrôlés, trois images sont rendues et **un véritable aperçu filigrané horizontal** est produit avec FFmpeg puis revérifié. SHA-256 de l’aperçu `e58a1e1e93078b1784932bd7d48bbc4e036224531160b2c681a8f982f70a5099`, 4 946 439 octets, 20,054 s. La première tentative Docker a dépassé son délai de démarrage ; la seconde réussit après la fin du build. Cette sonde Linux ne rend pas à nouveau le master complet.

Navigateur réel à **1536, 390 et 320 px** : défaut vertical, aller-retour de la bascule, préférence après rechargement, ratio 16:9 de Personnaliser, aucun débordement. Sur fixture locale seulement, Turnstile et l’admission sont interceptés : la requête contient `aspectRatio: '16:9'`, le job en cours affiche ce format et le bouton devient indisponible. Cela ne prétend pas valider un nouvel essai Cloudflare complet.

Les tests workerd/D1/R2 couvrent 20/30/40 secondes, la voix et le mode muet horizontal, l’idempotence, le manifeste figé et le refus d’un résultat de dimensions incorrectes. La requête SDK Runway est vérifiée par transport simulé pour les deux ratios. La première suite globale a subi quatre réinitialisations de connexion workerd pendant le build Docker ; les trois fichiers concernés réussissent ensuite seuls (18 tests). Aucun contournement produit pour ce problème local. **La suite finale `pnpm check` réussit : 250 tests, aucun échec, frontières et types du monorepo validés.** Build OpenNext, bundle Remotion, image Linux amd64 et `git diff --check` réussis.

Preuves techniques, captures et journaux : `evidence/local/video-format/`, ignoré par Git. MP4 : `render/video.mp4` ; dérivée Linux : `linux/preview.mp4`. Aucune nouvelle synthèse voix, rédaction OpenAI, animation Runway, vidéo Cloudflare, import ou consommation de crédit utilisateur n’est déclenchée pour cette recette.

## Publication

Image amd64 publiée au registre Cloudflare par digest `9ba35b60dca6df050e9c8d49d5fb418ffc9cc579995ae0f54ff18eaf0348bcdc`, maximum une instance `standard-2` (1 CPU, 6 Gio). Renderer version **13**, rollout **completed / 100 %** ; l’ancienne image était encore retournée pendant la progression du rollout, la nouvelle configuration est vérifiée après sa fin.

Publication dans l’ordre moteur, puis interface : `wrangler deploy --config apps/pipeline/wrangler.staging.runway-generation.jsonc --keep-vars --containers-rollout immediate`, puis `pnpm --filter @bienvu/web exec wrangler deploy --config wrangler.staging.jsonc --keep-vars`. Génération **`6132ee94-66de-4590-9885-cca81e26ff7c`**, web **`469668b0-cfd6-4283-8b01-1765266461fd`**, chacun effectivement **100 %**. Les **28 bindings de génération et 25 bindings web**, leurs valeurs et leurs paramètres de compatibilité sont identiques aux relevés avant publication. Générations ouvertes, date de contrôle conservée, zéro job actif ; aucun compteur remis à zéro.

`BIENVU_HOME_URL=https://bienvu.online node scripts/probe-video-format-ui.mjs` réussit dans Chrome sur **1536/390/320 px** : préférence, aller-retour des formats, ratio d’aperçu et absence de débordement. Capture mobile inspectée. Tous les appels API d’écriture sont bloqués par cette sonde ; aucune admission réelle. Accueil et connexion en **200**, API admin réelle `/api/admin?section=overview` sans session en **401**. Une première vérification avait utilisé la route inexistante `/api/admin/overview` (404) ; l’URL corrigée est vérifiée, sans changement applicatif.

Budget global d’octobre avant/après **36,95 € provisionnés**, coupure **90 €**, enveloppe autorisée **100 €**. Aucun nouvel appel applicatif payant ni crédit vidéo consommé pour cette recette. Déploiements et lectures utilisent les services existants ; facture Cloudflare non rapprochée. Données et configuration privées de publication dans `published.json` et les relevés locaux, hors Git.

Après la dernière publication du descriptif des formats, les trois largeurs du navigateur sont revérifiées avec succès. Les **16 assets JavaScript/CSS** référencés par l’accueil sont en 200 et ont exactement les SHA-256 du build local ; les conditions publiées mentionnent bien le 16:9. Configuration, budget et absence de job actif revérifiés.

## Couleur du bouton de format — 02/10/2026

Alex signale une différence avec Voix off et Sous-titres. Dans Chrome, la couleur initiale du format est `rgb(17, 18, 15)`, les deux autres options sont `rgb(57, 70, 57)`. La règle générale `.home-studio button {color:inherit}` l’emportait sur `.home-format-pill`. Le bouton de format utilise désormais la même priorité de couleur que les autres options, avec `#394639`. Modification limitée à cette déclaration CSS.

Vérification avant publication avec le CSS source injecté dans le navigateur : Vertical 9:16 et Horizontal 16:9 sont tous deux `rgb(57, 70, 57)`, identiques à Voix off et Sous-titres à 1536/390 px. Captures inspectées, aucun débordement ni appel API d’écriture. Build OpenNext réussi ; aucun rendu ou fournisseur sollicité. Relevés et captures sous `evidence/local/format-color/`, ignoré par Git.

Correction publiée à **100 %** sur le web, version **`8e4b5713-a642-4708-8ff8-15e5e08caac8`** ; les 25 bindings et la compatibilité sont conservés. Nouvelle vérification sur bienvu.online sans injection CSS : les deux formats ont exactement la même couleur que les deux options à 1536/390 px, capture mobile inspectée, zéro écriture API ni génération.

Limite : rendu complet natif, contrôle et dérivée dans l’image Linux, tests D1/R2 et interface sont distingués d’une nouvelle génération horizontale complète en production. Les WAV et le clip déjà validés sont réutilisés ; aucune nouvelle écoute humaine ou sortie Runway horizontale réelle n’est revendiquée.
