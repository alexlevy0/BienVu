# Comptes et identité d’agence — sprint 02

## Ce qui fonctionne localement

Better Auth **1.7.6** utilise le binding D1 natif, sans ORM supplémentaire. Les sessions, l’agence unique par propriétaire, les réglages et les logos privés fonctionnent dans le build OpenNext exécuté par workerd. Les tests injectent des identités synthétiques dans D1 : **ils ne prouvent pas une connexion réussie à Google**. Aucun compte Google réel n’a été utilisé pendant cette tranche.

**Alex a demandé le 28/09/2026 la connexion e-mail/mot de passe en plus de Google.** Better Auth/D1 reste le choix technique retenu. L’inscription, la confirmation, la connexion et la réinitialisation sont implémentées. Le transport est le binding Cloudflare Email Service ; aucun abonnement ni domaine activé par cette tranche.

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

Le staging du sprint 00 est inchangé. Avant tout nouveau déploiement, préparer une configuration révisable avec D1/R2 de staging, les migrations `0001` à `0005`, un client OAuth et un secret d’authentification distincts du local.

`scripts/prepare-staging.mjs` accepte `BIENVU_WEB_ORIGIN` (origine HTTPS exacte) et `BIENVU_GOOGLE_CLIENT_ID`. Sans origine fournie, il laisse l’authentification de staging fermée ; il ne copie pas localhost dans une configuration distante. Le fichier produit reste ignoré par Git. Fournir les secrets par les mécanismes Wrangler prévus, en tenant compte du fait qu’un `secret put` constitue un déploiement. Cette tranche n’exécute ni cette préparation distante, ni migration distante, ni envoi de secrets.

Le callback distant sera **l’origine HTTPS retenue + `/api/auth/callback/google`**, déclaré dans le client Google correspondant. Tester le véritable Worker déployé : consentement, cookie `Secure; HttpOnly; SameSite=Lax`, deux propriétaires, persistance et révocation, upload raster, débit/CPU et R2 privé. Mesurer en particulier le coût CPU des images ; les temps locaux ne prouvent pas le respect de la limite Workers Free. L’abonnement Paid ne remplace pas la configuration du client Google.

Pour les e-mails réels, après autorisation de reprise distante : confirmer Workers Paid, configurer/vérifier le domaine d’envoi dans Cloudflare Email Service et contrôler son état avec `pnpm --filter @bienvu/web exec wrangler email sending list`. Donner à `prepare-staging.mjs` `BIENVU_WORKERS_PLAN=paid` et `BIENVU_AUTH_EMAIL_FROM` (adresse du domaine vérifié). Le script prépare `AUTH_EMAIL_MODE=cloudflare` et un binding restreint à cet expéditeur ; sans expéditeur, l’envoi et l’inscription e-mail restent fermés en staging. Aucune clé d’API mail supplémentaire requise.

La recette distante restante : réception réelle/spam de confirmation et récupération sur les boîtes de test autorisées, lien expiré/utilisé, changement de mot de passe et révocation, passage Google → mot de passe puis mot de passe → Google avec même e-mail vérifié et même agence, refus de liaison à un compte local non vérifié, erreurs d’envoi, débit/CPU du scrypt, consommation et facture. Aucun test de cette liste n’a été réalisé à distance ici.

Plafonds applicatifs : 50 messages/jour pour le service, 3 par adresse sur une fenêtre de 10 minutes, compteurs D1 atomiques et clés d’adresse HMACées. Ils s’ajoutent aux limites IP de Better Auth (5 connexions/mot de passe par minute, 3 inscriptions ou demandes de mail par minute). Les refus ou erreurs de livraison en arrière-plan ne divulguent pas l’existence du compte ; les utilisateurs peuvent demander un nouveau lien. Le diagnostic d’échec ne contient pas le message du fournisseur. Pas de file de relance automatique dans ce sprint ; surveiller les échecs avant l’ouverture publique.

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
