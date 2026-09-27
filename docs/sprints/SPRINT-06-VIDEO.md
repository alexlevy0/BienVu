# Sprint 06 — Rendre la vidéo verticale de marque

**Dépendance : sprint 05. Statut initial : à faire.**

## Objectif

Transformer le manifeste validé en MP4 vertical avec photos, voix, sous-titres, identité d'agence et conclusion. Produire une version d'essai dont le filigrane fait partie des pixels exportés.

Références : [ARCHITECTURE.md](../ARCHITECTURE.md), [CONTRATS.md](../CONTRATS.md), [CADRAGE.md](../CADRAGE.md). Réutiliser le renderer démontré au sprint 00 ; la démonstration publique Remotion/Cloudflare seule ne constitue pas le backend du produit.

## Travail à réaliser

- [ ] **06.1 — Composer un modèle unique.** Créer la composition React Remotion à 1080 × 1920, 30 fps, avec scènes photo, transitions discrètes, textes lisibles et écran de contact. Prévoir des zones de sécurité pour les interfaces sociales. Protéger la lisibilité quand les couleurs de l'agence ont peu de contraste.
- [ ] **06.2 — Respecter les photos.** Éviter les recadrages qui suppriment l'essentiel d'une pièce ou déforment ses proportions. Utiliser un fond adapté quand le format de l'image exige de conserver sa totalité. Les mouvements restent légers ; aucun contenu immobilier n'est généré ou ajouté à l'image.
- [ ] **06.3 — Synchroniser avec la voix.** Construire la timeline depuis les durées mesurées, en tenant compte des pauses et chevauchements de transitions. Afficher les sous-titres par phrase et garantir que la conclusion n'est pas tronquée. Ne pas imposer un alignement mot à mot supplémentaire pour cette version.
- [ ] **06.4 — Figer les droits de sortie.** Lire le droit au filigrane depuis le manifeste serveur immuable. L'essai n'engendre aucun master sans filigrane accessible ou caché. Intégrer la mention de voix synthétique de façon lisible. Les versions payantes conservent l'identité de l'agence sans filigrane BienVu.
- [ ] **06.5 — Sécuriser le service de rendu.** Ajouter authentification interne, validation du manifeste, identification stable du rendu et réponse d'acceptation rapide. Exposer un statut privé et un résultat récupérable après restart. Restreindre les assets aux objets autorisés du job ; pas d'URL arbitraire ou de code fourni par une annonce.
- [ ] **06.6 — Vérifier et stocker.** Encoder en MP4 H.264/AAC, vérifier dimensions, pistes, durée, poids et empreinte. Activer un MP4 lisible en streaming. Écrire dans R2 privé avec clé idempotente. Nettoyer les fichiers temporaires et arrêter le conteneur après inactivité sans interrompre un rendu actif.

## Critères d'acceptation

1. Une vidéo réelle rendue sur Containers est lue sur un navigateur mobile et un navigateur desktop, avec audio synchronisé et fin complète.
2. Une inspection de plusieurs frames contrôle les textes longs, prix, logos clairs/sombres, photos horizontales et marges ; une écoute contrôle le début et la fin des phrases.
3. L'essai exporté comporte le filigrane même hors du lecteur BienVu ; modifier une valeur dans le navigateur ne le retire pas.
4. Deux demandes internes du même rendu ne créent pas deux résultats concurrents ni deux traitements inutiles.
5. Fichier source manquant, timeout et crash donnent un état récupérable ou un échec explicite, avec nettoyage et coût suivi.

## Livrables et fin du sprint

Composition, renderer privé, protocole de statut, vérification MP4, échantillons d'essai/payant et rapport visuel/audio dans [SUIVI.md](../SUIVI.md). Aucun éditeur de timeline ni catalogue de modèles n'est attendu.
