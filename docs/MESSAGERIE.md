# Messageries des administrateurs

`/admin?view=mailbox` permet de recevoir, répondre et rédiger des emails. Le superadmin (`SUPER_ADMIN_EMAIL`) choisit entre `contact@bienvu.online` et `alex@bienvu.online`. L’admin (`ADMIN_EMAIL=vonlanthen.greg@gmail.com`) utilise uniquement `greg@bienvu.online` ; son compte doit être vérifié. Greg dispose aussi des comptes, agences et vidéos en lecture seule, avec recherche, filtres, export et lecture des vidéos. Les réglages techniques, budgets, crédits et fournisseurs restent réservés au superadmin.

Les listes, compteurs, recherches, conversations, pièces jointes, originaux, aperçus HTML, uploads, relances et réponses sont filtrés côté serveur par boîte. Une référence RFC ne peut regrouper des messages de deux boîtes ; les fichiers préparés pour une boîte ne peuvent être envoyés depuis une autre. Les brouillons de rédaction restent conservés lors d’un changement de boîte dans la session d’interface. Les messages historiques restent dans `contact`.

## Réception

Le Worker `apps/mail` exporte un gestionnaire `email()` et utilise les mêmes bindings D1 `DB` et R2 privé `MEDIA` que le site. Trois règles Email Routing distinctes associent `contact@bienvu.online`, `alex@bienvu.online` et `greg@bienvu.online` à ce Worker. Définir `MAILBOX_ADDRESSES` comme tableau JSON de ces adresses dans les Workers mail et web. Le domaine doit avoir Email Routing activé et ses enregistrements MX configurés. Le Worker n’expose aucune route HTTP de réception publique.

Les messages originaux et les pièces jointes sont stockés sous `mailbox/` dans R2. D1 conserve les conversations, le texte, les états et le journal des actions. Les emails proposent un aperçu HTML et une variante texte avec liens cliquables. L’aperçu relit l’original privé : il fonctionne aussi sur les emails déjà reçus. Le HTML est nettoyé avec `sanitize-html`, puis placé dans une iframe sans scripts ni origine partagée. Les liens et boutons s’ouvrent dans un nouvel onglet ; les tableaux et styles autorisés sont conservés. Scripts, formulaires, cadres, gestionnaires d’événements et images distantes sont supprimés. Les images intégrées CID raster sont admises sous limites de taille. Limites de réception : 25 Mio par email, 64 pièces jointes ; un texte dépassant 100 000 caractères reste disponible dans l’original téléchargé.

Les identifiants RFC `Message-ID`, `In-Reply-To` et `References` regroupent les réponses d’un même correspondant. Pour les clients qui omettent les références, une réponse au même objet peut rejoindre la conversation récente du même expéditeur. Les livraisons répétées d’un message sont dédupliquées. Une réponse rouvre une conversation archivée ; les indésirables restent classés dans leur dossier.

## Envoi

Configurer un binding **`SUPPORT_EMAIL`** autorisant les trois adresses, ainsi que `MAILBOX_ADDRESS=contact@bienvu.online`, `MAILBOX_ADDRESSES` et `MAILBOX_ENABLED=true` dans le Worker web. Chaque message conserve son expéditeur ; le cron respecte cette adresse même lorsqu’il reprend plusieurs boîtes. Le binding `AUTH_EMAIL` et l’expéditeur des confirmations d’inscription sont indépendants. Le domaine doit déjà être activé dans Email Sending.

Chaque envoi est d’abord enregistré dans D1 avec un identifiant d’idempotence. Le traitement démarre en arrière-plan ; le cron existant à chaque minute reprend la file si nécessaire. Le statut « Envoyé » signifie que Cloudflare a accepté l’envoi, pas que le destinataire l’a lu. Une erreur dont l’acceptation est incertaine n’entraîne pas de nouvel envoi automatique. Seuls les refus explicites permettent une relance manuelle, limitée à trois tentatives.

Limites : 8 pièces jointes et 3 Mio au total, 20 000 caractères de texte, 10 nouveaux messages par minute et 100 par jour. Les fichiers ajoutés puis abandonnés sont nettoyés après 24 heures. Les messages et leurs pièces jointes ne sont pas concernés par ce nettoyage.

## Vérification locale

Les tests `tests/mailbox.test.ts` utilisent des bases D1 et R2 isolées et un transport d’envoi simulé : réception MIME, HTML, accès et origine, téléchargements, pagination, classement, concurrence de lecture, déduplication, envoi, relances et limites.

```sh
pnpm --filter @bienvu/mail typegen
pnpm exec tsx --test tests/mailbox.test.ts
pnpm --filter @bienvu/mail exec wrangler deploy --dry-run
```

Avec `wrangler dev`, une réception simulée utilise `POST /cdn-cgi/local/email?from=client%40example.com&to=contact%40bienvu.online` et un corps RFC 5322 incluant `Message-ID`. Aucun email n’est envoyé à un destinataire réel par ces tests.

Appliquer `0045_mailbox.sql`, puis `0066_staff_mailboxes.sql` à la base partagée avant d’activer la réception ou le site. Les configurations de production restent dans les fichiers `wrangler.staging*.jsonc` ignorés par Git ; les configurations suivies utilisent uniquement des ressources locales et un envoi simulé.

La recette `node --import tsx scripts/probe-mailboxes-ui.mjs` teste les composants réels sur ordinateur et mobile, les deux rôles, le changement de boîte, l’isolation du HTML et l’ouverture effective d’un bouton dans un nouvel onglet. Réponses HTTP uniquement locales, sans message envoyé.

## Candidatures au programme partenaires

La page publique `/partenaires` propose un formulaire sans compte : nom, e-mail professionnel et activité. La candidature crée une conversation non lue avec l’objet « Candidature partenaire — Nom ». Son texte indique sa provenance et précise que l’adresse déclarée n’est pas vérifiée. Aucun e-mail n’est envoyé automatiquement : une réponse depuis la Messagerie utilise le parcours d’envoi existant. L’acceptation du partenaire et l’attribution des clients restent manuelles ; cette première version ne calcule pas les commissions réelles et ne déclenche pas de versements.

`GET /api/partners/applications` expose uniquement la disponibilité du formulaire et la clé publique Turnstile. Le POST contrôle l’origine, un corps JSON borné, les champs autorisés, une clé d’idempotence et une preuve Turnstile liée à l’action `partner_application` et au domaine BienVu. Les clés et bindings Turnstile de l’essai existant sont réutilisés, sans dépendre de l’activation des générations anonymes.

Appliquer `0054_partner_applications.sql` avant de déployer ce formulaire. Le fil, le message, son événement et le reçu d’idempotence sont enregistrés dans un même batch D1. Un rejet annule l’ensemble ; la répétition d’une intention acceptée retrouve sa confirmation sans créer de doublon. Les limites sont de 3 candidatures par IP par heure, 3 par e-mail par jour et 100 au total par jour ; 30 tentatives par IP par heure peuvent atteindre Siteverify. Seules des empreintes HMAC sont conservées pour ces contrôles. Le nettoyage quotidien efface les empreintes anti-abus après 48 heures et conserve les échanges et la déduplication, jusqu’à une demande de suppression.

```sh
pnpm exec tsx --test tests/partners.test.ts tests/trial-api.test.ts tests/mailbox.test.ts
pnpm probe:partners:ui
```

La recette UI charge les composants réels avec des réponses HTTP et un contrôle anti-robot simulés exclusivement en local. Le dernier essai de réception sur le site public doit utiliser une vérification Turnstile réelle ; aucun contournement ni clé de test en production n’est prévu.
