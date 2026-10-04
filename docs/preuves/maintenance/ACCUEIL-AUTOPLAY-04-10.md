# Démarrage et cadrage de la vidéo principale — 4 octobre 2026

La vidéo en haut de la home démarre automatiquement sans son sur ordinateur. Sur mobile, y compris en paysage, elle reste sur sa couverture jusqu’au clic sur Lecture. La détection se fait après hydratation et exige un affichage large avec souris ou pavé tactile ; aucun attribut de démarrage automatique n’est envoyé dans le HTML initial. La lecture automatique ne prend pas le focus de l’input. Le son reste activable dans les commandes du lecteur.

Le cadre prend le ratio déclaré du fichier publié, puis celui des dimensions vidéo réellement chargées si nécessaire. La vidéo remplit son cadre sans bandes noires latérales, avec les textes du montage conservés. Les sources et couvertures sélectionnées par le super admin restent utilisées.

Validation : types web, frontières des paquets, build OpenNext et bundle Wrangler. Recette Chrome sur le Worker local avec D1/R2 puis sur `bienvu.online`, en ordinateur, téléphone et téléphone en paysage : démarrage automatique muet sans geste simulé sur ordinateur, absence de lecture automatique sur téléphone, lecture au clic, ratio du cadre correspondant au fichier, remplissage sans bandes, commandes de son/progression, pause pendant l’aide et absence de redémarrage après une pause volontaire. Aucune exception JavaScript.

Déploiement web : `8cfda510-cbcb-4283-8e2a-f6d2e239cbfa`. Bindings, variables et tâches planifiées préservés ; Workers de génération et d’import inchangés. La publication de médias du super admin est conservée. Aucun appel de génération IA ni consommation de crédit produit.
