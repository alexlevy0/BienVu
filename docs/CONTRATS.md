# BienVu — contrats fonctionnels et techniques

Ces contrats sont la cible à implémenter en TypeScript avec validation runtime. Les exemples de noms ne prouvent pas l'existence d'une API fournisseur.

## Données

| Entité | Champs essentiels |
|---|---|
| Agence | `id`, `ownerUserId`, `name`, `logoAssetId?`, `primaryColor`, `secondaryColor`, `phone?`, `email?`, `website?`, `createdAt` |
| Annonce | `id`, `agencyId`, `sourceUrl`, `canonicalUrl`, `sourceHost`, `sourceListingId?`, `fetchedAt`, `adapterVersion`, `description`, faits et provenance |
| Description source | `text` en texte brut, `sourcePath`, `truncated` ; `null` si absente |
| Fait | `value`, `sourcePath`, `rawEvidence`, `status: verified/user_provided/missing/conflicting`, unité explicite |
| Photo | `id`, `agencyId`, `listingId`, `sourceUrl`, `objectKey`, `contentHash`, `width`, `height`, `mime`, `sizeBytes`, `sourceOrder` |
| Import privé | `id`, `agencyId`, `idempotencyKey`, `sourceUrl`, `status`, résultat, erreur, diagnostics privés, bail et expiration |
| Script | `id`, `listingId`, `version`, `language`, `scenes[]`, `model`, `promptVersion`, `inputHash` |
| Scène | `id`, `photoAssetId`, `narrationText`, `captionText`, `factRefs[]`, `audioAssetId`, `durationFrames` |
| Job | `id`, `agencyId`, `idempotencyKey`, `status`, `stage`, `attempt`, `leaseUntil?`, `workflowId?`, `reservationId`, `errorCode?`, horodatages |
| Manifeste | `schemaVersion`, `jobId`, `templateVersion`, copie de marque, scènes, résolution, fps, droits de sortie et clés d'assets |
| Artefact vidéo | `id`, `agencyId`, `jobId`, `objectKey`, `sha256`, dimensions, codecs, durée, `watermarked`, `createdAt`, `expiresAt` |
| Abonnement | `agencyId`, identifiants Stripe, `planCode`, `status`, début/fin de période, `cancelAtPeriodEnd`, version de synchronisation |
| Allocation | `id`, `agencyId`, `kind: trial/paid`, `periodKey`, `limit`, `reserved`, `consumed`, dates de validité |
| Réservation | `id`, `jobId`, `allocationId`, `status: reserved/consumed/released`, timestamps |
| Coût | `jobId?`, fournisseur, étape, quantité, unité, prix daté, devise, montant estimé/réconcilié, identifiant de requête |

Le prix immobilier est stocké en unité monétaire explicite, idéalement en centimes ; la surface en m² et les durées en millisecondes ou frames selon le contrat. Distinguer `sale` et `rent`, période du loyer et charges. `null` signifie absent ; ne pas remplacer un champ absent par zéro. Les preuves brutes sont bornées et ne contiennent ni cookies ni secrets.

## Contrat d'import

`importListing(url, agencyContext)` retourne l'un des deux résultats :

- Succès : annonce normalisée, provenance, photos validées et warnings non bloquants.
- Échec : code stable, message français, caractère temporaire ou permanent et diagnostics privés.

Codes minimum : `INVALID_URL`, `UNSAFE_URL`, `SOURCE_BLOCKED`, `SOURCE_UNAVAILABLE`, `NOT_A_LISTING`, `INCOMPLETE_LISTING`, `CONFLICTING_FACTS`, `INSUFFICIENT_PHOTOS`, `IMPORT_TIMEOUT`.

Pipeline d'extraction : données structurées de la page, données embarquées pertinentes, puis DOM et adaptateur de site. Ne pas envoyer tout le HTML à un LLM par défaut. Un fallback IA optionnel ne reçoit qu'un extrait borné, nettoyé et traçable. Il n'est activé qu'après mesure de son utilité et de son coût.

Filtrer logos, avatars, publicités, biens voisins, doublons, petites vignettes et plans non appropriés. Résoudre `srcset` et lazy loading sans inventer une URL haute résolution. Vérifier le fichier reçu et ses dimensions avant de le retenir. Un simple `og:image` ne constitue pas une galerie complète.

Pour le minimum de recette : trois photos distinctes, bien identifiable, type et localisation fiables. Prix et surface affichés ou prononcés seulement s'ils sont vérifiés. Toute ambiguïté significative sur l'identité, le prix ou la surface doit être résolue par des preuves ou renvoyée comme échec.

Le sprint 03 implémente aussi le fait `rooms` (unité `rooms`), facultatif pour compatibilité avec les anciennes fixtures. Les images d’import utilisent `agencies/{agencyId}/imports/{listingId}/{hash}.jpg`. `RenderManifest` exige toujours les clés du job : le pipeline devra copier les médias retenus avant rendu. États d’import distincts des jobs : `importing → ready/failed → deleting`, sans reprise d’un état terminal. Toute référence de job interdit la suppression.

