# Avatars IA facultatifs

L’option est dans **Personnaliser → Avatar IA**, et dans les réglages audio de l’Éditeur. Elle est désactivée dans les nouveaux projets et réservée aux comptes connectés. L’utilisateur choisit le présentateur, l’ouverture, la conclusion, les deux ou **Pendant toute la vidéo**, le médaillon, le cadre ou une silhouette vérifiée sans fond, la taille et la position. Le présentateur reprend la voix off existante. Un choix de voix féminine avec un avatar masculin, ou l’inverse, affiche un avertissement non bloquant. Aucun genre n’est déduit d’une photo ou d’un nom : une métadonnée inconnue n’entraîne pas d’alerte.

La taille est réglable de **15 à 100 % de la largeur de la vidéo**, avec une valeur initiale de 25 %. Le même réglage sert à l’aperçu et à l’export. Augmenter la taille ne nécessite pas de nouvelle génération HeyGen : le clip est redimensionné au montage. Les Workers web/génération et l’image du renderer doivent tous accepter cette plage.

## Crédits et coûts

Décisions d’Alex du 09/10/2026 : **1 crédit BienVu supplémentaire** pour un ou deux passages courts ; **1 crédit par tranche entamée de 10 secondes** pour la présence continue, quel que soit le moteur autorisé.

| Durée de la vidéo | Supplément avatar continu | Total avec la vidéo, sans animation |
|---|---:|---:|
| 20 s | 2 crédits | 3 crédits |
| 30 s | 3 crédits | 4 crédits |
| 40 s | 4 crédits | 5 crédits |

Ce supplément s’ajoute au crédit vidéo et aux éventuelles animations de photos. Il est affiché avant le lancement et réservé atomiquement avec les autres crédits, sur les lots mensuels puis achetés. Aucun nouveau clip livré : remboursement de tout le supplément. Au moins un nouveau clip prêt : le supplément correspondant est consommé, y compris si le rendu final échoue ensuite. Une retouche qui réutilise tous les clips existants rend le supplément réservé ; les crédits vidéo et d’animation suivent leurs propres règles. Les réservations et règlements historiques restent inchangés.

Le coût HeyGen est indépendant du tarif produit. Le moteur standard est explicitement **Avatar III**, 720p, et ne dépend pas du moteur par défaut de l’API. Avatar IV reste activable par le superadmin. Les tarifs internes sont modifiables : III 0,99 $/min, IV photo 2,31 $/min, IV studio 4,83 $/min. Ce sont des estimations, pas une facture. Les durées réservées sont arrondies au-dessus, avec une marge de sortie. Les appels incertains gardent leur provision. Les factures et leur affectation aux vidéos se rapprochent dans Rentabilité → fournisseur HeyGen.

Limites initiales : 6 secondes au maximum par passage court, **40 secondes au maximum pour l’avatar continu**, budget mensuel 5 $, budget par vidéo 1 $, 2 clips simultanés. Le réglage de durée par passage ne limite pas l’avatar continu. Ces plafonds ne sont ni le solde réel du compte HeyGen, ni une recharge automatique. Le budget est contrôlé dans D1 avant chaque création. Une limite atteinte ou une panne conserve une vidéo sans les passages manquants, avec une information à l’utilisateur et règlement du supplément selon les clips réellement obtenus. Les limites en dollars sont conservées ; un moteur premium trop coûteux peut donc être refusé par ces limites.

## Audio, rendu et réutilisation

Les phrases d’ouverture et de conclusion du montage sont reprises intégralement depuis les WAV Cartesia, Google ou Fish déjà préparés. Une phrase dépassant la durée choisie conserve sa voix off et laisse ce passage sans avatar : aucun tronquage et aucun appel OpenAI/TTS supplémentaire pour l’avatar. Le MP4/WebM HeyGen est muet dans le montage ; seul le WAV original est joué. La durée totale de la vidéo est conservée.

Pour l’avatar continu, les WAV originaux sont assemblés en **un seul WAV PCM 16 bits, mono, 24 kHz**, de la durée exacte du montage. Le début de chaque phrase reprend son frame d’origine ; les pauses, la carte et la fin de montage restent incluses. Une seule création HeyGen est demandée. L’avatar est visible aussi pendant les silences, son comportement pendant ces silences dépend du fournisseur. L’audio assemblé est privé, vérifié par hash, borné à 4 MiB et lié dans le manifeste à chacune de ses pistes sources. Les clips HeyGen ont une limite spécifique de 32 MiB, sans augmenter les limites des photos, des animations ou des autres vidéos. La sortie fournisseur accepte au plus 350 ms d’écart de durée ; le montage conserve exactement la durée choisie.

