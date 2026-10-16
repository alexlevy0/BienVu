# Notifications navigateur de fin de génération

L’invitation apparaît après l’acceptation d’une génération, dans l’accueil/studio, les essais URL/manuels et les exports de l’Éditeur. Elle ne bloque ni l’admission ni l’affichage du résultat. « Plus tard » conserve le refus de l’invitation sur cet appareil ; le menu du compte et le pied de page permettent de revenir aux réglages.

Le service worker et la clé publique sont préparés sans demander de permission. Seul le clic « Activer les notifications » appelle `PushManager.subscribe`, dans le geste utilisateur. Un refus natif n’est jamais redemandé automatiquement. Les appareils sans API restent utilisables ; iPhone/iPad hors application ajoutée à l’écran d’accueil disposent d’une explication adaptée. Le manifeste permet l’ouverture autonome, sans cache hors ligne des pages ou vidéos privées.

## Livraison et confidentialité

La migration additive `0078_browser_notifications.sql` conserve les appareils et les suivis explicites de vidéos. Une capacité aléatoire de navigateur et l’identité vérifiée côté serveur protègent l’abonnement. Le serveur contrôle la propriété du job, les membres d’agence et la session anonyme, y compris lors de l’envoi. Changer de compte retire les suivis précédents ; désactiver ou se déconnecter retire l’abonnement local et la capacité serveur.

Après validation et publication atomique du MP4, le pipeline tente l’envoi. Un incident de notification ne fait jamais échouer la vidéo. Le cron web existant reprend les livraisons en attente : cinq tentatives bornées, baux atomiques, retrait des endpoints 404/410. Seuls des endpoints HTTPS des services push Chrome/Firefox/Apple/Windows sont acceptés ; aucune redirection n’est suivie.

Les messages utilisent `aes128gcm` (RFC 8291) et VAPID (RFC 8292), via `@block65/webcrypto-web-push` 2.0.0, compatible Web Crypto/Workers. Le contenu est générique : ni titre privé ni adresse d’annonce. Le lien `/historique/<job>` exige toujours les droits normaux du compte/de l’essai. Un identifiant unique, un tag natif et une transaction IndexedDB empêchent les notifications répétées entre onglets et lors d’une reprise. TTL transport : une heure. Suivis serveur : vingt-quatre heures ; dédoublonnage local : sept jours ; appareils : quatre-vingt-dix jours renouvelables et huit par identité. Purge quotidienne.

L’activation ajoute un cookie de capacité `HttpOnly`, sécurisé et limité au site. Pour les générations suivantes, les routes d’admission enregistrent le suivi avec l’identité serveur avant de répondre : fermer immédiatement l’onglet ne fait pas perdre la notification. La première activation rattache aussi la génération qui a déclenché l’invitation.

## Configuration

Les deux Workers web et génération utilisent le même jeu de clés :

- `WEB_PUSH_ENABLED=true` ; les configurations locales restent `false` par défaut.
- `WEB_PUSH_PUBLIC_KEY` : clé publique P-256 non compressée, base64url.
- `WEB_PUSH_PRIVATE_KEY` : secret VAPID privé, jamais dans Git, un argument de commande ou le navigateur.
- `WEB_PUSH_SUBJECT=mailto:contact@bienvu.online`.

Générer une paire P-256 cryptographique, conserver le secret dans un fichier local ignoré de permissions 0600, puis l’injecter par entrée standard ou fichier protégé avec Wrangler. Ne pas régénérer les clés lors d’un redéploiement : les abonnements existants sont liés à la clé publique. Appliquer la migration avant l’activation, préserver domaines, bindings, budgets et configurations de rendu. Un retour arrière peut désactiver `WEB_PUSH_ENABLED` sans supprimer les données.

## Vérifications

`tests/browser-notifications.test.ts` exerce les migrations D1 réelles locales, l’isolation des identités, les essais réclamés, les révocations, le contrôle d’origine, les capacités de désactivation, les endpoints autorisés, les livraisons concurrentes, les reprises et les endpoints expirés. Il déchiffre réellement les messages avec une clé de destinataire indépendante et vérifie la signature VAPID. Les recettes navigateur locales simulent l’autorisation native et le transport, sans changer les permissions système ni créer de génération payante.

Les restrictions du navigateur, les réglages système, les modes de concentration et la connectivité peuvent retarder ou empêcher une notification ; le résultat reste disponible dans Mes biens. Une permission native réelle et la réception sur un appareil personnel doivent être confirmées depuis cet appareil.
