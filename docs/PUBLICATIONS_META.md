# Publications Instagram et Facebook

Depuis **Mon agence → Vos réseaux sociaux**, le propriétaire ou un administrateur connecte Meta et choisit explicitement les Pages Facebook et les comptes Instagram à associer. Instagram doit être professionnel et associé à une Page dans ce parcours Facebook Login. Un membre éditeur peut publier ; un lecteur consulte le calendrier.

Dans **Mes vidéos → Publier sur mes réseaux**, sélectionner les destinations, ajuster la légende et publier immédiatement ou choisir une date. Le calendrier **Publications** affiche le résultat pour chaque réseau, permet de modifier ou annuler une programmation avant son démarrage, et de reprendre seulement une destination en échec. Cette version publie des Reels ; Facebook accepte ici les exports verticaux. L’export horizontal reste disponible pour Instagram et le téléchargement.

La diffusion ne coûte aucun crédit supplémentaire. Elle conserve une copie privée de l’export validé, indépendante des retouches et de l’expiration du fichier original. Cette copie expire 30 jours après la date prévue. Une programmation est possible entre deux minutes et trente jours à l’avance. Le navigateur affiche son fuseau ; le serveur enregistre l’instant en UTC. Les phases de préparation Meta se poursuivent en arrière-plan, même si le navigateur est fermé.

## Configuration Meta

Les clés locales vont dans `.env.social`, à partir de `.env.social.example`. Ne jamais les mettre dans Git ou dans un champ `NEXT_PUBLIC_*`.

| Champ Meta | Valeur |
| --- | --- |
| Domaine de l’application | `bienvu.online` |
| Site web | `https://bienvu.online` |
| URI de redirection OAuth valide | `https://bienvu.online/api/social/oauth/callback` |
| Politique de confidentialité | `https://bienvu.online/confidentialite` |
| Conditions d’utilisation | `https://bienvu.online/conditions` |
| Rappel de désautorisation | `https://bienvu.online/api/social/meta/deauthorize` |
| Rappel de suppression des données | `https://bienvu.online/api/social/meta/deletion` |

Activer le parcours Facebook Login adapté à l’application. Les permissions demandées sont `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic` et `instagram_content_publish`. Si une configuration Facebook Login for Business est utilisée, renseigner `META_LOGIN_CONFIG_ID` et inclure ces permissions dans sa configuration.

Pour le parcours de sélection des Pages et comptes professionnels de BienVu, créer une configuration **Général** avec un **jeton d’accès utilisateur**, puis autoriser les Pages et comptes Instagram avec ces cinq permissions. Le type de jeton doit correspondre à l’échange de jeton utilisateur utilisé par le serveur. Si une configuration optimisée Instagram bloque dans la fenêtre Meta après la double authentification, comparer avec cette configuration générale ; cela ne prouve pas à lui seul que le problème Meta est résolu.

Lorsque `META_LOGIN_CONFIG_ID` est renseigné, BienVu transmet `config_id` au dialogue Meta et omet `scope` et `auth_type` du parcours classique. Le choix des comptes à autoriser dépend alors de la configuration Meta. Le retour conserve les contrôles d’état, de navigateur et d’agence, puis demande la sélection explicite des comptes dans BienVu.

Si ce dialogue Meta se bloque, **Connexion bloquée ? Utiliser ma Page Facebook**, puis **Connecter via Facebook** permet de choisir le parcours Facebook classique, avec les mêmes permissions requises et la même URI de retour. Le client envoie uniquement `flow=facebook` ; toute autre valeur est refusée. Cette alternative récupère l’Instagram professionnel associé à la Page. Elle conserve la configuration Business pour les connexions normales et exige toujours la confirmation des comptes dans BienVu.

Les comptes ayant un rôle autorisé dans l’application Meta permettent de tester le parcours. Pour ouvrir la connexion aux clients, les accès et validations demandés par Meta doivent être accordés pour ces permissions. L’ID et le secret de l’application ne prouvent pas à eux seuls que cette ouverture est autorisée.

