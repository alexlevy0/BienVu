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

## Production vérifiée

Le pipeline et le web sont déployés à 100 %, versions respectives `7acdbe5b-21c4-4adf-9ec2-d8e50e847ced` et `50638676-0b89-4e2a-880e-40ea5ea98437`. Enrichissement de 1 343 lignes existantes, catalogue conservé à 1 357 apparences, 254 identités connues. Publication brute inchangée : 47 apparences regroupées en 12 présentateurs, défaut `Daphne_public_1` conservé. Annie expose les 13 apparences déjà publiées ; les autres tenues du fournisseur restent réservées au catalogue administrateur jusqu’à publication.

Accueil, galerie et API en 200 ; variantes publiques vérifiées pour chacun des 12 groupes, aucune apparition des groupes non publiés, catalogue administrateur anonyme refusé en 401. Les 64 bindings web et 36 bindings pipeline, crons, limites et configuration existants sont conservés. Image, version, capacité et configuration du renderer inchangées. Ouverture de la fiche Annie contrôlée dans la vraie galerie déployée ; capture privée `evidence/local/avatar-identities/deployed.png`.
