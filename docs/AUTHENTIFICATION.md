# Comptes et identité d’agence — sprint 02

## Ce qui fonctionne localement

Better Auth **1.7.6** utilise le binding D1 natif, sans ORM supplémentaire. Les sessions, l’agence unique par propriétaire, les réglages et les logos privés fonctionnent dans le build OpenNext exécuté par workerd. Les tests injectent des identités synthétiques dans D1 : **ils ne prouvent pas une connexion réussie à Google**. Aucun compte Google réel n’a été utilisé pendant cette tranche.

**Alex a demandé le 28/09/2026 la connexion e-mail/mot de passe en plus de Google.** Better Auth/D1 reste le choix technique retenu. L’inscription, la confirmation, la connexion et la réinitialisation sont implémentées. Le transport est le binding Cloudflare Email Service. Après les essais locaux, Alex a activé Workers Paid et acheté `bienvu.online` ; la recette distante décrite ci-dessous utilise ces ressources.

## Parcours e-mail et essais locaux

### Bypass de vérification pour le développement

Alex a demandé le 28/09/2026 un drapeau pour inscrire un compte déjà vérifié et le connecter immédiatement. Dans `apps/web/.dev.vars` :

```dotenv
AUTH_EMAIL_VERIFICATION_BYPASS=true
```

Redémarrer `pnpm preview` après modification. Ce réglage est **activé sur le poste local pour les essais** ; la valeur versionnée dans `wrangler.jsonc` et le modèle `.dev.vars.example` reste `false`.

- `true` : l’inscription e-mail marque `emailVerified=1`, n’envoie aucun message de confirmation, pose la session puis ouvre `/agence`. Aucun fournisseur d’e-mails n’est nécessaire pour cette inscription.
- Un compte local déjà en attente est marqué vérifié lors d’une connexion avec **son bon mot de passe**. Une mauvaise saisie ou une réinscription ne valide pas le compte et ne remplace jamais son mot de passe.
- `false` ou variable absente : le parcours normal avec confirmation reste obligatoire pour les nouvelles inscriptions. Seule la chaîne exacte `true` active l’option. Les comptes déjà marqués vérifiés le restent ; il n’y a pas de modification rétroactive de la base.

Le drapeau est exclusivement serveur : aucun champ du formulaire ne peut l’activer. Il exige `PROBE_MODE=local`, une origine HTTP exacte `localhost` ou `127.0.0.1` et une requête sur cette même origine. Il est refusé sur une origine publique, même si une configuration locale y était copiée ; la préparation staging impose `false`. La vérification d’identité Google, le contrôle du mot de passe, la récupération, l’isolation des agences et les quotas restent appliqués.

Pour vérifier le bypass sous workerd, avec le serveur configuré à `true` et son journal local enregistré :

```sh
BIENVU_PREVIEW_LOG=evidence/local/sprint-02/bypass-preview.log pnpm probe:auth-email --bypass
```

Cette variante crée et nettoie un compte synthétique, contrôle le champ D1, le cookie, l’agence et l’absence de mail. Son rapport est `evidence/local/sprint-02/bypass-workerd.json`. La sonde normale décrite ci-dessous exige de remettre le drapeau à `false`, puis de redémarrer le serveur. Aucun de ces essais ne prouve une adresse e-mail réelle.

### Parcours normal (`false`)

Sur `/connexion`, choisir « Créer un compte », puis saisir e-mail et mot de passe (12 à 128 caractères). Aucun accès à l’agence avant confirmation. Après confirmation, se connecter avec le mot de passe. « Renvoyer l’e-mail de confirmation » permet de reprendre après un message perdu ; « Mot de passe oublié » permet de réinitialiser le secret. Un compte Google existant peut définir un mot de passe par ce même lien, sans recréer l’agence.

Les mots de passe sont hachés par le scrypt de Better Auth (sel aléatoire, paramètres de la version épinglée). Aucun mot de passe en clair en base ou dans les journaux. Les messages de création/récupération ne révèlent pas si une adresse existe. Le lien de confirmation dure 60 minutes, sans connexion automatique ; le lien de reset dure 30 minutes, est consommé une seule fois et révoque toutes les sessions précédentes. Le jeton de reset est dans le fragment du lien, effacé de l’URL par le formulaire et conservé en mémoire ; recharger ce formulaire impose de rouvrir le lien reçu. Les erreurs de lien permettent d’en demander un nouveau.

