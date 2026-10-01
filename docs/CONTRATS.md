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
| Brouillon de création | Même identifiant parent que l'import ; version, champs nullable, texte d'origine, provenance, confirmations, photos privées, expiration et état `needs_input` |
| Script | `id`, `listingId`, `version`, `language`, `scenes[]`, `model`, `promptVersion`, `inputHash` |
| Scène | `id`, `photoAssetId`, `narrationText`, `captionText`, `factRefs[]`, `audioAssetId`, `durationFrames` |
| Job | `id`, `agencyId`, `idempotencyKey`, `status`, `stage`, `attempt`, `leaseUntil?`, `workflowId?`, `reservationId`, `errorCode?`, horodatages |
| Manifeste | `schemaVersion`, `jobId`, `templateVersion`, copie de marque, scènes, résolution, fps, droits de sortie et clés d'assets |
| Artefact vidéo | `id`, `agencyId`, `jobId`, `objectKey`, `sha256`, dimensions, codecs, durée, `watermarked`, `createdAt`, `expiresAt` |
| Abonnement | `agencyId`, identifiants Stripe, `planCode`, `status`, début/fin de période, `cancelAtPeriodEnd`, version de synchronisation |
| Allocation | `id`, `agencyId`, `kind: trial/paid/free`, `periodKey`, `limit`, `reserved`, `consumed`, dates de validité |
| Réservation | `id`, `jobId`, `allocationId`, `status: unfunded/reserved/consumed/released`, timestamps |
| Coût | `jobId?`, fournisseur, étape, quantité, unité, prix daté, devise, montant estimé/réconcilié, identifiant de requête |
| Signalement | `jobId`, auteur ou session autorisée, catégorie, commentaire borné, statut, date et clé d'idempotence ; jamais public |

Le prix immobilier est stocké en unité monétaire explicite, idéalement en centimes ; la surface en m² et les durées en millisecondes ou frames selon le contrat. Distinguer `sale` et `rent`, période du loyer et charges. `null` signifie absent ; ne pas remplacer un champ absent par zéro. Les preuves brutes sont bornées et ne contiennent ni cookies ni secrets.

## Contrat d'import

L'import strict historique retourne l'un des deux résultats :

- Succès : annonce normalisée, provenance, photos validées et warnings non bloquants.
- Échec : code stable, message français, caractère temporaire ou permanent et diagnostics privés.

Codes minimum : `INVALID_URL`, `UNSAFE_URL`, `SOURCE_BLOCKED`, `SOURCE_UNAVAILABLE`, `NOT_A_LISTING`, `INCOMPLETE_LISTING`, `CONFLICTING_FACTS`, `INSUFFICIENT_PHOTOS`, `IMPORT_TIMEOUT`.

Pipeline d'extraction : données structurées de la page, données embarquées pertinentes, puis DOM et adaptateur de site. Ne pas envoyer tout le HTML à un LLM par défaut. Un fallback IA optionnel ne reçoit qu'un extrait borné, nettoyé et traçable. Il n'est activé qu'après mesure de son utilité et de son coût.

Filtrer logos, avatars, publicités, biens voisins, doublons, petites vignettes et plans non appropriés. Résoudre `srcset` et lazy loading sans inventer une URL haute résolution. Vérifier le fichier reçu et ses dimensions avant de le retenir. Un simple `og:image` ne constitue pas une galerie complète.

Pour le minimum de recette : trois photos distinctes, bien identifiable, type et localisation fiables. Prix et surface affichés ou prononcés seulement s'ils sont vérifiés. Toute ambiguïté significative sur l'identité, le prix ou la surface doit être résolue par des preuves ou renvoyée comme échec.

Le sprint 03 implémente aussi le fait `rooms` (unité `rooms`), facultatif pour compatibilité avec les anciennes fixtures. Les images d’import utilisent un préfixe privé `agencies/{agencyId}/imports/{listingId}/` ; les nouveaux uploads de brouillon incluent l'identifiant d'envoi et l'empreinte afin qu'une suppression tardive ne retire pas son remplacement. Le manifeste exige les clés du job : le sprint 06 copie les médias retenus avant rendu. `RenderManifest` v1 reste une fixture historique des fondations ; le renderer produit reçoit `VideoManifest` v2, figé dans `video_manifests`, avec logo, WAV mesurés et droit essai/payant issu de la réservation serveur. Le client ne fournit ni ces droits ni des URL de médias. [Protocole et limites du renderer](VIDEO.md). États d’import distincts des jobs : `importing` (actif ou suspendu en `needs_input`) → `ready`/`failed` → `deleting`. Toute référence de job interdit la suppression.

