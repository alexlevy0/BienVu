# Nestenn — import lyonnais, 8 octobre 2026

## Import réel

L’[annonce demandée par Alex](https://nestenn.com/appartement-3-pieces-de-65m2-avec-balcon-place-de-stationnement-cave-ref-39584333) est importée une fois par `POST https://bienvu.online/api/imports` après publication du correctif. Réponse HTTP **200**, statut **`ready`**, référence **`39584333`**, appartement en vente à **Lyon**, **199 000 €**, **65 m²**, **3 pièces**, description conservée (**1 366 caractères**) et **7 photos distinctes**.

Début de la recette **13:34:23 UTC**, durée de l’appel produit **10 721 ms**. Diagnostics : **8 ressources**, **1 626 502 octets source**, **1 522 473 octets stockés**, aucun rejet ni doublon, `browserUsed: false`. Le prix provient du bien courant, pas de la simulation de prêt ou des annonces voisines.

Les 7 JPEG sont relus par l’API privée, avec vérification des dimensions, taille, SHA-256 et absence d’EXIF. Le résultat privé relu est identique à la réponse initiale ; résultat et photo sans session répondent **401**. Le rejeu de la même clé renvoie le même import sans nouvelle tentative ni provision.

## Blocages et correction

Le premier blocage est `CONFLICTING_FACTS` : le canonique est sur `immobilier-lyon-8.nestenn.com`, alors que le lien initial est sur `nestenn.com`. Sans source enregistrée, l’import générique refuse cette différence de domaine. La page contient aussi deux objets JSON-LD séparés par une virgule sans tableau englobant, ainsi que des quantités écrites avec quatre décimales (`65.0000`, `3.0000`). La galerie utilise un CDN distinct.

- Source explicite **Nestenn** : `nestenn.com`, `www.nestenn.com`, `immobilier-lyon-8.nestenn.com`, routes se terminant par `-ref-ID`.
- CDN d’images **`media-nestenn.immo-facile.com`** ; aucun joker pour les sous-domaines Nestenn ou immo-facile.
- Adaptateur **`nestenn-dom/1.0`** : JSON seul, avec un tableau ajouté autour des objets séparés par une virgule ; aucun code exécuté, aucune requête ou API devinée.
- Identité recoupée par la route, le canonique, l’URL du bien structuré et `productsId` du formulaire. La référence commerciale affichée dans le mandat reste distincte de cet identifiant technique.
- Transaction de vente et type recoupés entre fiche, titre et JSON-LD ; ville et code postal, surface habitable et pièces recoupés. Le format à quatre décimales reste propre à cet adaptateur, sans changer le parseur générique.
- Prix lié à `#description .titre1`, caractéristiques à `#caracteristiques`, texte à `#description p.description` et galerie à `#links`. Les noms de fichiers et leurs dossiers numériques doivent correspondre à la référence exacte de l’annonce.

Une contradiction, un bien multiple, un canonique étranger, une photo d’une autre référence ou un JSON inexploitable reste refusé, y compris en import partiel. Les protections réseau, DNS/TLS, SSRF, tailles, durées, concurrence et budget restent en place. Pas de migration, nouvelle clé ou modification du transport natif.

## Vérifications et publication

**36 tests ciblés réussis** : alias exacts, JSON concaténé et standard, quantités, contradictions, prix manquant, exclusion des voisins et du financement, galeries étrangères, JSON non exécuté, refus de recherches/redirections, import avec trois JPEG synthétiques, protections réseau et catalogue. Les quatre tests du catalogue sont revérifiés après ajout du résultat réel. Fixtures synthétiques sans reprise des textes, images ou jetons de la page réelle dans Git.

```sh
pnpm exec tsx --test --test-concurrency=1 tests/import-nestenn.test.ts tests/import-extraction.test.ts tests/import-description.test.ts tests/import.test.ts tests/import-network.test.ts tests/source-coverage.test.ts
pnpm typecheck
pnpm check:boundaries
pnpm build:web
```

Typage complet, frontières sur **426 fichiers**, build Next/OpenNext, dry-runs des trois Workers et `git diff --check` réussis. Le build web est renouvelé pour publier le résultat daté sur `/sources`. L’échec du 05/10 est conservé ; le succès du 08/10 ne constitue pas une garantie pour tous les formats ou sous-domaines Nestenn.

| Worker | Version initiale du correctif à 100 % | Bindings conservés |
| --- | --- | --- |
| Web, `bienvu.online` | `d0aade07-9a1e-4915-afb5-b74cdaec9f7d` | 50 |
| Service d’import | `398fb6a9-45d8-49fa-8828-54e8e797c80d` | 9 |
| Service de génération | `8cc78d63-d2a2-493d-a874-842422dff234` | 30 |

Comparaison des bindings complets et du runtime avant/après : identiques. Conteneurs existants conservés avec `--containers-rollout none`. Le web contient également l’extracteur ; le registre est publié dans le service de génération pour les mêmes liens en essai sans compte. Aucun rendu vidéo n’est déclenché pour cette recette.

Le catalogue est ensuite publié à **100 %** avec le web **`ae727f43-08a6-4136-ac1a-c5aed56fb43d`**, après un deuxième build et dry-run. Bindings et runtime restent identiques. L’accueil et `/sources` répondent **200**, `/api/imports` sans session **401**. La carte Nestenn publiée affiche le succès du 08/10 avec ses 7 photos et conserve l’essai échoué du 05/10, soit deux essais datés.

## Budget et données techniques

Un seul nouvel import : **56 → 57 sur 300 en octobre**, **2 → 3 sur 20 aujourd’hui**, provision d’import **0,50 €**. Total mensuel avec baseline **77,75 → 78,25 €**, dans la coupure inchangée de **90 €** et l’enveloppe **100 €**. Il s’agit de provisions, pas d’une facture fournisseur.

L’agence technique déjà utilisée lors de la recette précédente est réutilisée après vérification qu’elle ne possède plus d’import, génération, session ou credential. Aucun compte client utilisé, aucune nouvelle agence ou allocation gratuite créée. Nettoyage terminé à **13:41:50 UTC**, après le bail et les cinq minutes de protection : import et 7 objets temporaires supprimés par la route produit, sessions et credentials révoqués, fichier d’identité supprimé. Zéro objet et zéro génération restent dans cet espace. Le propriétaire technique reste soumis aux protections de l’agence ; coûts techniques, compteurs et provisions sont identiques avant/après nettoyage. Aucun défaut de clé étrangère dans D1.

Traces privées ignorées : `evidence/local/nestenn-2026-10-08/` et `evidence/remote/nestenn-2026-10-08/`. Aucune génération, voix off, animation IA, collecte massive, connexion à un portail ou notification par e-mail.