La description du bien est importée depuis son entité structurée ou son bloc DOM identifié, avec ses paragraphes. Elle reste distincte des faits vérifiés : sa présence ne valide pas les affirmations commerciales du texte et ne crée pas automatiquement de nouveaux faits. Aucun HTML actif n’est conservé ou interprété. Le texte est limité à 20 000 caractères ; `truncated` indique une coupure et l’interface renvoie vers la source pour la suite. Une description absente n’empêche pas l’import. Les anciens résultats sans ce champ sont lus avec `description: null` ; une nouvelle récupération explicite est nécessaire pour les enrichir.

## Saisie manuelle — décision du 28/09/2026

`NormalizedListing.sourceKind` vaut `url` (défaut des anciens résultats) ou `manual`. Une saisie manuelle possède `sourceUrl`, `canonicalUrl`, `sourceHost`, `sourceListingId` et les `photos[].sourceUrl` à `null`. Ses valeurs sont `user_provided` avec provenance `manual.champ` ; aucune n’est annoncée comme vérifiée sur un site. Les deux modes partagent photos privées, limites, conservation, lecture et rattachement à l’agence. Les informations manquantes restent absentes.

Entrée manuelle stricte : titre, type, transaction, localisation, description, prix en centimes EUR ou `null`, traitement des charges, surface/pièces ou `null` et manifeste de 3–12 fichiers (empreinte des octets, MIME, taille). Le loyer renseigné exige des charges explicites. Description limitée à 20 000 caractères, 10 Mio/fichier et 50 Mio au total. Les octets reçus doivent correspondre au manifeste ; décodage/réencodage raster, dimensions, déduplication et contrôle de stockage précèdent la publication.

`POST /api/imports/manual` crée une préparation idempotente privée. `PUT /api/imports/:id/uploads/:index` reçoit une photo à la fois. `POST /api/imports/:id/complete` publie seulement après réception de toutes les photos, avec au moins trois contenus distincts. Même clé et contenu → même annonce ; contenu changé → conflit. Les étapes contrôlent session, origine et agence ; aucune URL de fichier ou clé R2 cliente n’est acceptée. Aucun crédit n’est consommé.

La préparation expire après 15 minutes ; les objets d’un envoi interrompu restent journalisés pour la purge. Un import URL actif n’interdit pas une saisie manuelle. La génération depuis une annonce sauvegardée reste à connecter au sprint du pipeline.

## États des jobs (pipeline)

Parcours nominal : `queued → importing → scripting → voicing → rendering → ready`.

Depuis un état en cours : `retry_wait` en cas d'erreur temporaire récupérable ; `failed` après épuisement des tentatives ou erreur définitive. `retry_wait` conserve l'étape à reprendre et sa réservation. Les états `ready` et `failed` sont terminaux ; une nouvelle création possède un nouvel identifiant. Après un échec terminal, l'action utilisateur « Réessayer » crée donc un nouveau job, soumis aux contrôles de quota et de budget actuels. L'ancien échec n'a consommé aucun crédit.

Règles :

- Persister la réussite de chaque étape et les références des artefacts avant de passer à la suivante.
- Réutiliser une étape déjà validée si son empreinte d'entrée est identique.
- Au plus une nouvelle tentative automatique après un échec temporaire pour les premiers tests ; pas de retry automatique sur blocage explicite, URL dangereuse ou données contradictoires.
- Une reprise manuelle d'un job encore en `retry_wait` peut avancer la prochaine tentative, mais ne remet à zéro ni le compteur ni le délai global. Une réservation déjà libérée n'est jamais réutilisée comme un droit actif.
- Limite globale proposée : 10 minutes par job. À échéance, annuler ou réconcilier le rendu avant de libérer les droits ; ne pas accepter ensuite un résultat tardif comme une vidéo gratuite.
- Un résultat provenant d'une ancienne tentative ne peut pas écraser la tentative courante. Utiliser un identifiant/version de tentative.
- Une coupure après un appel IA peut entraîner un coût fournisseur sans résultat récupéré. Journaliser ce cas et limiter les relances ; ne pas promettre l'exactement-une-fois chez le fournisseur.

## Quotas et essai

1. Une identité utilisateur éligible dispose d'un seul essai réussi à vie, attaché également à son agence. Recréer une agence ou résilier ne rend pas cet essai à nouveau disponible.
2. Réserver une unité avant le travail payant. Refuser si `limit - reserved - consumed < 1`.
3. Consommer seulement lorsque le MP4 vérifié est disponible et que le job passe à `ready`.
4. Un échec définitif libère la réservation exactement une fois. Les dépenses techniques déjà engagées restent comptées dans le budget interne.
5. Un retry technique du même job réutilise la réservation. Aperçu et téléchargement sont gratuits en crédits.
6. Le quota payant est renouvelé à la période de facturation réellement payée, pas au premier du mois ni lors d'un simple retour de Checkout.
7. Un job garde son allocation et ses droits de rendu initiaux même s'il termine après le renouvellement. Une ancienne allocation n'est pas remise à zéro tant que des réservations sont encore rattachées.
8. Pas de report des crédits inutilisés. Pas de dépassement facturé automatiquement. Au lancement, les changements de palier prennent effet au prochain renouvellement ; ne pas simuler une proratisation non définie.
9. Un abonnement annulé en fin de période conserve son accès jusqu'à l'échéance payée. Les statuts impayés, incomplets et terminés bloquent les nouvelles générations payantes selon la période effectivement réglée ; ils n'effacent pas immédiatement l'historique.
10. L'essai produit uniquement une sortie filigranée. Après abonnement, la création d'une version sans filigrane est une nouvelle génération payante explicite ; ne pas produire un master gratuit sans filigrane en cache.