La description du bien est importée depuis son entité structurée ou son bloc DOM identifié, avec ses paragraphes. Elle reste distincte des faits vérifiés : sa présence ne valide pas les affirmations commerciales du texte et ne crée pas automatiquement de nouveaux faits. Aucun HTML actif n’est conservé ou interprété. Le texte est limité à 20 000 caractères ; `truncated` indique une coupure et l’interface renvoie vers la source pour la suite. Une description absente n’empêche pas l’import. Les anciens résultats sans ce champ sont lus avec `description: null` ; une nouvelle récupération explicite est nécessaire pour les enrichir.

## Saisie manuelle — décision du 28/09/2026

`NormalizedListing.sourceKind` vaut `url` (défaut des anciens résultats) ou `manual`. Une saisie manuelle possède `sourceUrl`, `canonicalUrl`, `sourceHost`, `sourceListingId` et les `photos[].sourceUrl` à `null`. Ses valeurs sont `user_provided` avec provenance `manual.champ` ; aucune n’est annoncée comme vérifiée sur un site. Les deux modes partagent photos privées, limites, conservation, lecture et rattachement à l’agence. Les informations manquantes restent absentes.

Entrée manuelle stricte : titre, type, transaction, localisation, description, prix en centimes EUR ou `null`, traitement des charges, surface/pièces ou `null` et manifeste de 3–12 fichiers (empreinte des octets, MIME, taille). Le loyer renseigné exige des charges explicites. Description limitée à 20 000 caractères, 10 Mio/fichier et 50 Mio au total. Les octets reçus doivent correspondre au manifeste ; décodage/réencodage raster, dimensions, déduplication et contrôle de stockage précèdent la publication.

`POST /api/imports/manual` crée une préparation idempotente privée. `PUT /api/imports/:id/uploads/:index` reçoit une photo à la fois. `POST /api/imports/:id/complete` publie seulement après réception de toutes les photos, avec au moins trois contenus distincts. Même clé et contenu → même annonce ; contenu changé → conflit. Les étapes contrôlent session, origine et agence ; aucune URL de fichier ou clé R2 cliente n’est acceptée. Aucun crédit n’est consommé.

La préparation manuelle historique expire après 15 minutes ; un brouillon de création suspendu expire après 30 jours. Les objets d’un envoi interrompu restent journalisés pour la purge et un job actif protège ses médias. Un import URL actif n’interdit pas une saisie manuelle. La génération depuis une annonce sauvegardée est connectée au Workflow depuis le sprint 07.

## Brouillon commun et extraction descriptive — extension locale du 29/09/2026

La migration additive 0019 relie `creation_drafts` à `listing_imports` par le **même identifiant**. Un import URL partiel conserve uniquement les faits et photos validés, puis met `draft_pending=1` ; le navigateur d'import et le transport sont terminés. Une annonce sans données exploitables reste éditable sans invention. Les refus d'origine, de sécurité, d'anti-abus et de quota gardent leurs erreurs, sans reprise. Un import URL complet reste `ready` et poursuit directement la génération.

`CreationDraftData` contient les champs nullables, le texte initial et une provenance `import`, `ai` ou `user` avec extrait source et marque de confirmation. `PATCH /api/imports/:id/draft` exige une version et ne remplace que les champs modifiés ; le conflit concurrent renvoie 409. `PUT` et `DELETE /api/imports/:id/uploads/:index` utilisent un identifiant d'envoi, un journal R2 privé et une marque d'annulation ; un résultat tardif ne réinsère pas une photo retirée. `POST /api/imports/:id/complete` vérifie version, confirmations, schéma métier, trois photos distinctes et présence R2 avant de publier l'annonce. La génération réserve ensuite le crédit via l'admission existante : aucune attente de saisie ne bloque un crédit vidéo.