`AUTH_EMAIL_MODE=local`, `AUTH_EMAIL_FROM=connexion@bienvu.example` et le binding `AUTH_EMAIL` avec `remote:false` sont dans la configuration locale. **Aucun e-mail réel n’est envoyé.** Le simulateur Wrangler affiche un chemin `Text: …/email-text/….txt` : ouvrir ce fichier local pour cliquer le lien de confirmation ou de reset. Ne jamais versionner ces messages, leurs liens ou le journal brut du simulateur. Le mode local est refusé sur une origine publique.

Pour la sonde reproductible, lancer le serveur avec sa sortie dans un fichier ignoré :

```sh
mkdir -p evidence/local/sprint-02
pnpm preview > evidence/local/sprint-02/email-preview.log 2>&1
# Dans un autre terminal :
BIENVU_PREVIEW_LOG=evidence/local/sprint-02/email-preview.log pnpm probe:auth-email
```

La sonde crée un compte via HTTP (pas d’utilisateur préinséré), lit les messages **simulés**, vérifie le hachage dans workerd, le refus avant confirmation, la persistance, le reset et la déconnexion, puis supprime son compte/agence. Le rapport `email-workerd.json` ne contient ni adresse, ni mot de passe, ni lien. Les tests Node/D1 capturent quant à eux le transport en mémoire. Aucune de ces preuves ne valide la réception dans une vraie messagerie ni les quotas CPU distants.

## Reproduire les vérifications sans accès externe

Depuis la racine du dépôt :

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm --filter @bienvu/web typegen
pnpm db:migrate
pnpm check
pnpm build:web
pnpm preview
```

Dans un autre terminal, `pnpm probe:accounts`. La sonde vise exclusivement `http://localhost:8787`, crée deux comptes synthétiques, teste les API, puis supprime ses sessions, agences et fichiers R2. Le rapport expurgé est dans `evidence/local/sprint-02/accounts-workerd.json`. `pnpm probe:foundations` et `pnpm probe:web` restent applicables. `pnpm dev` seul n’est pas la recette des bindings ni des comptes.

Pour une inspection visuelle authentifiée, sans ajouter une porte d’entrée de test au Worker :

```sh
pnpm probe:accounts --keep-fixtures
node scripts/open-local-fixture.mjs
```

Ouvrir `http://localhost:8790/` dans la minute. Le serveur opérateur, lié seulement à localhost, dépose le cookie signé d’un compte synthétique, redirige vers le formulaire et s’arrête après cette unique visite. Il n’est ni importé ni déployé dans l’application. Le cookie dure une heure et n’accorde aucun droit de génération. Le fichier contenant les fixtures est ignoré par Git et créé avec les droits 0600. Après inspection : se déconnecter, puis `pnpm probe:accounts --cleanup`. Le script ne permet pas de cibler un environnement distant.

## Brancher Google pour la vérification réelle

