# Sprint 04 — portails et couverture mesurée

Recette du **28 septembre 2026**. Registre, diagnostics, adaptateur de DOM Bien’ici et information de couverture déployés sur Cloudflare. **Sprint non clôturé : aucun import complet des quatre portails validé ; le chemin automatique Bien’ici reste expérimental (04.3).** Les acquisitions publiques et les quatre essais hébergés sont réels. Les tests synthétiques et la lecture de DOM capturés ne sont pas comptés comme des imports automatiques réussis.

## Échantillon réel

Sept URL distinctes d’annonces, une navigation HTTPS depuis Node local par URL, sans relance. Transport produit à IP épinglée, vérification TLS, redirections et corps bornés. Les liens SeLoger/Leboncoin viennent d’Alex ; les paramètres de suivi SeLoger sont supprimés pour ce diagnostic. Aucun cookie ou compte de portail, proxy, solveur de CAPTCHA ou appel IA. Deux consultations de pages de recherche pour trouver les liens sont comptées séparément.

| Portail | Annonces tentées | Imports complets | Résultat constaté | Date / environnement |
|---|---:|---:|---|---|
| Le Figaro Immobilier | 3 | 0 | Deux accès refusés ; un ancien lien redirige vers une page de recherche | 28/09, HTTPS Node local |
| SeLoger | 1 | 0 | Accès refusé sur le lien fourni par Alex | 28/09, HTTPS Node local |
| Leboncoin | 1 | 0 | Accès refusé sur le lien fourni par Alex | 28/09, HTTPS Node local |
| Bien’ici | 2 | 0 | HTML initial sans faits/galerie exploitables, JavaScript requis ; acquisition automatique non démontrée | 28/09, HTTPS Node local |