La clé de cache contient l’agence, le hash du WAV exact, le présentateur, le moteur, la transparence, la résolution et le format fournisseur. Photos, couleurs et placement ne nécessitent pas de nouveau clip. Les mêmes fichiers servent aux exports vertical et horizontal. Une nouvelle voix, un nouveau texte ou un nouveau rythme pour un avatar continu nécessite un nouveau clip. Le manifeste fige les hashes et les timings, et les clips privés sont retrouvés dans l’Éditeur avec la narration d’origine. Le mode continu occupe une seule piste couvrant toute la timeline. L’accès aux clips et à leur lecture partielle reste limité à l’agence du projet.

Si le rendu final échoue après la préparation du manifeste, **Mes biens → Reprendre dans l’Éditeur** récupère aussi ces pistes et clips vérifiés. La tentative originale reste dans l’historique ; ouvrir cette copie ne débite aucun crédit et ne relance pas HeyGen. Le nouvel export suit les règles de réutilisation ci-dessus. [Recette du 9 octobre](preuves/maintenance/GENERATION-BUDGET-09-10.md).

Un intent est enregistré avant l’appel payant. Les requêtes utilisent les clés d’idempotence stables de l’API v3. Une réponse de création perdue n’est jamais remplacée par une autre création. Les identifiants connus sont interrogés par le Workflow et le cron ; le bouton de réconciliation du superadmin ne génère rien. Sans identifiant fournisseur ni notification authentifiée, un résultat incertain reste à vérifier. Un clip reçu après un export ne modifie pas le MP4 existant et ne débite pas rétroactivement le client.

Les fichiers sont conservés dans le R2 privé, sous le job, avant le rendu. Le cache est limité à 90 jours, sauf si le fichier appartient à une vidéo conservée de manière permanente. L’expiration d’une référence de cache ne supprime jamais un média d’une vidéo d’origine.

## Configuration serveur

- Migration D1 **0058_heygen_avatars.sql** : catalogue, réglages audités, tâches, cache, réservation du supplément et fournisseur financier. Elle conserve les dépenses et affectations existantes.
- Migration additive **0061_full_length_avatars.sql** : moment `full`, supplément total de 2 à 4 crédits et règlement dans les lots d’origine. Le drapeau historique `avatar_credits` reste 0/1 ; `avatar_extra_credits` ajoute 0 à 3 unités pour les nouvelles demandes, sans recalcul des anciennes vidéos.
- Secrets côté web et génération : `HEYGEN_API_KEY`. Le fichier local `.env.heygen` est ignoré ; `.env.heygen.example` ne contient aucune clé.
- Variable `HEYGEN_ENABLED=true` sur les deux Workers déployés. Les exemples et profils locaux restent désactivés. La disponibilité effective dépend aussi du réglage superadmin.
- Notification facultative : `HEYGEN_WEBHOOK_SECRET` sur le Worker web, endpoint `https://bienvu.online/api/heygen/webhook`, événements `avatar_video.success` et `avatar_video.fail`. Signature HMAC-SHA256 du corps brut, en-tête `signature`. Les URLs du webhook ne sont jamais utilisées ; le statut et le fichier sont relus auprès de HeyGen.
- L’image Linux du renderer doit inclure `AvatarOverlay` et la validation WebM/VP9 avec alpha. Une simple mise à jour web ne suffit pas.

Le superadmin synchronise le catalogue par lots de 50, choisit les présentateurs proposés, leur défaut et la transparence réellement vérifiée. Les aperçus du fournisseur illustrent le présentateur ; ils ne sont pas une synthèse de la voix française sélectionnée. Les avatars personnels et leur création ne font pas partie de cette version.

Les suivis PostHog ajoutent les étapes, les coûts estimés et des contrôles déterministes de complétude. Les coûts réels restent inconnus jusqu’au rapprochement. Aucun juge LLM payant n’est ajouté.

## Recette et retour arrière

Les tests couvrent le supplément unique, les avertissements, la réservation, la réutilisation, le remboursement, l’isolation des agences, les signatures et les résultats incertains. Les fixtures ne prouvent pas une génération fournisseur réelle.

L’extension continue couvre en plus les durées 20/30/40 s, l’assemblage PCM et le resampling, les pauses, le cache du rythme exact, la récupération dans l’Éditeur et le financement du supplément par plusieurs lots. Les captures Linux d’un clip de recette de 40 s vérifient le début, le milieu et la fin dans les deux formats ; la transparence est contrôlée sur les pixels et la validation accepte les deux casses des métadonnées alpha produites par FFmpeg. Aucun nouvel appel fournisseur payant pour cette extension. Un premier clip continu réel HeyGen de 20 à 40 s reste à valider. [Preuves de l’avatar continu](preuves/maintenance/AVATAR-CONTINU-09-10.md).

