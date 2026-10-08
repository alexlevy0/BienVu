# HUMAN Immobilier — import navigateur validé, 8 octobre 2026

## Résultat final réel

À **16:39 UTC**, l’[annonce fournie par Alex](https://www.human-immobilier.fr/annonce-achat-appartement-tulle_259-4183) est importée automatiquement depuis `bienvu.online/api/imports` : HTTP **200**, statut **`ready`**, **72 345 €**, **56,63 m²**, **3 pièces**, description et **6 JPEG privés de 800 × 600 px**. Durée interne **13 889 ms**, **7 ressources**, **710 712 octets source**, **510 506 octets stockés**, zéro rejet ou doublon, `browserUsed=true`. Les photos sont relues par l’API authentifiée et vérifiées par taille, dimensions, SHA-256 et absence d’EXIF. L’accès sans session au résultat et aux médias reste **401**. Le rejeu de la même clé restitue ce résultat sans nouvelle tentative ni provision.

Le succès concerne ce lien réel et les structures couvertes par l’adaptateur ; il ne valide pas toutes les variantes du portail. Le catalogue ajoute cet essai daté et conserve les refus précédents. Le test ne lance aucune génération vidéo ni appel IA.

## Premier essai, avant correction du transport

Le premier essai sur `bienvu.online/api/imports`, après publication du lecteur mais avec l’ancien transport HTTPS Node, répond HTTP **200**, import **`failed`**, code **`SOURCE_BLOCKED`**, motif privé **`access_denied`**, étape **`page`**. Une seule ressource, aucun navigateur de secours, aucune donnée de fiche ni photo enregistrée. Durée interne **4 419 ms**. Le refus vient de l’accès à la source, avant l’extraction ; le seul ajout du lecteur ne le résolvait pas.

La relecture authentifiée et le rejeu de ce premier échec sont vérifiés ; sans session, le résultat répond **401**. Le catalogue conserve les refus du 05/10 et de ce premier essai du 08/10, distincts du succès final.

## Vérifications locales distinctes

- Une requête Node native à IP publique épinglée est refusée ; la réponse HTTP **403** contient `Access Denied`. Un diagnostic HTTP/2 natif est également refusé. Aucun changement de User-Agent ou de transport produit ne masque ces refus.
- Un Chrome standard, en contexte neuf sans connexion au portail ni cookies fournis, reçoit **200** pour le document exact. Les ressources annexes sont bloquées. Cette capture diagnostique reste privée et n’est pas utilisée comme cache ou comme page de substitution dans l’import hébergé.
- Sur ce HTML réel, l’adaptateur identifie **`259-4183`**, un appartement en vente à **Tulle**, **72 345 € honoraires inclus**, **56,63 m²**, **3 pièces**, la description (**409 caractères**) et **6 candidats photo**.
- Les 6 photos publiques de ce HTML sont téléchargées avec le transport Node protégé, décodées et réencodées en JPEG dans un dossier local ignoré. Aucun objet n’est créé dans l’espace d’un client ou dans R2. Lecture locale de la capture : **707 327 octets source**, **510 506 octets JPEG**, **7 ressources**, zéro rejet ou doublon. Le document HTML est injecté depuis la capture ; il ne s’agit donc **pas d’un import automatique réussi**.

Le premier navigateur produit faisait aussi passer ses requêtes par le transport Node refusé. Un diagnostic natif via CDP sur Cloudflare reçoit ensuite **200**, avec un Chrome standard, sans compte ni CAPTCHA, JavaScript désactivé et **82 ressources annexes bloquées**. Cela justifie une nouvelle méthode d’acquisition initiale, validée séparément ci-dessous. Le SDK Browser Run ne propose pas de résolution DNS épinglée ; la solution produit est donc intégrée au conteneur Node, avec Chromium et ses règles de résolution, plutôt que de modifier les garanties réseau du transport.

## Transport natif et contrôles finaux

`scripts/import-browser-transport.ts` est réservé aux fiches HUMAN enregistrées. Les deux alias exacts sont résolus et toutes leurs IP doivent être publiques ; Chromium reçoit des règles `MAP` fixes et un refus des autres noms. TLS reste vérifié, proxy et QUIC désactivés, contexte neuf sans cookies fournis, variables secrètes exclues du processus navigateur. Le document GET de la frame principale est le seul accès permis ; tout autre type de ressource est annulé. Les redirections sont validées avant nouvelle navigation, limitées à la même référence et aux alias enregistrés ; DNS est revérifié, Chrome conserve l’IP initialement épinglée.

Le flux HTML est intercepté par CDP **avant son affichage**, borné à **2 Mio même sans Content-Length**, puis la navigation est annulée. Aucun script de l’annonce ne s’exécute. Acquisition limitée à **18 secondes**, lancement à **8 secondes**, fermeture du navigateur et des flux en succès, erreur et annulation, y compris si le lancement finit après l’annulation. Aucun changement du User-Agent, proxy externe, compte du portail ou contournement de challenge. Un HTTP 401/403/429 reste fatal. Le parseur ne relance pas un second navigateur pour un document déjà obtenu par cette méthode.

Le Worker réserve le verrou navigateur global et l’usage unique par import avant l’appel au conteneur ; les photos gardent leur transport Node avec IP épinglée et réencodage JPEG. Les en-têtes privés `X-Import-Browser` permettent aux parcours web, local et de génération d’enregistrer la méthode réellement utilisée. Aucun Chromium ni Playwright Node n’est embarqué dans le bundle Workers.

**78 tests ciblés réussis**, dont les 7 nouveaux tests de flux CDP, DNS privé/mixte, redirection étrangère, rebinding, refus, fermeture et annulation, les 9 HUMAN et les 9 Nestenn. Les tests d’import anonyme incluent désormais les deux sources ajoutées au registre. Typage complet du monorepo et des tests, frontières **427 fichiers**, build Next/OpenNext et dry-runs des trois Workers réussis. Les 4 tests du catalogue sont revérifiés après ajout du succès réel.

Le vrai import local avec la méthode initiale native, sans HTML de capture injecté, réussit aussi avec ses six photos en **10 438 ms**. Un premier essai local de cette méthode avait dépassé le délai de lancement pendant la construction Docker ; le Chrome diagnostique isolé démarre ensuite en **1 501 ms**, et l’essai complet suivant réussit. Ce premier dépassement n’est pas compté comme un succès.

Image Linux/AMD64 construite sur le Node 24.17.0 déjà épinglé, **Chromium `154.0.8037.92-1~deb12u1`** et **Playwright-core 1.62.1**. La couche contenant le transport final est reconstruite après le typage, et son fichier embarqué est comparé au source. L’essai d’exécution locale AMD64 sous émulation n’a pas terminé dans sa fenêtre de 60 secondes ; il ne remplace pas la recette réelle Cloudflare réussie. Image publiée et épinglée : `registry.cloudflare.com/5fd251f918593d6bd7594889c4ec8343/bienvu-human-native@sha256:d08e544db56787586dcbad33f61fa07bcff01a1bb31cdc7a71119c11646032b6`.

| Worker | Correctif natif à 100 % | Bindings conservés |
| --- | --- | --- |
| Web | `7fe8bc55-ca57-4eee-95a8-a7cd673116f5` | 50 |
| Import | `a1fa978f-453b-48dd-8162-e165d3a2d2fa` | 9 |
| Génération | `6c814e81-e850-45dc-b489-0f8c3088f113` | 30 |

Bindings complets et paramètres runtime comparés avant/après : identiques. Le conteneur d’import reçoit la nouvelle image, avec capacité **un `basic`** et configuration réseau conservées. Aucun traitement réseau ou de génération actif lors du déploiement ; les 24 brouillons en cours de saisie restent conservés. Le renderer garde son image et `--containers-rollout none`. Aucune migration, nouvelle clé ou nouvelle ressource Cloudflare.

Le diagnostic Browser Run reçoit une provision distincte de **0,05 €** avant l’appel, sans augmenter la coupure. Pour le nouvel import produit : **59 → 60 sur 300 en octobre**, **5 → 6 sur 20 aujourd’hui**, provision **0,50 €**, total baseline et imports **79,30 → 79,80 €**, sous la coupure inchangée de **90 €** et l’enveloppe **100 €**. Les écarts avec le premier essai historique comprennent un autre import entre les deux recettes. Ce sont des provisions, pas une facture fournisseur. Les preuves privées finales sont dans `evidence/remote/human-native-2026-10-08/`.

## Adaptateur ajouté

`packages/contracts/src/import-sources.ts` enregistre les hôtes exacts `www.human-immobilier.fr` et `human-immobilier.fr`, la route de vente maison/appartement avec référence `AGENCE-MANDAT`, et uniquement le bucket photo `humanimmobilier-images.s3.fr-par.scw.cloud`. Pas de joker Scaleway ou HUMAN, pas d’autre site d’agence, API ou URL d’image devinés.

`human-dom/1.0` lit le bien unique `RealEstateListing.offers.itemOffered`, recoupe canonique, référence URL, `@id`, offre et référence visible. La transaction et le type sont comparés entre route, DOM et données structurées. La localisation et le nombre de pièces sont contrôlés ; les chambres restent distinctes. Le prix honoraires inclus est recoupé entre l’en-tête, son libellé détaillé et l’offre structurée. Prix hors honoraires, pourcentage des frais, simulation de crédit, revenus du secteur et annonces voisines sont exclus.

La surface structurée **56,63 m²** est compatible avec l’affichage **56,6 m²** après arrondi à la précision de chaque valeur affichée. Une différence véritable reste bloquante ; le format arrondi est limité à HUMAN, sans modification du parseur générique. La surface du séjour ne sert pas de surface habitable. Chaque image de `#gallery #slider` et du JSON-LD doit appartenir au bucket, au dossier `vente` et à la référence exacte ; les métadonnées d’images doivent retrouver les images de la galerie. Les images hors galerie sont exclues.

Fixtures synthétiques, sans reprise des descriptions, images ou jetons réels dans Git. Les données et documents publics réels sont conservés uniquement dans `evidence/local/human-2026-10-08/`, ignoré.

## Contrôles initiaux du lecteur

**45 tests ciblés réussis**, dont 9 scénarios HUMAN : faits et unités, prix inclus/net, arrondi et contradictions, identité, vente/location, type/ville/pièces, galerie étrangère ou privée, plusieurs biens, import avec JPEG synthétiques et arrêt sans navigateur après HTTP 403. Les 4 tests du catalogue sont revérifiés après ajout du résultat hébergé.

```sh
pnpm exec tsx --test --test-concurrency=1 tests/import-human.test.ts tests/import-nestenn.test.ts tests/import-extraction.test.ts tests/import-description.test.ts tests/import.test.ts tests/import-network.test.ts tests/source-coverage.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
```

Typage complet, frontières **427 fichiers**, build Next/OpenNext et dry-runs des trois Workers réussis. Le typage lancé simultanément avec le premier build a rencontré des fichiers générés `.next/types` momentanément supprimés ; il est relancé après la fin du build et passe. Ce problème de vérification n’a nécessité aucun changement applicatif.

| Worker | Version initiale de l’adaptateur à 100 % | Bindings conservés |
| --- | --- | --- |
| Web | `eea386d2-57bd-44a5-9c58-58be0c219d87` | 50 |
| Import | `a485ece6-a961-41a6-a644-cb1f0c95b816` | 9 |
| Génération | `ea8d9982-1b73-4acf-81af-a7253dd8f664` | 30 |

Bindings complets et runtime comparés avant/après : identiques. Images des conteneurs existants conservées avec `--containers-rollout none`. Pas de migration, nouvelle clé ou ressource Cloudflare.

Le catalogue est publié après un deuxième build et dry-run avec le web **`bdc427e9-a8f2-48c2-8d45-352164fe05af`** à 100 %. Les 50 bindings complets et le runtime sont revérifiés. L’accueil et `/sources` répondent **200**, `/api/imports` sans session **401**. La version publique rapporte le refus HUMAN du 08/10, sans effacer l’échec du 05/10.

## Budget et nettoyage du premier essai

Un seul nouvel import hébergé : **57 → 58 sur 300 en octobre**, **3 → 4 sur 20 aujourd’hui**. Provision conservée même en cas d’échec : **0,50 €**. Total baseline et imports **78,25 → 78,75 €**, sous la coupure inchangée de **90 €** et l’enveloppe **100 €**. Ces montants sont des provisions, pas une facture fournisseur.

Le compte technique déjà utilisé pour Nestenn est réutilisé, après contrôle qu’il ne possède ni import, génération, session ou credential. Aucun client utilisé, aucune nouvelle agence ou allocation gratuite, aucun rendu, voix off, animation, collecte massive ou e-mail. Les traces opérateur restent privées dans `evidence/remote/human-2026-10-08/`.

Nettoyage terminé à **14:22:25 UTC**, après le bail et les cinq minutes de protection, par la route produit. L’import technique est supprimé ; zéro import, objet média, génération, session ou credential restent dans cet espace. Le fichier d’identité privé est supprimé. Le propriétaire technique est conservé avec les protections de son agence. Compteurs et provisions ne sont pas remboursés ou effacés ; les coûts de cette agence sont identiques avant/après nettoyage. D1 ne présente aucun défaut de clé étrangère.

## Catalogue final

Après ajout du succès réel, les 4 tests du catalogue, le build Next/OpenNext et le dry-run web passent. Web **`76c7c2d6-887d-4331-828c-5dc73d5b3630`** publié à 100 %. Le succès daté du 08/10 à 16:39 UTC est conservé avec les deux échecs historiques, sans annoncer que toutes les variantes HUMAN sont validées.

## Nettoyage du test natif

Nettoyage terminé à **16:46:10 UTC**, après le bail et les cinq minutes de protection, via la route produit. Zéro import, média journalisé ou génération restent dans le compte technique ; credentials et sessions révoqués, fichier d’identité privé supprimé. Coûts et compteurs conservés, propriétaire technique conservé. Contrôle FK après nettoyage : zéro défaut. L’accueil et `/sources` répondent 200, `/api/imports` visiteur 401 ; le HTML publié contient le succès HUMAN et ses échecs historiques. Le verrou navigateur est libéré. Les 50 bindings et paramètres runtime du web final sont identiques à ceux d’avant modification.