| Cas / URL publique | Heure UTC | Durée | Observation |
|---|---|---:|---|
| [Figaro vente 108944355](https://immobilier.lefigaro.fr/annonces/annonce-108944355.html) | 15:40:54 | 387 ms | `SOURCE_BLOCKED` |
| [Figaro ancien lien location 107461633](https://immobilier.lefigaro.fr/annonces/annonce-107461633.html) | 15:40:54 | 1 003 ms | Redirection vers `immobilier-vente-appartement-paris+9eme+75009.html`, 1 767 369 octets ; résultat de recherche, pas une annonce |
| [Figaro location 109267703](https://immobilier.lefigaro.fr/annonces/annonce-109267703.html) | 15:42:26 | 204 ms | `SOURCE_BLOCKED` |
| [SeLoger vente Lyon 26M7SYHC5MVH](https://www.seloger.com/annonce/achat/auvergne-rhone-alpes/rhone-69/lyon-69000/26M7SYHC5MVH) | 15:44:06 | 199 ms | `SOURCE_BLOCKED` |
| [Leboncoin vente 3222183771](https://www.leboncoin.fr/ad/ventes_immobilieres/3222183771) | 15:44:06 | 235 ms | `SOURCE_BLOCKED` |
| [Bien’ici vente Nice apimo-86775374](https://www.bienici.com/annonce/vente/nice/appartement/2pieces/apimo-86775374) | 15:40:55 | 176 ms | HTML d’amorçage, 15 063 octets |
| [Bien’ici location Clamart mgc-ancien-602_0602_009784](https://www.bienici.com/annonce/location/clamart/appartement/2pieces/mgc-ancien-602_0602_009784) | 15:40:55 | 85 ms | HTML d’amorçage, 15 063 octets |

La collecte initiale conservait le code stable `SOURCE_BLOCKED`, sans distinguer HTTP 401/403/429. **Ne pas en déduire un CAPTCHA ou un code HTTP précis.** Le corps des refus n’a pas été conservé. Les nouveaux motifs privés sont vérifiés séparément avec ports injectés et fixture de transport.

Deux requêtes de découverte supplémentaires : recherche SeLoger Lyon (267 ms) et catégorie ventes immobilières Leboncoin (96 ms), toutes deux refusées. Elles ne gonflent pas le nombre d’annonces. Neuf navigations HTTPS Node au total, plus les éventuels sauts de redirection bornés. Aucune annonce de location SeLoger/Leboncoin n’a été essayée ; cet échantillon limité ne mesure pas leur couverture nationale. Le lien Figaro redirigé **n’est pas classé comme retrait confirmé**.

## Bien’ici : DOM public et import automatique distincts

Les deux pages Bien’ici ont aussi été ouvertes dans un navigateur ordinaire, sans connexion et après refus des cookies facultatifs. Leur DOM public est capturé localement, puis relu hors ligne par l’adaptateur. Ce navigateur n’est pas le Browser Run du produit ; sa consultation ne valide ni les restrictions réseau du pipeline ni un stockage de photos.

- Vente : extraction du DOM réel réussie, appartement à Nice, 57 m², deux pièces, 498 000 €, description de 755 caractères et 17 candidats de galerie. Seul le premier original est fourni dans le JSON-LD ; les 16 autres URL observées demandent une largeur de 600 px. Aucun paramètre n’est retiré pour deviner un original. **Aucune photo téléchargée/décodée ni persistance D1/R2 de ce bien dans cette campagne.**
- Location : DOM réel refusé `CONFLICTING_FACTS`, prix affiché 1 164 € contre 1 164,01 € dans `Product.offers.priceSpecification`. L’écart n’est ni arrondi silencieusement ni attribué aux charges par supposition.
- HTML initial des deux pages : `NOT_A_LISTING`, motif `structure_changed`, qui signifie ici « structure non exploitable sans JavaScript », pas une preuve que le portail vient de changer.
- Réseau du navigateur produit : scripts/XHR limités aux hôtes des pages. Le CDN JavaScript observé `res.bienici.com` n’y est pas autorisé ; ses autres dépendances n’ont pas été validées. Aucune extension arbitraire de cette liste. Le chemin automatique Bien’ici reste expérimental.

La réextraction des captures ne déclenche aucun réseau. Le rapport `offline-extraction.json` précise zéro import automatique validé ; les tests Bien’ici avec trois images synthétiques ne changent pas ce résultat.

## Changements livrés

- Catalogue partagé des sept sources : hôtes exacts/alias, routes et CDN explicitement listés. Registre rejetant recherche et redirection vers un autre bien. Domaine inconnu conservé en générique protégé ; faux suffixes de domaine sans privilège.
- Adaptateur `bienici-dom/4.0` isolé : titre/adresse/surface/pièces/prix recoupés, référence de chaque image contrôlée, galerie et description délimitées. Vignettes et images étrangères restent refusées selon les règles du sprint 03.
- Motifs privés sur liste fermée pour accès refusé, connexion, limitation, challenge, annonce absente, redirection et page non exploitable. Conservation entre pont/Container/service/web et dans D1 ; pas de corps fournisseur ni motif interne renvoyé à l’utilisateur.
- Aucun retry sur blocage explicite, recherche ou retrait. Un seul fallback navigateur possible pour le HTML sans données ; les plafonds existants et la fermeture de session restent en place.
- Nettoyage du seul fragment SeLoger observé `#ln=…` avant validation, dans l’accueil, le formulaire et `POST /api/imports`. HTTPS, hôte public, absence de credentials/port personnalisé toujours exigés.
- Page `/sources`, lien depuis la FAQ et information sous le champ d’URL : « testé sur un échantillon », « import générique à essayer », « momentanément indisponible », date, nombre et environnement. Les succès d’agences sont ceux du [sprint 03](../sprint-03/CLOUDFLARE.md), pas de nouveaux essais.
- Fixtures minimales synthétiques et commande `pnpm probe:portals` volontaire, un cas par lancement et par jour UTC, sans navigateur/API payante. Sorties brutes ignorées par Git. Aucune dépendance ni secret ajouté. Migration `0010_imports_daily_limit.sql` : dix imports quotidiens à la demande d’Alex, sans effacement des compteurs ni modification du plafond mensuel ou financier.

## Validation locale

- `pnpm check` final réussi : **117 tests, aucun échec**, TypeScript des neuf applications/packages et des tests, frontières sur 82 fichiers (`check-final-3.log`, 40,079 s pour les tests). Les treize groupes portails repassent après mise à jour de la couverture réelle ; la migration 0010 et les quotas concurrents sont couverts.
- Migration testée depuis l’ancien plafond : cinq tentatives restent cinq ; imports 6 à 10 acceptés ; 11e quotidien et 31e mensuel refusés ; rejeu sans incrément et purge sans restitution. `pnpm db:migrate` applique aussi 0009/0010 à l’état local habituel, sans réinitialisation.
- `pnpm probe:imports --portals --keep` sur **fixtures uniquement**, D1/R2 workerd isolés : description, galerie, isolation, échecs privés, une ressource sans retry pour refus/recherche/retrait, aucun job ou crédit consommé. Comptes et objets locaux supprimés ensuite par `--cleanup`.
- `pnpm probe:foundations` : neuf pages, en-têtes, API privées et générations désactivées vérifiés. Build OpenNext final, types et dry-runs réussis. Le warning de bundling `fast-png` sur `??` est préexistant.
- Navigateur local : sources en 1280 px et 390 px, sans débordement ; formulaire connecté avec identité synthétique, messages SeLoger/générique/recherche, alternative manuelle dépliée et lien vers `/sources`. Aucun import externe lancé depuis cette recette UI. Les captures pleine page ont un défaut d’assemblage du navigateur ; la capture `sources-mobile-viewport.png` est la preuve visuelle mobile retenue. Vue publiée inspectée après déploiement.
- Image `bienvu-importer:sprint-04` construite en Linux amd64 et testée par `node scripts/probe-import-container.mjs --portals` : authentification, Sharp natif PNG→JPEG, suppression des métadonnées, refus SVG/25 mégapixels et IP privées/DNS loopback. Le conteneur Docker créé pour cette recette est supprimé.

Défauts de vérification résolus : copie d’une liste readonly pour le SDK navigateur ; assertion nullable dans un test ; contrôles TypeScript à lancer après la génération des types Next. Un test de code de sortie Node a dépassé 3 s sous charge : son délai de démarrage est porté à 10 s, le test de timeout effectif à 400 ms reste inchangé. Une exécution simultanée à la construction Docker a subi un `ECONNRESET` Miniflare dans la déconnexion ; la suite entière, relancée sans cette charge ni preview, passe. Aucun résultat de cet essai interrompu n’est présenté comme réussi.

## Recette Cloudflare

Alex autorise dix imports par jour le 28/09. Migration `0010` appliquée à `bienvu-s00-staging`, puis relecture du trigger et des compteurs : **5 → 5**, plafond journalier 10 et mensuel 30. Une première lecture opérateur a été refusée 403 sur OAuth expiré ; Wrangler l’a rafraîchi puis la vérification a réussi. Aucun compteur n’a été effacé.

Image déployée : `sha256:b58fd9b8dc719fc958c84b364674312ad29a748800db586ca2dcc6c4c9e85ff8` (ancien digest `a8c9c2dfd3aabada9eab58c722bcfdef33a938e62f1ba000cd6f1e1108d4b658`). Service d’import **`f2cdd5a4-b8f1-4c1a-bad4-3fbb87448e3b`**, web de recette `a3b3861c-157d-48a1-915b-cf4a4b458639`, puis web final **`8b9a3494-2212-4337-b8ca-9cc7650517b7`** avec couverture actualisée. Bindings, domaine, secrets et pause du renderer conservés. Les versions précédentes restent disponibles pour retour arrière ; ne pas réinitialiser la migration ni les compteurs pour revenir au code précédent.

`node scripts/probe-portals-cloudflare.mjs init`, puis un lancement `import <portail>` par ligne, via l’API authentifiée sur `https://bienvu.online`. Les deux comptes sont synthétiques, les quatre annonces sont publiques et réelles ; aucun e-mail envoyé. Les URL réutilisent les cas locaux ci-dessus : Figaro location actuelle, SeLoger et Leboncoin fournis par Alex, Bien’ici vente. **0/4 imports complets.**

| Portail | Début UTC le 28/09 | Durée HTTP totale | Résultat privé | Browser Run |
|---|---|---:|---|---|
| figaro | 16:38:08.407 | 5097 ms | `SOURCE_BLOCKED` / access_denied | Non |
| seloger | 16:38:54.878 | 7385 ms | `SOURCE_BLOCKED` / access_denied | Non |
| leboncoin | 16:39:06.234 | 2491 ms | `SOURCE_BLOCKED` / access_denied | Non |
| bienici | 16:39:25.411 | 4571 ms | `UNSAFE_URL` / garde réseau du navigateur | Oui, une session |

Pour les trois refus : une ressource réclamée en D1, aucun navigateur et aucune relance. Les corps de refus sont abandonnés ; les 2 Mio conservés dans `hosted_import_costs.source_bytes` sont la borne réservée avant la ressource échouée, **pas un téléchargement mesuré**. Bien’ici : deux ressources, 30 126 octets comptés (HTML de 15 063 octets chargé directement puis dans le navigateur), aucune photo. Le garde-fou réseau s’active pendant la navigation ; la sous-requête exacte n’est pas journalisée. L’hôte JS public `res.bienici.com` observé hors ligne est exclu de la liste actuelle, mais on ne lui attribue pas à lui seul la cause exacte de l’échec distant sans trace supplémentaire.

Chaque échec est relu depuis D1/API ; autre agence refusée 404, accès anonyme 401. Le rejeu de la même clé retourne le même import sans nouvelle consommation. La vérification de galerie D1/R2 sur un succès n’a pas pu être réalisée : aucun succès, aucun fichier stocké. La page publique reprend l’échantillon Cloudflare le plus récent (un lien par portail) ; les sept explorations locales restent dans ce rapport.

Fermeture du navigateur Bien’ici confirmée par l’historique fournisseur : **2,066 s, `NormalClosure`** ; aucune session active après recette. Conteneur import endormi, dernier cycle observé **56,829 s** (ce n’est pas le cumul de tous les cycles). Estimation brute maximale de calcul de ce seul cycle : 0,00044213 USD avant allocations et autres postes, pas une facture. Aucun conteneur Docker laissé actif. Preview locale arrêtée et pont HTTPS local préexistant restauré sur 8791.

`cleanup` retire les seules identités/imports synthétiques : compteurs et réservations vérifiés inchangés. **9/10 tentatives ce jour UTC, 10/30 ce mois**, en incluant la fixture historique antidatée du sprint 03. Une place quotidienne reste à la fin de la recette. Les quatre nouveaux échecs restent provisionnés. Contrôles finaux : quatre pages publiques 200, API d’import anonyme 401, génération 503 ; `/sources` affiche les échecs et les alternatives.

### Vérification restant à faire

Pour Bien’ici, examiner de façon ciblée les dépendances JS réelles et identifier la requête rejetée, puis autoriser seulement les hôtes publics démontrés en conservant résolution/IP épinglée, limites, méthode GET et fermeture. Il faut ensuite démontrer au moins trois photos admissibles, sans fabriquer d’URL d’original ni arrondir un prix contradictoire. Une nouvelle tentative doit être bornée et provisionnée après correction, pas une relance inchangée. Figaro/SeLoger/Leboncoin restent limités par un refus d’accès ; le lien d’agence, la saisie manuelle ou un flux autorisé sont les voies proposées.

### Crawlee

Documentation officielle étudiée à la demande d’Alex. **Crawlee n’a été ni installé ni testé, localement ou sur Cloudflare.** Il orchestre des requêtes/navigateurs sous Node et pourrait tourner en Container ; cette étude n’est pas une preuve de déploiement ni d’accès aux portails. La file de tâches et les retries qu’il propose n’apportent pas ici de solution démontrée aux trois refus ni au problème de dépendances/galerie Bien’ici. Aucun coût Apify, proxy, CAPTCHA ou abonnement externe ajouté. [Sources techniques](../../SOURCES.md#sources-du-sprint-04--consultées-le-28092026).

## Alternatives et coût

| Limite | Option concrète | Coût / état |
|---|---|---|
| Figaro, SeLoger, Leboncoin refusés | Utiliser le lien public du même bien sur le site de son agence ; sinon renseigner le bien et ses photos dans le formulaire existant | Pas de fournisseur supplémentaire ; limites habituelles BienVu inchangées |
| Bien’ici JavaScript/galerie/prix | Même alternative ; conserver l’adaptateur expérimental et planifier une seule investigation bornée | Aucun abonnement externe ajouté ; estimation distante à réserver avant essai |
| Import commercial plus large | Étudier un flux explicitement autorisé par l’agence/portail | Accès et tarif non obtenus ; aucun achat ni message à un tiers envoyé |

**Provision supplémentaire de cette recette : 4 × 0,50 € = 2 €.** Cumul prudent **22 €** (8 € fixes + 2,50 € rendus + 6 € domaine + 5,50 € imports/opérateur), **8 € de marge sur 30 €** ; alerte à 20 €, coupure à 25 €. Facture réelle/TTC et allocations restantes non rapprochées. Les coûts des quatre échecs ne sont pas remboursés par le nettoyage. Aucun rendu, e-mail ou appel IA/TTS nouveau. L’absence de succès des portails ne bloque pas les prochains sprints vidéo sur les agences déjà testées et la saisie manuelle, mais reste une limite explicite du lancement.

## Preuves et Git

Sorties locales ignorées dans `evidence/local/sprint-04/` : `collection.json`, `current-collection.json`, `user-collection.json`, captures HTML publiques, `offline-extraction.json`, logs tests/build/types/dry-runs et recette UI. Le rapport Markdown, les fixtures expurgées et le code sont versionnables ; pas de HTML complet, cookies, contacts, secrets ou photos de tiers dans Git.

Travail sur `main` depuis `01b67bfb65dbd78c16bd74c16c6411e2dcc5c92a`. Sa [CI GitHub est réussie](https://github.com/alexlevy0/BienVu/actions/runs/36444985953), constat du 28/09 à 16:00 UTC environ ; elle valide l’état précédent, pas cette tranche encore locale. Sprint 04 déployé pour recette ; aucun commit/push de ce lot effectué. Preuves distantes ignorées dans `evidence/remote/sprint-04/`, notamment les quatre résultats, coûts/compteurs, fermeture du navigateur, nettoyage et contrôle HTTP final. Les cookies synthétiques sont supprimés après nettoyage.

Vérification documentaire finale : 223 liens relatifs sans cible manquante ; `git diff --check` réussi. Le pont local restauré confirme le mode HTTPS public à IP épinglée, sans fixtures.
