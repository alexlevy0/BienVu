# Administration des visuels de la home — 4 octobre 2026

Demande : choisir dans le super admin tous les médias de la page d’accueil, depuis les photos importées, exports et plans IA de l’ensemble de BienVu.

- Onglet **Page d’accueil** : 24 emplacements, sélection avec recherche, filtres, pagination et prévisualisation.
- Brouillon privé, aperçu complet protégé et publication explicite ; rétablissement des visuels par défaut ou de la publication précédente.
- Copies indépendantes dans R2, originales privées conservées, diffusion publique limitée aux sélections publiées et purge des seules copies inutilisées.
- Migration additive `0044_homepage_media.sql`, révisions atomiques et journal immuable.
- La home garde ses visuels initiaux jusqu’à la première publication effectuée par le super admin. Les intitulés d’annonce/agence sont adaptés aux médias sélectionnés et les informations fictives initiales sont masquées pour ces médias.

Recette : `pnpm check` (331 tests, types de tous les paquets et frontières), tests ciblés D1/R2, build OpenNext et bundle Wrangler. Vérification sur le Worker local réel : copie par flux à longueur connue, brouillon inaccessible sans super admin, publication et affichage dans la home. Vérification Chrome de l’onglet, des 24 emplacements, de la recherche, de la prévisualisation, de la sélection, de la publication et de la mise en page mobile, sans exception JavaScript. Aucun appel à un fournisseur IA ni consommation de crédits produit en production.

[Mode d’emploi et détails de conservation](../../ACCUEIL-VISUELS.md).
