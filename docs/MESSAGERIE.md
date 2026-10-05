# Messagerie du superadmin

`/admin?view=mailbox` regroupe les emails reçus à `contact@bienvu.online`, les réponses et les nouveaux messages. L’accès exige une session vérifiée correspondant à `SUPER_ADMIN_EMAIL` ; les téléchargements de pièces jointes et d’originaux appliquent le même contrôle.

## Réception

Le Worker `apps/mail` exporte un gestionnaire `email()` et utilise les mêmes bindings D1 `DB` et R2 privé `MEDIA` que le site. Une règle Email Routing associe **uniquement** `contact@bienvu.online` à ce Worker. Le domaine doit avoir Email Routing activé et ses enregistrements MX configurés. Le Worker n’expose aucune route HTTP de réception publique.

Les messages originaux et les pièces jointes sont stockés sous `mailbox/` dans R2. D1 conserve les conversations, le texte, les états et le journal des actions. Les emails HTML sont convertis en texte ; le contenu actif et les images distantes ne sont pas affichés. Limites de réception : 25 Mio par email, 64 pièces jointes ; un texte dépassant 100 000 caractères reste disponible dans l’original téléchargé.

Les identifiants RFC `Message-ID`, `In-Reply-To` et `References` regroupent les réponses d’un même correspondant. Pour les clients qui omettent les références, une réponse au même objet peut rejoindre la conversation récente du même expéditeur. Les livraisons répétées d’un message sont dédupliquées. Une réponse rouvre une conversation archivée ; les indésirables restent classés dans leur dossier.

## Envoi

Configurer un binding **`SUPPORT_EMAIL`** autorisant `contact@bienvu.online`, ainsi que `MAILBOX_ADDRESS=contact@bienvu.online` et `MAILBOX_ENABLED=true` dans le Worker web. Le binding `AUTH_EMAIL` et l’expéditeur des confirmations d’inscription sont indépendants. Le domaine doit déjà être activé dans Email Sending.

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

Appliquer `0045_mailbox.sql` à la base partagée avant d’activer la réception ou le site. Les configurations de production restent dans les fichiers `wrangler.staging*.jsonc` ignorés par Git ; les configurations suivies utilisent uniquement des ressources locales et un envoi simulé.
