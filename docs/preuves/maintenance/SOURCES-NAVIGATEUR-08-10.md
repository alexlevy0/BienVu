# Sources après ajout de la lecture navigateur — 8 octobre 2026

## Périmètre et résultats réels

Contre-vérification des **onze réseaux sans import complet confirmé** dans le catalogue, avec les mêmes liens publics. Les réseaux ayant déjà un import réussi ne sont pas retestés ici. Un document HTTP 200, une capture locale ou une extraction de fixture ne deviennent jamais une preuve d’import complet.

Entre **17:20 et 17:22 UTC**, onze appels séquentiels à `https://bienvu.online/api/imports` : **un `ready`, dix `failed`, aucun brouillon partiel**. Chaque résultat est relu avec authentification ; sans session, sa lecture répond 401. Le rejeu de sa clé restitue le même résultat sans tentative ou provision supplémentaire. Aucune génération vidéo, voix off, animation ou publication.

| Source | Résultat du nouvel import hébergé | Photos |
| --- | --- | --- |
| Citya | **Complet** : 240 000 €, 45 m², 2 pièces, Toulouse, description | **11** |
| Laforêt | `UNSAFE_URL`, ressource de style hors périmètre pendant la lecture navigateur | 0 |
| Guy Hoquet | `UNSAFE_URL`, ressource de style hors périmètre pendant la lecture navigateur | 0 |
| ERA | `UNSAFE_URL`, ressource de galerie non enregistrée | 0 |
| Foncia | `SOURCE_UNAVAILABLE`, motif `not_found` | 0 |
| Square Habitat | `CONFLICTING_FACTS` à l’extraction | 0 |
| Arthurimmo | `SOURCE_UNAVAILABLE` avant récupération du document | 0 |
| Le Figaro | `SOURCE_BLOCKED`, motif `access_denied`, navigateur natif utilisé | 0 |
| SeLoger | `SOURCE_BLOCKED`, motif `access_denied` | 0 |
| Leboncoin | `SOURCE_BLOCKED`, motif `access_denied` | 0 |
| Bien’ici | `UNSAFE_URL`, police externe hors périmètre pendant la lecture navigateur | 0 |

**Citya, à 17:21:22 UTC :** référence `TAPP176-971928`, `citya-dom/1.0`, prix de vente 24 000 000 centimes EUR, 45 m², 2 pièces. Durée interne **10 552 ms**, **12 ressources**, **3 412 962 octets source**, **5 951 128 octets JPEG privés**, zéro rejet ou doublon. Les onze photos sont relues via l’API privée : taille, SHA-256, dimensions, format JPEG et absence d’EXIF contrôlés. L’accès visiteur au résultat et aux photos répond 401.

Les nouveaux résultats du catalogue portent la date du 08/10 et l’horodatage exact de chaque essai. Les échecs historiques restent conservés. Citya compte désormais un succès réel ; les dix autres réseaux ne sont pas déclarés compatibles.

## Diagnostic navigateur distinct

Avant la recette produit, un diagnostic Browser Run natif examine exactement les onze documents : contexte neuf, JavaScript désactivé, aucune connexion au portail, aucune requête d’asset ou redirection autorisée, plafond de document et durée bornés. Session et verrou global sont fermés après le diagnostic. Les captures HTML restent privées et ne sont jamais utilisées comme substitut dans un import hébergé.

- **Le Figaro :** document 200 dans ce diagnostic, mais données incomplètes : prix non vérifiable et une seule photo liée à la fiche. Les images `img.figarocms.net` observées sont des illustrations d’articles voisins ; elles ne sont pas ajoutées à la galerie ni au registre. Le vrai import natif reçoit ensuite un refus : aucun succès public n’est déduit du diagnostic.
- **Citya :** document exploitable, offre imbriquée et onze URL photo littérales dans le carrousel. Cette observation conduit au lecteur dédié, puis à la recette produit positive.
- **Guy Hoquet et ERA :** documents accessibles mais sans fiche reconnue par le lecteur actuel. Leurs ressources hors périmètre ne sont pas autorisées globalement.
- **Laforêt, Foncia, SeLoger et Leboncoin :** refus dans le diagnostic. Le résultat produit de Foncia reste distinct, avec son motif `not_found`.
- **Arthurimmo :** le document dépasse le plafond diagnostique de 2 Mio. Ce constat n’est pas présenté comme le motif exact du résultat produit, qui ne le précise pas.
- **Square Habitat :** diagnostic interrompu au délai ; le produit relève séparément une contradiction.
- **Bien’ici :** le document initial est une coque sans fiche structurée exploitable. La recette produit reste en échec.

## Changement conservé

`citya-dom/1.0` reconnaît uniquement une fiche `RealEstateListing` et son offre/appartement uniques. Il vérifie les identités URL et `@id`, la vente, la devise, la disponibilité, la ville et le code postal, la surface et les pièces. Le prix de vente adjacent à l’en-tête concorde avec l’offre ; le financement mensuel, les charges et la taxe restent exclus. La galerie doit être unique et contenir la couverture structurée ; seules ses photos et leurs URL lazy sont retenues. Les carrousels voisins et icônes sont exclus. Les photos proviennent du même site et du chemin de l’agence correspondant à la référence. Aucun hôte CDN ou sous-domaine arbitraire ajouté.

