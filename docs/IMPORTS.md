# Imports d’annonces — sprint 03

Le parcours local ou Cloudflare transforme un lien en annonce privée et galerie persistante. Depuis la demande d’Alex du 28/09/2026, un bouton sous l’import ouvre aussi une [saisie manuelle avec photos](SAISIE-MANUELLE.md). Les deux modes utilisent la session et l’agence du sprint 02, sans job vidéo, crédit ou essai consommé. Aucun éditeur vidéo n’est ajouté.

**État au 28/09 :** imports URL et saisie manuelle actifs sur bienvu.online, avec Container privé à IP épinglée/Sharp, fallback Browser Run et D1/R2 existants. Trois agences réelles importées avec 12/11/7 photos ; recette séparée pour la page JavaScript et la saisie synthétiques. [Rapport Cloudflare](preuves/sprint-03/CLOUDFLARE.md).

## Lancer et utiliser

Après `pnpm install --frozen-lockfile` et `pnpm setup:local` :

```sh
pnpm db:migrate
pnpm build:web
pnpm preview
```

Dans un second terminal :

```sh
pnpm dev:imports
```

Se connecter sur `http://localhost:8787`, puis ouvrir `/generer`. Coller un lien HTTPS d’une annonce publique. Le résultat contient les faits vérifiés, la description du bien lorsqu’elle est disponible, les photos privées, la provenance et une date d’expiration. « Vos derniers imports » permet de relire le résultat après rechargement. Une autre URL du même bien peut être essayée après un échec.

Le pont natif écoute uniquement sur `127.0.0.1:8791`. Il exige `LOCAL_IMPORT_TOKEN`, secret aléatoire créé dans `apps/web/.dev.vars` par `setup:local`. Le Worker n’utilise ce pont qu’avec `PROBE_MODE=local`, `IMPORT_MODE=local` et une requête HTTP localhost/127.0.0.1. Ne pas exposer ces serveurs par un tunnel public. Les fichiers Wrangler versionnés ont `IMPORT_MODE=disabled` ; la préparation staging force également cette valeur. Arrêter le pont empêche toute nouvelle récupération distante.

## Extraction et frontières de confiance

`packages/importers` contient le parseur HTML parse5 8.0.0, les extracteurs TypeScript et l’orchestration, séparés du réseau. Aucun `eval`, appel IA ou exécution de texte extrait. Le chemin statique lit JSON-LD (y compris les références `@graph`), microdata, puis les adaptateurs Espaces Atypiques, Orpi et Century 21. Chaque fait garde `sourcePath`, une preuve bornée et une version d’adaptateur. Identité, vente/location et localisation sont obligatoires ; un prix ou une surface absent reste absent, une contradiction vérifiable bloque l’import. Un loyer n’est retenu qu’avec EUR, période mensuelle et traitement explicite des charges.

Les adaptateurs 3.2 extraient aussi la description liée au bien. Le HTML est converti en texte brut, entités décodées, paragraphes et sauts de ligne conservés, éléments actifs et blocs de navigation ignorés. La provenance est enregistrée dans `description.sourcePath`. Aucun résumé ni reformulation automatique : la description conserve le texte de la source et reste séparée des faits vérifiés. Le champ vaut `null` si le bloc manque ou si plusieurs blocs candidats ont des textes différents. L’interface affiche cette absence ; aucun éditeur n’est ajouté.

Le même transport Node en local et dans le Container Cloudflare résout toutes les adresses d’un hôte et refuse une résolution vide, mixte publique/privée ou réservée. Il épingle l’adresse publique dans la connexion HTTPS en conservant le nom TLS/SNI et la vérification du certificat. Chaque redirection repasse par les contrôles ; aucune deuxième résolution implicite par `fetch`. Pas de cookie, authentification, proxy ou en-tête de l’utilisateur transmis aux agences. Pages limitées à l’hôte source ; CDN d’images autorisés explicitement par adaptateur. Pas de joker ni de nouvel hôte autorisé parce que la page le demande. Les URL de toute la galerie sont contrôlées avant son téléchargement.

Les galeries sont délimitées par la structure de l’annonce et, lorsque disponible, sa référence. Lazy loading et `srcset` sont résolus à partir des URL présentes. Logos, avatars, plans identifiés et recommandations hors galerie sont écartés ; aucun classifieur visuel ne garantit l’exclusion d’un visuel mal étiqueté par la source. Sharp décode réellement JPEG/PNG/WebP, vérifie les dimensions et réencode en JPEG orienté sans métadonnées. Les empreintes du contenu normalisé dédupliquent les photos ; l’ordre de la galerie est conservé. Les filigranes présents sur les photos des agences restent présents.

## Limites effectives

