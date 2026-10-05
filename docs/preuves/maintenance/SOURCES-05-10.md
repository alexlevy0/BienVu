# Sources testées — 5 octobre 2026

La page `/sources` présente maintenant **15 réseaux d’agences et de mandataires**, ainsi que les **4 portails déjà testés**. La recherche reconnaît les noms et domaines, même sans accents. Les filtres permettent de consulter les sources avec un import complet ou partiel démontré et celles pour lesquelles la saisie manuelle est conseillée. Chaque carte indique le nombre d’essais, leur date, leurs résultats et les liens des annonces.

Les informations sous l’URL de création utilisent le même catalogue. Ce catalogue public est distinct du registre qui autorise les requêtes réseau : aucun hôte, sous-domaine, chemin, CDN, proxy ou mécanisme de contournement n’a été ajouté aux permissions de l’importeur.

## Sélection des réseaux

Recherche effectuée le 5 octobre sur les sites officiels des réseaux nationaux. Le panel couvre les agences franchisées, les réseaux intégrés et les mandataires ; ce n’est pas un classement exhaustif. Les implantations et les nombres de conseillers ne sont pas des unités comparables.

Références consultées pour leur présence en France :

- [Orpi — le réseau](https://www.orpi.com/le-reseau-orpi/) et [Century 21 — en France](https://www.century21.fr/fiches/a_propos/century21/france/).
- [Laforêt — qui sommes-nous](https://www.laforet.com/qui-sommes-nous), [HUMAN — le réseau](https://www.human-immobilier.fr/human-news/human-premiere-agence-paris/1538), [Guy Hoquet — qui sommes-nous](https://business.guy-hoquet.com/qui-sommes-nous/).
- [Nestenn — liste des agences](https://nestenn.com/liste-agences), [ERA — agences](https://www.eraimmobilier.com/agences/), [l’Adresse — activité du réseau](https://www.ladresse.com/blog/un-premier-semestre-2026-en-dents-de-scie-qui-rebat-les-cartes-en-faveur-des-acheteurs/1262).
- [Foncia — implantation des agences](https://pressroom.foncia.com/communiques-de-presse/foncia-avignon-reunit-ses-equipes-expertises-nouvelle-agence), [Citya — le réseau](https://www.citya.com/citya-immobilier), [Square Habitat — agences](https://www.squarehabitat.fr/agences/).
- [iad — campagne nationale 2026](https://blog.iadfrance.fr/conseil-immobilier/iad-relance-son-temps-fort-mandats-7-semaines-pour-faire-rayonner-l-immobilier-de-proximite/), [SAFTI](https://www.safti.fr/), [Arthurimmo.com](https://www.arthurimmo.com/), [Espaces Atypiques](https://www.espaces-atypiques.com/).

## Essais réels dans BienVu

**16 annonces**, une tentative par URL, via `POST https://bienvu.online/api/imports`, avec une identité technique isolée et le transport produit Cloudflare Worker/Container/D1/R2. Le premier lien Orpi étant indisponible, une seconde annonce Orpi connue a été ajoutée au panel. Les URL exactes sont dans `scripts/source-coverage-samples.json` et dans le catalogue public.

| Réseau et annonce | Résultat du 5 octobre | Photos vérifiées |
|---|---|---:|
| Orpi — Ambillou | Lien indisponible (`SOURCE_UNAVAILABLE`, `not_found`) | 0 |
| Orpi — Sanary-sur-Mer | Import complet (`ready`) | 12 |
| Century 21 — Saint-Martin-Boulogne | Informations insuffisantes (`INCOMPLETE_LISTING`) | 0 |
| Laforêt — Lyon 3e | Destination non prise en charge (`UNSAFE_URL`) | 0 |
| HUMAN — Tulle | Accès refusé par la source (`SOURCE_BLOCKED`, `access_denied`) | 0 |
| Guy Hoquet — Courbevoie | Destination non prise en charge (`UNSAFE_URL`) | 0 |
| Nestenn — Lyon 8e | Informations contradictoires (`CONFLICTING_FACTS`) | 0 |
| ERA — Saint-Nazaire | Destination non prise en charge (`UNSAFE_URL`) | 0 |
| l’Adresse — Bègles | Destination non prise en charge (`UNSAFE_URL`) | 0 |
| Foncia — Toulouse | Lien indisponible (`SOURCE_UNAVAILABLE`, `not_found`) | 0 |
| Citya — Toulouse | Informations insuffisantes (`INCOMPLETE_LISTING`) | 0 |
| Square Habitat — Angers | Informations contradictoires (`CONFLICTING_FACTS`) | 0 |
| Arthurimmo.com — Nantes | Source indisponible (`SOURCE_UNAVAILABLE`) | 0 |
| iad — Lyon | Informations insuffisantes (`INCOMPLETE_LISTING`) | 0 |
| SAFTI — Cergy | Destination non prise en charge (`UNSAFE_URL`) | 0 |
| Espaces Atypiques — Sathonay-Village | Import complet (`ready`) | 12 |

Deux imports complets, 14 échecs, aucun brouillon partiel : **24 photos effectivement téléchargées, décodées et persistées**, avec contrôle des empreintes SHA-256, du format JPEG, des dimensions et de l’absence de métadonnées EXIF. Chaque réponse d’import a été relue par sa route privée ; un accès sans session reste refusé avec HTTP 401. Un HTTP 200 de la route d’import ne transforme pas un résultat `failed` en réussite.

Le catalogue conserve aussi le succès Century 21 du **28 septembre**, avec 7 photos ([preuve](../sprint-03/CLOUDFLARE.md)), et les quatre essais de portails du **28 septembre** ([preuve](../sprint-04/RAPPORT.md)). La page contient donc **19 sources et 21 essais documentés**, dont **16 nouveaux essais**. Les anciens ne sont pas redatés au 5 octobre. Century 21 et Orpi sont présentés avec des résultats variables ; Espaces Atypiques a un import complet sur l’unique nouvelle annonce testée.

Un échec décrit le lien testé et ne prouve pas que toutes les annonces d’un réseau échouent. Une page indexée peut avoir été retirée ; un refus d’accès ou une destination refusée n’est pas une panne universelle de l’agence. Les restrictions réseau et les refus des sites restent respectés, sans nouvel essai automatique ni compte tiers.

## Nettoyage et budget

Aucune vidéo, voix off, animation IA ou e-mail n’a été généré. Aucun crédit vidéo consommé. Les importations utilisent les limites et provisions existantes : **16 tentatives aujourd’hui sur 20**, **38 sur 60 ce mois-ci**, sans remise à zéro. Quatre tentatives restent disponibles pour l’activité normale de la journée.

La provision d’import augmente de **8,00 €** pour les 16 essais (0,50 € par tentative). Le total mensuel provisionné passe de **53,75 € à 61,75 €**, avec une coupure existante à **90,00 €** ; ce sont des provisions de budget, pas des factures rapprochées. Les échecs et la suppression des données de recette ne remboursent pas ces provisions. La génération reste active.

Toutes les lignes d’import et leurs objets privés temporaires ont été supprimés après le délai de protection du produit. Une première demande de suppression immédiate a été refusée avec HTTP 409 comme prévu ; le nettoyage a ensuite confirmé l’absence des données, y compris celles supprimées entre-temps par le cron. Les credentials et sessions techniques ont été révoqués. Le compte propriétaire technique est conservé, pour respecter les invariants d’agence sans désactiver leurs triggers. Aucun compte client préexistant n’a été modifié.

Les réponses privées, diagnostics, contrôles de médias et captures restent hors Git dans `evidence/remote/source-coverage-20261005/`. `identity.json` a été supprimé ; `cleanup.json` atteste le nettoyage, la révocation et la conservation des compteurs et provisions.

## Validation

- **29 tests ciblés réussis** : catalogue, résultats partiels, adaptateurs de portails et permissions réseau. Les nouveaux tests vérifient notamment qu’une preuve locale ou partielle ne devient pas un import complet, que les dates historiques restent distinctes et que reconnaître un réseau dans la page n’élargit pas les permissions de l’importeur.
- TypeScript complet, contrôle des frontières de 330 fichiers, `git diff --check`, build Next/OpenNext et dry-run Wrangler réussis.
- Navigateur réel sur le Worker local, **1440 et 390 px** : 19 cartes, filtre des trois sources avec réussite démontrée, 16 sources restantes, recherche sans accents et par domaine, annonces détaillées, état vide et remise à zéro, focus clavier, aucun débordement horizontal. Captures inspectées. Aucune requête d’écriture pendant ces vérifications.

Commandes de validation :

```sh
pnpm typecheck
pnpm exec tsx --test --test-concurrency=2 tests/source-coverage.test.ts tests/import-portals.test.ts tests/import-partial.test.ts
pnpm check:boundaries
node --check scripts/probe-source-coverage-cloudflare.mjs
pnpm build:web
pnpm exec wrangler deploy --dry-run --config apps/web/wrangler.staging.jsonc
node evidence/remote/source-coverage-20261005/browser-check.mjs
git diff --check
```

Le Worker `bienvu-web-probe-staging`, servi sur `bienvu.online`, est publié à **100 %** avec la version **`e0f8a580-b7ba-4358-b984-24350ff3b043`**. Les bindings, variables et secrets ont été comparés avant/après par empreinte et sont identiques. Base D1, R2, services d’import et de génération, domaines et crons existants sont conservés. Aucune migration ni publication des conteneurs.

```sh
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars --strict --message 'Update dated real estate source import results'
node evidence/remote/source-coverage-20261005/browser-check.mjs https://bienvu.online
```

Vérification distante à **13:34 UTC** : accueil et `/sources` **HTTP 200**, API imports/admin sans session **401**. Les nouveaux réseaux et la date du 5 octobre figurent dans le HTML servi. Le même contrôle de navigateur réel a réussi sur le domaine public en **1440 et 390 px**, y compris recherche, filtres, détails et absence de débordement ou d’écriture. Les captures locales et distantes ont été inspectées.

Les modifications restent non committées ; aucun commit/push demandé pour cette tâche.

Actualisation l’Adresse après cette campagne : l’annonce de Bègles, auparavant refusée, est maintenant importée avec 11 photos grâce à son adaptateur dédié. Le catalogue conserve le dernier résultat vérifié de cette même URL ; les rapports précédents et le constat initial de cette campagne restent conservés. Voir [LADRESSE-05-10](LADRESSE-05-10.md). Le filtre des sources avec réussite compte désormais quatre réseaux ; quinze restent sans import complet démontré.
