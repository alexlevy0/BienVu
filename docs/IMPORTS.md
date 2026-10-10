# Imports d’annonces — sprints 03 et 04

**Maintenance du 10/10 :** estimation automatique sur la home connectée : lecture des photos, proposition de toutes les animations IA et calcul des crédits avant génération. La préparation cachée utilise les quotas habituels et est réutilisée lors de l’action explicite. L’essai anonyme reste classique. [Comportement et recette](preuves/maintenance/ESTIMATION-IMPORT-10-10.md).

Le parcours local ou Cloudflare transforme un lien en annonce privée et galerie persistante. Depuis la demande d’Alex du 28/09/2026, un bouton sous l’import ouvre aussi une [saisie manuelle avec photos](SAISIE-MANUELLE.md). Les deux modes utilisent la session et l’agence du sprint 02, sans job vidéo, crédit ou essai consommé. Aucun éditeur vidéo n’est ajouté.

**État au 28/09 :** imports URL et saisie manuelle actifs sur bienvu.online, avec Container privé à IP épinglée/Sharp, fallback Browser Run et D1/R2 existants. Trois agences réelles importées avec 12/11/7 photos ; recette séparée pour la page JavaScript et la saisie synthétiques. [Rapport Cloudflare](preuves/sprint-03/CLOUDFLARE.md).

**Maintenance du 01/10 :** les informations déjà extraites sont conservées dans un brouillon même si les photos sont refusées ou trop lentes. Un adaptateur Figaro recoupe les titres, prix, description et JSON-LD liés à la fiche. Le formulaire connecté reçoit les champs récupérés et demande les photos manquantes. Les tests de ce préremplissage utilisent une fixture reconstruite ; **le lien Figaro fourni par Alex reste refusé par le portail depuis Cloudflare**, `SOURCE_BLOCKED/access_denied`, avant toute extraction. [Recette, publication et limites](preuves/maintenance/IMPORT-PARTIEL-FIGARO-01-10.md).

**Maintenance du 02/10 — Orpi Sanary :** l’adaptateur `orpi-dom/4.2` accepte désormais un titre sans surface, en conservant celle-ci comme manquante. L’import réel Cloudflare du lien signalé récupère le prix, les 5 pièces, la description et 12 photos. Après un échec terminal, un nouvel essai explicite crée une nouvelle requête ; une réponse réseau incertaine conserve sa clé pour éviter un doublon. [Diagnostic et recette](preuves/maintenance/ORPI-SANARY-02-10.md).

**Maintenance du 09/10 — Orpi La Baule :** le lien signalé est lisible par l’adaptateur existant. Le refus intervenait avant toute requête Orpi, faute de marge pour réserver les 0,50 € de l’import : 89,55 € engagés, coupure à 90 €. L’autorisation d’Alex double l’enveloppe à 200 € et la coupure à 180 €, avec historique conservé et action auditée. Les refus de budget portent désormais `IMPORT_BUDGET_LIMIT` au lieu d’accuser la source avec `SOURCE_UNAVAILABLE`, et un nouvel essai explicite après ce refus utilise une nouvelle clé. L’import réel Cloudflare est **`ready`, 5 photos, 6 pièces, 232,9 m², 1 383 200 €**, avec relecture privée et empreintes des cinq JPEG contrôlées, sans génération vidéo ni IA. Migration additive `0059`, aucune modification de l’extracteur ni des règles de sécurité réseau.

**Maintenance du 08/10 — Espaces Atypiques, locations :** le registre accepte aussi `/locations/`, et l’adaptateur `espaces-atypiques/3.4` recoupe la route, l’article et le statut de location. Les champs `Loyer CC`/`HC` de la fiche distinguent le loyer mensuel et les charges ; dépôt, stationnement et forfaits facultatifs restent séparés. Le lien lyonnais fourni par Alex produit un import réel `ready` avec **1 900 €/mois charges comprises, 3 pièces et 11 photos**, sans navigateur ni appel IA. Surface toujours à confirmer manuellement selon la politique existante. [Vérifications et limites](preuves/maintenance/ESPACES-LOCATION-08-10.md).

