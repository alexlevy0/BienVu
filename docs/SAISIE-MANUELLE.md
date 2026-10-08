# Créer une annonce manuellement

La saisie manuelle permet de préparer un bien et ses photos, notamment lorsqu’un site ne peut pas être importé. Depuis le **5 octobre 2026**, l’accueil présente une fiche unique avec aperçu, à la place des cinq étapes. L’import par lien et le mode Éditeur restent disponibles.

## Utilisation

Sur Cloudflare : ouvrir [bienvu.online](https://bienvu.online/) ; aucun serveur local nécessaire. Les photos peuvent être préparées sans compte. Après connexion, elles sont envoyées immédiatement au brouillon privé. Le budget financier reste partagé avec les imports URL.

En local : Après `pnpm db:migrate` et `pnpm build:web`, lancer `pnpm preview` et `pnpm dev:imports` dans deux terminaux. Se connecter sur `http://localhost:8787/generer`, puis cliquer sur **Saisir mon annonce manuellement** sous l’import URL.

Sur l’accueil, cliquer sur **Saisie manuelle**, choisir le type de bien et vente ou location, renseigner la ville, puis ajouter si disponibles prix, surface et pièces. Un loyer renseigné exige de préciser si les charges sont comprises. Le volet **Ajouter des précisions** contient le titre et la description ; le titre est proposé à partir du type, de la transaction et de la ville, et reste modifiable.

Ajouter 3 à 12 photos différentes du bien. Déplacer les miniatures, ou utiliser leurs flèches, pour changer l’ordre et la couverture ; les boutons permettent aussi de retirer ou réessayer un fichier. L’aperçu suit la couverture, les informations et le format choisis. Prix, surface, pièces et description restent facultatifs ; une valeur renseignée doit être valide.

**Réglages**, dans la barre du bas, permet de choisir format vertical ou horizontal, durée, voix et sous-titres, et d’ouvrir la personnalisation existante. Le coût affiché suit les animations sélectionnées. **Créer ma vidéo** reste désactivé tant que les informations ou les uploads sont incomplets. Sans compte, cette action conserve la fiche et les fichiers dans le navigateur puis ouvre l’inscription ; après connexion, la saisie reprend sans devoir resélectionner les photos. **Importer un lien** revient à l’accueil en conservant la fiche.

L’enregistrement du brouillon et les uploads ne consomment aucun crédit vidéo. La génération conserve le barème de 1 crédit pour la vidéo, plus 1 par photo animée. L’ancien écran `/generer` utilise toujours son enregistrement manuel, avec la même nouvelle fiche adaptée à sa colonne.

## Limites et provenance

- JPEG, PNG, WebP ; 10 Mio par fichier, 50 Mio au total, 3 à 12 contenus distincts.
- Décodage complet : minimum 640×360 pixels, maximum 16 millions de pixels ; JPEG réencodé jusqu’à 2 048 pixels par côté, ratio et orientation conservés, métadonnées retirées. SVG, HEIC, animation, fichiers corrompus et faux MIME sont refusés.
- Titre/localisation : 200 caractères maximum. Description : 20 000 caractères, paragraphes conservés, affichage en texte brut. Surface positive jusqu’à 100 000 m², 1 à 100 pièces, prix positif jusqu’à 1 milliard d’euros. Prix et autres champs facultatifs laissés vides restent absents.
- `sourceKind: manual`, sources web de l’annonce et des photos à `null`. Faits renseignés `user_provided`, provenance `manual.champ`. Ils ne sont pas présentés comme des faits vérifiés sur un site. Le texte et les photos du formulaire ne constituent pas une preuve de compatibilité d’un importeur.
- Les **imports par lien** sont limités à **20 tentatives par jour UTC et 300 par mois** depuis la migration `0053` du 08/10/2026 (60/mois précédemment). Depuis la migration `0028`, ajouter ses propres photos ou créer une copie personnalisable d’une annonce n’utilise plus ce compteur de scraping. Les compteurs historiques restent conservés. Les saisies manuelles gardent la réservation financière de **0,50 € par dossier hébergé**, ainsi que 12 photos / 50 Mio / 48 requêtes par dossier et leur garde-fou de créations par heure. Le quota vidéo n’est utilisé qu’à la génération.

## API, persistance et reprise

1. `POST /api/imports/manual`, JSON strict et `Idempotency-Key` : valide les champs et un manifeste de fichiers (MIME, taille, SHA-256 des octets originaux). Crée un dossier privé avec bail de 15 minutes, ou renvoie le même dossier pour la même clé/contenu. Un changement sous la même clé est refusé.
2. `PUT /api/imports/:id/uploads/:index` : un fichier par requête, corps borné avant lecture complète. La session fixe l’agence ; taille, MIME et empreinte doivent correspondre au manifeste. Le fichier est décodé/réencodé par le service natif authentifié (pont local ou Container Cloudflare privé), puis journalisé dans D1 avant écriture R2 privée. Les doublons normalisés sont refusés. Une reprise du même slot retrouve le fichier ou répare un `put` interrompu.
3. `POST /api/imports/:id/complete` : vérifie toutes les entrées et les métadonnées R2, puis publie l’annonce atomiquement. Les répétitions et la finalisation concurrente renvoient la même annonce. Les routes privées existantes servent le résultat et les photos.

Toutes les mutations contrôlent session, origine et rattachement à l’agence. Aucun nom de fichier, identifiant d’agence, clé R2 ou URL de photo fourni par le client n’est utilisé comme chemin de stockage. Le champ `input_json` n’est pas exposé par les routes de consultation. L’API `head` de R2 permet la vérification avant publication sans recharger les corps ([documentation officielle](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), consultée le 28/09/2026).

La migration `0008` ajoute `source_kind`, `input_json` et `input_hash`, une unicité par slot photo et des contrôles de publication. Pour conserver sans reconstruction destructive les colonnes SQL historiques `NOT NULL`, une absence de source est stockée comme chaîne vide dans ces seules colonnes ; le contrat/API expose `null`, jamais une URL inventée. Les anciennes lignes restent de type `url`.

Un dossier partiel n’est pas une annonce publiée. Le parcours de l’accueil utilise le brouillon partagé versionné (`POST /api/imports/draft`, `PATCH /api/imports/:id/draft`) et envoie les photos au fur et à mesure. La reprise conserve ses références privées, l’ordre des photos et la personnalisation. Le brouillon local invité reste disponible une heure. L’ancien parcours `/generer` conserve les routes décrites ci-dessus et sa clé d’idempotence pendant les réessais. Les dossiers abandonnés sont purgés selon les règles produit ; tout job référençant une annonce en empêche la purge. Les compteurs persistent après purge.

## Validation et limites d’hébergement

`pnpm check` inclut `tests/manual-listings.test.ts` : validation, provenance, idempotence, isolation, image modifiée, doublons, décodage, stockage interrompu/repris, finalisation concurrente, expiration et purge. Les données sont synthétiques, les moteurs D1/R2 et Sharp s’exécutent réellement en local.

Avec preview au port 8787 et aucun pont sur 8791, `pnpm probe:imports --manual --keep` teste les vraies routes HTTP et conserve temporairement les seuls comptes de recette pour inspection. `node scripts/open-local-fixture.mjs --imports` ouvre leur session ; `pnpm exec tsx scripts/serve-imports.ts --fixtures` permet ensuite l’upload dans le navigateur sans récupération externe. Finir par `pnpm probe:imports --cleanup`, arrêter le pont de fixtures et relancer `pnpm dev:imports` pour l’usage normal.

Le décodage hébergé utilise désormais un Container Cloudflare privé, sans Sharp dans le Worker. La recette distante vérifie les trois uploads, la reprise, la publication, la description et la consultation privée avec deux agences synthétiques ; aucune preuve de compatibilité d'un site n'en est déduite. [Rapport et limites](preuves/sprint-03/CLOUDFLARE.md).
### Base de recette isolée

Si le quota technique de la base habituelle est atteint, ne pas remettre ses compteurs à zéro pour une sonde. Arrêter la preview habituelle et utiliser un répertoire local séparé :

```sh
export BIENVU_LOCAL_STATE="$PWD/evidence/local/sprint-03/manual-state"
pnpm --filter @bienvu/web exec wrangler d1 migrations apply DB --local --persist-to "$BIENVU_LOCAL_STATE"
pnpm --filter @bienvu/web exec wrangler dev --port 8787 --local --persist-to "$BIENVU_LOCAL_STATE"
```

Dans le terminal des sondes, définir la **même variable absolue**, puis lancer `pnpm probe:imports --manual --keep` et terminer par `pnpm probe:imports --cleanup`. Elle cible les accès D1/R2 des outils opérateur ; sans elle, ils utilisent l’état habituel. Le répertoire doit rester dans `evidence/local/`. Le pont de fixtures et l’ouverture de session ne changent pas. À la fin, arrêter cette preview et le pont de fixtures, puis relancer `pnpm preview` et `pnpm dev:imports` normalement. La configuration d’authentification locale et les fichiers source restent communs ; les données D1/R2 sont séparées.