Sources techniques : [collection Facebook officielle de Meta](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api), [Instagram API avec Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/), [validation de l’application](https://developers.facebook.com/docs/app-review/).

## Configuration Cloudflare

Appliquer `packages/db/migrations/0042_social_publishing.sql` avec le gestionnaire des migrations D1. Les tables utilisent la base et le bucket privés existants ; les Workers de génération et d’import ne changent pas.

Sur le Worker web, conserver les bindings existants et ajouter :

- Variables : `META_APP_ID`, `META_GRAPH_VERSION=v25.0`, `META_LOGIN_CONFIG_ID` si applicable, `SOCIAL_ENABLED=true` après configuration.
- Secrets : `META_APP_SECRET`, `SOCIAL_TOKEN_ENCRYPTION_KEY`.
- Cron `* * * * *`, en conservant le cron quotidien `23 3 * * *`.

Générer la clé de chiffrement une fois et la conserver dans `.env.social`. Vérifier l’absence d’un secret déjà installé avant d’en générer une nouvelle. Une rotation non préparée rendrait les jetons enregistrés illisibles. La désactivation de `SOCIAL_ENABLED` suspend les nouveaux envois et les reprises ; les publications déjà présentes sur Meta ne sont pas supprimées.

Le cron prend au plus dix destinations par passage, en deux groupes de cinq. Chaque phase possède un verrou en base. L’accès vidéo remis à Meta utilise une signature limitée dans le temps, ne révèle aucun chemin R2 et n’est valable que pendant un envoi actif. La purge quotidienne retire les autorisations temporaires expirées et les copies vidéo arrivées à échéance, par lots.

## Vérification et incident

Les tests `tests/social-publishing.test.ts` utilisent D1/R2 isolés et un transport Meta simulé. Ils vérifient OAuth, isolation des agences et rôles, copie figée, pagination, planification, annulation, envois concurrents, upload Facebook, erreurs partielles et perte de réponse finale. Ils n’envoient aucune vidéo à un compte réel.

Le client Meta est aussi exécuté dans workerd avec un transport sortant simulé, pour vérifier les différences avec Node : le `fetch` natif est appelé sans receveur personnalisé et les requêtes utilisent `redirect: 'manual'`. Toute réponse de redirection est refusée avant lecture, sans transmettre les jetons à son adresse de destination. Seules les lectures OAuth et la prolongation du jeton peuvent être reprises après une erreur temporaire ; le code OAuth n’est jamais échangé une deuxième fois automatiquement.

Le démarrage OAuth accepte un POST vide, y compris lorsque workerd le représente par un flux vide. L’interface envoie systématiquement un objet JSON ; le renseignement de Page et le choix du parcours Facebook classique restent facultatifs. Les corps non vides doivent être du JSON valide, sans champ supplémentaire et limités à 1 Ko.

Le retour OAuth rejoint directement **Vos réseaux sociaux**. Les comptes doivent encore être choisis dans **Choisissez vos comptes**, puis confirmés avec **Connecter ces comptes**. En cas d’échec, un message reste visible au-dessus des cartes, y compris après actualisation. Les diagnostics `social_oauth_step_failed` indiquent uniquement l’étape et les codes numériques Meta ; ils excluent les jetons, codes OAuth, URL, messages fournisseur et informations de compte.

Les erreurs renvoyées au retour de Meta distinguent le refus d’autorisation, l’indisponibilité temporaire et les demandes refusées pour configuration. Un retour sans code ni erreur est un échec, plutôt qu’une annulation présumée. L’état, le navigateur et l’agence sont contrôlés et la tentative consommée avant tout diagnostic fournisseur ; aucun code n’est échangé si Meta renvoie aussi une erreur. Les paramètres répétés sont refusés. `social_oauth_provider_failed` conserve uniquement des catégories OAuth prédéfinies et un code numérique borné, jamais `error_description` ni le contenu libre de Meta. `social_oauth_started` indique seulement le parcours Business ou Facebook et si une Page facultative était renseignée.

Si une Page est ajoutée après la première autorisation Meta, vérifier sa sélection dans [les intégrations professionnelles Facebook](https://www.facebook.com/settings?tab=business_tools), avec le profil qui gère cette Page. Autoriser dans BienVu la Page et le compte Instagram concernés, enregistrer puis relancer la connexion. Si Meta réutilise l’ancienne autorisation sans proposer de sélection, retirer l’autorisation de l’application dans ces réglages puis relancer le parcours. Lorsque l’autorisation vise une sélection de comptes, la liaison Instagram–Page ne suffit pas à ajouter la nouvelle Page à cette sélection.

Les erreurs de découverte distinguent l’absence de Pages transmises (`SOCIAL_NO_ACCOUNTS`), des droits de publication insuffisants (`SOCIAL_PAGE_ACCESS`) et l’absence de compte Instagram associé transmis (`SOCIAL_INSTAGRAM_LINK`). Le diagnostic `social_oauth_accounts_empty` ne contient que les comptages de Pages/comptes et les indicateurs de permissions. Le filtre de publication accepte aussi `PROFILE_PLUS_MANAGE`, présent dans les [types officiels de tâches de Page Meta](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py).

Si Meta indique des identifiants de Pages dans les cibles de permissions du jeton validé mais omet ces Pages dans `/me/accounts`, la découverte relit au plus dix Pages par leur identifiant, par groupes de cinq. L’aide permet aussi d’indiquer le lien ou l’identifiant numérique de sa Page ; le paramètre `facebookPage` sur `/agence` préremplit ce champ. Ce renseignement reste facultatif et n’accorde aucun droit : Meta doit fournir le jeton de cette Page, puis `/me` avec ce jeton doit confirmer son identifiant. Les permissions du jeton utilisateur doivent être valides et les tâches en lecture seule, lorsqu’elles sont fournies, restent exclues. La recherche ignore les cibles de scopes Instagram ou inconnus. Meta contrôle les droits lors de chaque appel de publication.

L’identifiant facultatif est conservé pendant quinze minutes dans un cookie chiffré HttpOnly, lié au navigateur de cette tentative OAuth. Le serveur vérifie d’abord l’état à usage unique, l’utilisateur et l’agence, puis déchiffre ce renseignement. Les deux cookies OAuth sont effacés au retour, y compris en cas d’erreur. Aucun identifiant de Page n’est journalisé. La [collection officielle Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-db99ce99-bf76-475c-8b76-718576c11cae) décrit l’accès direct à une Page connue sans exiger `can_post`. Ce champ n’est plus transformé en une tâche de publication fictive : le jeton de Page et son identité sont vérifiés. Le diagnostic donne aussi le nombre de cibles de Page autorisées, de lectures refusées et un indicateur signalant la présence du renseignement facultatif.

Une reprise automatique ne répète jamais l’appel final de publication après une réponse ambiguë. Le calendrier demande alors de vérifier le compte : **Déjà publiée** enregistre son lien, ou **Vérifier et relancer** autorise explicitement un nouvel envoi. Une déconnexion annule les envois qui n’ont pas atteint cette phase finale ; un envoi déjà transmis peut encore se terminer.

Pour la recette Meta, connecter un compte autorisé, vérifier les permissions et destinations, puis valider expressément la vidéo et la légende à publier. Tester ensuite un envoi immédiat et un envoi programmé. Ces vérifications réelles dépendent du compte connecté et ne sont pas remplacées par les tests simulés.
