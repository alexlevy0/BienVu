# Identités et variantes HeyGen — 17 octobre 2026

Le catalogue conserve maintenant l’identité fournisseur (`group_id`), son nom officiel et les tags retournés par HeyGen. Le regroupement repose sur l’identifiant, jamais sur le prénom : deux homonymes ne sont pas fusionnés. Les anciennes publications sont normalisées à la lecture et à l’écriture, en conservant leurs identifiants de variantes, leur ordre, leurs recommandations et leur choix par défaut. Aucun élargissement automatique de la sélection publique.

Dans Personnaliser et sur `/avatar`, une fiche représente une personne. Son ouverture affiche les tenues et cadrages publiés, le choix courant, les favoris par apparence, la recherche et les démonstrations muettes au survol. Fermeture au clavier, focus restauré, fenêtre native accessible, animation réduite respectée. La galerie et le catalogue superadmin chargent une couverture par identité ; les détails sont paginés par 32 apparences et les images proches de l’écran seulement. Une seule démonstration est montée à la fois.

Dans le superadmin, le catalogue est groupé par identité, avec les filtres existants. Ouvrir une fiche permet d’ajouter ou retirer ses déclinaisons du brouillon, de gérer disponibilité et transparence. La publication reste explicite, avec contrôle de révision et accès superadmin inchangés. Jusqu’à 256 variantes par groupe, 200 groupes et 5 000 variantes au total ; les admissions et tarifs restent identiques.

## Validation

- 43 tests ciblés réussis : catalogue, publications, homonymes, pagination de 70 variantes, non-exposition des variantes non publiées, favoris, autorisations/origines, transparence, coûts et pipeline de génération simulé.
- `pnpm typecheck`, `pnpm check:boundaries` (618 fichiers), build Next/OpenNext et `git diff --check` réussis.
- Recette des vrais composants avec D1 Miniflare isolée : ouverture d’un groupe, choix précis conservant les réglages, fenêtres imbriquées, ajout d’une tenue en brouillon puis publication visible dans la galerie, catalogue administrateur par personne. Démonstration observée en lecture, muette et prête ; grille mobile sur deux colonnes à 390 px, sans débordement horizontal.
- Aucune génération fournisseur payante. Les captures privées restent sous `evidence/local/avatar-identities/`.

## Catalogue existant

`scripts/sync-avatar-identities.mjs` lit le catalogue HeyGen sans génération. Par défaut, il prépare uniquement des métadonnées locales ignorées par Git. `--cached --apply` enrichit les lignes déjà présentes en D1, avec sauvegarde préalable et vérification que la publication, les médias, les prix et les disponibilités n’ont pas changé. Il n’ajoute aucun avatar ni aucune variante à la sélection publique. Déployer le pipeline et le web compatibles avant cet enrichissement ; aucune migration SQL ou nouveau secret requis.

L’âge et le teint ne sont pas inférés depuis les images. Leurs filtres restent hors périmètre tant que des métadonnées fiables ne sont pas disponibles.
