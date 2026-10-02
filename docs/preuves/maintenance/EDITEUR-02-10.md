# Mode Éditeur — 02/10/2026

Alex demande un éditeur de montage conforme à sa maquette, pour les brouillons et les vidéos existantes. La route privée `/editeur` est accessible depuis le menu latéral, Personnaliser et Mes vidéos. Une vidéo prête et conservée ouvre une copie modifiable ; son MP4 et son entrée originale restent intacts.

## Fonctionnement livré

Les panneaux Photos, Texte et Audio entourent un aperçu plein écran du bien et une timeline. Les photos se glissent dans la timeline, se réordonnent, se scindent et se redimensionnent avec ajustement du plan voisin. Les formats 9:16 et 16:9 et les durées 20/30/40 secondes gardent une timeline complète, avec au moins quinze frames par plan. Trois photos distinctes minimum restent nécessaires à l’export.

Les couches de texte sont déplaçables dans l’aperçu et minutées séparément : contenu, trois polices embarquées, taille, gras, italique, alignement, couleur, largeur, position, fond, ombre et apparition. Duplication et suppression, ajout des informations du bien et du logo, annuler/rétablir, magnétisme, zoom et lecture sont disponibles. Les couches simultanées ont des lignes distinctes ; la timeline défile pour les projets comportant beaucoup de textes.

Le choix de voix, ses extraits fixes, la narration personnelle et les sous-titres sont conservés. Couper la voix coupe les sous-titres. Une musique personnelle MP3/WAV/M4A de dix Mo maximum est décodée dans le navigateur, ramenée à quarante secondes maximum en PCM mono 24 kHz, puis contrôlée indépendamment sur le serveur. Volume, début et décalage sont modifiables ; le rendu conserve une piste musicale lorsqu’on coupe la voix. Les sous-titres utilisent un emplacement partagé entre l’aperçu et le moteur, distinct des informations situées au bas de l’image.

L’enregistrement automatique est sérialisé et vérifie la version du brouillon. Une modification concurrente bloque l’écrasement et conserve les retouches à l’écran. La navigation attend la sauvegarde et les imports en cours. Les envois de photos échoués disposent d’une reprise et d’un retrait.

L’export affiche le prix, demande la confirmation des droits sur les médias, fige une copie privée du projet et passe par l’admission financière existante : un crédit vidéo, plus un par photo Runway sélectionnée. Les plans issus de la scission d’une même photo partagent une animation et un crédit d’animation. Une autre exportation produit une autre vidéo. Les modifications ultérieures du projet ne changent pas le montage déjà admis.

## Données et moteur

`EditorDocument` est un contrat JSON strict et borné, sans URL, chemin de stockage ni code fourni par le navigateur. Les références aux photos et aux musiques sont résolues côté serveur dans le périmètre du propriétaire. La migration additive 0032 journalise les musiques privées ; leur nettoyage accompagne celui des imports. Les clés étrangères, empreintes, durées audio et plages de lecture sont contrôlées. L’accès d’une autre agence est refusé.

Les scènes parlées conservent le pipeline de narration et de budget existant. Le manifeste fige les couches, plans et musique et remappe les photos sélectionnées. Remotion applique le document au MP4 ; l’aperçu web utilise les mêmes calculs portables sans importer le moteur vidéo dans les Workers. Les trois polices sont présentes dans l’image Linux. Les requêtes et empreintes historiques sans document d’éditeur restent identiques.

## Vérifications et limites

`pnpm check` entièrement vert : **267/267 tests**, types de tous les packages et des tests. Après l'ajout du champ numérique qui préserve les valeurs intermédiaires pendant la frappe, le build OpenNext et la recette navigateur passent à nouveau ; les frontières finales portent sur **211 fichiers**. La première exécution avait une fixture de suppression arrêtée au schéma 0022 ; elle applique maintenant aussi la migration du journal musical, sans changer ses assertions historiques.

Tests D1/workerd/R2 : privé inter-agences, plages audio, source silencieuse ou durée incohérente rejetée avant débit, copie de MP4, original conservé, export figé, rejeu et version concurrente, réservation de deux crédits pour une vidéo et une animation, reprise du pipeline sans deuxième appel fournisseur, copie puis nettoyage de la musique. Les API de voix et d’animation sont simulées dans ces tests.

Chromium sur le build Worker à **1536/1280/390 px**, API de recette interceptée : texte, déplacement réel à la souris, réordonnancement et redimensionnement de plans, scission, retour de quarante à vingt secondes, format horizontal, annuler/rétablir, rechargement, voix/sous-titres, import de musique décodée et lecture HTMLAudio réelle, photo en erreur puis reprise/retrait, confirmation de coût, export de la version enregistrée, réouverture d’une vidéo et conflit de sauvegarde. Captures inspectées, aucun débordement. Deux assertions de la sonde ont été corrigées : sélectionner l’audio musical plutôt que l’extrait de voix, et conserver le corps d’export au changement de page. Le parcours final passe entièrement.