`POST /api/imports/describe` pour une agence et `POST /api/trial/describe` pour une session anonyme appellent le même adaptateur OpenAI privé. Le texte est limité à 4 000 caractères, la sortie JSON stricte à 750 tokens, la réponse à 32 Kio et le délai fournisseur à 18 secondes, sans outil, stockage fournisseur ni navigation. Une preuve textuelle exacte et les unités sont validées côté serveur ; absence = `null`, ambiguïté = confirmation. La réponse n'est appliquée qu'à la version initiale du brouillon. Les demandes sont dédupliquées par propriétaire/session et clé, limitées en D1 et provisionnées à 0,05 € par tentative dans la coupure technique existante. L'anonyme doit fournir sa session opaque et une vérification Turnstile ; aucun crédit vidéo n'est pris pour l'analyse. Une panne ouvre le formulaire en conservant le texte.

`POST /api/generations/:id/report` et `POST /api/trial/:id/report` enregistrent uniquement après contrôle du propriétaire ou de la session. Catégories fermées, commentaire de 1 à 1 000 caractères, trois signalements par job et auteur, cinq par jour et clé d'idempotence empêchent les doubles envois. Les rapports restent privés en D1, consultables par l'exploitant avec ses accès administratifs ; aucune notification tierce n'est déclenchée.

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

1. Depuis la demande du 29/09 : un essai abouti par session anonyme persistante, puis trois vidéos par mois pour un compte gratuit vérifié. L’essai récupéré utilise un de ces crédits. Anniversaire d’inscription UTC, dernier jour valide en mois court, sans cumul ; les anciennes allocations `trial` et payantes restent intactes. Voir [ESSAI-ANONYME.md](ESSAI-ANONYME.md).
2. Réserver une unité avant le travail payant. Refuser si `limit - reserved - consumed < 1`.
3. Consommer seulement lorsque le MP4 vérifié est disponible et que le job passe à `ready`.
4. Un échec définitif libère la réservation exactement une fois. Les dépenses techniques déjà engagées restent comptées dans le budget interne.
5. Un retry technique du même job réutilise la réservation. Aperçu et téléchargement sont gratuits en crédits.
6. Le quota payant est renouvelé à la période de facturation réellement payée, pas au premier du mois ni lors d'un simple retour de Checkout.
7. Un job garde son allocation et ses droits de rendu initiaux même s'il termine après le renouvellement. Une ancienne allocation n'est pas remise à zéro tant que des réservations sont encore rattachées.
8. Pas de report des crédits inutilisés. Pas de dépassement facturé automatiquement. Au lancement, les changements de palier prennent effet au prochain renouvellement ; ne pas simuler une proratisation non définie.
9. Un abonnement annulé en fin de période conserve son accès jusqu'à l'échéance payée. Les statuts impayés, incomplets et terminés bloquent les nouvelles générations payantes selon la période effectivement réglée ; ils n'effacent pas immédiatement l'historique.
10. Le nouvel essai produit un master propre privé et une dérivée filigranée incrustée. Seule la dérivée est exposée à l’anonyme. Authentification vérifiée, propriété atomique et crédit consommé déverrouillent le master existant sans nouvel import, voix ni rendu. Au quota épuisé, la vidéo reste privée et verrouillée. Aucune publication automatique ; les anciens fichiers `trial` ne sont pas requalifiés.

La migration et le nouveau parcours restent désactivés par défaut, en attente de recette distante. L'interface indique le droit utilisé avant la génération. Un abonnement actif utilise son quota payant ; un quota épuisé ne bascule pas silencieusement vers une sortie d'essai filigranée. La suppression d'une vidéo ou de l'historique ne réinitialise pas l'éligibilité à l'essai. Définir une conservation minimale et justifiée de cette trace, séparée de celle des médias.

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