**Maintenance du 08/10 — Nestenn :** le portail et le canonique observé de l’agence Lyon 8 sont liés par une liste d’hôtes explicite. L’adaptateur `nestenn-dom/1.0` lit les objets JSON-LD séparés par une virgule, puis recoupe le bien unique avec sa fiche et sa galerie. Le lien fourni par Alex donne un import réel `ready` avec **199 000 €, 65 m², 3 pièces, description et 7 photos**, sans navigateur ni IA. Le domaine `media-nestenn.immo-facile.com` est autorisé pour les images de cette même référence ; aucun joker d’agence ou de CDN. [Résultat, protections et limites](preuves/maintenance/NESTENN-08-10.md).

**Maintenance du 08/10 — Personnaliser :** la galerie utilise des aperçus WebP privés de 640 pixels maximum, validés par session, agence et empreinte R2 avant chaque réponse ou réutilisation ETag. Les huit JPEG iad fournis passent de **2 013 150 à 147 768 octets** pour l’affichage, **93 % de données en moins**. Les originaux restent ceux du rendu ; les cadres sont stables, les premières images prioritaires et celles du formulaire masqué différées. La conversion bornée utilise le conteneur existant, sans objet R2 supplémentaire, nouveau scraping ou nouvel import réservé. [Diagnostic, recette et limites](preuves/maintenance/PHOTOS-PERSONNALISER-08-10.md).

## Lancer et utiliser

La tranche locale du **sprint 04** ajoute le [registre et la couverture datée](preuves/sprint-04/RAPPORT.md), visibles sur `/sources` et sous le champ d’URL. Les trois agences ci-dessus disposent d’une preuve Cloudflare du sprint 03. Aucun des quatre portails n’a encore produit un import automatique complet validé ; la nouvelle tranche n’est pas encore déployée.

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

`packages/importers` contient le parseur HTML parse5 8.0.0, les extracteurs TypeScript et l’orchestration, séparés du réseau. Aucun `eval`, appel IA ou exécution de texte extrait. Le chemin statique lit JSON-LD (y compris les références `@graph`), microdata, puis les adaptateurs Espaces Atypiques, Orpi, Century 21 et Figaro. Chaque fait garde `sourcePath`, une preuve bornée et une version d’adaptateur. Identité, vente/location et localisation sont obligatoires pour lancer une génération ; le parcours connecté peut conserver une annonce partielle identifiable et demander les compléments. Un prix ou une surface absent reste absent, une contradiction vérifiable bloque l’import. Un loyer n’est retenu qu’avec EUR, période mensuelle et traitement explicite des charges.

Les adaptateurs 3.2 extraient aussi la description liée au bien. Le HTML est converti en texte brut, entités décodées, paragraphes et sauts de ligne conservés, éléments actifs et blocs de navigation ignorés. La provenance est enregistrée dans `description.sourcePath`. Aucun résumé ni reformulation automatique : la description conserve le texte de la source et reste séparée des faits vérifiés. Le champ vaut `null` si le bloc manque ou si plusieurs blocs candidats ont des textes différents. L’interface affiche cette absence ; aucun éditeur n’est ajouté.

Pour un **texte saisi dans l'accueil**, l'extraction structurée accepte aussi les prix abrégés : `200k€`, `200 K euros` et `200K` dans un contexte de prix deviennent **200 000 €** (20 000 000 centimes côté serveur). Les millions avec une devise euro et les décimales sont pris en charge. Une abréviation de vente unique et explicite peut être récupérée localement si le modèle a omis le prix ; les devises étrangères, montants négatifs, autres unités, transactions manquantes et montants contradictoires ne sont pas complétés arbitrairement. Un montant ambigu proposé conserve sa demande de confirmation.

Les demandes usuelles « Je voudrais/veux/souhaite vendre ou louer un appartement/une maison » sont reformulées localement en présentation, sans nouvel appel IA : par exemple « Découvrez cet appartement à vendre à Lyon, au prix de 200 000 €. » Le reste du texte, notamment les équipements indiqués, est conservé ; aucune qualité, surface ou pièce n'est inventée. Le texte initial reste dans `originalText` et dans la bulle de demande ; le champ de description est modifiable. Une description déjà rédigée et les descriptions importées par URL restent conservées. Ces règles concernent les **nouvelles extractions**, sans réécriture des brouillons existants ni des modifications manuelles. [Recette prix et description du 30/09](preuves/maintenance/PRIX-DESCRIPTION-30-09.md).