| Limite | Valeur |
|---|---|
| Durée d’un import / d’une ressource | 60 s / 12 s |
| HTML / image source / total de corps source | 2 Mio / 10 Mio / 50 Mio |
| Description normalisée | 20 000 caractères ; troncature indiquée dans le résultat et l’interface |
| Redirections par ressource | 3, contrôlées à chaque étape |
| Ressources / candidats / photos conservées | 20 / 24 / 12 ; minimum 3 distinctes |
| Image décodée | 16 millions de pixels maximum ; minimum 640×360 |
| JPEG stocké | 2 048×2 048 maximum, ratio préservé |
| Imports URL actifs / dossiers stockés par agence | 1 / 30, tous modes pour le stockage |
| Tentatives d’import, toutes agences | 5 par jour UTC / 30 par mois UTC |
| Récupérations simultanées du pont/conteneur | 2 |
| Conservation / bail / délai avant purge | 30 jours / 90 s URL, 15 min saisie / bail + 5 min |

Une récupération échouée garde toute sa réservation d’octets, car son volume reçu peut être inconnu. La dernière requête reçoit seulement le budget restant. Les limites de tentatives sont atomiques dans D1 et persistantes après purge ; un rejeu idempotent ne les consomme pas à nouveau. Ce sont des limites techniques de recette, pas les quotas des abonnements ni une garantie de facture. Les sondes locales isolées peuvent retirer leurs tentatives synthétiques ; la recette Cloudflare conserve toutes ses tentatives et réservations après nettoyage. Aucun remboursement n’existe dans la purge produit.

## Persistance et nettoyage

La migration `0006_private_imports.sql` ajoute imports, journal d’objets, compteurs et contraintes. La clé est `agencies/{agencyId}/imports/{importId}/{sha256}.jpg`. Le journal précède le `put` R2, afin de retrouver un objet même après une réponse incertaine. La publication atomique en D1 exige un import actif et au moins trois objets journalisés ; le contrat et les fichiers sont contrôlés avant publication. Les routes filtrent toujours par l’agence déduite de la session et répondent `private, no-store`.

La migration `0007_listing_description.sql` ajoute `listings.description_json` et conserve le déclencheur de publication atomique. La description est sauvegardée avec le résultat privé et dans cette colonne. Les imports antérieurs restent lisibles avec une description absente : relancer un import du lien pour la récupérer, dans les plafonds habituels. La migration ne consulte aucune source et ne modifie pas les anciennes annonces.

La migration `0008_manual_listings.sql` ajoute le mode de création et le manifeste des uploads manuels. `sourceKind=url` reste le défaut des anciennes annonces ; leur contenu est conservé. La publication attend toutes les photos déclarées. [Provenance, reprise et limites manuelles](SAISIE-MANUELLE.md).

```sh
pnpm imports:cleanup
```

Cette commande opérateur agit seulement sur D1/R2 **locaux**, traite au plus 30 imports expirés, échoués ou abandonnés par passage, puis peut être relancée. Elle passe l’import en suppression, efface les clés journalisées puis les métadonnées. Une écriture tardive ne peut pas republier un import supprimé. Tout job référençant l’annonce, même terminé, protège ses fichiers ; la politique de purge des jobs viendra avec le pipeline. Aucun compteur de tentatives n’est remis à zéro. Sur Cloudflare, le même traitement est branché au cron toutes les dix minutes et à une route opérateur authentifiée ; voir la recette distante.

Les fichiers d’import ne sont pas directement acceptés comme médias de rendu : `RenderManifest` conserve son préfixe de job. Le sprint du pipeline devra copier les photos retenues vers des clés propres au job et vérifier leurs empreintes.

## API locale et Cloudflare

| Route | Résultat |
|---|---|
| `POST /api/imports` | `{url}` strict + `Idempotency-Key` ; import de l’agence connectée |
| `GET /api/imports` | Les 30 derniers imports non expirés de cette agence |
| `GET /api/imports/:id` | État et résultat privé, 404 pour une autre agence ou un import expiré |
| `GET /api/imports/:id/photos/:photoId` | JPEG privé, taille et empreinte de métadonnées contrôlées |
| `DELETE /api/imports/:id` | Purge explicite après le délai de sûreté, refus si un job le référence |

Une création attend le résultat borné : `200` avec `status=ready` ou `failed` et code d’échec persistant ; un rejeu pendant le travail renvoie `202 importing`. Les refus avant création utilisent 401, 403, 409, 422, 429 ou 503. Pas de retry automatique. `IMPORTS_UNAVAILABLE` ferme le chemin non configuré ; `IMPORT_LIMIT` signale le plafond. Les messages d’import restent français et ne contiennent pas de stack ou de secret.

## Reproduire les vérifications

```sh
pnpm check
# Avec preview au port 8787 et aucun pont sur 8791 :
pnpm probe:imports
# Inclure les routes de saisie manuelle et les uploads binaires :
pnpm probe:imports --manual
# Pour l’inspection UI, conservation temporaire des seules identités synthétiques :
pnpm probe:imports --keep
node scripts/open-local-fixture.mjs --imports
# Ouvrir l’URL localhost imprimée, une seule fois.
pnpm exec tsx scripts/serve-imports.ts --fixtures
# À la fin, arrêter le pont fixtures puis :
pnpm probe:imports --cleanup
```

