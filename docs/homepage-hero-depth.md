# Vidéo principale en calques

Le desktop superpose trois vidéos synchronisées : décor avec la piste sonore, avatar transparent muet, puis textes transparents muets. Les textes, les coordonnées et les éléments de carte restent au-dessus du présentateur. Les affiches transparentes disparaissent dès la première lecture ; les conserver sous une vidéo alpha laisserait notamment la carte initiale visible pendant les plans suivants.

Sur mobile (760 px et moins), le lecteur et la vidéo complète d’origine restent utilisés. Les sources vidéo supplémentaires ne sont pas affectées aux éléments HTML ; les affiches desktop utilisent des `<source media>` avec une image vide sur mobile. La lecture automatique attend la fin du chargement de la page et un moment disponible, reste muette et ne démarre pas avec la réduction des animations ou l’économie de données.

Le mouvement de souris utilise des ressorts Motion et des amplitudes distinctes pour le décor, les textes et le présentateur. L’encart « Avatar IA » et sa flèche suivent le présentateur avec une amplitude légèrement réduite et une petite rotation. Il se désactive sur tactile, en plein écran, hors champ, pendant une interaction avec les commandes et avec la réduction des animations. Le lecteur suspend tous les calques si un des trois attend des données. Une seule piste sonore, une horloge et des commandes communes gèrent lecture, pause, recherche et boucle.

Avec une souris, les commandes et l’icône de lecture apparaissent en fondu au survol du cadre. Le focus clavier les révèle également, sans conserver la barre affichée après un simple clic suivi d’une sortie de souris. Sur un écran tactile, les commandes restent visibles. Le fondu respecte la réduction des animations.

## Sources et export

Les sources du film existant sont récupérées depuis son manifeste et vérifiées par SHA-256 avant export. Aucun appel à Runway, à HeyGen ou à la synthèse vocale n’est nécessaire. Les fichiers du client et son résultat initial ne sont pas modifiés.

`node --import tsx scripts/prepare-home-hero-cutout.mjs evidence/local/hero-cutout` lit `source-manifest.json`, `homepage-before.json` et les fichiers vérifiés dans `assets/<sha256>`. Après `pnpm --filter @bienvu/renderer bundle`, il exporte le fond et les textes depuis la composition existante, recadre l’union du mouvement de l’avatar, prépare les versions WebM alpha et HEVC alpha (macOS), puis écrit les affiches et le registre `home-hero-depth-assets.ts`. Les grandes vidéos restent dans R2, sous `public/home-hero-depth/`, avec des clés dérivées de leurs empreintes. Les sources et exports de travail sont ignorés par Git.

Le paramètre `marketingLayer` de la composition est réservé à cet export local. Il est absent des rendus de génération habituels ; le contrat des vidéos et le moteur déployé restent identiques.

## Publication et remplacement

La route publique ne sert que les cinq copies explicitement inscrites au registre, avec requêtes partielles et validation de taille et d’empreinte. Elle ne permet jamais d’adresser un job ou un chemin de fichier privé. Les copies sont téléversées avant le déploiement du web ; aucun déploiement de renderer ni migration n’est requis.

La composition ne s’active que si l’empreinte du film choisi dans le super admin correspond au registre. Remplacer la vidéo principale rétablit automatiquement le lecteur habituel, sans superposer l’ancien présentateur sur une autre narration. Une erreur de média rétablit également ce lecteur. Pour utiliser l’effet sur un nouveau film, préparer puis publier ses propres calques.
