# Ma vitrine

Une agence BienVu peut présenter une sélection de ses biens sur `/agences/[slug]`, avec une fiche par bien sur `/agences/[slug]/biens/[id-public]`. La gestion est dans `/ma-vitrine`, près de Mon agence. Aucun import, rendu, appel IA, abonnement ou débit de crédit n’est déclenché par cette fonctionnalité.

## Parcours et droits

1. Vérifier le brouillon prérempli depuis l’agence existante. Le nom public, l’accent, les contacts, le logo, la couverture et les autres adaptations concernent uniquement la vitrine.
2. Choisir un bien de Mes biens, les photos publiques, leur couverture et éventuellement une vidéo terminée et déverrouillée. Enregistrer la sélection ne publie aucun nouveau média.
3. Ouvrir l’aperçu privé sur ordinateur/mobile et publier la présentation et les sélections enregistrées. Les modifications non enregistrées sont signalées et la navigation demande confirmation.

Le propriétaire et les administrateurs peuvent enregistrer la présentation, publier l’ensemble et mettre hors ligne. Les éditeurs peuvent préparer, publier ou retirer un bien et traiter les demandes. Les lecteurs consultent sans écrire. La suppression d’une demande est réservée au propriétaire et aux administrateurs. Ces rôles utilisent l’adhésion et la sélection d’agence existantes, vérifiées à chaque API.

Le statut de la vitrine est Brouillon, Publiée ou Hors ligne. La présentation publique est un instantané distinct du brouillon. Un changement de slug réserve la nouvelle adresse ; seuls les slugs effectivement publiés peuvent rediriger vers la présentation encore publique. Une URL réservée en brouillon ne donne jamais accès à l’agence.

Explorer et la vitrine gardent leurs états indépendants. La fiche privée du bien propose la publication et le retrait de la vitrine, sans toucher aux actions Explorer ou Éditeur. Après retrait, archivage ou suppression, un bien doit être explicitement sélectionné/publié à nouveau. Un désarchivage ne le republie pas. Les références vendues/louées sont masquées, sauf choix explicite de l’agence.

## Données et médias

Migration additive : `packages/db/migrations/0071_agency_showcases.sql`. Elle ne préremplit ni ne publie aucune donnée existante. Le brouillon est préparé au premier accès authentifié ; aucune seconde agence n’est créée.

La migration ajoute la présentation brouillon/publiée, les réservations de slugs, les sélections de biens, les copies de médias, les demandes et reçus idempotents, les compteurs agrégés et les limites anti-abus. Les biens restent regroupés par le catalogue actuel ; une ancre de source et un UUID public persistent entre les copies de montage et changements de dossier. Les regroupements ne produisent pas plusieurs fiches publiques, et retirer le groupe révoque ses anciennes sélections.

Les photos/vidéos sélectionnées sont copiées dans R2 sous le préfixe privé `agencies/{agency}/showcase/`. Cela évite de dépendre de la durée de rétention du fichier d’import. La copie vidéo utilise un `FixedLengthStream` dans Workers ; le pont de test Node/Miniflare utilise un tampon borné. Le choix d’une vidéo vérifie son propriétaire logique, son état terminé, l’accès au master, le manifeste figé et l’empreinte du fichier. Les essais anonymes réclamés sont vérifiés par leur propriétaire logique avant toute copie depuis leur ancienne agence physique.

Les URLs publiques passent toujours par une API qui revérifie la publication et la sélection du média. Les objets R2 ne sont pas publics ; les identifiants devinés, anciennes URLs, HEAD, Range et `If-None-Match` ne contournent pas un retrait. Les réponses HTML, RSC, redirections, erreurs et médias sont `private, no-store`. L’aperçu utilise les mêmes projections publiques mais des URLs de médias privées ; il reste authentifié et noindex, avec formulaire/statistiques désactivés.

Le prix, les caractéristiques et la description suivent les données actuelles de Mes biens. L’empreinte des faits de la vidéo est comparée à ces données : une vidéo obsolète est masquée, ses liens deviennent inaccessibles et les photos prennent sa place. La gestion indique le problème et renvoie vers les contenus du bien. Une nouvelle vidéo ne remplace jamais automatiquement celle qui a été sélectionnée.

Les adresses précises ne sont rendues publiques que sur choix explicite. DPE/GES et mentions complémentaires sont saisis dans la sélection publique car le modèle d’import actuel ne fournit pas ces champs. Rien n’est inventé : les informations non renseignées sont indiquées sur la fiche. L’agence reste responsable de compléter les mentions applicables à son annonce.

Bornes techniques de cette version : 12 photos sélectionnées par bien, 500 sélections par agence, 50 Mo par vidéo, réserve de copies de 1 Gio par agence, 5 000 demandes conservées par agence. Les logos/couvertures JPEG/PNG sont préparés dans le navigateur à 1 024 pixels maximum puis validés/réencodés côté serveur, avec une charge entrante de 2 Mo maximum. Ce sont des protections de ressources et non des droits commerciaux ; aucun nouveau tarif n’est ajouté. Les copies non référencées depuis plus d’un jour sont collectées par lots de 50 au nettoyage quotidien ; une sélection encore conservée dans un brouillon n’est pas effacée.

