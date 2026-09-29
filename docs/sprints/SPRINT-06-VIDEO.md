# Sprint 06 — Rendre la vidéo verticale de marque

**Dépendance : sprint 05 terminé. État au 28/09/2026 : terminé. Recette technique Cloudflare validée ; Alex confirme le 28/09 l’image, la voix et la carte finale de la nouvelle vidéo Cloudflare issue du parcours complet (sprint 07).** [Rapport et limites](../preuves/sprint-06/RAPPORT.md).

## Objectif

Transformer le manifeste validé en MP4 vertical avec photos, voix, sous-titres, identité d'agence et conclusion. Produire une version d'essai dont le filigrane fait partie des pixels exportés.

Références : [ARCHITECTURE.md](../ARCHITECTURE.md), [CONTRATS.md](../CONTRATS.md), [CADRAGE.md](../CADRAGE.md). Réutiliser le renderer démontré au sprint 00 ; la démonstration publique Remotion/Cloudflare seule ne constitue pas le backend du produit.

## Travail à réaliser

- [x] **06.1 — Composer un modèle unique.** Créer la composition React Remotion à 1080 × 1920, 30 fps, avec scènes photo, transitions discrètes, textes lisibles et écran de contact. Prévoir des zones de sécurité pour les interfaces sociales. Protéger la lisibilité quand les couleurs de l'agence ont peu de contraste.
- [x] **06.2 — Respecter les photos.** Éviter les recadrages qui suppriment l'essentiel d'une pièce ou déforment ses proportions. Utiliser un fond adapté quand le format de l'image exige de conserver sa totalité. Les mouvements restent légers ; aucun contenu immobilier n'est généré ou ajouté à l'image.
- [x] **06.3 — Synchroniser avec la voix.** Construire la timeline depuis les durées mesurées, en tenant compte des pauses et chevauchements de transitions. Afficher les sous-titres par phrase et garantir que la conclusion n'est pas tronquée. Ne pas imposer un alignement mot à mot supplémentaire pour cette version.
- [x] **06.4 — Figer les droits de sortie.** Lire le droit au filigrane depuis le manifeste serveur immuable. L'essai n'engendre aucun master sans filigrane accessible ou caché. Intégrer la mention de voix synthétique de façon lisible. Les versions payantes conservent l'identité de l'agence sans filigrane BienVu.
- [x] **06.5 — Sécuriser le service de rendu.** Ajouter authentification interne, validation du manifeste, identification stable du rendu et réponse d'acceptation rapide. Exposer un statut privé et un résultat récupérable après restart. Restreindre les assets aux objets autorisés du job ; pas d'URL arbitraire ou de code fourni par une annonce.
- [x] **06.6 — Vérifier et stocker.** Encoder en MP4 H.264/AAC, vérifier dimensions, pistes, durée, poids et empreinte. Activer un MP4 lisible en streaming. Écrire dans R2 privé avec clé idempotente. Nettoyer les fichiers temporaires et arrêter le conteneur après inactivité sans interrompre un rendu actif.

## Critères d'acceptation

1. Une vidéo réelle rendue sur Containers est lue sur un navigateur mobile et un navigateur desktop, avec audio synchronisé et fin complète.
2. Une inspection de plusieurs frames contrôle les textes longs, prix, logos clairs/sombres, photos horizontales et marges ; une écoute contrôle le début et la fin des phrases.
3. L'essai exporté comporte le filigrane même hors du lecteur BienVu ; modifier une valeur dans le navigateur ne le retire pas.
4. Deux demandes internes du même rendu ne créent pas deux résultats concurrents ni deux traitements inutiles.
5. Fichier source manquant, timeout et crash donnent un état récupérable ou un échec explicite, avec nettoyage et coût suivi.

## Livrables et fin du sprint

Composition, renderer privé, protocole de statut, vérification MP4, échantillons d'essai/payant et rapport visuel/audio dans [SUIVI.md](../SUIVI.md). Aucun éditeur de timeline ni catalogue de modèles n'est attendu.

## Recette technique du 28/09/2026 et clôture humaine

Les six tâches sont livrées. Deux MP4 natifs essai/payant et un **vrai MP4 de cette composition rendu sur Containers** : 20,054 s, 600 frames, H.264/AAC, 1080 × 1920. R2 privé, SHA/poids/plages vérifiés ; résultat relu après redéploiement sans nouveau calcul, arrêt du conteneur confirmé. Authentification, droits serveur, concurrence, reprise et échecs couverts ; **156 tests** réussissent.

Annonce/photos synthétiques, cinq WAV Google déjà validés, aucun nouvel appel fournisseur. Les six frames du MP4 distant ont été inspectées ; lecture complète desktop et mobile **émulé**, voix décodée et fin complète. Alex a approuvé image et voix du MP4 local. **Alex confirme ensuite image et voix du nouvel export Cloudflare du sprint 07, réalisé avec le même renderer, ce qui clôt la réserve humaine.** Ce retour ne vaut pas nouvelle lecture du premier fichier d’essai. Téléphone physique/Safari non vérifiés ; aucune validation de ces appareils déduite de l’émulation.

L’ancien échec et son coût sont conservés. À la demande d’Alex, budget mensuel porté à **40 €**, coupure **35 €**, provisions **26,35 €**. Une reprise réussie dans la campagne de 1,60 € autorisée. Service opérateur remis en pause, conteneur arrêté, génération publique fermée. Le sprint 06 est terminé après la confirmation humaine décrite ci-dessus. Workflow et parcours client ont ensuite été validés au sprint 07 ; son budget actualisé et ses limites figurent dans le suivi.
