# Lecture de la vidéo principale — 4 octobre 2026

La vidéo en haut de la home démarre dans son cadre au clic sur Lecture. Le lecteur natif offre pause, progression, volume et plein écran, avec `playsInline` pour la lecture dans la page sur mobile. La couverture et la source choisies dans le super admin restent utilisées, et le cadre conserve ses dimensions pendant la lecture.

La lecture est interrompue quand le cadre est masqué par le parcours de création, quand une fenêtre de la home s’ouvre, quand un autre extrait sonore démarre ou quand l’onglet passe en arrière-plan. Une erreur de chargement affiche un message avec possibilité de réessayer. Les autres exemples conservent leur fenêtre de présentation.

Validation : types web, frontières des paquets, build OpenNext et bundle Wrangler. Recette Chrome en affichages ordinateur et mobile sur le Worker local avec une vidéo et sa couverture dans D1/R2, puis sur `bienvu.online` avec la vidéo effectivement publiée : absence de démarrage automatique, lecture sans modal, dimensions inchangées, pause/reprise, déplacement dans la vidéo, volume, reprise après la fin, pause pendant l’aide et alternance avec l’extrait de voix. Aucune exception JavaScript pendant ces recettes.

Déploiement web : `ef443783-b9c0-4268-a278-c8ce5fda4740`. Les bindings et tâches planifiées sont préservés ; les Workers de génération et d’import ne sont pas modifiés. Une nouvelle sélection de visuels a été publiée par le super admin pendant les vérifications ; la configuration publique après déploiement correspond à cette dernière publication. Aucun appel de génération IA ni consommation de crédit produit.
