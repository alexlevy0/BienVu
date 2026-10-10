# Visuels de la page d’accueil

Le super admin dispose de l’onglet **Page d’accueil** (`/admin?view=homepage`). Il contrôle 38 emplacements : le visuel principal et sa vidéo, les quatre inspirations, les deux démonstrations d’avatars, les démonstrations photo/vidéo/texte, le kit du mandat, les trois exemples de partage et les quatre plans de la démonstration de l’Éditeur.

Le groupe **Vos annonces prennent la parole** contrôle la section située avant « Vos photos prennent vie ». La présence discrète et la présence intégrée disposent chacune d’une couverture et d’une vidéo. Les démonstrations se lisent dans leur cadre au clic, avec commandes natives et sans démarrage automatique ; « Voir les avatars en action » ouvre la galerie publique `/avatar`. Les faits de l’exemple sont masqués lorsqu’un média personnalisé est choisi. Les deux vidéos par défaut réutilisent un extrait HeyGen déjà généré et sa voix française ; aucune nouvelle génération fournisseur n’est lancée pour cette section.

Le groupe **Un mandat, sept contenus** contrôle le bloc situé après « Vos photos prennent vie » : visuel et vidéo du Reel Instagram, de la Story Instagram, de TikTok et de la vidéo horizontale, ainsi que le média du post Facebook et du visuel prix/surface. Les quatre aperçus vidéo ouvrent le lecteur existant. Les exemples chiffrés sont retirés lorsqu’un média personnalisé est choisi ; son titre, sa ville et son agence sont alors utilisés. Le texte de publication reprend le média choisi pour le post Facebook. « Créer mes contenus » ramène au compositeur principal.

## Utilisation

1. Cliquer sur **Choisir** pour un emplacement.
2. Rechercher une annonce, une agence, une ville ou un identifiant dans toutes les agences. Filtrer les photos importées, vidéos complètes ou vidéos IA. Les plans IA conservés sont inclus.
3. Prévisualiser le fichier, puis cliquer sur **Utiliser ce média** ou **Choisir ce média**. L’affectation est immédiatement enregistrée dans le brouillon.
4. Ouvrir **Aperçu du brouillon** pour voir la home complète avec ces affectations. Cet aperçu exige une session super admin.
5. Cliquer sur **Publier les visuels** pour remplacer les sélections publiques. **Annuler les changements** rétablit le brouillon depuis la dernière publication ; **Par défaut** rétablit un emplacement.

Une vidéo sélectionnée fournit automatiquement sa couverture si aucun visuel distinct n’est choisi. Un plan vidéo peut aussi servir de visuel et se lire dans la démonstration de l’éditeur. Les photographies par défaut restent disponibles. Les faits fictifs superposés aux exemples initiaux sont masqués pour les médias personnalisés ; les titres et agences affichés proviennent de la sélection.

La vidéo principale se lit directement dans son cadre en haut de la page, avec les commandes de pause, progression, volume et plein écran. Sur ordinateur, elle démarre automatiquement sans son ; sur mobile, elle attend le clic sur Lecture. Le cadre suit les dimensions du fichier pour éviter les bandes noires tout en conservant les textes. La lecture se met en pause si le cadre est masqué, si une fenêtre de la home s’ouvre, si un autre extrait sonore démarre ou si l’onglet du navigateur passe en arrière-plan.

## Conservation et accès

La banque source exige le contrôle super admin existant : adresse exacte et e-mail vérifié. Aucun chemin R2 ou secret fournisseur n’est transmis dans la configuration publique. Les sources privées ne deviennent pas publiques.

Au choix d’un média, une copie serveur est créée sous `homepage/<id>/` dans le bucket privé, avec une éventuelle couverture. En Workers, la copie utilise un flux à longueur bornée, sans charger un MP4 en mémoire. La lecture HTTP accepte HEAD, ETag et les plages d’octets nécessaires aux lecteurs vidéo.

Seuls les fichiers référencés par la publication courante sont accessibles à l’endpoint public. Les copies publiées restent conservées indépendamment de la suppression d’un import ou de son fichier source. Le cache navigateur des fichiers dure au maximum 60 secondes. Les copies non utilisées par le brouillon **ni** par la publication sont nettoyées après 24 heures par la maintenance quotidienne. Les originaux, exports, pistes audio et animations privés ne sont jamais supprimés par cette maintenance.

Un fichier absent est signalé comme indisponible dans la banque. Une copie interrompue n’affecte pas la home et peut être reprise avec le même identifiant de requête. La publication vérifie les fichiers avant d’être appliquée atomiquement. Des modifications concurrentes déclenchent un conflit et un rechargement, sans écraser la dernière sélection. Les opérations sont historisées dans `homepage_audit`.

## Déploiement et recette

Appliquer `0044_homepage_media.sql` avant le Worker web. La migration initialise une sélection vide : les médias existants restent affichés jusqu’à la première publication effectuée par le super admin.

`tests/homepage-media.test.ts` vérifie la banque multi-agences, les autorisations et l’origine, les filtres/pagination, les types d’emplacements, les copies et reprises, la publication, la concurrence, la lecture vidéo, le retrait public et la conservation après suppression des originaux. Ces tests emploient des fixtures locales D1/R2 ; aucun appel à un fournisseur IA et aucun crédit vidéo ne sont nécessaires.

`node scripts/probe-home-avatar-showcase.mjs` vérifie la section avec ses composants React et médias réels : sept largeurs d’écran, absence de téléchargement vidéo avant le clic, lecture avec audio, arrêt de l’autre extrait, pause lorsque la section est hors écran, médias personnalisés et quatre contrôles superadmin. Par défaut, le serveur et les API sont des fixtures locales ; `BIENVU_HOME_URL=https://bienvu.online/` effectue uniquement une lecture de la page publiée et de ses démonstrations, sans modifier de compte ou de sélection. Le script `prepare-home-avatar-demos.mjs --avatar /chemin/extrait-transparent.webm` recompose les médias localement à partir de l’extrait existant, sans fournisseur.
