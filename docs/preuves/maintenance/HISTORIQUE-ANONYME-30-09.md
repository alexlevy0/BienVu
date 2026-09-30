# Mes vidéos sans compte — 30 septembre 2026

## Résultat

La bibliothèque ne se limitait auparavant qu'à l'agence connectée, alors que les essais anonymes étaient déjà enregistrés en D1/R2. Elle liste maintenant les trente derniers essais non rattachés de la session du navigateur. Les créations en cours, terminées et échouées restent consultables après navigation ou rechargement ; recherche, filtres, tri, lecture et détail sont disponibles. « Récentes » utilise aussi ce périmètre. « Télécharger sans filigrane » enregistre l'intention existante puis ouvre la connexion et la récupération, sans nouvelle génération.

L'autorisation repose sur le cookie HttpOnly existant, sa preuve hachée et non expirée, le périmètre technique de la session et l'absence de propriétaire. Les lignes déjà rattachées sont exclues, y compris lorsqu'un rattachement intervient entre la sélection et la lecture des lignes. L'historique ne crée aucune session, n'admet aucun job, ne débite aucun crédit et reste accessible quand les nouvelles admissions sont suspendues. L'API retourne uniquement les représentations publiques internes : jamais une preuve, une clé R2 ou un lien vers le master. Les routes de média continuent à vérifier l'accès indépendamment.

## Fichiers

- `packages/db/src/anonymous.ts` : lecture des essais non rattachés, bornée et isolée par session/périmètre.
- `apps/web/lib/trials.ts`, `app/api/trial/history/route.ts` : API privée de consultation, liste vide sans preuve valide et refus cross-site.
- `components/generation-store.tsx`, `anonymous-trial.tsx`, `generation-history.tsx`, `generation-detail.tsx`, `studio-sidebar.tsx`, `conversation-generation.tsx` : suivi invité, bibliothèque et aperçu, intention de connexion, recents et texte de conservation.
- `tests/trial-api.test.ts`, `scripts/probe-trial-ui.mjs` : régressions serveur et navigateur ; `docs/ESSAI-ANONYME.md`, `SUIVI.md` : fonctionnement et limites.

Aucune migration, nouvelle ressource ou modification des quotas/TTL. Les modifications e-mail et Orpi de la maintenance précédente sont conservées dans le dépôt.

## Vérifications locales

- `pnpm typecheck` avant et après build, `pnpm check:boundaries` : réussis, 163 fichiers respectent les frontières.
- `pnpm exec tsx --test tests/trial-api.test.ts` : réussite initiale ciblée, avant ajout du troisième cas de liste multiple ; la suite complète couvre les trois cas finaux.
- `pnpm test` : **184 tests réussis au passage final**, aucun échec. Le premier passage lancé en parallèle du build avait un import non prêt après environ 90 s, des échecs dépendants de cet import et un ECONNRESET local en purge. `pnpm exec tsx --test --test-concurrency=1 tests/import-storage.test.ts tests/trial-cleanup.test.ts` : 9 tests réussis, puis nouvelle suite complète réussie sans build concurrent. Aucune protection produit assouplie pour ces rejouages.
- `pnpm build:web` : build Next/OpenNext complet ; `pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --dry-run` : réussi.
- `pnpm --filter @bienvu/web exec wrangler dev --port 8790 --local`, puis `pnpm probe:trial:ui` : réussite à **1536×1024 et 390×844**. APIs, comptes et Turnstile simulés ; lecture d'un vrai MP4 de fixture déjà rendu localement, aucun nouveau rendu. Cas : démarrage automatique, assemblage mesuré, bibliothèque pendant le rendu et transition automatique vers prêt, « Récentes », passage par Explorer, historique après deux navigations/rechargements, recherche et filtres, dialogue de lecture, détail, absence de master anonyme, intention de connexion, annulation, récupération simulée sans doublon et bibliothèque vide sans preuve. Pas de débordement horizontal observé ; inspection visuelle des captures desktop/mobile. Aucun téléphone physique ni échange Google/e-mail réel.
- Route workerd réelle, sans interception : hôte configuré `localhost:8787` envoyé au port de recette 8790 ; réponses 200 vides sans preuve et avec preuve falsifiée, 403 cross-site, `private, no-store`, aucun `Set-Cookie`. L'accès direct avec origine 8790 différente de l'origine d'authentification est refusé comme prévu. Les tests D1/R2 isolés valident la liste des essais échoués/en cours, deux navigateurs distincts, aperçu seul, expiration, pause des admissions, rattachement puis disparition de l'historique anonyme et maintien dans celui de l'agence. Lectures sans changement du budget.

Journaux/captures/rapport JSON dans `evidence/local/anonymous-history-*` et `evidence/local/trial-ui/`, ignorés par Git. Aucun secret ni cookie réel de portail dans les preuves versionnées.
Le serveur de recette lancé pour cette maintenance sur 8790 a été arrêté après vérification ; le serveur utilisateur préexistant n'a pas été touché.

## Publication et contrôles réels

`pnpm exec wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars --strict` : Worker existant `bienvu-web-probe-staging`, version **997ae70f-7d8c-493d-bee5-94b5380ce0df**, domaine `bienvu.online`. Aucun redéploiement des Containers ou de la génération.

Sur le domaine : `/historique` répond 200 et affiche la bibliothèque invitée dans le navigateur ; `/api/trial/history` renvoie 200 avec liste vide sans cookie ou avec preuve falsifiée, 403 pour une requête cross-site, cache privé et aucun nouveau cookie ; `/api/generations` reste à 401 sans compte. Ces contrôles n'utilisent pas de cookie d'essai réel ayant une vidéo. Lecture seule D1 : deux essais `ready/available` non rattachés existent, avec expiration entre le 30/09 à 16:33 UTC et le 01/10 à 11:50 UTC au moment du contrôle. Aucun fichier utilisateur modifié ou supprimé.

**Vérification restante précise :** dans le navigateur/profil ayant créé l'essai, ouvrir « Mes vidéos » avant son expiration, recharger puis lire l'aperçu. Pour compléter la recette réelle de récupération déjà ouverte le 29/09, cliquer sur « Télécharger sans filigrane », se connecter dans ce même navigateur et vérifier le téléchargement et la présence d'une seule vidéo dans le compte. Ne pas créer un nouvel essai pour cette seule relecture. La fermeture de toutes les fenêtres privées ou la suppression des cookies peut rendre la preuve irrécupérable ; aucun rattachement ne repose sur un e-mail ou un identifiant deviné.

## Coût et limites

Zéro nouvel import, job vidéo, appel OpenAI/Google TTS ou e-mail. Lectures et déploiement des ressources existantes, sans surcoût fournisseur attendu dans leurs allocations ; facture non rapprochée. Registre distant : 29,40 € de base + 11,00 € d'imports, auxquels s'ajoutent 0,05 € provisionnés hors registre = **40,45 €**, plafond pilote 50 € avec coupure à 45 €, soit **4,55 €** avant coupure. Le déploiement n'ouvre pas un nouveau budget pour octobre.

Les médias anonymes restent disponibles **24 heures après disponibilité par défaut**, avec expiration affichée sur chaque carte. Le cookie dure trente jours ; la liste peut ensuite montrer un essai expiré sans accès à ses fichiers. La connexion étend la conservation par le mécanisme de récupération existant. Cette recette ne prétend pas avoir prouvé un nouveau rendu distant, une récupération réelle ou une conservation indépendante des cookies.