La sonde démarre son pont **fixtures sans réseau extérieur**, utilise les vraies routes workerd, D1/R2 locaux et des comptes synthétiques, puis nettoie ses données (sauf avec `--keep`). Les cookies temporaires sont ignorés par Git. `pnpm dev:imports` démarre, lui, le transport HTTPS réel : ne pas confondre ces deux modes.

```sh
# Recette réelle bornée, volontaire, depuis le poste (pas dans la CI) :
pnpm exec tsx scripts/probe-import-sources.ts --real
```

Trois URL fixes, trois photos maximum par annonce, une tentative sans relance. D1/R2 locaux isolés sont relus puis détruits. Les sorties détaillées et photos restent dans `evidence/local/sprint-03/real/`, hors Git. Les fixtures versionnées ont des références, faits, contacts et médias synthétiques. [Rapport daté et matrice](preuves/sprint-03/RAPPORT.md).

`pnpm exec tsx scripts/probe-import-descriptions.ts --real` vérifie seulement l’extraction des descriptions sur ces trois pages publiques, une tentative chacune, sans télécharger de photos. Les textes complets restent hors Git dans `evidence/local/sprint-03/descriptions/`. Le rapport partageable contient les tailles, la provenance et les empreintes, pas les descriptions intégrales. Cette sonde ne vérifie ni la persistance ni Cloudflare ; la recette HTTP sur fixtures couvre séparément la sauvegarde et la relecture locales.

## Cloudflare : configuration et exploitation

Le portage utilise `apps/importer` et `apps/pipeline/wrangler.import.jsonc`, conformément à l'[ADR 0003](adr/0003-transport-import-cloudflare.md). La configuration staging ignorée cible `bienvu-import-staging`, D1/R2 existants, une instance `basic`, sommeil 30 s. `IMPORT_TOKEN` est un secret aléatoire commun au web et au service ; `PROBE_TOKEN` opérateur est distinct. Le web possède le Service Binding `IMPORT_SERVICE`, `IMPORT_MODE=cloudflare` et son origine HTTPS exacte. Le mode local reste strictement réservé au loopback.

La préparation `scripts/prepare-staging.mjs` accepte `BIENVU_STAGING_TARGET=imports` et `BIENVU_IMPORTS_ENABLED=true`, avec `BIENVU_WORKERS_PLAN=paid`. Préparer séparément le web en conservant origine, client Google, expéditeur et destinataire existants. Ne pas régénérer la configuration du renderer en pause pour déployer l'importeur. Appliquer les migrations manquantes, puis déployer le service avant le web. Utiliser `wrangler deploy --secrets-file` pour ajouter les secrets sans remplacer ceux d'authentification. Après un changement du code web, refaire `pnpm build:web`.

La migration `0009` crée le registre mensuel, fermé par défaut. La base inclut **toutes les autres dépenses et provisions du mois**, pas seulement Workers. Réservation 0,50 € par import avant ressource payante, 48 ressources/50 Mio maximum, échecs conservés. Un slot Browser Run, une seule tentative par dossier ; tous les accès autorisés passent par le transport épinglé, jamais `route.fetch()`/`continue()`. Les tests réseau injectés restent distincts des vrais refus distants.

```sh
# OAuth Wrangler existant ; aucune valeur secrète dans les arguments.
pnpm exec wrangler whoami
node scripts/import-operator.mjs state
node scripts/import-operator.mjs pause
# Après rapprochement : montants en centimes, plafond <= 2500 ; met en pause.
node scripts/import-operator.mjs budget 1650 2500
node scripts/import-operator.mjs resume
```

Ces commandes ciblent uniquement les ressources de staging connues. `pause` arrête aussi le conteneur d'import. `resume` exige un mois configuré et au moins 0,50 € disponible. Elles ne réinitialisent aucun compteur. L'état indique une alerte à 20 € de provisions ; la coupure à 25 € laisse 5 € sur l'enveloppe de 30 €. Un mois nouveau exige un nouveau rapprochement explicite. La facture fournisseur reste une vérification séparée.

Les sondes `scripts/probe-import-cloudflare.mjs` sont **réelles et payantes potentiellement**, réservées à une campagne bornée : `fixtures`, `gates`, `operator <cas>`, `import <agence|javascript>`, `manual`, `status`. Elles refusent de relancer un cas déjà enregistré. Les étapes utilisant des comptes nécessitent les seules fixtures `probe-accounts --remote --keep-fixtures`. Les cas opérateur exigent temporairement `IMPORT_PROBES_ENABLED=true` ; ce drapeau est désactivé après recette. Ne pas effacer les réservations R2/D1 pour recommencer.

La purge se vérifie via `scripts/probe-import-purge.mjs seed`, puis `verify` après un passage du cron, et `cleanup` avant suppression des comptes de recette. Le seed crée exclusivement un import antidaté et un job synthétiques, jamais un rendu ; il conserve sa tentative au registre. Les contenus source complets, captures et fichiers de recette restent dans `evidence/remote/`, hors Git.
