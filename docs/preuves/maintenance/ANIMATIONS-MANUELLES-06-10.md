# Sélection des animations dans la fiche manuelle — 6 octobre 2026

Une étoile est affichée en haut à droite de chaque photo de la saisie manuelle.
Elle reprend exactement le dessin du badge « Nouveau » de l’Éditeur, désormais
partagé dans `HomeIcon`. Elle est creuse pour un mouvement classique et pleine
pour une animation IA sélectionnée. Le contrôle expose `aria-pressed`, un libellé
par photo et une infobulle, avec une zone de clic adaptée aux écrans tactiles.

La sélection utilise les réglages existants de `VideoCustomization`, le même
état que « Personnaliser » et le calcul existant des crédits. Elle est enregistrée
dans le brouillon. Les valeurs sont liées aux slots des photos, et non à leur
position visuelle : réordonner les images ne change pas la photo à animer.
Les anciennes sélections numériques sont converties en slots avant un ajout,
un retrait ou un changement d’ordre. Un emplacement réutilisé après un retrait
ne transmet pas l’animation de l’ancienne image à la nouvelle.

L’étoile d’une image exclue du montage la réintègre si elle est sélectionnée pour
l’animation. Une image en cours d’envoi ou de retrait ne peut pas être sélectionnée.
La connexion reste nécessaire pour les animations IA et l’accès Lecteur reste
sans modification. Cliquer sur l’étoile ne soumet pas le formulaire et ne déclenche
aucune génération ni consommation de crédit.

## Vérifications

- TypeScript web, compilation Next.js/OpenNext, contrôle des frontières sur
  390 fichiers et vérification du diff réussis.
- Douze tests existants passent sur la saisie manuelle et le barème : admission,
  choix exact des photos, uploads, isolation, quotas et remboursement des échecs.
- Quatre scénarios Chrome passent sur le Worker local : sélection/désélection
  et synchronisation avec « Personnaliser » à 1 440 et 390 pixels, changement
  d’ordre et reprise du brouillon, retrait d’une photo animée puis remplacement
  au même emplacement, ancienne sélection numérique, et visiteur non connecté.
- Le coût passe de 1 à 2 puis 3 crédits avec les sélections et redescend après
  désélection ou retrait. Aucune requête de génération n’est envoyée.
- Le rendu sur ordinateur et mobile est inspecté, sans débordement horizontal
  ni exception JavaScript. La simulation stricte du déploiement réussit.

Les contrôles navigateur utilisent des comptes et réponses API simulés, sans
écriture dans les comptes réels. Les tests D1/R2 couvrent séparément les contrôles
de données et de crédits. Les rapports, captures et empreintes des bindings sont
conservés dans `evidence/local/manual-animation/`.

## Mise en ligne

La version `ad391654-21c8-414b-a237-ae80777d9710` est publiée à 100 % sur
`bienvu.online`. Les quatre scénarios navigateur passent aussi sur cette version,
avec les mêmes réponses API simulées et sans lancement réel de génération.
Les 44 bindings web, 9 bindings d’import et 28 bindings de génération conservent
leurs empreintes. Seul le Worker web a été publié, sans migration ni modification
de secret ou du moteur de rendu.
