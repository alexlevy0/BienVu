# Centrage du texte de l’accueil — 4 octobre 2026

Sur ordinateur, le titre et son introduction sont centrés verticalement dans l’espace situé au-dessus du formulaire. La première ligne de la grille absorbe l’espace disponible et son contenu est centré avec Flexbox. La hauteur du bloc s’adapte à la vidéo et aux retours à la ligne, sans padding supérieur fixe.

La règle s’applique à partir de 761 px. La disposition mobile et le passage à la vue de création restent inchangés.

Vérifications :

- Mesures du navigateur sur BienVu à 1 024, 1 100, 1 536 et 1 920 px : centre du contenu identique au centre de sa ligne, sans débordement ni chevauchement du formulaire.
- À 1 536 px, le titre descend d’environ 70 px et l’espace sous l’introduction passe de 170 à 100 px.
- À 390 px, les positions restent identiques ; la vidéo attend toujours une lecture manuelle. Sur ordinateur, elle conserve son démarrage sans son.
- Build web et vérification du déploiement Worker réussis. Paramètres, secrets et tâches planifiées conservés ; Workers d’import et de génération inchangés.

Version web déployée : `5b5e70ac-22ad-4395-8700-5a9155bc2186`.

Mesures et captures conservées localement dans `evidence/local/hero-centering/` (dossier ignoré par Git).
