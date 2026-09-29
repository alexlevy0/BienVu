# Mes vidéos et Explorer — 29 septembre 2026

## Livré

La page `/historique` reprend la maquette fournie : barre latérale commune à l’accueil, recherche, filtres Toutes/Terminées/En cours, ordre récent/ancien, cartes à trois colonnes, visuel du bien, durée, progression, lecteur, téléchargement et date d’expiration. Les cartes affichent les vrais jobs de l’agence connectée ; la vignette provient de la première photo du manifeste vidéo figé et vérifié dans R2. Aucune vidéo de démonstration n’est affichée dans la bibliothèque réelle.

Une vidéo terminée et encore disponible reste privée par défaut. Son propriétaire peut choisir « Publier dans Explorer » après une confirmation qui annonce la visibilité publique des photos, de l’agence et de ses coordonnées dans la vidéo. La publication crée un identifiant public indépendant du job. Elle apparaît dans `/explorer` et sur `/explorer/[id]`, avec lecture MP4, puis cesse d’être visible et lisible après retrait ou expiration du fichier. Une nouvelle publication après retrait crée un nouveau lien ; l’ancien reste invalide. L’agence peut retirer la publication depuis « Mes vidéos ». Les routes de mutation exigent la session propriétaire et la même origine.

La migration `0015_generation_shares.sql` crée uniquement la table et les index de publication. Aucun job existant n’est publié par défaut. L’API publique ne retourne que les métadonnées utiles à l’affichage ; le MP4 est servi depuis le contrôle de stockage déjà utilisé pour les vidéos privées, avec `no-store`, vérification de la réservation consommée, taille et empreinte R2. Les vignettes restent dans le périmètre D1/R2 du job. Les abonnements, l’essai avec filigrane et l’accès de développement ne changent pas.

## Vérifications locales sur fixtures

- `pnpm check` : **158 tests réussis**, TypeScript et frontières. Après ajout d’une assertion de vignette, le test ciblé `tests/generation-storage.test.ts` et `pnpm typecheck` repassent ; build OpenNext et dry-run Wrangler réussissent.
- Miniflare/D1/R2 : publication refusée à une autre agence et à un job en échec ; double clic convergent ; liste publique avant/après publication, retrait et expiration ; nouveau lien après retrait ; plage vidéo 206 ; vignette issue du manifeste et refus inter-agences. Aucun fournisseur ni génération réelle appelé.
- `scripts/probe-video-library.mjs --fixtures` sur le Worker local : captures **1536 et 390 px**, trois jobs **fictifs**, recherche et filtres, confirmation de publication et retrait simulés dans le navigateur, galerie Explorer fictive. Aucun débordement horizontal. Ces captures sont dans `evidence/local/video-library/` et ne prouvent pas qu’une vidéo client réelle a été publiée.
- `scripts/probe-home-studio.mjs --fixtures` repasse après extraction de la navigation commune : accueil, quatre exemples, formulaire et menu mobile fonctionnent toujours.

## Vérifications sur bienvu.online

Migration 0015 appliquée à la D1 applicative ; `SELECT count(*) FROM generation_shares` renvoie **0** après migration. Worker `bienvu-web-probe-staging`, version **`67759ec3-2102-4e5a-81ec-79c9d76ea555`**, déployé sur `bienvu.online`. Les bindings, noms des cinq secrets, date de compatibilité et observabilité sont inchangés.

Lecture anonyme réelle de cette première version : accueil, historique et Explorer **200** ; `/api/explorer` **200** avec liste vide ; `/api/generations/shares` et vignette privée **401** ; page et MP4 d’un identifiant public inconnu **404**. Chromium sur le vrai domaine en **1536 et 390 px** montre les écrans invités et l’état vide initial d’Explorer sans débordement. La vue Explorer a ensuite reçu la galerie de démonstrations décrite dans [sa recette](EXPLORER.md). Captures sous `evidence/remote/video-library/`.

**Limite de recette :** aucune vidéo client n’a été publiée sans choix explicite de son propriétaire. La création puis la révocation d’un partage sont prouvées sur D1/R2 locaux et dans une interaction navigateur à réponses simulées ; une publication de bout en bout avec session réelle sur le domaine restera à vérifier lorsqu’une vidéo disponible sera choisie. Le domaine ne contient actuellement aucune publication. Aucun crédit vidéo, appel OpenAI/Google, achat ou nouvelle provision budgétaire n’a été consommé par cette livraison ; le coût final du trafic Cloudflare reste à rapprocher avec la facture.

Les serveurs locaux de preview utilisés pour la recette ont été arrêtés. Aucun commit/push demandé pour cette tranche ; l’accueil précédent et cette page sont dans le même lot local.