Un MP4 natif complet de vingt secondes est rendu à partir de médias et WAV déjà présents : **1080 × 1920, 600 frames, H.264/AAC, faststart, 12,328 Mo**, volume moyen **−24,18 dB**, textes retouchés et minutés. La musique de cette recette est un son technique, pas une sélection musicale proposée aux utilisateurs. Aucun nouvel appel OpenAI, Google, Fish ou Runway ; aucun crédit client consommé.

L'image du vrai Dockerfile est construite pour **Linux/amd64**. Le test isolé utilise l'utilisateur **node (UID 1000)**, sans réseau : captures verticales aux frames 30/360/599, capture horizontale, trois références à un clip Runway déjà conservé, arrêt sur sa dernière frame, et MP4 musical de deux secondes sans voix avec piste AAC. Les placements finaux des sous-titres à 58 % sont inspectés dans les deux formats et laissent les coordonnées de l'agence dégagées. Les trois références ne représentent pas trois nouvelles animations du bien. Deux erreurs du script de recette Linux sont corrigées : résolution ESM depuis un répertoire et identifiant de composition ; le test final passe.

La première voix et les animations Runway sont créées lors de l’export. L’aperçu d’un nouveau projet montre les photos, mouvements de caméra et textes, l’emplacement des sous-titres et la musique importée ; il ne prétend pas jouer une narration ni une animation qui n’ont pas encore été générées. La [correction de reprise audio du 3 octobre](EDITEUR-VOIX-03-10.md) récupère désormais la voix déjà générée d’une vidéo existante, la place dans la timeline, la joue dans l’aperçu et la réutilise à l’export lorsqu’elle reste inchangée. Une vidéo expirée n’est pas modifiable. Une nouvelle génération complète payante sur Cloudflare ne fait pas partie de cette recette.

Preuves privées, logs, captures et médias sous `evidence/local/editor/`, ignorés par Git.

## Publication Cloudflare

Sauvegarde SQL distante avant migration. Après la suspension administrative temporaire des nouvelles générations, zéro job actif ; un instantané par empreinte couvre **13 tables historiques et 275 lignes**. Seule la migration **0032_editor_music.sql** était en attente : appliquée, journal initialement vide, aucune erreur de clé étrangère. Une erreur interne transitoire de l'API D1 pendant la première liste des migrations disparaît à la seconde lecture, avant toute mutation de schéma.

Publication séquentielle avec conservation des variables : génération **`9a931fcd-864a-45f3-836a-866fb4386359`**, import **`6baef18d-03f0-4c7f-bf55-96223b79e96f`**, web **`11c9051b-970a-4aa9-9071-d3e1ebf3065f`**, chacun à **100 %**. Le conteneur de rendu atteint la **version 15**, image **`af3e3ba5724a357b6db5670af70ebe8d33df97c83cd85c79d4a2d28519d8ef72`**, rollout terminé à 100 %. La capacité reste un conteneur standard-2 maximum ; le transport d'import garde son image précédente.

Les **25/28/9 bindings** respectifs, secrets référencés, variables et dates de compatibilité sont identiques avant/après. Les treize empreintes historiques et les 275 lignes sont inchangées ; clés étrangères valides. Admission réactivée et relue : **14 jobs historiques, zéro actif, budget engagé 48,05 €**, coupure **90 €**, enveloppe **100 €**, sans modification de ces montants. La recette ne consomme pas de crédit vidéo ni d'appel fournisseur ; la facture d'hébergement n'est pas rapprochée ici.

HTTP 200 pour l'accueil, `/editeur` et Mes vidéos ; métadonnées `noindex` de la route privée ; refus visiteur **401** pour compte, brouillon, musique et détail de génération. Le même parcours Chromium passe ensuite sur les **assets réellement publiés**, à **1536/1280/390 px**, avec API de compte et d'écriture interceptées : saisie numérique réelle, déplacement du texte, plans, son musical, reprise des uploads, nouvelle version de vidéo et conflit. Captures ordinateur/mobile inspectées, aucun débordement. Aucun brouillon ni export payé créé sur la D1 du domaine pendant cette recette. Les moteurs de génération complets sont testés localement et dans Linux ; un export complet avec fournisseurs sur Cloudflare n'a pas été rejoué.

Serveurs locaux, navigateur de recette et conteneurs de test fermés. Code et documentation laissés dans le dépôt sans commit ni push pour cette tranche.

Références consultées pour la publication : [migrations D1](https://developers.cloudflare.com/d1/reference/migrations/), [Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/), [commandes Containers](https://developers.cloudflare.com/containers/reference/wrangler-commands/). Skills Remotion, Workers et Wrangler appliqués ; versions de dépendances conservées.