## Demandes, notifications et confidentialité

Le formulaire valide nom, email, téléphone facultatif, message et bien public appartenant à cette agence. Il utilise l’origine autorisée, un champ leurre, des limites IP/email et Turnstile avec l’action `showcase_contact`. Les empreintes anti-abus sont protégées par HMAC, sans IP en clair.

Le navigateur garde une clé de demande pour les reprises réseau. Le serveur conserve un reçu idempotent et la demande avant toute notification. Une double soumission ne crée pas deux messages. La suppression d’une demande conserve un reçu sans coordonnées/message pour empêcher qu’un ancien envoi ne la recrée.

La notification réutilise `AUTH_EMAIL`, `AUTH_EMAIL_FROM`, `AUTH_EMAIL_MODE` et `BETTER_AUTH_URL`. Le cron existant traite 10 demandes par passage, avec bail, cinq tentatives au maximum et une limite indépendante de 100 notifications/jour. Une erreur reste visible dans BienVu et peut être relancée. Sans service email configuré, l’interface indique la notification désactivée : elle ne simule aucun envoi réussi. Une notification contient la référence, les coordonnées et le message nécessaires à l’agence, et le lien vers sa boîte de demandes privée.

Comme tout envoi externe sans transaction distribuée, une interruption entre acceptation du transport et confirmation D1 peut produire une notification répétée ; elle ne crée pas une seconde demande. La réussite du transport ne prouve pas la réception dans la boîte du destinataire.

Les demandes et reçus sont purgés après 180 jours ; les compteurs agrégés après 90 jours ; les clés d’événement après deux jours ; les limites expirées au nettoyage quotidien. Le formulaire explique l’usage des coordonnées, sans inscription commerciale automatique. La politique de confidentialité comporte la section `#vitrines`.

Les statistiques 7/30 jours utilisent de vrais événements : pages et clics après consentement, demandes effectivement enregistrées indépendamment d’un envoi d’email. Les membres de l’agence, aperçus et robots reconnus sont exclus des visites. Les pages restent visibles dans la mesure PostHog sous des chemins normalisés. L’enregistrement de sessions est désactivé pour les vitrines et leur gestion ; les formulaires/demandes portent aussi les marqueurs d’exclusion de capture. Aucun message ni coordonnée de prospect n’est une propriété analytics.

## Référencement et performance

Les pages agence/bien sont rendues côté serveur, avec titre, description, canonique, Open Graph et données structurées. Les médias ne démarrent pas seuls : affiches, photos progressives, vidéo `preload=none`, pagination de 12 biens et au maximum six mises en avant. La navigation visiteur ne comporte pas la sidebar privée. Le catalogue filtre transaction, type, localisation, budget et pièces côté serveur.

Les pages publiées, encore accessibles, rejoignent le sitemap existant. Les filtres sont noindex, les adresses canoniques restent propres et les aperçus privés sont exclus. `robots.txt` distingue `/agence$` (privé) de `/agences/` (public). La construction du sitemap borne la lecture à 1 000 agences ; au-delà, il faudra répartir les vitrines en sitemaps séparés, également pour respecter la limite XML de 50 000 URLs. Le choix `no-store` privilégie la révocation immédiate ; un cache ultérieur devra être conditionné à une version de publication vérifiée côté serveur.

## Galerie vidéo et configuration

Le design du 11/10 reprend la référence fournie par Alex : couverture panoramique, identité et logo circulaire, boutons de contact, navigation vente/location, filtres détaillés dépliables et grandes cartes verticales. La première page non filtrée remonte les biens à la une et dédoublonne leurs cartes avec le catalogue. Les filtres et la pagination utilisent les routes serveur existantes. Les fiches conservent galerie, caractéristiques, disponibilité, énergie et mentions déclarées.

Une vidéo de carte est attachée et démarrée uniquement après un clic volontaire. Elle conserve ses proportions, avec commandes natives, fermeture et lien vers la fiche. Une lecture met les autres vidéos en pause ; une carte sortie de l’écran se met également en pause. Les photos restent chargées progressivement. Seuls les champs utiles à une carte sont envoyés à son composant interactif, sans recopier descriptions, mentions et galeries complètes dans ses propriétés.

Le cœur conserve jusqu’à 500 identifiants publics par vitrine dans le navigateur de l’appareil, sur action du visiteur. Ces favoris restent locaux ; leur absence de stockage persistant est signalée et le choix reste utilisable pendant la visite. Le formulaire de contact se déplie depuis les boutons de projet/message et les liens directs `#contact`, en conservant réception, protection anti-spam et demandes liées au bien.