Fixture entièrement synthétique et **7 tests Citya** : offre/galerie, financement, contradictions même en partiel, identité et indisponibilité, galeries ambiguës ou étrangères, routes exactes, import de WebP normalisés en JPEG privés. Le transport natif reste activé par source explicitement enregistrée ; **HUMAN seul** conserve `documentTransport: 'browser'`. Le parcours expérimental Figaro est désactivé après son échec hébergé, pour ne pas ajouter un lancement Chromium sans succès démontré.

Les protections DNS/TLS, plafonds, contrôle de domaine, arrêt sur refus/challenge, verrou navigateur, isolation des agences et normalisation des médias sont conservés.

## Contrôles et publication

**41 tests ciblés** du navigateur, de Citya, du budget/transport hébergé, du réseau, des imports partiels et du catalogue passent. Les 7 tests Citya sont revérifiés après correction du typage. Les tests des autres lecteurs et de la saisie anonyme ont également passé pendant la première série ; le test Citya initial a été corrigé pour fournir le contrat de transport JPEG normalisé plutôt que des octets WebP bruts. Typage complet du monorepo et des tests, frontières **428 fichiers**, builds Next/OpenNext et dry-runs des trois Workers réussis. Le catalogue et le refus d’activation des sources sans recette positive sont revérifiés après mise à jour des résultats.

| Worker | Version de la recette à 100 % | Bindings |
| --- | --- | --- |
| Web | `95ac8a06-6d2d-4bf9-9ada-af64fadf15ce` | 50 |
| Import | `3129280e-ac30-4b12-894d-a3b44c4dba64` | 9 |
| Génération | `a401e46f-d307-4e67-b235-769ed7cf6a3c` | 30 |

Les paramètres runtime et bindings complets, y compris variables et noms des secrets, sont comparés avant/après et identiques. Le conteneur d’import reste un seul `basic`, le renderer garde son image et un rollout `none`. Aucun traitement réseau ou génération actif au déploiement. Aucun quota augmenté, migration ou ressource Cloudflare créée. La couche d’image contient les sources comparées au code local ; elle réutilise la base Chromium validée au lieu de réinstaller les dépendances.

## Budget et nettoyage

Diagnostic navigateur provisionné avant appel : **0,55 €**. Recette produit : **11 × 0,50 € = 5,50 €** de provisions, conservées même pour les échecs. Usage du jour **6 → 17 sur 20**, du mois **60 → 71 sur 300**. Total baseline et provisions après campagne **85,85 €**, sous la coupure inchangée **90 €** et l’enveloppe **100 €**. Ces chiffres sont des réservations prudentes, pas une facture fournisseur. Les compteurs et coûts ne sont pas réinitialisés.

Le même propriétaire technique déjà révoqué est réutilisé, après contrôle de l’absence d’import, génération, credential ou session. Aucun compte client ni nouvelle allocation de crédits. Les preuves brutes et identifiants restent dans `evidence/remote/sources-browser-2026-10-08/`, ignoré et protégé. Le nettoyage s’effectue uniquement par les routes produit après les baux et les cinq minutes de protection ; le propriétaire technique est conservé avec ses invariants.

## Version finale du catalogue et du périmètre navigateur

Après retrait de l’activation Figaro non concluante et ajout des onze résultats, **28 tests** du navigateur, des portails et du catalogue passent. Typage complet, frontières, build Next/OpenNext et les trois dry-runs repassent. Les sources embarquées dans la dernière couche d’image sont vérifiées, avec le registre final comparé au fichier local.

| Worker | Version finale à 100 % |
| --- | --- |
| Web et `/sources` | `5cff8fe6-ae45-4042-976d-92d0f06fbf00` |
| Import | `e4059c98-7d19-4381-a02b-274897983797` |
| Génération | `edb83aef-a61d-4148-ab1f-74a7a82e435f` |

Image finale du conteneur d’import : `registry.cloudflare.com/5fd251f918593d6bd7594889c4ec8343/bienvu-sources-native@sha256:1b29b20620fb7abfbc0608317291a71a62de5d0c0243106acb302c78898b5ec8`. Les 50/9/30 bindings et paramètres runtime restent identiques ; le renderer garde l’image `4f92089cc5ce231aad245908acb7aeeac219c8a9baeb4777f3dd96b78b584667`. Aucun job actif au déploiement. Contrôle de clés étrangères : zéro défaut, verrou navigateur libéré.

Vérification publique à **17:28:27 UTC** : accueil et `/sources` HTTP 200, `/api/imports` visiteur 401 ; les notes des onze nouveaux essais sont présentes dans le HTML servi, ainsi que les succès Citya/HUMAN et l’historique des échecs.

Nettoyage achevé à **17:29:59 UTC**, après tous les baux et les cinq minutes de protection : les onze imports techniques et leurs médias sont supprimés via la route produit, zéro import, objet journalisé ou génération restent dans cet espace. Credentials et sessions révoqués, fichier d’identité privé supprimé, propriétaire technique conservé. Les enregistrements de coûts de l’agence sont identiques avant/après nettoyage ; usage et provisions conservés. Nouvelle vérification D1 : zéro défaut FK, verrou navigateur libéré.
