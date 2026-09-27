# BienVu — suivi des sprints

Dernière mise à jour : 28 septembre 2026.

## État actuel

**Ajout du 28/09 : bypass local de vérification e-mail.** `AUTH_EMAIL_VERIFICATION_BYPASS=true` est activé dans `apps/web/.dev.vars` sur le poste ; les configurations versionnées restent à `false`. Une inscription marque l’adresse vérifiée et ouvre directement l’agence avec une vraie session, sans mail. Un compte local en attente passe vérifié seulement après saisie du bon mot de passe. Mode réservé à localhost/127.0.0.1, interdit sur origine publique, staging forcé à `false`. [Configuration](AUTHENTIFICATION.md#bypass-de-vérification-pour-le-développement) · [preuve spécifique](preuves/sprint-02/BYPASS-LOCAL.md). Cela ne valide pas une adresse réelle et ne clôt pas la recette distante du sprint 02.

**Sprint 02 : code livré et vérifié en local, validation complète en attente.** Better Auth 1.7.6/D1, agence unique par propriétaire, formulaire persistant, logos PNG/JPEG privés et versionnés. **56 tests**, TypeScript, build OpenNext et sondes workerd D1/R2 réussis ; inspection desktop/mobile. L’extension e-mail/mot de passe demandée le 28/09 est implémentée : inscription avec confirmation, connexion, récupération et révocation. Le hachage est exercé dans workerd ; les messages sont simulés, aucune livraison réelle validée. [Rapport de cette extension](preuves/sprint-02/EMAIL-MOT-DE-PASSE.md). La connexion Google réelle n’a pas été testée : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont absents. [Rapport et preuves](preuves/sprint-02/RAPPORT.md) · [configuration OAuth et recette restante](AUTHENTIFICATION.md). Aucun quota public ni paiement activé.

**Sprint 01 : fondations livrées et vérifiées en local**, à la demande d'Alex de poursuivre sans attendre Workers Paid. Interface française, contrats métier, migrations D1, CI préparée et observabilité disponibles. Installation depuis une copie propre, 30 tests, TypeScript et build OpenNext réussis. Aucun déploiement de cette tranche ; [rapport du sprint 01](preuves/sprint-01/RAPPORT.md) et [guide local](DEVELOPPEMENT.md).

**Sprint 00 : validation partielle, faisabilité globale non validée.** Le web Next.js/OpenNext est déployé sur Workers Free et la sonde distante D1/R2/cookie réussit. Une vraie annonce d'agence fournit ses données et trois photos depuis Browser Run vers R2 privé. Remotion a produit deux MP4 natifs, de 6 s et 30 s, puis un MP4 de 6 s dans Docker Linux amd64. **Le rendu Cloudflare Containers, son sommeil et sa facture restent à vérifier.**

Après reconnexion Wrangler par Alex, puis activation de R2 par Alex, deux Workers, une base D1 et un bucket R2 privés de test ont été créés. Aucun abonnement Workers Paid, achat de licence, crédit API, paiement client ou hébergeur alternatif activé.

**Consigne d'Alex du 27/09/2026 : rester en local en attendant Workers Paid.** Alex prévoit d'activer lui-même ce plan le 28/09/2026 ; l'activation n'est pas encore vérifiée. Aucun nouvel essai distant ni achat à lancer en attendant.

[Laboratoire déployé du sprint 00, inchangé](https://bienvu-web-probe-staging.alexlevy0.workers.dev) · [rapport](preuves/sprint-00/RAPPORT.md) · [procédure](preuves/sprint-00/PROCEDURE.md) · [ADR](adr/0001-hebergement-sprint-00.md).

| Sprint | Statut | Preuves | Reste |
|---|---|---|---|
| 00 | Code livré, validation partielle | Workers/D1/R2/cookie distants ; import agence avec trois photos ; MP4 natifs 6/30 s ; image Linux et rendu 6 s réussis ; son local entendu par Alex | Durée cible Linux, Containers/R2/sommeil, recette du MP4 distant et facture |
| 01 | Livré et vérifié en local | Copie propre, 30 tests, types, migrations, build OpenNext, sondes workerd et inspection mobile/ordinateur | Déploiement/migrations de staging non faits ; résultat GitHub CI non contrôlé ici ; validation Containers du sprint 00 distincte |
| 02 | Code livré ; local validé ; OAuth et mails réels restants | 56 tests, build, e-mail/mot de passe avec mails simulés, sessions Better Auth/D1, marque, logos R2 privés, isolation, UI mobile/desktop | Client Google, domaine expéditeur vérifié + Workers Paid, réception réelle, staging, mesure CPU logos/scrypt |
| 03 | À faire | — | Import agences et sécurité d'URL client |
| 04 | À faire | — | Portails et couverture générique |
| 05 | À faire | — | Script et voix |
| 06 | À faire | — | MP4 et filigrane produit |
| 07 | À faire | — | Pipeline durable complet |
| 08 | À faire | — | Facturation et quotas |
| 09 | À faire | — | Recette de lancement |

## Décisions et hypothèses

| Sujet | État | Preuve / limite |
|---|---|---|
| Produit | SaaS payant, quotas par abonnement, une vidéo d'essai filigranée après inscription, charte enregistrée, aucun éditeur | Décisions confirmées par Alex ; parcours client non implémenté dans ce sprint |
| Adaptation Next.js | Next 16.3.6, React 19.3.0, OpenNext 1.20.6, Wrangler 4.142.0 | Build, workerd local et Worker distant réussis ; pas de migration silencieuse |
| Rendu | Remotion 4.0.529, Node 24.17.0, Linux amd64 prévu pour Containers | Rendus natifs 6/30 s et Linux 6 s réussis ; hébergement Containers non validé |
| Taille / concurrence | standard-2 proposé, un rendu simultané | Mesure distante à faire |
| Auth client | E-mail/mot de passe **en plus de Google**, demandé par Alex le 28/09 ; Better Auth 1.7.6 + D1 retenu techniquement | Sessions, confirmation et reset locaux prouvés ; mails simulés, Google réel non testé. Cloudflare Email Service préparé sans activation distante |
| Texte / voix | API OpenAI, modèles et voix configurables | Aucun appel ; qualité française et coût non mesurés |
| Prix et quotas | 29/59/99 € HT pour 10/30/60 vidéos | Hypothèses commerciales non validées |
| Format | 1080×1920, environ 30 s, un modèle | Valeurs proposées, éprouvées sur médias synthétiques |
| Conservation | 30 jours | Règle effective sur le préfixe de test R2 `probes/` ; conditions client futures à préciser |
| Licence Remotion | Gratuite pour l'équipe déclarée de 1 à 3 personnes | FAQ officielle vérifiée ; réévaluer si l'équipe grandit |
| Budget | 30 €/mois tout compris ; dépenses initiales déclarées : 0 € | Aucun upgrade Workers ; coût supplémentaire estimé à 0 €, facture non consultée |

## Sprint 00 — résultats et commandes

- **Dépôt :** `/Users/alexlevy0/Dev/BienVu`, branche `codex/sprint-00-faisabilite`. Git Homebrew utilisé car le Git système demande l'accord Xcode ; aucun accord accepté, aucun commit/push.
- **Livré :** monorepo TypeScript, laboratoire Next.js, sondes opérateur, extraction contrôlée, renderer Node/Remotion, contrôleur Containers, fixtures, budget persistant et coupe-circuit. Aucun éditeur ou saisie manuelle de photos ajouté.
- **Fichiers principaux :** `apps/web`, `apps/pipeline`, `apps/renderer`, `packages/contracts`, `packages/importers`, `packages/video`, migration D1, `scripts`, `tests`, lockfile et documentation. Reprise : vérification WAV/PCM native, lanceur `renderer-native.mjs`, état Browser Run, galerie HTML, diagnostic photo et délai d'inactivité corrigés.
- **Fixtures :** 17 tests réussis, sans API facturable : URL/DNS privés, plafonds de taille, identité/prix contradictoires, location, photos étrangères, contrats de rendu, budget et journal d'échec via HTTP simulé. [Résultat](preuves/sprint-00/tests-fixtures-final.log).
- **TypeScript :** contrôle complet réussi, puis nouveau contrôle du pipeline après le dernier correctif. La fixture HTTP n'est pas présentée comme un vrai rendu.
- **Web réel :** build OpenNext, workerd local puis déploiement Workers Free. Les six contrôles distants passent : autorisation, cookie, D1, R2, refus d'un cookie inconnu et nettoyage. [Preuve](preuves/sprint-00/web-cloudflare.json). Page de laboratoire inspectée visuellement.
- **Import réel :** cinq sessions Browser Run : agence initiale, Figaro, puis trois contre-vérifications nommées et réservées. Succès final agence en 6,828 s, trois JPEG distincts réellement décodés et stockés dans R2 ; échecs antérieurs conservés. Le carrousel supprimait les ancres du DOM ; lecture du HTML initial ajoutée. La fermeture par inactivité durant les transferts a été observée et corrigée. [Succès](preuves/sprint-00/browser-agency-success.json), [inspection des photos et empreintes](preuves/sprint-00/inspection-photos.json).
- **Sources limitées :** l'essai réussi utilise le HTML initial avec ressources annexes bloquées. Il ne valide pas toutes les agences ni les pages dépendant d'une hydratation externe. Surface omise en cas de définitions ambiguës ; droits commerciaux sur les photos non établis.
- **Le Figaro :** `SOURCE_BLOCKED` observé chez Cloudflare ; aucun contournement, aucune conclusion d'annonce retirée. [Preuve](preuves/sprint-00/browser-figaro.json).
- **Remotion réel sur fixtures :** MP4 natifs 6 s et 30 s, H.264/AAC, 1080×1920, 30 fps, filigrane. Tailles : 735 464 et 2 500 320 octets ; rendu/vérification : 39,321 et 177,000 s. Piste AAC réellement décodée, niveau RMS environ −32,8 dBFS. [Court](preuves/sprint-00/mp4-native-short.json), [cible](preuves/sprint-00/mp4-native-target.json).
- **Service Node réel :** secret requis, 202 avant fin, replay idempotent, conflits et concurrence refusés, fichier disponible après vérification. [Preuve](preuves/sprint-00/render-server-native.json). Serveurs locaux ensuite arrêtés.
- **Inspection :** trois images du MP4 final vues à 1, 15 et 29 s, textes et filigrane lisibles. La piste audio contient un signal synthétique de test, sans voix off. Sa présence, son décodage et son niveau sonore sont vérifiés. **Alex confirme le 27/09/2026 avoir écouté la vidéo locale et entendu le son.** [Retour utilisateur](preuves/sprint-00/ecoute-utilisateur.md). L'audibilité locale est donc confirmée ; une inspection visuelle continue n'est pas attestée par ce retour. La recette du futur MP4 distant devra comprendre lecture complète et écoute.
- **Linux :** image amd64 construite, dépendances, bundle et Chromium inclus ; digest `sha256:bace81bba111d48da01d4b4b36fa247cd8f27710ec65b4876ffdce9f3e0fcf01`. Rendu Linux court réussi : 6 s, 735 772 octets, 471,485 s de rendu/vérification sous Rosetta avec quota 1 vCPU. Trois images du MP4 inspectées. VM Docker : environ 3,83 GiB au total, moins que les 6 GiB permis par la commande. Ce temps ne prédit pas Cloudflare. [Preuve MP4](preuves/sprint-00/mp4-linux-short.json). [Build](preuves/sprint-00/build-docker-reprise.log).
- **Arrêt distant :** imports désactivés, un nouvel appel renvoie 503, état sans secret refusé, zéro session active. Cinq sessions totalisent **63,301 s** selon le fournisseur, dont une fermeture `BrowserIdle` avant correction ; la dernière fermeture est normale. [Preuve](preuves/sprint-00/browser-shutdown.json).
- **R2 :** `r2.dev` désactivé, aucun domaine public, purge 30 jours. Base D1 `bienvu-s00-staging`, bucket `bienvu-s00-private`. [Inventaire](preuves/sprint-00/ressources-staging.json). Secrets distincts de staging hors Git.
- **Commandes exécutées :** installation, fixtures, types, tests, build OpenNext, migrations locale/distante, déploiements web/import, sondes web/browser/status, diagnostic et lecture de photos R2, rendu natif court/cible, sonde HTTP Node, build Docker. Commandes détaillées et reprise Containers dans la procédure.
- **Historique conservé :** auth expirée puis rétablie à 18:11 UTC ; premier refus R2 avant activation par Alex ; timeouts Chromium locaux ; premier build Docker interrompu ; deux nouvelles vérifications audio natives échouées avant correction. Aucun de ces essais n'est compté comme succès.
- **Nettoyage demandé par Alex :** 11 conteneurs `jakt` actifs arrêtés/supprimés à 18:31 UTC, puis les deux arrêtés restants à 18:32 UTC. Volumes et images conservés. [Preuve historique](preuves/sprint-00/docker-cleanup-all.json). Aucun ancien projet relancé. Le conteneur temporaire BienVu `--rm` a terminé avec le code 0 et a été supprimé automatiquement ; zéro conteneur reste au dernier contrôle. [Nettoyage final](preuves/sprint-00/cleanup-reprise.json).
- **Coût :** 0 € supplémentaire estimé dans les quotas Free, 30 € restants estimés, facture non consultée. Aucun appel texte/TTS ni rendu Containers. [Mesure et hypothèses](preuves/sprint-00/budget-reprise.json).
- **Limite centrale :** Containers exige Workers Paid. Son activation, le rendu hébergé, le sommeil, la durée active facturée et le coût par vidéo distante utilisable restent non validés. Ne pas marquer le sprint terminé sur la base des MP4 locaux.

## Sprint 01 — fondations locales

- **Périmètre autorisé :** poursuivre le sprint 01 en local en attendant l'activation de Workers Paid par Alex le 28/09/2026. L'architecture retenue est conservée ; la faisabilité Containers n'est pas supposée acquise.
- **Interface :** tableau de bord, création, identité d'agence, historique, abonnement et connexion. Navigation française responsive ; vérification syntaxique d'URL ; génération, compte, enregistrement et achat explicitement indisponibles. Aucun import ou job simulé présenté comme réel, aucun prix non validé publié.
- **Données et contrats :** `packages/contracts/src/product.ts` et `errors.ts`, fixtures vente/location/absence/contradiction, `packages/db` avec migrations `0002`/`0003`. Métadonnées par agence, références croisées protégées, un job actif, idempotence, intentions durables, réservations et coûts préparés. Le flux complet des quotas reste aux sprints métier.
- **Sécurité et diagnostic :** `packages/observability`, UUID de requête généré côté serveur, erreurs françaises sans secrets, logs sur liste blanche, query strings masquées dans la configuration. `POST /api/generations` renvoie 503 par défaut et ne peut pas créer de travail même si la pause est levée sans authentification. `pnpm generations:pause` fonctionne sur D1 local.
- **Reproductibilité :** `pnpm check`, `db:migrate`, `preview`, `probe:foundations`, `scripts/verify-clean.mjs` et `.github/workflows/ci.yml`. Versions du sprint 00 conservées ; Miniflare épinglé à la version déjà fournie par Wrangler. Exports des packages web adaptés au traitement OpenNext.
- **Tests réellement exécutés :** 30 réussis, dont six sous-tests SQL sous Miniflare/workerd et leur parent, plus TypeScript sur les packages et les tests. Deux batches concurrents, refus inter-agences, rollback complet, limites de contrat, audio tronqué et droits d'essai contrôlés. [Log](preuves/sprint-01/check.log).
- **Exécution locale :** migrations sur la base locale et sur une copie propre, seconde application sans changement ; build OpenNext réussi. Sept pages HTTP 200, refus serveur des générations, UUID et headers vérifiés ; D1/R2/cookie opérateur réussis avec nettoyage. Aucun de ces résultats n'est présenté comme un test distant de la tranche 01. [Sondes](preuves/sprint-01/web-workerd.json), [copie propre](preuves/sprint-01/clean-copy.json).
- **Inspection :** tableau de bord et agence vus sur ordinateur, plusieurs pages vues à 390 px ; champs désactivés et refus d'une URL locale vérifiés dans le navigateur. Aucun débordement horizontal sur les pages mesurées. [Compte rendu](preuves/sprint-01/inspection-ui.json).
- **Limites / coût :** authentification, enregistrement de marque, génération et facturation non intégrés. CI non exécutée sur GitHub ; staging inchangé. Aucun nouveau conteneur Docker, appel payant ou déploiement. Coût fournisseur supplémentaire attendu : 0 € ; facture non relue. [Rapport complet](preuves/sprint-01/RAPPORT.md).

## Sprint 02 — comptes et marque en local

- **Contexte Git :** Alex confirme avoir défini `main` par défaut sur GitHub et effectué le checkout local. Travail poursuivi sur `main` depuis le commit `3d41aaa`. Aucun commit/push de cette tranche effectué.
- **Livré :** authentification Better Auth/Google prête à configurer, sessions et déconnexion, agence idempotente, trace d’éligibilité sans allocation, marque persistante, logos privés/versionnés, isolation serveur et limite des uploads. Le formulaire conserve les champs non enregistrés lors d’un remplacement de logo.
- **Fichiers :** `apps/web/lib`, routes `api/auth`, `api/me`, `api/agency`, composants compte/agence, contrat `agency.ts`, accès D1 et migration `0004_accounts_brand.sql`, tests comptes/logos, sondes/opérateur local, setup, Wrangler/types, CI, manifests, lockfile et [documentation OAuth](AUTHENTIFICATION.md).
- **Commandes exécutées :** installation des dépendances exactes ; `pnpm setup:local`, `pnpm --filter @bienvu/web typegen`, tests ciblés puis `pnpm check`, `pnpm db:migrate` et réapplication, `pnpm build:web`, `pnpm preview`, `pnpm probe:accounts` (avec conservation temporaire pour UI puis nettoyage), `pnpm probe:foundations`, `pnpm probe:web`, contrôle des secrets candidats Git et des liens documentaires.
- **Résultats locaux :** 43 tests réussis, types et frontières vérifiés, migration sur base vide/locale existante, build final réussi. Neuf groupes HTTP passent dans workerd : sessions, concurrence, validation, CSRF, logos PNG/JPEG réellement décodés/réencodés, refus inter-agences et visiteur, conservation des anciennes versions, déconnexion et absence de crédit/job/coût. [Journal](preuves/sprint-02/check.log), [preuve HTTP](preuves/sprint-02/accounts-workerd.json).
- **Interface :** formulaire vu en 1280×720 et 390×844 ; erreurs de nom/couleur, sauvegarde, rechargement et déconnexion exercés. Connexion non configurée clairement indiquée. Aucun débordement horizontal mesuré à 390 px ; sélecteur de fichier natif non exercé, upload vérifié par API. [Inspection](preuves/sprint-02/inspection-ui.json).
- **Réel vs fixtures :** D1/R2/workerd et la bibliothèque d’authentification s’exécutent réellement en local ; utilisateurs et logos sont synthétiques. Les contrôles OAuth couvrent URL d’autorisation, PKCE, origine et état invalide, sans consentement ni callback Google réussi. Ne pas cocher 02.1 ni déclarer le sprint entièrement validé sur cette base.
- **Limites :** configuration et recette Google, staging, mesures CPU distantes à faire. Anciens logos conservés sous plafond 64 versions/32 Mio ; rapprochement des uploads interrompus/purge respectant les manifestes à préparer avant exploitation durable. Aucun rendu produit avec marque ni pipeline public ouvert.
- **Coût / arrêt :** aucun appel applicatif distant, abonnement, paiement, API IA, Browser Run ou Docker. 0 € fournisseur supplémentaire attendu, facture non relue. Comptes et logos de recette supprimés ; preview workerd conservé au port 8787. [Rapport complet](preuves/sprint-02/RAPPORT.md).

## Extension du sprint 02 — e-mail/mot de passe, 28 septembre 2026

- **Décision d’Alex :** conserver Google et proposer aussi e-mail/mot de passe. L’exclusion initiale des mots de passe est remplacée dans le cadrage et le sprint.
- **Livré :** formulaire d’inscription/connexion, confirmation d’adresse et renvoi, récupération avec lien unique et révocation des sessions, même agence pour un compte Google récupéré par e-mail. Binding Cloudflare Email Service préparé, fermé par défaut en staging ; plafonds atomiques d’envoi 50/jour et 3/adresse/10 minutes.
- **Fichiers :** `components/login.tsx`, `lib/auth.ts`, `auth-handler.ts`, `auth-email.ts`, route `api/auth`, contrats `auth.ts`, migration `0005_auth_mail_limits.sql`, tests `auth-email.test.ts`, sonde `probe-auth-email.mjs`, Wrangler/types, CI et préparation staging ; documents produit, budget et configuration actualisés.
- **Commandes exécutées :** `pnpm --filter @bienvu/web typegen`, `pnpm db:migrate` puis réapplication, tests ciblés, `pnpm check`, `pnpm build:web`, `pnpm preview`, `BIENVU_PREVIEW_LOG=… pnpm probe:auth-email`, `pnpm probe:accounts`, `pnpm probe:foundations`, `pnpm probe:web`, inspection navigateur et contrôle des secrets candidats Git.
- **Résultats :** 52 tests réussis, TypeScript et build ; parcours HTTP d’inscription sans insertion de compte préalable, confirmation, connexion/rechargement, reset et déconnexion sous workerd. Scrypt et D1 s’exécutent réellement en local. Les nouveaux tests protègent aussi erreur/expiration/rejeu, CSRF, révocation, réponse générique, plafonds, configuration fermée et conservation de l’essai.
- **Réel vs fixtures :** identités synthétiques, mails capturés en mémoire dans les tests et par le simulateur Wrangler dans la sonde ; **aucun mail reçu réellement**, aucun échange Google réussi. Le test de récupération Google utilise une identité fournisseur synthétique en D1. Les comptes de recette sont nettoyés.
- **Restant / coûts :** domaine expéditeur vérifié, Workers Paid, client Google et recette distante (livraison/spam, parcours entre modes, HTTPS, CPU scrypt et facture). 0 € d’appel applicatif externe, aucun achat, Docker ou déploiement. Aucun commit/push. [Rapport et preuves](preuves/sprint-02/EMAIL-MOT-DE-PASSE.md).

## Vérification du bypass local

- **Fichiers :** `lib/auth.ts` (drapeau, hooks limités aux parcours e-mail), `auth-handler.ts` (origine locale, inscription sans transport, réponse sans jeton), `components/login.tsx` (redirection automatique), Wrangler/types, `.dev.vars.example`, préparation staging, tests et variante `probe:auth-email --bypass`.
- **Configuration :** variable serveur exacte `true`, `false` par défaut. Activation seulement dans le fichier local ignoré ; aucun secret affiché, aucun changement de configuration distante ni migration de données utilisateur.
- **Vérifications :** `typegen`, `pnpm check` (56 tests dont défaut/activation, session immédiate, adresse persistée, ancien compte en attente, mauvais mot de passe, réinscription, CSRF, origine publique et génération de configuration staging), build OpenNext, sonde HTTP workerd puis inscription navigateur sur compte synthétique. Rapports séparés de la recette normale par e-mail.
- **Coût / limites :** aucun appel externe, e-mail réel, Docker, abonnement ou déploiement. Les adresses ainsi marquées sont des fixtures locales ; les contrôles Google réels et livraison réelle restent à faire.

## Couverture des sources

| Source | Mode effectivement testé | Liens uniques | Tentatives Cloudflare | Succès | Limite / résultat |
|---|---|---:|---:|---:|---|
| Espaces Atypiques 16624 | HTML de l'annonce, galerie, trois photos décodées → R2 privé | 1 | 4 | 1 | Deux angles du séjour et une vue extérieure ; trois échecs conservés ; autres agences non couvertes |
| Le Figaro 108944355 | Browser Run distant | 1 | 1 | 0 | Accès refusé ; source non qualifiée de retirée |
| SeLoger | Non testé | 0 | 0 | 0 | — |
| Leboncoin | Non testé | 0 | 0 | 0 | — |
| Bien'ici | Non testé | 0 | 0 | 0 | — |

## Dépenses

| Date | Poste | Consommation / engagement | Estimation facturable | Facture | Budget estimé restant |
|---|---|---|---:|---|---:|
| 27/09/2026 | Local | Fixtures, builds et rendus ; matériel/électricité non mesurés | 0 € fournisseur | Sans objet | 30 € |
| 27/09/2026 | Cloudflare Workers/D1/R2 | Deux Workers de test, une base, quelques Mo privés, quelques dizaines d'opérations R2 | 0 € dans les quotas Free | Non consultée | 30 € |
| 27/09/2026 | Browser Run | 5 sessions, 63,301 s mesurées, échecs compris ; 536,699 s de quota quotidien restantes | 0 € après quota ; brut théorique 0,001582525 USD | Non consultée | 30 € |
| 27/09/2026 | Texte/TTS, Remotion | 0 appel API ; licence gratuite pour 1–3 personnes | 0 € | Aucun achat | 30 € |
| 27/09/2026 | Sprint 01 local | Tests de contrats, D1/workerd local, builds et inspection UI ; aucun appel fournisseur payant | 0 € fournisseur attendu | Aucun achat ; facture non relue | 30 € estimés |
| 27–28/09/2026 | Sprint 02 local | Sessions et identités synthétiques, D1/R2 locaux, images, builds et UI ; aucun appel applicatif distant | 0 € fournisseur attendu | Aucun achat ; facture non relue | 30 € estimés |
| 28/09/2026 | Extension e-mail/mot de passe | Hachage réel et mails simulés en local, contrôles D1/workerd et UI | 0 € fournisseur | Aucun achat ni envoi réel | 30 € estimés |
| À venir, non engagé | Workers Paid + Containers | Provision indicative 8 € fixes et 0,50 €/tentative, 3 essais initiaux / 5 max | À recalculer avec change/taxes et facture | Aucun achat | Non engagé |

## Prochaine vérification

Les sprints 01–02 sont disponibles en local (`pnpm preview`, port 8787). Configurer le client Google puis réaliser la recette décrite dans [AUTHENTIFICATION.md](AUTHENTIFICATION.md) ; un abonnement Workers Paid ne fournit pas ces identifiants OAuth. Attendre l'activation de Workers Paid annoncée par Alex pour le 28/09/2026 avant les essais Containers du sprint 00 : courte vidéo puis 30 s, MP4 récupéré depuis R2 privé, lecture/écoute, concurrence, fin effective, sommeil et consommation facturable, dans les limites déjà préparées. L'audibilité locale est confirmée ; le rendu hébergé reste à démontrer. La future mise à jour du staging avec les sprints 01–02 nécessitera leurs migrations et une nouvelle sonde web distante ; aucun de ces actes n'a été effectué pendant la phase locale.