Le même transport Node en local et dans le Container Cloudflare résout toutes les adresses d’un hôte et refuse une résolution vide, mixte publique/privée ou réservée. Il épingle l’adresse publique dans la connexion HTTPS en conservant le nom TLS/SNI et la vérification du certificat. Chaque redirection repasse par les contrôles ; aucune deuxième résolution implicite par `fetch`. Pas de cookie, authentification, proxy ou en-tête de l’utilisateur transmis aux agences. Pages limitées à l’hôte source ; CDN d’images autorisés explicitement par adaptateur. Pas de joker ni de nouvel hôte autorisé parce que la page le demande. Les URL de toute la galerie sont contrôlées avant son téléchargement.

Les galeries sont délimitées par la structure de l’annonce et, lorsque disponible, sa référence. Lazy loading et `srcset` sont résolus à partir des URL présentes. Logos, avatars, plans identifiés et recommandations hors galerie sont écartés ; aucun classifieur visuel ne garantit l’exclusion d’un visuel mal étiqueté par la source. Sharp décode réellement JPEG/PNG/WebP, vérifie les dimensions et réencode en JPEG orienté sans métadonnées. Les empreintes du contenu normalisé dédupliquent les photos ; l’ordre de la galerie est conservé. Les filigranes présents sur les photos des agences restent présents.

L'adaptateur **Figaro 4.1** lit un titre `Vente/Location … à …`, une référence canonique et un prix lié à ce même titre ou à son produit JSON-LD. Il refuse les contradictions de transaction, type, ville, département, surface, pièces, prix ou référence. Taxes, simulations de crédit et recommandations ne servent pas à remplir le prix. La description garde ses paragraphes ; un texte abrégé est signalé, ou remplacé par la version complète du même JSON-LD lorsque son début correspond. Les images sont liées au produit exact ou aux métadonnées `og:url` de cette fiche ; aucune URL de galerie n'est devinée. Les CDN `cdn.immobilier.lefigaro.fr` et `lh3.googleusercontent.com` sont autorisés explicitement pour ce portail, avec les mêmes contrôles réseau et décodage.

Avec `allowPartial`, une photo refusée, invalide ou expirée n'efface pas les faits lus. Un CDN public hors liste est ignoré **sans requête**, avec diagnostic et avertissement. Une URL privée/malformée, une résolution privée, une redirection interdite, une panne de stockage, l'annulation de l'appelant ou l'expiration globale restent fatales. Le téléchargement photo est borné à **50 s**, et au temps restant de l'import moins **2 s** pour la persistance ; les plafonds d'octets et de requêtes restent applicables. Moins de trois photos ouvre un brouillon à compléter, jamais une génération incomplète. Le chemin strict utilisé par la génération anonyme exige toujours une annonce complète : cette maintenance ne lui ajoute pas de conversion automatique en formulaire partiel.

## Limites effectives

Depuis le 10/10/2026, les plafonds partagés des imports par lien sont **40 tentatives/jour UTC et 300/mois UTC** (migration quotidienne `0065`, après `0053` pour le mois, compteurs conservés). `URL_IMPORT_QUOTAS` synchronise les droits affichés, l’admission de génération et le compteur superadmin avec les seuils du trigger D1. Les uploads personnels restent hors de ce compteur depuis `0028`. La capacité de stockage et les réservations financières continuent à s’appliquer ; cette hausse ne relève pas le budget mensuel.

### Registre et portails

`packages/contracts/src/import-sources.ts` centralise les hôtes exacts, leurs alias, routes d’annonces, CDN explicites et résultats datés. Le registre dans `packages/importers/src/registry.ts` refuse une recherche sur un portail connu avant le réseau et vérifie qu’une redirection conserve la même référence. Un domaine inconnu reste sur l’import générique protégé ; aucun CDN ne lui est accordé par ressemblance de nom. Un canonique peut utiliser un alias enregistré, sans changer de chemin ; pour une fiche Orpi reconnue, seul le slash final est aussi optionnel. Les fragments de suivi SeLoger observés (`#ln=…`) sont retirés par `ImportUrl` avant la validation ; les autres fragments restent refusés.

