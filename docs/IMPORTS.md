# Imports d’annonces — sprint 03

Le parcours local transforme un lien en annonce privée et galerie persistante. Depuis la demande d’Alex du 28/09/2026, un bouton sous l’import ouvre aussi une [saisie manuelle avec photos](SAISIE-MANUELLE.md). Les deux modes utilisent la session et l’agence du sprint 02, sans job vidéo, crédit ou essai consommé. Aucun éditeur vidéo n’est ajouté.

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

Le transport Node de développement résout toutes les adresses d’un hôte et refuse une résolution vide, mixte publique/privée ou réservée. Il épingle l’adresse publique dans la connexion HTTPS en conservant le nom TLS/SNI et la vérification du certificat. Chaque redirection repasse par les contrôles ; aucune deuxième résolution implicite par `fetch`. Pas de cookie, authentification, proxy ou en-tête de l’utilisateur transmis aux agences. Pages limitées à l’hôte source ; CDN d’images autorisés explicitement par adaptateur. Pas de joker ni de nouvel hôte autorisé parce que la page le demande. Les URL de toute la galerie sont contrôlées avant son téléchargement.

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
| Tentatives d’import locales, toutes agences | 5 par jour UTC / 30 par mois UTC |
| Récupérations simultanées du pont | 2 |
| Conservation / bail / délai avant purge | 30 jours / 90 s URL, 15 min saisie / bail + 5 min |

Une récupération échouée garde toute sa réservation d’octets, car son volume reçu peut être inconnu. La dernière requête reçoit seulement le budget restant. Les limites de tentatives sont atomiques dans D1 et persistantes après purge ; un rejeu idempotent ne les consomme pas à nouveau. Ce sont des limites techniques de recette, pas les quotas des abonnements ni une garantie de facture. Les sondes HTTP synthétiques exercent ces mêmes compteurs ; leur nettoyage opérateur retire uniquement les tentatives de leurs identités synthétiques. Aucun remboursement n’existe dans la purge produit.

## Persistance et nettoyage

La migration `0006_private_imports.sql` ajoute imports, journal d’objets, compteurs et contraintes. La clé est `agencies/{agencyId}/imports/{importId}/{sha256}.jpg`. Le journal précède le `put` R2, afin de retrouver un objet même après une réponse incertaine. La publication atomique en D1 exige un import actif et au moins trois objets journalisés ; le contrat et les fichiers sont contrôlés avant publication. Les routes filtrent toujours par l’agence déduite de la session et répondent `private, no-store`.

La migration `0007_listing_description.sql` ajoute `listings.description_json` et conserve le déclencheur de publication atomique. La description est sauvegardée avec le résultat privé et dans cette colonne. Les imports antérieurs restent lisibles avec une description absente : relancer un import du lien pour la récupérer, dans les plafonds habituels. La migration ne consulte aucune source et ne modifie pas les anciennes annonces.

La migration `0008_manual_listings.sql` ajoute le mode de création et le manifeste des uploads manuels. `sourceKind=url` reste le défaut des anciennes annonces ; leur contenu est conservé. La publication attend toutes les photos déclarées. [Provenance, reprise et limites manuelles](SAISIE-MANUELLE.md).

```sh
pnpm imports:cleanup
```

Cette commande opérateur agit seulement sur D1/R2 **locaux**, traite au plus 30 imports expirés, échoués ou abandonnés par passage, puis peut être relancée. Elle passe l’import en suppression, efface les clés journalisées puis les métadonnées. Une écriture tardive ne peut pas republier un import supprimé. Tout job référençant l’annonce, même terminé, protège ses fichiers ; la politique de purge des jobs viendra avec le pipeline. Aucun compteur de tentatives n’est remis à zéro. La purge périodique hébergée reste à brancher avant exploitation ; la date affichée ne signifie pas qu’un cron distant est déjà actif.

Les fichiers d’import ne sont pas directement acceptés comme médias de rendu : `RenderManifest` conserve son préfixe de job. Le sprint du pipeline devra copier les photos retenues vers des clés propres au job et vérifier leurs empreintes.

## API locale

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

## Cloudflare : vérification restante

La vérification d’un DNS suivie d’un `fetch` par nom ne démontre pas une protection contre le DNS rebinding. Les guardrails Browser Run contrôlent des domaines ; cette documentation ne constitue pas une preuve d’épinglage des IP. `resolveOverride` a des restrictions de zone et le `fetch` Worker ne permet pas simplement de remplacer le nom par l’IP. Voir la [décision de transport](adr/0002-import-local-et-egress.md).

Le module `apps/pipeline/src/import-browser.ts` prépare un fallback avec fermeture systématique, `waitUntil` en cas de lancement tardif, blocage des service workers/WebSocket et interception des requêtes. Il exige un transport sûr injecté ; les routes ne sont jamais poursuivies par `route.continue()` ou `route.fetch()`. Il n’est **pas activé** dans l’application. Ses tests de cycle de vie utilisent un navigateur factice, pas Browser Run.

Avant activation distante : démontrer un transport compatible Cloudflare qui applique les contrôles à la connexion effective et aux redirections ; fournir un décodage raster borné dans ce runtime ; tester une page contrôlée avec DNS rebinding, IPv4/IPv6 privés, sous-requêtes, nouvelles navigations, popups et redirections d’images ; vérifier fermeture réelle Browser Run sur succès/exception/timeout et coût ; migrer le staging, brancher la purge et refaire la recette de trois annonces avec relecture R2 privée. En attendant, pages uniquement JavaScript et destinations non prouvées sont refusées. Un abonnement Workers Paid seul ne résout pas cette frontière réseau.