La gestion présente cinq cartes de configuration : identité/adresse, couverture/logo/couleur, présentation/secteurs, coordonnées/liens, disponibilité/notifications. Un aperçu de l’identité suit les saisies, avec les médias déjà sélectionnés ; la prévisualisation complète ouvre toujours le dernier brouillon enregistré. Enregistrement et publication restent deux actions distinctes, avec avertissement des modifications non enregistrées. Les rubriques Biens, Demandes et Statistiques conservent leurs fonctions et leurs autorisations. Aucune migration, dépendance ni clé supplémentaire pour cette refonte.

Refonte déployée le **11/10/2026**, Worker **`596b9e6d-0c0e-4c84-8331-e93aafcc77ae`** à **100 %**. Validation aux quatre largeurs 1536/1092/390/320 px, 11 tests ciblés, recette complète du Worker local avec deux agences, 17 contrôles HTTP distants et 28 fichiers publiés comparés au build. Preuves privées : `evidence/local/showcase-redesign/`. Pipeline, importer, renderer, contrats de publication et protections conservés.

## Configuration et mise en service

Aucune dépendance ni clé de fournisseur supplémentaire. Réutiliser les bindings D1 `DB`, R2 `MEDIA`, l’authentification et les crons existants. Le formulaire demande les clés Turnstile déjà présentes (`TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY`), avec le hostname du site autorisé. Sans ces clés il reste clairement indisponible, avec les coordonnées publiques de l’agence accessibles. Le mail est facultatif ; les demandes dans BienVu ne dépendent pas de sa configuration.

La migration 0071 doit être appliquée **avant** la publication du nouveau Worker web : le sitemap, les retraits et les crons utilisent ses tables. L’ancien Worker peut fonctionner avec ces tables supplémentaires. Il n’y a pas de changement du pipeline, du renderer, de Stripe ou des crédits. Pour revenir à la version antérieure, retirer d’abord les publications depuis la gestion et repasser sur l’ancien Worker ; conserver les tables et les copies afin de ne pas perdre les demandes. Ne pas supprimer la migration en guise de rollback de données.

Mise en production autorisée par Alex le **11/10/2026** : migration additive **0071** appliquée avant le Worker web **`0279ec88-e0e0-4d9a-b2e5-06fd427e6489`**, déployé à **100 %** sur `bienvu.online`. Le point de restauration D1 et la version web précédente **`021dc80e-9968-4730-ab48-2fbaf4855080`** sont conservés dans les preuves privées. Les données métier historiques et les **60 bindings** web sont conservés, hors métadonnées de release/sourcemaps actualisées. Pipeline, importer et renderer quatre cœurs/parallélisme quatre inchangés. Aucune vitrine ou annonce n’a été publiée automatiquement.

## Vérification reproductible

```sh
pnpm check
pnpm --filter @bienvu/web build:worker
node --import tsx scripts/probe-showcase.mjs
```

`tests/showcases.test.ts` couvre publication, instantanés, isolation, rôles, conflits, sélection de médias, prix obsolètes, retrait/archivage/suppression, liens directs, sitemap, consentement, réception idempotente et notification échouée/absente. Les suites Mon agence, Mes biens, équipes, Explorer et Éditeur restent dans la batterie existante.

La recette navigateur lance le véritable Worker construit avec Next/OpenNext, D1 et R2 **locaux et isolés**. Elle utilise des identités synthétiques et les images de démonstration déjà présentes dans le dépôt. Elle parcourt gestion → sélection → aperçu → publication → galerie anonyme → fiche → demande → traitement → mise hors ligne, sur ordinateur et mobile. Pour tester le formulaire sans résoudre un CAPTCHA humain, sa soumission passe par un adaptateur de recette qui appelle le service de contact réel avec une réponse Siteverify simulée ; la demande est enregistrée dans la même D1 locale. Cet adaptateur existe uniquement dans le script de test, jamais dans l’application. Les tests du service vérifient les refus d’actions/tokens incorrects. Les événements navigateur consentis sont envoyés à la véritable API locale et alimentent les compteurs. Aucun rendu fournisseur, email réel, compte client, donnée de production ou dépense ne sont utilisés.

Preuves privées ignorées : `evidence/local/showcase/` pour la recette et `evidence/local/showcase-deployment/` pour la mise en production. **17 contrôles HTTP** sur le domaine ont vérifié les pages, le sitemap, les redirections de l’aperçu privé, les refus anonymes des API et l’inaccessibilité des vitrines/médias non publiés. **27 fichiers CSS/JavaScript** publiés correspondent au build par SHA-256 ; les sourcemaps privées Next/Worker sont envoyées à PostHog. Les clés Turnstile et le service d’email existants sont conservés, mais un contrôle Turnstile humain et la réception d’une notification réelle restent à confirmer lors du premier essai. Aucun email de recette n’a été envoyé et aucun compte ou contenu synthétique n’a été créé en production.