`portals/bienici.ts` est un adaptateur du **DOM après JavaScript**, recoupant titre/adresse/prix avec `Accommodation` et `Product`, ainsi que la référence de chaque image. Il ne devine ni API ni URL haute résolution. Le DOM de vente capturé manuellement fournit 17 candidats, dont 16 URL limitées à 600 px ; la location observée présente un écart de prix et est refusée. Cela ne prouve pas un import automatique : acquisition avec le navigateur produit, dimensions réellement décodées et persistance hébergée restent à vérifier. Le Browser Run actuel limite aussi scripts/XHR aux hôtes de pages enregistrés ; le CDN JavaScript observé `res.bienici.com` n’est pas autorisé silencieusement.

Les HTTP 401/403/429 produisent `SOURCE_BLOCKED` avec un motif privé `login_required`/`access_denied`/`rate_limited`. Les challenges HTML reconnus arrêtent aussi l’essai ; HTTP 404/410 et pages retirées donnent `SOURCE_UNAVAILABLE`/`not_found`. Une redirection vers d’autres résultats porte `listing_redirect`. Ces motifs sont transportés par un en-tête privé sur liste fermée puis enregistrés dans les diagnostics ; ils ne contiennent ni corps fournisseur ni jeton. Les codes publics restent stables. Aucun retry automatique ; le fallback navigateur unique est réservé à une page sans données exploitables, pas à un refus explicite ou une liste de résultats.

L’adaptateur **HUMAN `human-dom/1.0`** reconnaît les fiches de vente maison/appartement à référence `AGENCE-MANDAT` sur les deux hôtes exacts HUMAN, et le bucket photo `humanimmobilier-images.s3.fr-par.scw.cloud`. Il recoupe la route, le canonique, le `RealEstateListing`, l’offre et la référence visible. Le prix honoraires inclus est séparé du prix hors honoraires, des frais, des simulations et des revenus du secteur. La surface habitable précise du JSON-LD est comparée à la précision de l’affichage arrondi, uniquement pour cette source ; la surface du séjour et les chambres ne remplacent pas la surface habitable et les pièces. Galerie DOM et images structurées doivent appartenir à la référence exacte. **L’import réel du 08/10 à 16:39 UTC est `ready` : 72 345 €, 56,63 m², 3 pièces, description et 6 photos privées.** Pour HUMAN, la récupération initiale utilise désormais un Chromium standard dans le conteneur Node : DNS public épinglé, TLS vérifié, redirections de même fiche uniquement et flux HTML borné intercepté avant affichage. Aucun script de l’annonce n’est exécuté. Les photos gardent le transport HTTPS Node existant. Le navigateur est réservé par le verrou global et utilisé une seule fois ; 401/403/429 ou challenge arrêtent toujours l’import, sans retry. Les échecs précédents restent dans le catalogue. [Recette, protections et limites](preuves/maintenance/HUMAN-08-10.md).

**Contre-vérification du 08/10 :** les onze réseaux sans import complet confirmé sont retestés dans le produit hébergé. **Citya fonctionne désormais sur l’appartement testé à Toulouse : 240 000 €, 45 m², 2 pièces, description et 11 photos privées.** `citya-dom/1.0` reconnaît l’offre imbriquée `RealEstateListing.mainEntity.itemOffered`, recoupe les informations de l’en-tête et le prix de vente, puis sélectionne la seule galerie contenant la couverture déclarée. Les URL lazy sont lues dans le HTML ; les mensualités de crédit, charges, taxes et biens voisins restent exclus. Le périmètre enregistré se limite aux routes de vente d’appartements à référence `TAPP…` et aux deux hôtes exacts Citya, sans nouveau CDN.

