# Fixtures d’import — sprints 03 et 04

Toutes les données et les images de cette recette sont synthétiques. Les structures DOM des trois adaptateurs reprennent uniquement les marqueurs techniques observés le 28/09/2026 sur Espaces Atypiques, Orpi et Century 21. Les noms, prix, références et URL de photos sont remplacés. Aucun HTML brut, jeton de page, contact ou photo réelle n’est versionné.

Vente, location mensuelle avec charges, prix absent, contradiction, doublons, hors annonce, microdata/lazy loading et trois adaptateurs. Les requêtes des fixtures sont interceptées en mémoire ; ces URL ne doivent pas être utilisées pour une recette Internet.

## Portails — 28 septembre 2026

`portals/bienici-sale.html` reproduit les seuls marqueurs observés dans le DOM public Bien’ici après JavaScript : `detailedSheetFirstBlock`, `titleInside`, `fullAddress`, prix, galerie `slideImg`/`u="image"`/`src2`, description et deux documents JSON-LD `Accommodation`/`Product`. Les valeurs, références, contacts et liens de photos sont synthétiques. Les variantes location, charges et contradiction de centime sont construites en mémoire dans les tests, à partir des structures observées sur les deux pages réelles. Aucun HTML public intégral ni image réelle n’est versionné.

`search.html`, `removed.html` et `challenge.html` sont des scénarios négatifs synthétiques. La redirection Figaro vers une recherche a été observée ; le HTML d’un challenge de portail ou d’une annonce retirée n’a pas été acquis. Ces deux fixtures ne prouvent donc pas le format actuel d’un portail particulier.

Les tests sans réseau couvrent aussi les codes HTTP, les hôtes trompeurs, les alias, les redirections, l’absence de retry, les images étrangères et les vignettes trop petites. Un import simulé Bien’ici n’est **pas** un import automatique réel. Les acquisitions publiques séparées et leurs limites figurent dans le [rapport du sprint 04](../../docs/preuves/sprint-04/RAPPORT.md).