Deux essais réels du 09/10/2026 ont utilisé **Daphne_public_1**, Avatar III et un WAV Inès/Cartesia de 5,92 s déjà existant. MP4 : 5,928 s, 720×1280, H.264 ; WebM : 5,929 s, 720×1280, VP9 avec `alpha_mode=1`. Variation totale du solde API : **0,20 $**, sans nouvelle synthèse ni appel OpenAI. Seul ce présentateur est marqué transparent vérifié sur cette preuve. Traces privées : `evidence/local/heygen-2026-10-09/`, hors Git.

Le rendu Linux a été contrôlé dans les deux formats, avec MP4 en médaillon et WebM transparent. Un export complet local de 30 s conserve 900 frames, H.264/AAC, un démarrage progressif et une piste audible ; il utilise les mêmes clips réels sur une annonce et des photos de recette. Il ne constitue pas une génération client en production. Chrome à 1536/390 px vérifie la désactivation initiale, les deux avertissements, le genre inconnu, la timeline, le calcul de crédits et l’absence de débordement. Le superadmin emploie D1 local réel ; son solde de démonstration est intercepté, sans nouvel appel fournisseur.

Configuration publiée : **100 avatars studio publics compatibles Avatar III sont proposés**, parmi 200 entrées du catalogue administré. **Daphne_public_1** reste le défaut, présenté en premier. La transparence vérifiée, les moteurs autorisés, les budgets et le supplément client sont conservés. Le superadmin peut activer les résultats compatibles par lots de 100, selon ses filtres, et synchroniser d’autres pages HeyGen. Les clés et le webhook signé sont configurés. Aucun nouveau crédit client n’est utilisé pour cette vérification. La syntaxe de la migration utilise `IIF` dans le trigger d’admission pour rester compatible avec le découpage des statements du service D1 distant.

Le sélecteur défile horizontalement, avec recherche, filtre par genre et navigation au clavier. Un survol de **800 ms** lance l’extrait muet dans la carte ; sortir de la carte annule le survol ou arrête sa lecture. Le bouton d’extrait fonctionne aussi au toucher. Un seul extrait est monté à la fois ; aucune vidéo n’est téléchargée à l’ouverture. Les portraits entrent dans le chargement à 160 px du bord visible, avec dimensions réservées et décodage asynchrone. Le catalogue est mutualisé en mémoire du navigateur pendant 30 s, sans état utilisateur partagé côté Worker.

`node --import tsx scripts/prepare-avatar-catalog.mjs --activate --limit=100` prépare uniquement des presets publics studio compatibles, avec consentement explicite de l’opérateur à leur activation. Il garde une sauvegarde privée locale et audite les changements sous l’identité du superadmin. Les portraits WebP sont réduits à 320 px ; les démonstrations sont limitées à huit secondes, jusqu’à 320 px sans agrandir la source, et sans audio. Ces dérivés restent dans `catalogue/heygen`, avec version calculée depuis la source. Les 100 portraits préparés passent de **6 619 956 à 738 534 octets** (−88,8 %). Les futurs presets synchronisés peuvent être préparés par le même outil ; avant préparation, leur média fournisseur borné sert de repli et peut être plus volumineux.

Les routes média contrôlent la visibilité avant R2, puis servent ETag, HEAD et Range. Cache navigateur/public de cinq minutes uniquement pour les presets publics activés ; erreurs et médias admin désactivés restent `private, no-store`. Un retrait retire immédiatement le choix du catalogue après actualisation ; un portrait public déjà mis en cache peut rester visible cinq minutes. Les clips générés des projets conservent leurs propres routes privées. Aucun nouveau binding, abonnement ou appel de génération HeyGen n’est nécessaire. [Recette du catalogue](preuves/maintenance/CATALOGUE-AVATARS-09-10.md).

Pour suspendre les nouvelles générations d’avatars : décocher la disponibilité dans le superadmin, puis éventuellement désactiver `HEYGEN_ENABLED`. Ne pas supprimer les tables, réservations ou médias existants. Les vidéos terminées restent lisibles. Le polling de tâches déjà soumises peut continuer sans nouvelle création payante.

Références : [création v3](https://developers.heygen.com/reference/create-video), [audio personnalisé](https://developers.heygen.com/audio-to-video), [transparence](https://developers.heygen.com/transparent-background-videos), [webhooks](https://developers.heygen.com/docs/webhooks), [tarifs API](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained).