Le diagnostic navigateur et l’import complet restent distincts : Le Figaro fournit un document dans le diagnostic Browser Run, mais refuse encore le vrai import natif depuis le conteneur. Son activation initiale expérimentale est donc retirée. `documentTransport: 'browser'` n’est activé que pour HUMAN, dont la recette hébergée est positive. Les dix autres sources restent en échec, avec de nouveaux résultats datés et les anciens essais conservés sur `/sources`. Aucun accès refusé n’est contourné, aucun média voisin ou URL inventée n’est ajouté. [Méthode et résultats](preuves/maintenance/SOURCES-NAVIGATEUR-08-10.md).

### Plafonds conservés

| Limite | Valeur |
|---|---|
| Durée d’un import / d’une ressource | 60 s / 12 s |
| Fenêtre photo après extraction | 50 s maximum, limitée au temps global restant moins 2 s |
| HTML / image source / total de corps source | 2 Mio / 10 Mio / 50 Mio |
| Description normalisée | 20 000 caractères ; troncature indiquée dans le résultat et l’interface |
| Redirections par ressource | 3, contrôlées à chaque étape |
| Ressources / candidats / photos conservées | 20 / 24 / 12 ; minimum 3 distinctes |
| Image décodée | 16 millions de pixels maximum ; minimum 640×360 |
| JPEG stocké | 2 048×2 048 maximum, ratio préservé |
| Imports URL actifs / dossiers stockés par agence | 1 / 30, tous modes pour le stockage |
| Tentatives d’import, toutes agences | 40 par jour UTC / 300 par mois UTC |
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

Dans « Récentes », le menu `… → Supprimer` retire un brouillon de l'agence connectée. `DELETE /api/imports/:id/draft` contrôle le propriétaire et l'origine, puis marque uniquement un brouillon inachevé sans job comme `deleting`. Il disparaît immédiatement des listes ; sa lecture, sa modification et ses photos privées deviennent inaccessibles. Les objets R2 connus sont effacés avant la réponse, puis le journal reste disponible au moins cinq minutes pour réconcilier un upload interrompu. Le cron existant reprend le nettoyage, y compris après une indisponibilité R2. Une vidéo déjà créée ou un import finalisé ne peut pas être supprimé par cette route.

La migration `0022_draft_extraction_usage.sql` conserve les compteurs d'analyse par agence/jour indépendamment du brouillon. Elle reprend les appels existants sans provision supplémentaire : supprimer un brouillon ne remet à zéro ni les limites (5 analyses/agence/jour, 100/mois globalement), ni le budget déjà réservé. L'interface ferme la saisie si le brouillon supprimé est ouvert et retire sa copie locale ; un autre brouillon ouvert reste conservé. [Recette de suppression et animation](preuves/maintenance/BROUILLONS-ANIMATION-30-09.md).

Les fichiers d’import ne sont pas directement acceptés comme médias de rendu : `RenderManifest` conserve son préfixe de job. Le sprint du pipeline devra copier les photos retenues vers des clés propres au job et vérifier leurs empreintes.

## API locale et Cloudflare

| Route | Résultat |
|---|---|
| `POST /api/imports` | `{url}` strict + `Idempotency-Key` ; import de l’agence connectée |
| `GET /api/imports` | Imports non expirés de cette agence, pages de 30 : `{imports,nextCursor}`. `?cursor=…` poursuit la lecture ; `?drafts=1` sélectionne les brouillons avant pagination |
| `GET /api/imports/:id` | État et résultat privé, 404 pour une autre agence ou un import expiré |
| `GET /api/imports/:id/photos/:photoId` | JPEG privé, taille et empreinte de métadonnées contrôlées |
| `DELETE /api/imports/:id` | Purge explicite après le délai de sûreté, refus si un job le référence |
| `DELETE /api/imports/:id/draft` | Suppression logique immédiate du brouillon de l'agence, nettoyage R2 puis réconciliation différée ; 401 sans session, 404 hors agence, 409 si déjà finalisé |

Une création attend le résultat borné : `200` avec `status=ready` ou `failed` et code d’échec persistant ; un rejeu pendant le travail renvoie `202 importing`. Les refus avant création utilisent 401, 403, 409, 422, 429 ou 503. Pas de retry automatique. `IMPORTS_UNAVAILABLE` ferme le chemin non configuré ; `IMPORT_LIMIT` signale le plafond. Les messages d’import restent français et ne contiennent pas de stack ou de secret.

