# Connexion — nouvelle interface du 29/09/2026

La page [bienvu.online/connexion](https://bienvu.online/connexion) utilise maintenant le mot-symbole du studio et une démonstration vidéo à droite sur ordinateur, sous le formulaire sur mobile. La démonstration « Lumière sur Paris » reprend un média déjà utilisé dans Explorer : bien et agence fictifs, animation sans voix. Le bouton ouvre le MP4 avec commandes natives ; la fenêtre rend le focus au bouton à sa fermeture. La logique du composant `Login` et les routes d’authentification n’ont pas été modifiées.

## Vérifications

- `pnpm --filter @bienvu/web typecheck` et `pnpm check:boundaries` : réussis (127 fichiers contrôlés par les frontières).
- `CI=true pnpm build:web` : réussi ; avertissement tiers déjà présent dans `fast-png` sur un `??` sans effet sur la page. `wrangler deploy --config wrangler.staging.jsonc --dry-run` : réussi, bindings conservés.
- `node scripts/probe-login-studio.mjs --fixtures` sur `pnpm preview` : faux visiteur anonyme et configuration Google/e-mail simulés ; captures Chromium à 1536, 390 et 320 px sans débordement, logo et image visibles, modes connexion/inscription/mot de passe oublié accessibles, vidéo lue sur ordinateur et mobile émulé. Aucune requête de connexion ou e-mail réellement envoyée. Captures et rapport sous `evidence/local/login-studio/`, ignorés par Git.
- Déploiement Wrangler sur le domaine, version **`be65c293-0ced-41cb-a3a1-613d1ed9d7e5`**. `BIENVU_LOGIN_URL=https://bienvu.online node scripts/probe-login-studio.mjs` : mêmes contrôles sur les véritables pages, API de statut, image et MP4 ; lecture 28 s vérifiée en Chromium sur ordinateur et mobile émulé. Captures et rapport sous `evidence/remote/login-studio/`, ignorés par Git. Le `401` de `/api/me` est attendu pour le visiteur anonyme.

La recette distante ne s’est pas connectée à un vrai compte : les parcours Google et e-mail avaient été validés auparavant et leurs appels n’ont pas changé. Aucun essai sur appareil physique. Aucun achat, génération vidéo ni appel API fournisseur pendant cette refonte ; le trafic et la facturation Cloudflare n’ont pas été rapprochés.
