# Reprise de la voix d’une vidéo dans l’Éditeur — 2–3 octobre 2026

## Résultat

Ouvrir une vidéo prête dans l’Éditeur récupère ses WAV privés, les textes réellement prononcés et les horaires des scènes du montage. La timeline affiche chaque passage avec sa durée et une forme d’onde calculée sur les échantillons PCM. La lecture de l’aperçu et ses sous-titres suivent le curseur ; une pause, un déplacement ou la coupure de la voix arrête les lecteurs. Les premiers projets de retouche créés avant cette correction peuvent retrouver leur origine et leurs WAV en conservant leurs retouches visuelles. Cela comprend les vidéos créées anonymement puis récupérées par un compte : l’accès suit le propriétaire vérifié, les sources restent dans leur espace immuable d’origine et les copies appartiennent au nouveau projet.

La voix est copiée dans le dossier privé du projet : la disparition des fichiers du job d’origine n’efface pas cette copie. L’export fige encore une copie indépendante. Tant que la voix, la narration et la durée restent identiques, le pipeline réutilise les WAV et les durées de scènes d’origine, sans nouvelle rédaction OpenAI ni synthèse TTS. Les changements visuels, le volume et le format ne nécessitent pas une nouvelle voix. Modifier la voix, le texte ou la durée affiche qu’une nouvelle piste sera créée à l’export ; « Reprendre la voix d’origine » rétablit ces trois réglages.

## Stockage et accès

La migration additive `0033_editor_voice.sql` rattache un journal de voix à son import et à son agence. Les API de métadonnées et de WAV exigent le propriétaire vérifié ; elles exposent des identifiants de médias et des plages de lecture privées, jamais les chemins audio de R2. Le contrôle d’origine protège la récupération par POST. Une référence de voix étrangère ou inexistante est refusée avant la réservation d’un crédit.

Les copies contrôlent l’empreinte, la taille et la durée de chaque WAV. Le journal est créé avant l’écriture des objets, permettant la reprise d’une copie interrompue. Le nettoyage et la suppression de brouillon incluent les WAV et le journal en cascade. Les anciennes personnalisations sans référence de voix gardent leur JSON et leurs empreintes.

Le manifeste de rendu ne change pas pour cette correction : les WAV et durées récupérés utilisent ses champs audio/scènes existants. Une narration modifiée utilise le chemin de synthèse habituel. La réservation et le prix en crédits d’un nouvel export restent ceux du produit.

## Vérifications

`pnpm check` : **269/269 tests**, types des packages et des tests, frontières **218 fichiers**. Build Next/OpenNext réussi. Deux erreurs de fixture sont corrigées : les tests cessent de modifier directement une rétention protégée par les triggers et simulent la disparition des WAV sources ; les types d’assets utilisent le contrat audio du journal.

La recette D1/workerd/R2 crée un montage puis sa retouche et son export, avec des fournisseurs simulés. Les positions, empreintes et durées audio sont identiques ; les providers de rédaction et de synthèse lèvent une erreur si un nouvel appel est tenté pendant la réutilisation. Aucun appel n’a lieu, aucun `narration_calls` n’est créé pour cet export. Le rejeu conserve les résultats. Une narration volontairement modifiée synthétise une autre piste. La récupération d’un ancien projet préserve le titre et les couches retouchés. Isolation inter-agences, ranges, fausse référence avant débit et suppression des copies sont vérifiés.

Le contrôle complémentaire ajoute une vraie admission anonyme, un manifeste de recette, une récupération après connexion et une copie de ses WAV dans l’espace du propriétaire. Avant récupération, l’autre agence ne peut pas ouvrir la vidéo ; après, les empreintes sont identiques et le projet possède ses propres fichiers privés. La récupération d’un ancien projet de ce type est également testée. Cette recette a identifié puis corrigé les recherches de manifeste encore liées à l’agence anonyme au lieu de son propriétaire. **16/16 tests** ciblés Éditeur/voix/essai anonyme passent après ces corrections.