## Reproduire les vérifications

```sh
pnpm check
# Avec preview au port 8787 et aucun pont sur 8791 :
pnpm probe:imports
# Inclure les routes de saisie manuelle et les uploads binaires :
pnpm probe:imports --manual
# Recette distincte après nettoyage : refus/recherche/retrait simulés, zéro réseau externe :
pnpm probe:imports --portals
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

Le 28/09/2026, Alex autorise **10 imports par jour UTC**, au lieu de 5. La migration `0010_imports_daily_limit.sql` remplace le trigger : compteurs conservés, 30 imports/mois inchangés, idempotence et réservations financières conservées. Migration appliquée en local et sur D1 Cloudflare ; les cinq tentatives du jour sont restées à cinq lors du contrôle après migration. Il s’agit d’une limite de test BienVu partagée entre agences (URL et saisie manuelle), pas d’un plafond imposé par Cloudflare ni du quota vidéo d’un abonnement.

### Reprendre une recette de portail

```sh
# Afficher les sept liens datés, sans réseau :
pnpm probe:portals --list
# Uniquement lors d’une nouvelle campagne volontaire, un cas à la fois :
pnpm probe:portals --real seloger-sale
```

La seconde commande utilise le transport HTTPS Node réel, sans navigateur, proxy, cookie ou API payante. Une seule annonce et trois photos maximum ; une seconde tentative du même cas le même jour UTC est refusée par le dossier de preuve. Le succès local exige les contrats, un stockage D1/R2 Miniflare isolé et une relecture des fichiers avec SHA-256 ; il exige encore une inspection visuelle et ne démontre pas Cloudflare. Un refus rend le code de sortie 2. Les données/galeries brutes restent dans `evidence/local/sprint-04/probes/` ignoré. Ne pas lancer ces URL de fixtures sur Internet ; cette commande utilise uniquement les liens réels explicitement listés.

Pour la recette **hébergée** du sprint 04, `node scripts/probe-portals-cloudflare.mjs init` prépare deux identités synthétiques. `import figaro|seloger|leboncoin|bienici` tente une seule annonce publique, via l’API authentifiée et les vrais services. Chaque cas est journalisé avant son exécution et refuse une seconde invocation ; les échecs restent comptés. Vérifier le résultat avant de lancer le cas suivant. `cleanup` retire uniquement ces identités et leurs données, en vérifiant que compteurs et réservations restent intacts. Aucune capture de portail ni session secrète n’est versionnée.

La migration `0010` permet cette recette dès le 28/09 sans réinitialiser le compteur. Les quatre essais réservent au plus 2 € supplémentaires (0,50 € par tentative, **provision et non prix fournisseur**), sous le plafond financier existant. Le renderer reste en pause. [Résultats distants et limites](preuves/sprint-04/RAPPORT.md#recette-cloudflare).

### Configuration existante

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

Ces commandes ciblent uniquement les ressources de staging connues. `pause` arrête aussi le conteneur d'import. `resume` exige un mois configuré et au moins 0,50 € disponible. Elles ne réinitialisent aucun compteur. L'état indique une alerte à 20 € de provisions ; la coupure à 35 € laisse 5 € sur l’enveloppe de 40 €, après la hausse explicite d’Alex du 28/09 (migration 0013 et mise à jour opérateur du mois ; les anciens journaux gardent leur plafond). Un mois nouveau exige un nouveau rapprochement explicite. La facture fournisseur reste une vérification séparée.

Les sondes `scripts/probe-import-cloudflare.mjs` sont **réelles et payantes potentiellement**, réservées à une campagne bornée : `fixtures`, `gates`, `operator <cas>`, `import <agence|javascript>`, `manual`, `status`. Elles refusent de relancer un cas déjà enregistré. Les étapes utilisant des comptes nécessitent les seules fixtures `probe-accounts --remote --keep-fixtures`. Les cas opérateur exigent temporairement `IMPORT_PROBES_ENABLED=true` ; ce drapeau est désactivé après recette. Ne pas effacer les réservations R2/D1 pour recommencer.

La purge se vérifie via `scripts/probe-import-purge.mjs seed`, puis `verify` après un passage du cron, et `cleanup` avant suppression des comptes de recette. Le seed crée exclusivement un import antidaté et un job synthétiques, jamais un rendu ; il conserve sa tentative au registre. Les contenus source complets, captures et fichiers de recette restent dans `evidence/remote/`, hors Git.


## Orpi location — correction du 30 septembre 2026

Le registre accepte désormais les fiches `/annonce-location-…-UUID/` en plus des ventes, avec ou sans slash final. Le DOM `orpi-dom/4.1` recoupe la transaction du chemin avec « à louer »/« à vendre » du titre et la référence de la galerie. Une redirection entre vente et location est refusée même si l'UUID est identique. Le loyer provient du montant principal de l'en-tête, uniquement avec la période « par mois » et les charges explicitement comprises ou exclues. Dépôt de garantie, honoraires, loyer de base et annonces voisines ne remplacent pas ce montant. Période ou charges manquantes : prix omis ; charges contradictoires : échec.

L'essai anonyme autorise ces locations Orpi. Une page de recherche d'une source autorisée donne `NOT_A_LISTING` ; un portail extérieur au pilote donne `TRIAL_SOURCE_UNSUPPORTED`. Aucun contrôle HTTPS, hôte, UUID, redirection, photo ou budget n'est supprimé.

Les deux pages fournies par Alex le 30/09 ont été téléchargées par le transport HTTPS natif borné et extraites localement : Chevilly-Larue (833 €/mois charges comprises, 22,41 m², une pièce, cinq candidats photo) et Issy-les-Moulineaux (1 178 €/mois charges comprises, 37,23 m², deux pièces, sept candidats). Cela valide leurs HTML réels, pas à lui seul les photos décodées, la persistance Cloudflare ou une nouvelle vidéo. La fixture `orpi-rent.html` contient des données de recette synthétiques et ne constitue pas une troisième annonce réelle.

## Projets de l’Éditeur — correction du 6 octobre 2026

Le nombre total de lignes `listing_imports` n’est plus un quota : l’ancien plafond de 30 lignes par agence bloquait aussi « Nouveau projet » et « Utiliser la démo ». Les projets et imports existants restent conservés. La création `/api/imports/draft` ne sollicite plus le transport d’import et ne réserve plus 0,50 € simplement pour ouvrir un éditeur vide ou copier les médias déjà publiés de la démo. L’envoi de photos personnelles conserve sa réservation avant normalisation dans la route d’upload.

Les imports par lien gardent leur compteur partagé de 40 par jour UTC et 300 par mois depuis `0065`, leur réservation financière, les bornes réseau et la purge existantes. Les photos restent limitées à 12 et 50 Mio par brouillon. Aucun compteur, crédit consommé ou coût déjà provisionné n’est remboursé par ce changement.

La migration `0047_project_creation_rate.sql` ajoute une protection indépendante : 60 nouvelles créations manuelles par agence et par heure UTC. Elle reprend l’historique des projets existants. Un rejeu idempotent ne compte pas deux fois, la suppression d’un projet ne réinitialise pas le registre et une autre agence dispose de son propre compteur.

Les erreurs publiques distinguent désormais `IMPORT_LIMIT` (quota de liens), `IMPORT_BUDGET_LIMIT` (budget de traitement), `IMPORT_RESOURCE_LIMIT` (bornes du transfert) et `PROJECT_RATE_LIMIT` (créations trop rapprochées). Les messages de l’Éditeur et des uploads utilisent ce contrat au lieu d’annoncer une limite générique « d’imports de test ».

Régression : `tests/editor-projects.test.ts` vérifie la migration, l’ouverture après 30 projets, l’indépendance des quotas/budgets, la concurrence, le rejeu, la suppression et le renouvellement horaire. `tests/editor-demo.test.ts` vérifie en plus la copie complète avec voix, musique et animations après 30 projets et avec les imports par lien et leur budget indisponibles.
