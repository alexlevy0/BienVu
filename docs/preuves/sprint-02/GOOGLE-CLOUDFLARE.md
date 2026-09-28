# Google OAuth — activation et recette Cloudflare du 28/09/2026

**Connexion réelle réussie, confirmée par Alex, avec son agence retrouvée.** Ce résultat complète sa connexion Google locale et la recette e-mail distante. Il ne clôt pas tous les critères du sprint 02.

## Périmètre et configuration

- Demande explicite d'Alex : activer Google pour tester sur Cloudflare.
- Worker existant : `bienvu-web-probe-staging`, sur `https://bienvu-web-probe-staging.alexlevy0.workers.dev`.
- Version déployée : `bdff9a5d-e1a8-4aba-a5b7-d56e4deaaa03`, depuis le code `3d83abf706e25d7da014ab1b4db2a37ec0535e02` ; seuls la configuration Google et les documents de suivi changent pour cette activation.
- Client OAuth déjà utilisé avec succès en local : ID dans la configuration de staging ignorée, secret dans `.dev.vars.staging` protégé en 0600, transmis par `--secrets-file` comme secret Cloudflare. Aucune valeur d'identifiant ou de secret copiée dans ce rapport.
- Secrets d'authentification et opérateur de staging conservés, distincts de ceux du local. D1 `bienvu-s00-staging`, R2 privé `bienvu-s00-private` et restrictions d'e-mails conservés. Bypass à `false`, imports et générations désactivés. Aucun changement des Workers Browser Run/Containers ni de leurs compteurs.

## Vérifications

| Nature | Vérification | Résultat |
|---|---|---|
| Fixtures locales | `tsx --test --test-concurrency=2 tests/auth-config.test.ts tests/accounts.test.ts` | 12 tests réussis ; sessions, agences, protections OAuth et préparation staging |
| Build local | Types Wrangler régénérés, `pnpm build:web` | Réussi, TypeScript inclus ; types inchangés sémantiquement |
| Paquet local | `wrangler deploy --dry-run` avec la configuration et le fichier de secrets de staging | Réussi ; sept secrets locaux connus recherchés dans 2 549 fichiers du build, aucune occurrence |
| Cloudflare réel | Déploiement puis lecture des bindings de la nouvelle version | ID client correct, secret Google présent comme `secret_text`, réglages existants conservés |
| HTTP distant réel | `/api/auth/status`, `/connexion`, `/api/me`, démarrage OAuth et origine étrangère | Google et e-mail actifs ; page 200, accès anonyme 401, origine étrangère 403 ; démarrage OAuth 200 |
| HTTP distant réel | URL d'autorisation émise par BienVu | Hôte Google, bon client, callback HTTPS exact, flux code, état présent, PKCE S256, scopes `openid email profile`, cookie d'état `Secure; HttpOnly; SameSite=Lax` |
| Navigateur distant | Inspection de l'application chargée | Agence authentifiée visible ; une session ouverte seule ne démontre pas une nouvelle connexion Google |
| Humain, fournisseur réel | Connexion Google effectuée par Alex sur le site Cloudflare | Alex confirme explicitement la connexion réussie et son agence retrouvée |

Le contrôle initial recherchant le texte du bouton dans le HTML brut a échoué : le formulaire est affiché après le chargement de session côté navigateur. Cette assertion n'était pas adaptée au rendu de la page. Son résultat initial est conservé séparément ; le contrôle HTTP ne prétend plus vérifier le bouton. L'inspection du navigateur et surtout la confirmation d'Alex documentent le parcours réel.

Les journaux et rapports expurgés restent locaux dans `evidence/remote/auth-google/` : `preflight.json`, `preparation.json`, `typegen.log`, `tests-local.log`, `build.log`, `dry-run.log`, `bundle-secret-scan.json`, `deploy.log`, `deployed-bindings.json`, `http-checks-initial.json` et `http-checks.json`. Les rapports de contrôle ne conservent ni URL OAuth avec état, ni code, cookie ou jeton fournisseur. Le répertoire privé `before/` conserve la configuration précédente hors Git.

## Limites et coût

Les scénarios avec deux propriétaires réels, les cas complémentaires OAuth/liaison entre méthodes et la recette distante complète des logos restent à effectuer. Aucun test de charge ni audit exhaustif de sessions n'est déduit de cette connexion réussie.

Aucun nouvel abonnement, envoi d'e-mail, rendu ou appel IA/TTS n'a été lancé pour cette activation. Quelques requêtes Worker/D1 et un déploiement utilisent les ressources existantes ; surcoût estimé nul, facture non rapprochée. Le budget de 30 € et ses provisions restent inchangés.

Sources consultées : [secrets Workers et envoi avec le déploiement](https://developers.cloudflare.com/workers/configuration/secrets/), [permissions Wrangler pour un Worker existant](https://developers.cloudflare.com/workers/authorization/workers/#wrangler). Les options ont été contrôlées dans Wrangler 4.142.0 installé. [Configuration et étapes complémentaires](../../AUTHENTIFICATION.md).
