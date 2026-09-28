# Raccordement de bienvu.online — 28 septembre 2026

## Résultat et périmètre

À la demande d'Alex, [bienvu.online](https://bienvu.online) est rattaché au Worker existant `bienvu-web-probe-staging`. HTTPS est opérationnel et les pages/API HTTP redirigent vers HTTPS avec un statut 308. Alex confirme avoir ajouté l'origine et le callback dans Google, puis confirme une connexion Google réussie sur le nouveau domaine avec son agence retrouvée.

- Origine : `https://bienvu.online` ; callback : `https://bienvu.online/api/auth/callback/google`.
- Version initiale du raccordement et de la recette humaine : `ea61cf31-3d98-4ea6-b5b0-61177114f970`.
- Version finale, ajout de la redirection HTTPS : `2c2f5e24-23a4-45a0-8b4e-14ca99a11b7a`.
- D1, R2 privé, secrets et client Google existants conservés. Une reconnexion est nécessaire sur le domaine : aucun transfert de cookie entre hôtes.
- Le site reste une version de développement. Les imports/générations sont désactivés ; les e-mails restent limités au destinataire de recette. Aucun paiement activé.

## Changements

`scripts/prepare-staging.mjs` accepte `BIENVU_WEB_CUSTOM_DOMAIN`, vérifie sa concordance avec l'origine HTTPS et prépare un Custom Domain. `workers_dev` et les URL de prévisualisation sont désactivés pour conserver une seule adresse publique d'authentification. Les configurations locales restent en HTTP.

Le contrôle réel initial a montré que Cloudflare servait aussi la page de connexion en HTTP. La lecture du réglage de zone `always_use_https` a été refusée par l'API avec les droits OAuth existants (403). La redirection est donc appliquée dans `apps/web/worker.ts`, point d'entrée qui réutilise OpenNext. `lib/https-redirect.ts` utilise l'origine configurée, conserve chemin/paramètres et ignore les en-têtes d'hôte ou de protocole fournis par le client. Les types Wrangler ont été régénérés.

La sonde d'e-mails distante accepte les deux adresses connues du même Worker, mais refuse de reprendre les cookies ou les preuves d'une recette enregistrée sur une autre origine. Aucun message n'a été renvoyé.

## Vérifications distinctes

| Nature | Vérification | Résultat |
|---|---|---|
| Fixtures locales | `pnpm exec tsx --test --test-concurrency=2 tests/https-redirect.test.ts tests/auth-config.test.ts` | 5 tests réussis : redirection, absence de boucle, maintien du HTTP local, origine invalide, protection contre les en-têtes forgés et préparation staging |
| Local | Garde de la sonde e-mail avec l'état historique | Reprise refusée avant tout accès réseau ; preuves anciennes conservées |
| Build et types | `pnpm build:web`, typegen web, typecheck web, `tsc -p tsconfig.tests.json`, `pnpm check:boundaries` | Réussis ; avertissement connu de fast-png sans échec de build |
| Paquet | Dry-run Wrangler après la modification du point d'entrée ; recherche de six secrets connus dans 2 549 fichiers OpenNext | Réussi ; aucune occurrence de secret |
| Cloudflare réel | Zone active, prévisualisation du rattachement, Custom Domain et certificat, lecture des bindings après chaque déploiement | Aucun conflit DNS ; seule l'origine change dans les bindings ; workers.dev/prévisualisations désactivés |
| DNS réel | Comparaison MX/SPF/DKIM/DMARC avant/après | DNS d'envoi conservés ; résolution du domaine web disponible |
| HTTPS réel | Accueil, connexion, CSS, statut auth et accès anonyme | Pages/CSS 200 ; Google/e-mail actifs ; `/api/me` anonyme 401 |
| OAuth réel, contrôles HTTP | Démarrage Google, client, callback, code, scopes, PKCE, état, cookie et origine étrangère | Callback bienvu.online exact ; scopes identité/e-mail/profil ; cookie Secure/HttpOnly/Lax ; origine étrangère refusée avec 403 |
| Humain, fournisseur réel | Connexion Google sur bienvu.online | Alex confirme la connexion et l'agence retrouvée sur la version initiale du raccordement |
| HTTPS réel, version finale | Redirections de `/`, `/connexion?verified=1` et `/api/auth/status`, puis page HTTPS et démarrage OAuth | 308 vers le même chemin HTTPS ; page 200, callback et protections conservés |
| Navigateur réel | Formulaire Google/e-mail et inspection visuelle de l'accueil sur le domaine | Application affichée correctement, mention de développement visible |

Les nouveaux fichiers locaux de preuve sont dans `evidence/remote/web-domain/`, ignorés par Git : `before/`, `preparation.json`, `probe-origin-guard.json`, `tests-local.log`, `boundaries.log`, `build.log`, `typegen.log`, `typecheck.log`, `bundle-secret-scan.json`, `dry-run.log`, `deploy.log`, `http-checks.json`, `deployed-bindings.json`, `https-dry-run.log`, `https-deploy.log`, `final-http-checks.json` et `final-deployed-bindings.json`. Les rapports n'enregistrent ni cookie, ni code OAuth, ni URL d'autorisation contenant un état.

## Limites, coût et retour arrière

La recette humaine Google a précédé le second déploiement, qui ajoute uniquement la redirection HTTP ; le chemin HTTPS et les bindings ont été recontrôlés après celui-ci. Les envois d'e-mails réels restent ceux de la recette historique sur workers.dev : aucun nouvel envoi n'est revendiqué pour le domaine. Les scénarios complémentaires du sprint 02 restent ouverts.

Aucun nouvel abonnement ni achat. Deux déploiements et quelques appels Worker/D1/OAuth utilisent les ressources existantes, sans rendu, Browser Run ou IA/TTS. Surcoût estimé nul dans les allocations actuelles ; facture non rapprochée et budget de 30 € inchangé.

Pour revenir à workers.dev, restaurer l'origine précédente dans la configuration locale ignorée, retirer la route du domaine, réactiver explicitement `workers_dev`, vérifier le callback Google encore enregistré, puis effectuer dry-run et déploiement. La copie `before/wrangler.staging.jsonc` conserve les réglages antérieurs ; la réinstaller à son emplacement d'origine avant de l'utiliser, car ses chemins sont relatifs. Contrôler ensuite les routes réellement publiées et supprimer le seul rattachement web devenu inutile, sans modifier les DNS d'e-mails. D1/R2 et secrets restent conservés ; aucune migration de données nécessaire.

Références : [Custom Domains Cloudflare](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [point d'entrée personnalisé OpenNext](https://opennext.js.org/cloudflare/howtos/custom-worker), [guide OAuth Google](https://developers.google.com/identity/protocols/oauth2/web-server). [Configuration reproductible](../../AUTHENTIFICATION.md#domaine-bienvuonline).
