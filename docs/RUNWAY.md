# Animation des photos avec Runway

## Durée adaptée au montage — 09/10/2026

Les nouvelles animations demandent à `gen4_turbo` **2 à 5 secondes entières**, selon la durée réelle du plan : arrondi à la seconde supérieure, minimum deux secondes et plafond historique de cinq secondes. Le [contrat officiel](https://docs.dev.runwayml.com/openapi.json) et le catalogue MCP du projet confirment une plage fournisseur de 2 à 10 secondes ; BienVu conserve son plafond pour éviter d’augmenter le coût des plans longs. Résolution, mouvements, nombre de photos sélectionnées et prix en crédits BienVu restent identiques.

Exemple sans carte : **dix photos animées dans vingt secondes → dix clips de deux secondes**, soit 100 crédits Runway / 1 $ au tarif API de 5 crédits par seconde et 0,01 $ par crédit, au lieu de 250 crédits / 2,50 $. Les durées fractionnaires sont arrondies ; un plan de 0,5 seconde exige quand même un clip de deux secondes. Source : [tarifs API](https://docs.dev.runwayml.com/guides/pricing/).

La planification utilise la narration terminée et retire la séquence de carte. Avec un document d’éditeur, elle respecte les durées personnalisées et choisit la plus longue occurrence d’une photo divisée en plusieurs plans, dont la source recommence à chaque occurrence. Les montages automatiques conservent leur répartition existante : jusqu’à deux animations, cinq secondes par plan lorsque la durée le permet ; au-delà, partage de la durée entre toutes les photos.

La migration `0055_adaptive_animation_duration.sql` conserve les journaux historiques, les tâches soumises, les 25 crédits et provisions de 35 centimes des anciennes animations. Les nouvelles provisions deviennent 5 crédits API et 7 centimes de provision prudente par seconde ; elles ne changent ni le solde prépayé ni les plafonds globaux. Le timing est figé avant le premier appel ; un repli sur photo conserve ce timing et une reprise utilise la durée enregistrée. Les anciennes tâches soumises restent à cinq secondes. Les clips conservés de toutes ces durées sont réutilisés sans nouvelle création payante.

Le manifeste accepte les clips de deux, trois, quatre et cinq secondes. L’éditeur et son rendu tiennent la dernière image réelle d’un clip court, et le montage automatique conserve sa lecture à vitesse normale ou ralentie selon le plan. Les manifestes et vidéos déjà figés ne sont pas réécrits.

Vérification : tests D1/R2 de dix clips avec exactement 100 crédits disponibles, reprise, réutilisation, échecs partiels, migration de tâche historique, payload SDK à deux/trois/cinq secondes et timings d’éditeur avec carte. La sonde `scripts/probe-runway-duration.ts` utilise uniquement un MP4 H.264 simulé de deux secondes et de l’audio synthétique : aucun appel payant fournisseur.

Implémentation du 1 octobre 2026, demandée par Alex après un achat déclaré de **10 € de crédits API**. Cette intégration ne relève pas le plafond mensuel de 100 € / coupure à 90 €. La génération reste un montage automatique.

## Parcours et médias

Dans **Personnaliser → Style → Animation des photos**, choisir les mouvements locaux, une photo Runway ou deux photos Runway. Valeur par défaut : zéro appel Runway. La première photo sélectionnée est animée ; la seconde est celle au milieu de l'ordre sélectionné. L'ordre et le choix des photos sont conservés.

Chaque clip utilise `gen4_turbo`, ratio `720:1280` en vertical ou `1280:720` en horizontal, durée de cinq secondes, sans son. Les cinq secondes sont intégralement utilisées ; les autres photos occupent le reste de la narration, avec au moins une seconde chacune même pour douze photos dans une vidéo de vingt secondes. La sortie finale est 1080 × 1920 ou 1920 × 1080 H.264, avec AAC si la voix est activée, à 30 images/s ; les textes et les droits de téléchargement existants sont conservés. Les clips 720p sont agrandis : ce n'est pas une génération native 1080p. Ces deux ratios sont déclarés dans le [contrat OpenAPI officiel](https://docs.dev.runwayml.com/openapi.json), relu le 02/10/2026. Changer l’orientation ne change ni le nombre de clips demandé ni leur provision.

Les photos fixes bénéficient de quatre mouvements de caméra sobres, variés et déterministes : zoom avant/arrière et translations horizontales/verticales, avec easing et marge de cadrage sans bord vide. Le réglage avancé permet de les désactiver. Les clips ne sont ni bouclés ni résonorisés ; leur dernière image est tenue pendant le fondu. L'aperçu de personnalisation reste indicatif et ne déclenche aucun fournisseur.

L'instruction Runway demande de conserver architecture, mobilier, matériaux et lumière. Une IA vidéo peut néanmoins modifier des détails : l'utilisateur doit vérifier le résultat avant partage. Les photographies originales restent conservées. L'interface et la politique de confidentialité précisent l'envoi facultatif à Runway.

## Intégration et reprise

### Direction Cinéma d'après la référence — 01/10/2026

Alex a fourni une vidéo WhatsApp de **26,26 s / 480 × 848 / 24 images/s** et confirmé une visite immersive, avec les informations surtout à la fin. Les images extraites à 34 instants montrent des travellings, un changement de mise au point, de courtes coupes, des passages noirs, un logo discret et une carte finale. Certains plans contiennent des personnes et l'extérieur évolue du jour vers le soir : ce ne sont pas des changements demandés à l'annonce.

**Cinéma** devient le défaut des nouvelles créations (interface et admission sans réglages), sans réécrire les brouillons ni les manifestes déjà figés. Les autres styles restent proposés. Photos plein écran dégagées, signature de l'agence discrète, mouvements locaux plus amples avec vitesse continue, informations vérifiées et contact uniquement à la fin. La carte utilise un dégradé qui conserve visible la partie haute de la dernière photo ; toutes les photos restent dans la timeline. Voix, sous-titres choisis, droits et filigrane d'essai sont conservés. Les transitions restent les fondus courts ou coupes choisis : aucun passage noir prolongé n'est ajouté.

Les prompts Runway alternent **travelling avant** sur la première photo et **travelling latéral** sur la seconde. Ils décrivent un mouvement simple, continu, proche du point de vue initial, avec conservation des éléments et de la lumière. Ils ne demandent ni personne ajoutée, ni changement de saison/jour, ni pièce inventée. Un zoom ou une translation locale demeure un recadrage **2D**, sans profondeur générée. Le modèle, les cinq secondes, la limite de deux clips et les plafonds prépayés sont inchangés. Cette version ne copie ni le logo, ni les images, ni la piste audio de la référence.

Sources de cette direction de prompting : [guide officiel Gen-4](https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide) (mouvement simple, formulations positives, plan unique) et [index Dev](https://docs.dev.runwayml.com/llms.txt). La qualité des nouveaux prompts reste à apprécier sur une nouvelle génération réelle ; une fixture de transport ne la prouve pas.

La sonde `pnpm exec tsx scripts/probe-cinematic-render.ts` utilise les **octets exacts du clip réel déjà payé** et les photos synthétiques de sa recette. La voix est décodée depuis le précédent master Google/Cloudflare, avec les textes et timings conservés. Elle produit un rendu **local** et des images avec/sans sous-titres, filigrane et charte claire ; aucun import ni appel Runway, Google ou OpenAI, aucune admission distante. Cette preuve locale reste distincte du MP4 Cloudflare précédent et d'une future création Runway avec les nouveaux prompts.

**Recette de cette direction :** 19 tests ciblés réussis, TypeScript complet, frontières sur 192 fichiers, bundle renderer et build OpenNext. Interface sur API **fixtures** à 1536/390/320 px : sélection/ordre, Cinéma, carte finale, voix, narration exacte, sous-titres désactivables et deux clips transmis sans appel fournisseur ; captures inspectées. Vrai MP4 **natif** de 20,053333 s, 600 frames, 1080 × 1920, H.264/AAC, 30 images/s, faststart, **10 426 730 octets**, RMS **−27,04 dBFS**, rendu/contrôle en 180,23 s. Manifeste `a582b6b9…71299`, MP4 `a09926ce…036d6`. Le listing est fictif, le clip est réellement issu de Runway et réutilisé ; la voix décodée ne constitue pas une nouvelle synthèse Google. Images supplémentaires sous-titrées/filigranées et charte claire inspectées, **lecture/écoute humaine de cette nouvelle version restant à confirmer**.

Image Linux construite **par mise à jour de l'image renderer v8 validée**, base exacte `3ebade165…ca3c3` : remplacement des sources `contracts`/`video` et rebundle, sans changement de dépendances, Chrome ou polices. Ce n'est pas une nouvelle installation complète. Tag `bienvu-renderer:cinema-20261001`, index **`f61b2c46a0102700452d9a137fbc5e0d565b6bdb56bb011e9ae95dbde3f92739`**. Sonde Linux réussie sur cette image : **trois PNG** aux frames 30/156/590, vrai clip réutilisé, hashes/Range contrôlés, utilisateur 1000, deux CPU, 3 Gio, réseau désactivé. **Aucun MP4 Linux complet local** produit pendant cette sonde. Conteneur jetable supprimé.

```sh
pnpm exec tsx --test tests/runway-animations.test.ts tests/video-customization.test.ts tests/video.test.ts tests/video-storage.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm --filter @bienvu/renderer bundle
pnpm build:web
pnpm exec tsx scripts/probe-cinematic-render.ts
BIENVU_HOME_URL=http://127.0.0.1:3020 node scripts/probe-video-customizer.mjs
node --import tsx scripts/probe-runway-linux.mjs bienvu-renderer:cinema-20261001 evidence/local/video-reference/cinema evidence/local/video-reference/linux
```

**Publication du style** : pipeline **`18ff5afb-a9fb-4067-806b-91ea42e03cad`**, web **`0f2011ba-6096-4e4f-93e9-211477a665f6`**, chacun à 100 % ; renderer **v9**, index `f61b2c46…92739`, maximum une instance et configuration conservés. Dry-runs stricts, push de l'image puis déploiements avec `--keep-vars` ; anciens bindings et noms de secrets relus identiques. Les premières lectures de l'application renvoyaient v8 en cache ; lecture avec paramètre de fraîcheur confirme v9 et la nouvelle image, sans erreur de santé. Accueil 200, **16 assets** identiques aux octets compilés, admin visiteur 401, zéro job actif avant/après rollout. **Aucune génération Cloudflare supplémentaire**, donc le nouveau MP4 Cinéma complet hébergé reste à contrôler lors d'une utilisation réelle. Retour arrière : anciens IDs web/pipeline et renderer v8 conservés dans les preuves privées.

Solde MCP **1 235 → 1 235 crédits**, zéro nouvelle création Runway/TTS/OpenAI, aucune réservation vidéo ni remise à zéro. Plafonds **100 € / coupure 90 €** conservés ; stockage/lectures/déploiement Cloudflare dans les ressources existantes, facture non rapprochée. Navigateur réel visiteur sur bienvu.online à **1536/390/320 px** : champ présent, aucun débordement, captures inspectées, zéro écriture API ; ce contrôle de l'accueil ne remplace pas une création. Serveur local 3020 arrêté, aucun conteneur de sonde restant. Rapports, fichiers privés et logs : `evidence/local/video-reference/` ; captures UI fixtures : `evidence/local/video-customizer/`. Les résultats Linux non validés de la préparation historique ci-dessous sont remplacés pour le **décodage et les images fixes** par cette nouvelle sonde réussie ; les preuves restent distinguées.

Le Workflow de génération ajoute `animate-selected-photos` après la voix, avant le manifeste et le rendu. SDK officiel `@runwayml/sdk@4.20.1`, secret serveur `RUNWAYML_API_SECRET`. Aucun SDK Runway dans le navigateur. Les octets de la photo privée sont vérifiés (périmètre, taille, SHA-256), envoyés par upload éphémère SDK, puis utilisés via `runway://`. Aucun bucket ou lien d'annonce privé n'est publié.

La ligne `photo_animations` est réservée **avant** l'appel. Le SDK désactive les retries de création et utilise son helper `.waitForTaskOutput()`. L'identifiant de tâche est enregistré avant la première lecture. Une reprise relit la même tâche ; une réponse de création inconnue ne provoque jamais une seconde création. Les lignes de soumission récentes ne sont pas modifiées par une invocation concurrente. Après une interruption ancienne, le résultat reste incertain et la photo est utilisée.

Le SDK 4.20.1 attend environ six secondes avant de lire la promesse de création : un rejet HTTP rapide risquait de devenir non géré. Un handler de rejet est attaché immédiatement à cette même promesse, puis le helper l'attend et remonte toujours l'erreur originale. Il n'y a ni attente préalable de `create()`, ni polling manuel, ni second envoi. Ce cas est reproduit par transport HTTP simulé avec une réponse 500.

Deux clips maximum, 150 s maximum par clip, étape Workflow de six minutes, aucune nouvelle tentative payante automatique. Le code laisse au moins deux minutes pour le rendu dans l'échéance globale. Clé absente, activation fermée, budget absent/épuisé ou échec API : retour aux photos et aux mouvements locaux. Les erreurs sont journalisées avec des codes stables, sans clés, octets, corps fournisseur ou URL JWT. Un MP4 récupéré mais techniquement invalide est refusé par le renderer ; ce cas peut faire échouer le job et libérer son crédit vidéo.

Les sorties sont copiées immédiatement dans **R2 privé**, sous le préfixe exact du job. URL fournisseur HTTPS sur origines attendues seulement, redirections interdites, téléchargement borné à 10 Mio. Le manifeste associe chaque clip à l'identifiant et au hash de sa photo. Le renderer contrôle le hash, le codec, les dimensions et la durée avant décodage. L'expiration des essais anonymes purge aussi leurs clips ; le journal de coûts reste conservé, sans métadonnées d'objet expiré.

## Budget et Super admin

Tarif consulté le 01/10 : **5 crédits/seconde** pour Gen-4 Turbo, **25 crédits / clip**, **0,25 USD avant taxes**. Deux clips = 50 crédits / 0,50 USD. [Tarifs officiels](https://docs.dev.runwayml.com/guides/pricing/) · [Modèles](https://docs.dev.runwayml.com/guides/models/).

Migration additive **`0026_runway_animations.sql`** :

- `runway_budget` rattache l'achat à un mois déjà ouvert. Au maximum 1 000 centimes et 1 000 crédits, avec solde API à vérifier ; aucun mois ou budget Runway n'est ouvert automatiquement.
- L'achat déclaré de 10 € est ajouté **une seule fois** à la base globale lors de la création de cette enveloppe. Les provisions par clip ne sont pas ajoutées une seconde fois à la dépense globale.
- Chaque tentative réelle garde 25 crédits et **0,35 € de provision prudente** dans cette enveloppe prépayée, même en cas d'échec ou de réponse inconnue. Ce montant est un garde-fou, pas une conversion/facture. Le plus bas des limites crédits, prépaiement et budget global s'applique. Avec 10 € provisionnés, 28 tentatives au maximum, sous réserve du solde API et des autres limites.
- Le détail vidéo Super admin montre photo, modèle, état, crédits réservés, provision, tâche API et erreur. Les tests utilisent une base isolée ; leur transport simulé n'est pas un appel facturé.

## Recette API et activation Cloudflare — 01/10/2026

OAuth MCP corrigé avec `mcp:read`, puis vérifié après redémarrage : projet **My project** (`7794588d-a674-47a3-821c-4d03997f2127`), Gen-4 Turbo accessible. Solde lu immédiatement avant l'unique création : **1 260 crédits** ; après : **1 235**, soit **25 crédits consommés**. Clé SDK serveur déployée sans affichage, fichiers privés ignorés par Git.

D1 de production sauvegardée avant les migrations **0026/0027**. L'achat déclaré de **10 €** est imputé une seule fois dans la base d'octobre ; enveloppe Runway à **1 000 crédits / 1 000 centimes**. Les plafonds du service restent **100 € / coupure 90 €**. La migration 0027 conserve aussi les réservations des vérifications faites sur une base isolée : ces 25 crédits et 35 centimes restent déduits du même prépaiement. Aucun remboursement artificiel ni double comptage global.

Le site avait déjà atteint **10 imports pour le jour UTC**. Le test utilise donc une D1 distincte **bienvu-runway-recipe-20261001**, une agence synthétique sans compte authentifié, des photos de démonstration et une allocation technique privée ; aucun quota client ni annonce client n'est modifié. Les champs du bien sont fictifs. Cette recette ne valide aucun import de portail ni abonnement commercial.

La première admission normale lance voix réelle Google, création SDK Runway et rendu Linux Cloudflare. La tâche **`ce82d571-4cee-42c8-8513-05127eb9cab3`** réussit, mais la récupération du clip échoue : Workers ne supporte pas `redirect: 'error'`. La vidéo termine correctement avec les photos fixes, sans clip ; ce premier succès n'est pas présenté comme un rendu Runway.

Correction : téléchargement avec **`redirect: 'manual'`**, toute réponse 3xx refusée avant lecture, aucun suivi vers une origine étrangère. Régression reproduite par transport fixture. Reprise SDK de la **même tâche**, sans nouvelle création facturée, puis copie immédiate dans R2 privé : **1 987 729 octets**, SHA-256 **`2d4e32bf…da80bb0a`**, **720 × 1280 H.264, 24 images/s, 5,041667 s**, sans piste audio. La durée déclarée de cinq secondes conserve la tolérance de contrôle du renderer.

La seconde admission reprend le Workflow produit dans un Worker de recette dont seul le fournisseur de création est remplacé : il vérifie le hash exact de la photo, enregistre la tâche existante et appelle le SDK de reprise. La ligne locale a `mode=mock` et zéro provision Runway parce qu'elle réutilise une création déjà payée ; **les octets du clip sont une vraie sortie Runway**, pas le clip simulé du test natif. Voix, R2, manifeste et renderer Cloudflare restent réels. Cette distinction est conservée dans `recovery-intent.json` et les journaux. Aucun second `imageToVideo.create()`.

Deux admissions de recette réservent chacune **1,20 €** pour le service, comptabilisées dans la D1 globale par des événements d'estimation distincts. Avec l'achat de 10 €, le registre d'octobre passe de **17,10 à 29,50 €** de provisions, avant éventuelle activité utilisateur ultérieure. Les 35 centimes Runway sont inclus dans le prépaiement. Ces provisions ne constituent pas une facture Cloudflare ou une conversion fiscale du tarif USD.

Image Linux publiée par digest **`3ebade165afc3953465a576685f3b2d8580c9bde94cbcecbe52a716a237ca3c3`**, renderer de production version **8**, 1 instance maximum, 1 CPU / 6 Gio. Configuration effective de génération conservée dans `apps/pipeline/wrangler.staging.runway-generation.jsonc` (ignorée par Git), Worker **bienvu-generation-development**, D1 **bienvu-s00-staging** ; la configuration historique `wrangler.staging.generation.jsonc` pointe vers une autre base et ne doit pas servir à publier sur le domaine.

Pour toute réactivation ultérieure : vérifier le mois, le registre global et le solde MCP ; ajouter le secret serveur par entrée standard ou `--secrets-file` privé ; conserver les bindings/secrets existants. `RUNWAY_TEST_AGENCY_ID` permet de limiter une première publication à une agence de recette, vide après validation technique. Retour arrière : **`RUNWAY_ENABLED=false` et `runway_budget.paused=1`** ; garder les réservations et les médias existants.

**MP4 de reprise terminé** : job `97d0f60c-b089-4888-838e-11c79d0474c7`, manifeste `b702cf95…7d9e17c`, **20,053333 s / 600 frames / 1080 × 1920 / 30 images/s / H.264-AAC / faststart**, **9 478 554 octets**, volume moyen **−24,03 dBFS**. Rendu et contrôle en **172,43 s**. Téléchargement R2 et SHA-256 du clip/master revérifiés ; images aux secondes 0, 2,5, 4,9, 6, 12 et 19,5 inspectées : clip et textes présents, contact final lisible, trois photos dans la timeline (150/225/225 frames). Les vues comparées du clip conservent les principaux éléments visibles ; cela ne garantit pas l'absence de toute modification IA sur une autre annonce.

**Publication** : pipeline `be1830e5-d7cf-44b9-b809-4525183f51a9`, web `17c75997-c628-41f9-a3d5-0094ed8b1c37`, chacun à 100 %. `RUNWAY_ENABLED=true`, restriction d'agence vide, enveloppe ouverte ; valeur client par défaut zéro clip. Aucun changement des anciens bindings/secrets de génération. La recette initiale création + récupération + rendu a nécessité le correctif de téléchargement ; le second Workflow utilise la création préexistante via le fournisseur de reprise décrit ci-dessus. Une nouvelle création après ce correctif n'est pas facturée pour répéter la preuve.

Nettoyage : Workers de recette/reprise, Workflow et application Containers temporaires supprimés après arrêt du conteneur. D1 de recette et médias R2 privés conservés pour les preuves, aucune agence synthétique créée dans la D1 produit. Solde MCP final toujours **1 235 crédits**. Accueil 200, **16 assets** distants conformes par SHA-256, API admin sans session 401, anciens bindings web/génération conservés.

Les commandes, réponses d'admission, empreintes, captures, exports et rapports techniques sont dans `evidence/remote/runway/`, hors Git. La lecture humaine de la nouvelle vidéo reste distincte des contrôles techniques et de l'inspection des images.

## Recette locale reproductible

```sh
pnpm exec tsx --test tests/runway-animations.test.ts
pnpm check
pnpm --filter @bienvu/renderer bundle
pnpm exec tsx scripts/probe-runway-render.ts
docker build --platform linux/amd64 -f apps/renderer/Dockerfile -t bienvu-renderer:runway-20261001 .
node --import tsx scripts/probe-runway-linux.mjs
```

La sonde utilise les photos de démonstration et les WAV Google **déjà validés**, puis fabrique un clip local avec Sharp/FFmpeg. Ce clip simule une sortie API et ne prouve ni le modèle, ni le solde, ni la qualité Runway. Rapport dans `evidence/local/runway/render-report.json`, images et MP4 locaux hors Git. MP4 contrôlé : 20,053 s, 1080 × 1920, H.264/AAC, 30 images/s, faststart, 11 592 679 octets ; rendu et vérification en 78,44 s. La sonde UI `scripts/probe-video-customizer.mjs` contrôle le réglage à 1536, 390 et 320 px avec API simulées, sans génération distante ; sa dernière exécution réussit sur le build final et intercepte aussi les requêtes d'images.

Résultats conservés localement : `evidence/runway-check.log` (**226 tests**, types et frontières), `evidence/runway-web-build.log`, `evidence/runway-web-dry.log`, `evidence/runway-generation-dry.log`, `evidence/runway-bundle.log`, `evidence/runway-ui-final.log` et `evidence/runway-render.log`. Le serveur de recette créé sur le port 3020 est arrêté. Ces tests locaux restent distincts de la recette API et Cloudflare ci-dessus.

**Linux — préparation supplémentaire :** construction Docker `linux/amd64` réussie, tag local `bienvu-renderer:runway-20261001`, digest de l'index exporté **`3ebade165afc3953465a576685f3b2d8580c9bde94cbcecbe52a716a237ca3c3`**, journal `evidence/runway-docker-build.log`. La sonde spécifique prépare deux PNG (image animée et fondu) avec réseau désactivé, utilisateur `node` de l'image, limite de 3 Gio et deux CPU. **Son exécution n'est pas validée** : le premier essai dépasse 30 s au lancement Docker, le second dépasse 30 s sur `docker image inspect`, avant le rendu. La VM locale annonce 4 Gio ; aucune configuration Docker globale n'a été modifiée. Journaux : `evidence/runway-linux.log`, `evidence/runway-linux-final.log`. Le délai de démarrage et le nettoyage du conteneur ont été renforcés après le premier incident ; ni ces timeouts ni la construction réussie ne prouvent le décodage Linux du clip.

La sonde de rendu Linux complet `scripts/probe-video-container.mjs` accepte désormais tous les médias du contrat, dont les clips MP4, et un répertoire de preuve optionnel. Elle exige toujours 6 Gio de VM pour le rendu complet. Elle n'a pas été exécutée avec le nouveau clip sur cette VM de 4 Gio. Le rendu complet natif et ces vérifications Linux restantes sont des preuves distinctes ; terminer le test Cloudflare après résolution de l'accès MCP.

Nettoyage final : le premier lancement avait laissé un conteneur à l'état `Created`, sans exécution. Ce conteneur de recette a été supprimé explicitement ; la liste des conteneurs utilisant cette nouvelle image est vide après suppression. Aucun autre conteneur, volume ou paramètre Docker n'a été supprimé ou modifié.

Documentation d'implémentation : [SDK](https://docs.dev.runwayml.com/guides/using-the-api/) · [Entrées éphémères](https://docs.dev.runwayml.com/assets/uploads/) · [Conservation des sorties](https://docs.dev.runwayml.com/assets/outputs/).
