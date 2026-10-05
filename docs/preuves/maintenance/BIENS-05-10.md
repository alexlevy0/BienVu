# Mes biens et fiches de contenus — 5 octobre 2026

La bibliothèque « Mes vidéos » devient **Mes biens** (`/biens`). Elle suit les deux maquettes : cartes de biens avec couverture, localisation, surface, pièces, prix et aperçus des contenus ; fiche détaillée avec onglets **Contenus**, **Photos**, **Informations** et **Publications**. La recherche couvre le titre, la ville et la référence. Les filtres vente/location/archives, le tri, la vue liste et la pagination utilisent les données de l’agence. Les anciens liens `/historique` restent utilisables ; le détail historique d’une génération conserve son suivi et ses actions de crédits.

## Données et actions

- Les imports, brouillons, exports et dossiers existants sont regroupés par liens explicites, URL canonique identique ou ensemble identique d’au moins trois photos. Deux dossiers explicitement distincts restent distincts. Le titre ou la ville seuls ne provoquent aucun regroupement. Une copie ouverte depuis une vidéo rejoint son bien grâce à sa filiation ; les alias des anciennes références continuent de résoudre la fiche.
- Les compteurs représentent les vidéos et brouillons réellement enregistrés. Un visuel prix/surface téléchargeable et un texte factuel de publication sont préparés à partir des informations disponibles. Les vidéos sont nommées selon leur format réel : aucun export destiné à un réseau n’est inventé.
- L’archivage est réversible et conserve les médias, les partages et les crédits. Il utilise les tables de dossiers déjà présentes, dans une transaction D1. Aucune migration ni ressource supplémentaire.
- « Modifier le bien » ouvre la fiche existante et **enregistre sans génération ni crédit**. L’enregistrement reste possible avec moins de trois photos ; la création habituelle d’une vidéo exige toujours ses trois photos. « Créer un contenu » ouvre l’Éditeur en reprenant le brouillon ou les sources de la vidéo : voix et animations conservées par le parcours existant.
- Lecture, téléchargement individuel ou ZIP, copie du texte, publication explicite dans Explorer, retrait du partage, publication sociale et reprise d’un échec utilisent les parcours existants. Le ZIP se prépare dans le navigateur, jusqu’à 200 Mio de vidéos ; les téléchargements individuels restent accessibles au-delà.
- Les photos sont servies par une route privée vérifiant l’agence propriétaire. Les copies conservées des générations sont privilégiées et vérifiées par empreinte et taille. Les réponses des APIs sont `private, no-store`. Un utilisateur en lecture seule ne peut ni modifier, ni archiver, ni publier. L’invité conserve l’accès à son essai via le détail historique.

## Validation locale

- `pnpm check` : **358 tests réussis**, contrôle des frontières et TypeScript de tous les packages.
- Complément D1/R2 sur la retouche d’une vidéo : fiche unique avec son brouillon de copie, photos conservées accessibles malgré les anciens marqueurs d’expiration, voix et timings retrouvés, aucun appel fournisseur.
- Recette navigateur sur APIs de fixtures à **1536, 390 et 320 px** : recherche, filtres, grille/liste, archive/restauration, fiche et navigation clavier entre les onglets, lecture, PNG, ZIP, partage/retrait Explorer, connexion sociale, ouverture de l’Éditeur et modification des pièces sans admission de génération. Droits des rôles invité et lecteur vérifiés, aucun débordement horizontal.
- Recette existante de la fiche manuelle connectée et invitée à 1536 et 390 px : ordre des photos, doublons, prix/charges, réglages et conservation de la saisie passent après l’ajout du mode d’enregistrement.
- Compilation Next/OpenNext réussie, puis mêmes recettes de biens à 1536/390/320 px sur le Worker compilé local. Les sondes `probe:foundations` et `probe:web` passent : anciennes et nouvelles routes, refus des appels invités, cookie de sonde et accès D1/R2 local. Les artefacts de la sonde sont nettoyés.

Les captures, logs et réponses de fixtures restent ignorés dans `evidence/local/properties-20261005/`. Ces recettes n’envoient aucune génération payante et ne réinitialisent aucun budget.

```sh
pnpm check
node --import tsx --test tests/editor-voice.test.ts
node --import tsx scripts/probe-properties-ui.mjs
node scripts/probe-manual-sheet-ui.mjs
pnpm build:web
pnpm probe:foundations
pnpm probe:web
git diff --check
```

## Mise en ligne

Le Worker web `bienvu-web-probe-staging`, servi sur **bienvu.online**, est déployé avec la version **`a707e4d6-bc56-4a75-8b42-421528ed88a9`**. Le déploiement préserve les variables existantes et n’utilise aucune nouvelle ressource. Les empreintes des bindings et secrets sont identiques avant et après : web (43), import (9), génération (28). Les autres Workers ne sont pas redéployés.

La vérification publique en lecture seule passe : accueil, `/biens`, alias `/historique`, fiche de bien invitée, `llms.txt` et `robots.txt` répondent HTTP 200. Les trois routes privées de liste, détail et photo refusent l’invité avec HTTP 401 et `private, no-store`. Les brouillons conservent leur cycle de conservation existant ; les exports conservés restent accessibles via leur bien.

```sh
pnpm --filter @bienvu/web exec wrangler deploy --config wrangler.staging.jsonc --keep-vars --strict --dry-run
pnpm --filter @bienvu/web exec wrangler deploy --config wrangler.staging.jsonc --keep-vars --strict --message 'Mes biens: property library, content details and private photo access'
```

Le serveur local est arrêté. Aucun commit ni push n’est effectué pour cette demande.