Depuis le 01/10/2026, `VideoManifest.photos` accepte 3–12 photos et `photoTimeline` est facultative sans valeur par défaut (empreintes historiques conservées). Pour le modèle plein écran `/2`, les nouvelles préparations y placent toutes les photos de l'annonce normalisée dans leur ordre, chacune une seule fois, avec des durées entières couvrant exactement la somme des scènes parlées. Le contrat refuse omission, doublon, photo étrangère, réordonnancement ou durée divergente. Les 4–6 scènes de narration et leurs WAV restent indépendants du défilement photographique. En l'absence de timeline, le contrôle historique impose toujours que chaque photo soit référencée par une scène. [Détails et limites de récupération](VIDEO.md#galerie-complète--1-octobre-2026).

Le LLM fournit 4–6 phrases courtes et leurs références de faits, pas des durées audio supposées exactes. Une piste TTS par scène permet des sous-titres par phrase sans alignement mot à mot. Le renderer mesure chaque piste, convertit sa durée en frames avec arrondi supérieur et ajoute les silences nécessaires.

Depuis le 01/10, `VideoCustomization` permet trois styles plein écran (`editorial`, `minimal`, `cinematic`), trois voix françaises Chirp 3 HD (`Aoede`, `Kore`, `Charon`), deux couleurs hexadécimales propres à la vidéo, un mouvement doux et une transition `fade`/`cut`. Aucun défaut n'est injecté dans les JSON historiques. Le manifeste fige `visualStyle`, `photoMotion` et `photoTransition` quand ces réglages existent.

Pour une annonce préparée, `photoOrder` contient 3–12 indices distincts de ses propres photos. La sélection est vérifiée avant réservation, puis les seuls objets retenus sont contrôlés et leur ordre est figé. L'entrée URL anonyme n'accepte pas ces indices, car ses photos ne sont pas encore connues. `POST /api/imports/:id/customize`, propriétaire/origine/idempotence contrôlés, crée une copie privée éditable d'une annonce prête ; source et vidéos existantes restent disponibles. La copie seule ne consomme ni crédit vidéo ni provision d'import. Les nouveaux uploads utilisent les contrôles habituels.

Le brouillon conserve `videoCustomization` et peut contenir une narration incomplète pendant l'édition. La génération exige 4–6 passages de texte simple non vide, au plus 300 caractères chacun, 900 caractères et 75 mots au total. Le texte utilisateur est figé comme `user_provided` et compilé sans rédaction OpenAI. Une durée audio trop longue renvoie un échec explicite, sans réécriture ni synthèse de correction. Le lecteur du panneau est un aperçu visuel indicatif sans nouvelle synthèse ; le montage final est produit à la génération. [Recette et limites](preuves/maintenance/PERSONNALISATION-01-10.md).

La durée vidéo suit l'audio mesuré. Ne pas couper une phrase pour atteindre 30 secondes. Si une narration automatique dépasse la plage cible, raccourcir une seule fois le script et régénérer les pistes nécessaires, dans les limites de coût. Au-delà, rendre un échec explicite. Prix, unités et noms de ville doivent être prononcés correctement dans la recette.

## Conservation proposée

Médias bruts, narrations et vidéos : 30 jours par défaut, avec expiration annoncée avant téléchargement et dans l'historique. Les assets de marque persistent jusqu'à modification ou suppression du compte. La purge combine métadonnées et règles R2, et ne supprime pas les fichiers d'un job actif. Les justificatifs comptables et traces de facturation ont une politique séparée à définir selon les obligations applicables ; ne pas les supprimer avec un simple fichier vidéo.

## Contrat de parcours — sprint 07

`GenerationInput` / `GenerationRequest` : union stricte `{url, subtitlesEnabled?, customization?}` ou `{listingId, subtitlesEnabled?, customization?}` ; l’agence, les droits et les coûts sont déduits côté serveur. `subtitlesEnabled` accepte seulement un booléen : absent signifie activé. Le choix fait partie de l'entrée immuable et de son empreinte d'idempotence, puis du `VideoManifest` serveur. Il masque uniquement les sous-titres de narration ; textes du bien, voix, marque, contact et filigrane restent inchangés. Aucun défaut n'est injecté dans les anciennes entrées ou les anciens manifestes, pour conserver leurs empreintes. `GenerationView` retourne statut/étape/tentative, source `url`/`manual` (ou `null` avant sa résolution), erreur publique, date d’expiration, titre et liens privés de lecture/téléchargement. Aucun objectKey, secret, prompt ou manifeste n’est rendu au client. `GET /api/generations/:id/source-photo` et sa variante d'essai ne servent le premier cliché de l'import qu'après contrôle de propriété du job, de validité de l'import et des métadonnées R2 ; 404 si indisponible. Le curseur de l’historique est revalidé et reste soumis au filtre de l’agence. Voir [GENERATIONS.md](GENERATIONS.md).