Créer/configurer dans la console Google un client OAuth de type **application Web** réservé au développement. Configurer l’écran de consentement et ses utilisateurs de test. BienVu ne demande que l’identité, l’adresse e-mail et le profil, sans accès à Drive ou Gmail. Google documente la création du client et les URI locales dans son [guide OAuth serveur](https://developers.google.com/identity/protocols/oauth2/web-server).

Pour la recette workerd locale, utiliser exactement :

| Réglage | Valeur |
|---|---|
| Origine JavaScript | `http://localhost:8787` |
| URI de redirection | `http://localhost:8787/api/auth/callback/google` |
| `BETTER_AUTH_URL` | `http://localhost:8787` |

Dans **`apps/web/.dev.vars`**, compléter `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`. Conserver le `BETTER_AUTH_SECRET` aléatoire créé par `pnpm setup:local` ; minimum 32 caractères. Ne pas mettre ces secrets dans une variable `NEXT_PUBLIC_*`, une commande enregistrée dans l’historique, Git ou une conversation. Le modèle sans valeurs sensibles est `.dev.vars.example`. Redémarrer `pnpm preview` après modification. Le bouton Google reste désactivé quand ses identifiants sont absents. Le callback doit correspondre au client déclaré ; voir [l’intégration Google de Better Auth](https://better-auth.com/docs/authentication/google).

La recette restante doit utiliser deux comptes de test distincts : connexion et consentement, retour `/agence`, rechargement, changement d’identité, déconnexion, reconnexion avec la même agence et refus d’accès au logo de l’autre. Vérifier aussi annulation du consentement, callback rejoué, état absent/cookie absent et absence de jetons dans réponses/journaux. Ne pas conserver de codes OAuth, cookies ni captures contenant des données personnelles dans les preuves versionnées.

## Staging, après reprise autorisée des essais distants

**Recette réelle du 28/09/2026 validée pour le parcours e-mail.** Alex a activé Workers Paid, acheté `bienvu.online` pour 4,99 USD et désigné sa boîte personnelle comme destinataire des tests. Le domaine est actif dans le compte Cloudflare. L'expéditeur `connexion@bienvu.online` est configuré ; les trois MX sur `cf-bounce`, SPF, DKIM et DMARC ont été vérifiés directement sur les deux serveurs faisant autorité. Le contrôle initial via le résolveur local renvoyait encore `ENOTFOUND` : ce résultat ne prouvait pas l'absence de DNS. L'import manuel proposé ensuite a signalé des doublons et des MX gérés automatiquement ; aucune désactivation d'Email Routing n'est nécessaire. Preuve de configuration (`docs/preuves/sprint-02/email-domain-setup.json`).

Le précontrôle sans domaine (`docs/preuves/sprint-02/email-remote-preflight.json`) reste une preuve historique antérieure à l'achat. Le fichier DNS (`docs/preuves/sprint-02/bienvu.online-email-dns.txt`) est un relevé public daté, **à ne pas réimporter sur la zone désormais configurée**. Après une rotation DKIM, relire les valeurs actuelles auprès de Cloudflare.

Le Worker existant `bienvu-web-probe-staging` héberge maintenant le parcours de comptes sur [son adresse de test](https://bienvu-web-probe-staging.alexlevy0.workers.dev/connexion). Version déployée : `84a0f420-90bc-4c34-89fc-fc72b3ebc1bf`. D1 `bienvu-s00-staging` et R2 privé `bienvu-s00-private` sont conservés. Les migrations `0001` à `0008` sont appliquées ; les imports et les générations restent désactivés. Le site n'a pas été rattaché à la racine `bienvu.online` dans cette recette d'envoi.

Le binding d'envoi est restreint à **un expéditeur et au seul destinataire confirmé**. Cette configuration de test ne permet pas l'ouverture des inscriptions au public. `AUTH_EMAIL_VERIFICATION_BYPASS=false` est imposé en staging ; le bypass local demandé par Alex reste actif uniquement sur le poste. Un secret Better Auth distinct du local a été créé, stocké avec les droits 0600 hors Git et transmis avec le déploiement. Les adresses personnelles, mots de passe, cookies et liens reçus restent hors des preuves versionnées.

Les deux messages ont été reçus **en boîte principale**, avec clic de confirmation et changement de mot de passe effectués par Alex. Cloudflare rapporte deux événements `delivered` et deux messages consommés. La connexion, les cookies sécurisés, le refus de l'ancien mot de passe et de l'ancienne session, ainsi que la conservation de l'agence sont validés. [Rapport de la recette réelle](preuves/sprint-02/EMAIL-CLOUDFLARE.md).

### Préparer seulement le web

`scripts/prepare-staging.mjs` accepte désormais `BIENVU_STAGING_TARGET=web` pour préserver les configurations du navigateur et du renderer en pause. Les paramètres suivants sont nécessaires à une recette e-mail bornée :

```sh
BIENVU_STAGING_TARGET=web \
BIENVU_D1_ID=0219384e-d439-4421-840e-32c551afdb0d \
BIENVU_WORKERS_PLAN=paid \
BIENVU_WEB_ORIGIN=https://bienvu-web-probe-staging.alexlevy0.workers.dev \
BIENVU_AUTH_EMAIL_FROM=connexion@bienvu.online \
BIENVU_AUTH_EMAIL_TO='<adresse autorisée>' \
node scripts/prepare-staging.mjs
```

Remplacer le destinataire par l'adresse confirmée, sans l'enregistrer dans Git. `BIENVU_AUTH_EMAIL_TO` est optionnel pour une configuration future ouverte, mais obligatoire pour la sonde distante bornée. Sans expéditeur, le script désactive les mails ; sans origine HTTPS exacte, l'authentification reste fermée. Le mode Paid et l'adresse d'expéditeur sont validés. `send_email.remote` n'est pas copié dans le déploiement.

```sh
pnpm build:web
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --dry-run
pnpm exec wrangler d1 migrations apply DB --remote --config apps/web/wrangler.staging.jsonc
pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --secrets-file apps/web/.dev.vars.staging
```

Ces commandes modifient le staging lors des deux dernières étapes. Le fichier de secrets doit contenir le secret d'authentification de staging et le jeton opérateur déjà existant, jamais de valeur locale copiée. Il est ignoré par Git. La préparation de configuration ne déploie rien à elle seule.

**Compatibilité D1 constatée :** le premier passage distant de `0006` échouait avec `incomplete input`, sans appliquer partiellement cette migration. Les gardes des triggers `0006`–`0008` utilisent maintenant `SELECT RAISE(...) WHERE ...` au lieu de `SELECT CASE WHEN ... THEN RAISE(...) END`. Le comportement des quotas et de la publication est conservé et testé localement ; la nouvelle application distante réussit. Les versions locales déjà appliquées avaient la même règle métier ; aucune réinitialisation de base effectuée.

### Exécuter la recette réelle, en deux messages

La sonde `scripts/probe-auth-email-remote.mjs` est séparée de la sonde locale. Elle vise uniquement ce Worker de staging, exige le destinataire unique du binding et refuse de remplacer un compte existant. Elle ne modifie jamais directement `emailVerified` en D1. La confirmation doit venir du message réellement reçu ; Alex choisit le mot de passe final dans le formulaire reçu, sans le communiquer à l'agent.

```sh
# Une seule fois, avec l'adresse déjà autorisée dans le binding :
BIENVU_AUTH_EMAIL_TO='<adresse autorisée>' node scripts/probe-auth-email-remote.mjs start
# Lecture de l'état sans nouvel envoi :
node scripts/probe-auth-email-remote.mjs status
# Après ouverture humaine du lien de confirmation : connexion de recette,
# puis un seul message de récupération pour choisir le mot de passe final.
node scripts/probe-auth-email-remote.mjs confirmed
# Après le changement de mot de passe par Alex :
node scripts/probe-auth-email-remote.mjs reset-done
```

`start` ne doit pas être relancé pour diagnostiquer une non-réception. Le nombre de demandes est inscrit avant chaque envoi ; aucun retry automatique. Le script contrôle l'absence de session à l'inscription, le hachage salé, le refus avant confirmation, puis la connexion et le cookie `Secure; HttpOnly; SameSite=Lax`, l'agence, la révocation de l'ancien cookie et le refus de l'ancien mot de passe après reset. Le compte et son agence sont conservés pour Alex. Le mot de passe provisoire et le cookie de recette sont retirés du fichier opérateur à `reset-done`.

L'état privé est `evidence/remote/auth-email/credentials.json` (0600, ignoré). Le rapport expurgé est `auth-flow.json` dans le même dossier. Les traces de recette excluent les corps, en-têtes, paramètres d'URL et détails d'erreurs du fournisseur. La réception en boîte principale/spam et la reconnexion avec le mot de passe choisi demandent le retour d'Alex ; une réponse HTTP 200 ou l'acceptation par le transport ne les prouve pas.

### Limites qui restent distinctes de l'envoi e-mail

Google reste désactivé faute de client OAuth. Le callback distant à déclarer ultérieurement sera l'origine HTTPS retenue + `/api/auth/callback/google`. Consentement Google, liaison Google ↔ mot de passe, deux propriétaires réels et recette distante complète des logos restent à faire. Expiration et replay du reset sont couverts par les tests locaux, pas automatiquement par cette recette humaine de deux messages.

Plafonds applicatifs : 50 messages/jour pour le service, 3 par adresse sur une fenêtre de 10 minutes, compteurs D1 atomiques et clés d'adresse HMACées. Ils s'ajoutent aux limites IP de Better Auth (5 connexions/mot de passe par minute, 3 inscriptions ou demandes de mail par minute). Les erreurs de livraison en arrière-plan ne divulguent pas l'existence du compte. Aucun renvoi automatique n'est mis en place. Les 3 000 e-mails mensuels inclus sont partagés au compte ; quota fournisseur constaté avant le test : 1 000/jour, zéro consommé. [Tarifs Cloudflare](https://developers.cloudflare.com/email-service/platform/pricing/) · [Budget du mois, domaine inclus](BUDGET-ET-OFFRES.md).

## Garanties implémentées

- Un objet Better Auth par requête, origine explicite, état OAuth en D1 et contrôle du cookie d’état maintenu. PKCE constaté dans l’URL d’autorisation générée. Origine exacte sur toutes les mutations et retours fixés côté serveur. Seuls les endpoints e-mail nécessaires sont ouverts ; modification d’e-mail, liaison manuelle, suppression et accès aux jetons restent fermés. La liaison Google implicite exige le même e-mail vérifié chez Google **et** dans le compte local ; aucune liste de fournisseurs ne dispense de cette vérification.
- Cookies de session HttpOnly/Lax, Secure sur HTTPS ; HTTP autorisé seulement pour le mode local et les hôtes loopback prévus. Cache de session désactivé : une session révoquée est refusée dès la lecture D1 suivante. Durée de cookie : sept jours.
- E-mail vérifié exigé. Jetons Google supprimés avant insertion/mise à jour du compte fournisseur ; pas de cookie de compte fournisseur. Les réponses utilisateur n’exposent ni token de session, ni compte fournisseur, ni IP. Journaux Better Auth désactivés ; erreurs applicatives françaises et diagnostics sur liste blanche.
- `owner_user_id` unique, création idempotente après création de session et rattrapage à `/api/me`. La trace d’essai appartient au même utilisateur ; aucune allocation n’est créée. Aucun endpoint de suppression/recréation de compte n’est ouvert dans ce sprint.
- `PUT /api/agency` accepte exclusivement les champs éditables. Ni propriétaire, ni agence cible, ni logo arbitraire ne peuvent être fournis. Nom + au moins un contact requis, couleurs hexadécimales et coordonnées validées.
- `POST /api/agency/logo` reçoit le fichier binaire, MIME PNG/JPEG, **2 Mo maximum et 16–1 024 px par côté**. Lecture bornée même sans Content-Length, contrôle de signature/dimensions, décompression PNG bornée et CRC, décodage réel, réencodage PNG RGBA, métadonnées supprimées. SVG, HTML, animation PNG, mauvais MIME et corruption sont refusés. WebP n’est pas accepté dans cette tranche ; ce choix réduit la surface de décodage dans Workers.
- Lectures de logo via `/api/agency/logo/:id`, session + filtre d’agence obligatoires, 404 pour un asset étranger, `private, no-store` et `nosniff`. Pas d’URL R2 publique ou signée. La clé R2 ne sort pas dans la réponse utilisateur.
- Chaque upload crée une nouvelle clé, un hash et une ligne immuable. Le pointeur de marque change seulement après écriture R2. Aucune suppression automatique des anciennes versions ; un manifeste déjà sérialisé garde sa copie de marque et son identifiant de logo. Le rendu complet de ces manifestes reste aux sprints vidéo/pipeline.
- Mutations limitées par utilisateur : 30 sauvegardes et 6 tentatives de logo par minute. Réservation de stockage en D1 avant upload : au plus 64 versions / 32 Mio par agence, contrôlés atomiquement. Un crash laisse une réservation comptée et identifiable, jamais une suppression aveugle. Une procédure de rapprochement/purge tenant compte des manifestes devra être ajoutée avant une exploitation durable ; aucune purge n’a été simulée comme réalisée.

Les réglages de bibliothèque ont été confrontés aux [options Better Auth](https://better-auth.com/docs/reference/options), à sa [gestion de sessions](https://better-auth.com/docs/concepts/session-management) et surtout aux types/code **1.7.6** installés. Les garanties de cette section décrivent le code et la recette locale ; elles ne remplacent pas la recette OAuth distante.
