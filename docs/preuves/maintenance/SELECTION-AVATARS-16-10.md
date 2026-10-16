# Sélection des avatars — validation locale du 16 octobre 2026

La bêta a été committée séparément dans `9b16540`. Ce document décrit la recette effectuée avant le push et le déploiement de la sélection.

## Vérifications automatiques

- 38 tests ciblés réussis : publication et migration, catalogue, galerie, favoris, droits/origine/CAS, transparence, transferts de sélection, presets de l’accueil, placements, avatar continu et pipeline simulé. Commandes : `pnpm exec tsx --test --test-concurrency=1 tests/avatar-publication.test.ts tests/avatar-transparency.test.ts tests/home-render-presets.test.ts`, puis `pnpm exec tsx --test --test-concurrency=1 tests/avatars.test.ts tests/avatar-catalog.test.ts tests/avatar-gallery.test.ts tests/avatar-favorites.test.ts tests/avatar-continuous.test.ts tests/avatar-placement.test.ts`.
- `pnpm typecheck` réussi sur les packages, applications et fixtures de tests.
- `pnpm check:boundaries` : 604 fichiers vérifiés.
- `pnpm --filter @bienvu/web build` réussi : compilation webpack et génération des pages.
- `git diff --check` sans erreur.

## Recette visuelle

Vrais composants client, bundlés dans une fixture locale isolée avec D1 Miniflare ; 90 profils publics existants comme données d’essai. Les lectures de médias réutilisent les routes publiques existantes. Aucune génération fournisseur et aucune mutation en production.

Vérifiés : les deux onglets administrateur, la recherche catalogue, ajout en brouillon, noms, regroupement de deux cadrages, restauration du brouillon après rechargement, publication, affichage commun dans la galerie et le sélecteur, favoris prioritaires, choix d’une variante, lecture effective et muette d’un extrait, fenêtre complète, sélection et fermeture au clavier. Le sélecteur et sa fenêtre n’ont pas de débordement à 390 px. Le choix depuis la galerie arrive dans le véritable formulaire de création puis dans l’onglet Avatar IA, avec le bon cadrage et 2 crédits pour une vidéo de 20 s avec passages courts.

Captures privées et fixture sous `evidence/local/avatar-selection/` (ignoré par Git). La recette n’a pas exécuté de vraie génération vidéo et ne remplace pas un smoke test après déploiement.

## Mise en service

Appliquer la migration additive `0077_avatar_publication.sql` avant de déployer le Worker web. Elle initialise jusqu’à 24 profils déjà activés (8 recommandés) ; la sélection de départ reste à affiner dans le superadmin. Aucun nouveau secret ou binding, aucune migration de vidéo ou de dépense existante. Le retrait éditorial et la désactivation technique restent distincts.