L'interface indique le droit utilisé avant la génération. Un abonnement actif utilise son quota payant ; un quota épuisé ne bascule pas silencieusement vers une sortie d'essai filigranée. La suppression d'une vidéo ou de l'historique ne réinitialise pas l'éligibilité à l'essai. Définir une conservation minimale et justifiée de cette trace, séparée de celle des médias.

Garder une trace dédupliquée des événements Stripe et des factures déjà utilisées pour une allocation. Les événements hors ordre sont réconciliés avec l'état fournisseur courant. Tous les compteurs doivent résister à deux clics, deux requêtes concurrentes, un webhook répété et un restart de Worker.

## API produit proposée

| Route | Contrat |
|---|---|
| `GET /api/me` | Utilisateur, agence et droits calculés côté serveur |
| `PUT /api/agency` | Met à jour uniquement la marque de l'agence de la session |
| `POST /api/agency/logo` | Upload raster authentifié, taille et contenu validés |
| `POST /api/imports` | Corps strict `{url}` + clé d’idempotence ; import privé, sans crédit ni job ; mode local seulement à ce stade |
| `GET /api/imports` | Imports non expirés de l’agence, limite de 30 |
| `GET /api/imports/:id` | Résultat privé et erreur stable ; aucune donnée d’une autre agence |
| `GET /api/imports/:id/photos/:photoId` | JPEG privé après contrôle de la session et du rattachement |
| `DELETE /api/imports/:id` | Suppression après délai de sûreté, si aucun job ne référence l’import |
| `POST /api/generations` | Corps `{url}` + clé d'idempotence ; crée ou retrouve le job ; réponse `202 {jobId,status}` |
| `GET /api/generations/:id` | Statut, erreur affichable et référence d'aperçu si prêt |
| `GET /api/generations` | Historique paginé de l'agence |
| `POST /api/generations/:id/retry` | Reprise anticipée d'un job `retry_wait` éligible, même réservation et mêmes limites ; refuse un job terminal |
| `GET /api/videos/:id/preview` | Accès autorisé au MP4, avec Range ; version conforme aux droits |
| `GET /api/videos/:id/download` | Même artefact, téléchargement et contrôle d'accès |
| `DELETE /api/videos/:id` | Suppression des objets de la vidéo et métadonnées selon la politique documentée |
| `POST /api/billing/checkout` | `planCode` validé contre le catalogue serveur ; jamais un montant libre envoyé par le client |
| `POST /api/billing/portal` | Session Stripe limitée au client de cette agence |
| `POST /api/billing/webhook` | Corps brut, signature vérifiée, déduplication, traitement persistant |

Codes HTTP cohérents : 401 sans session ; 403/404 pour une ressource étrangère ; 409 pour conflit ; 422 pour entrée inexploitable ; 429 pour limite ou quota ; 503 pour pause de génération. Aucun message public ne contient un secret, une stack trace ou les données d'une autre agence.

L’API d’import retourne `200` pour une représentation persistée `ready` ou `failed` (avec `errorCode`), et `202` pour un import encore en cours. Les refus avant création utilisent les codes HTTP ci-dessus. `IMPORTS_UNAVAILABLE` vaut 503 et `IMPORT_LIMIT` 429. [Limites et procédure locales](IMPORTS.md).

## Voix et timing

Le LLM fournit 4–6 phrases courtes et leurs références de faits, pas des durées audio supposées exactes. Une piste TTS par scène permet des sous-titres par phrase sans alignement mot à mot. Le renderer mesure chaque piste, convertit sa durée en frames avec arrondi supérieur et ajoute les silences nécessaires.

La durée vidéo suit l'audio mesuré. Ne pas couper une phrase pour atteindre 30 secondes. Si la narration dépasse la plage cible, raccourcir une seule fois le script et régénérer les pistes nécessaires, dans les limites de coût. Au-delà, rendre un échec explicite. Prix, unités et noms de ville doivent être prononcés correctement dans la recette.

## Conservation proposée

Médias bruts, narrations et vidéos : 30 jours par défaut, avec expiration annoncée avant téléchargement et dans l'historique. Les assets de marque persistent jusqu'à modification ou suppression du compte. La purge combine métadonnées et règles R2, et ne supprime pas les fichiers d'un job actif. Les justificatifs comptables et traces de facturation ont une politique séparée à définir selon les obligations applicables ; ne pas les supprimer avec un simple fichier vidéo.