Chromium sur le build Worker à **1536/1280/390 px**, API et médias de recette interceptés : quatre passages aux positions originales, 256 segments de forme d’onde, lecture HTMLAudio réelle, un seul passage joué à la fois, changement de passage, pause, sous-titres du texte conservé, changement de voix, reprise de l’original et coupure sans lecteur orphelin. Le reste du parcours d’édition passe aussi : sauvegarde/rechargement, annuler/rétablir, déplacement de texte, plans, durée/format, import et lecture de musique, reprise/retrait de photos, coût et version exportée, conflit concurrent. Captures ordinateur et mobile inspectées sans débordement. L’assertion de la sonde observe lecture et nombre de lecteurs dans la même évaluation pour éviter de mesurer après la fin de son court WAV de deux secondes.

Ces WAV de recette sont des sons techniques. Aucun nouvel appel OpenAI, Google, Fish ou Runway, aucun crédit client consommé, aucun export complet payant Cloudflare lancé par la recette. L’image du renderer déjà publiée reste compatible ; son rendu complet a été vérifié dans la tranche Éditeur précédente. La reprise exige que les sources du montage soient encore conservées à sa première ouverture ; un job expiré ne devient pas modifiable. Les anciennes durées non standard sont arrondies à la durée de projet supérieure (20/30/40 s), en conservant les débuts des passages et en ajoutant le reliquat en fin de timeline.

Logs, sauvegarde SQL, captures et état opérateur sont privés dans `evidence/local/editor-voice/`, ignoré par Git.

## Publication et état final

Sauvegarde SQL distante privée de **870 451 octets** avant migration. Pendant la suspension administrative des nouvelles générations, zéro job actif : migration **0033** seule en attente, appliquée avec succès. **13 tables historiques / 292 lignes** contrôlées par empreinte avant/après, sans changement ni erreur de clé étrangère. Admission rétablie ; le correctif complémentaire des sources anonymes est publié sur le web sans nouvelle migration ni modification du moteur.

Versions finales à **100 %** : web **`9d4b05a8-4754-4811-92ac-11005bfda0ae`**, génération **`d1641b69-0b66-4c48-bf91-4af334bc2085`**, import **`a8b9e204-2585-4bb4-81cb-79099467dd01`**. La première version web de cette tranche, `5e0a53ce-e466-4c1d-b1a1-3d830943de52`, est remplacée par le correctif des vidéos récupérées. Les **25/28/9 bindings**, variables, secrets référencés et dates de compatibilité sont identiques. Renderer **v15**, image **`af3e3ba5724a357b6db5670af70ebe8d33df97c83cd85c79d4a2d28519d8ef72`** et capacité maximale d’un conteneur standard-2 conservés ; aucune reconstruction ni mise à jour de conteneur pendant cette correction.

Lecture finale : **15 jobs**, **zéro actif**, admission **ouverte**, budget engagé **49,75 €**, coupure **90 €**, enveloppe **100 €**. Les empreintes des treize tables sont toujours identiques à l’instantané avant migration. Aucun crédit client ou appel fournisseur de la recette ; la facture d’hébergement n’est pas rapprochée ici.

HTTP **200** pour l’accueil, l’Éditeur et Mes vidéos ; `noindex` de l’Éditeur privé conservé ; **401** pour compte, brouillon, musique, métadonnées/WAV de voix et détail vidéo sans session. La recette Chromium complète passe sur les **assets réellement publiés** à **1536/1280/390 px**, avec compte, lectures audio et écritures de recette interceptés : positions originales, lecture/pause, sous-titres, changement de voix, reprise de l’original, coupure et reste du montage. L’indication de voix désactivée est vérifiée sur cette dernière version. Captures inspectées sans débordement.

Build final et types des tests réussis après le correctif des sources récupérées ; `git diff --check` propre. Serveur et navigateur de recette fermés. Code et documentation restent sans commit ni push pour cette tranche.

Références de publication : [migrations D1](https://developers.cloudflare.com/d1/reference/migrations/), [commandes Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/), [publication des Containers](https://developers.cloudflare.com/containers/reference/wrangler-commands/). Skills Remotion, Workers et Wrangler appliqués, sans nouvelle dépendance.
