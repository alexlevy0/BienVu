# Sprint 02 — travail des 27–28 septembre 2026

> Rapport historique local. La recette distante du 28/09 est maintenant décrite dans le [rapport Cloudflare](RECETTE-DISTANTE.md).

> Rapport historique de la tranche initiale. Les connexions e-mail et Google réelles sont depuis validées, ainsi que le domaine bienvu.online. Les comptes sont déployés ; les réserves de configuration Google ci-dessous sont levées. La recette distante marque/logos/isolation reste ouverte : voir le [bilan actuel](../../BILAN-SPRINTS.md).

Ce rapport décrit la livraison initiale Google/marque. L’extension e-mail/mot de passe demandée ensuite par Alex est documentée séparément dans [EMAIL-MOT-DE-PASSE.md](EMAIL-MOT-DE-PASSE.md), avec ses preuves supplémentaires. Les 43 tests ci-dessous sont le résultat historique de la livraison initiale.

**Code livré et validé localement ; sprint non entièrement validé.** La connexion Google réelle et la recette du Worker déployé restent à effectuer. Les identifiants Google OAuth sont absents. Alex a demandé de poursuivre en local en attendant Workers Paid ; aucun déploiement ni essai Cloudflare supplémentaire n’a été lancé.

## Résultat utilisable

Une session Better Auth valide permet d’enregistrer le nom, les couleurs et au moins un contact de son agence, d’ajouter/remplacer un logo raster privé et de retrouver les réglages après rechargement. La déconnexion supprime la session en D1 et expire le cookie. L’agence est déduite de la session, jamais d’un identifiant envoyé par le client.

L’interface sans connexion invite à se connecter ; Google reste explicitement indisponible sans configuration. La commande opérateur de recette ouvre seulement un compte **synthétique local**, pas un compte Google. Aucun paiement, essai public ou quota de génération activé.

## Fichiers principaux

- `apps/web/lib/auth.ts`, `http.ts`, `owner.ts`, `logo.ts` : identité, garde serveur, corps bornés et normalisation raster compatible Workers.
- `apps/web/app/api/auth`, `api/me`, `api/agency` : routes fermées par défaut, profil et logos privés. `components/account.tsx` et `agency-form.tsx` : interface et états français.
- `packages/contracts/src/agency.ts`, `packages/db/src/agency.ts`, migration `0004_accounts_brand.sql` : validations, propriété, agence unique, identité essai, versions et plafonds d’écriture/stockage.
- `tests/accounts.test.ts`, `tests/logos.test.ts`, `scripts/probe-accounts.mjs`, `open-local-fixture.mjs` : tests et recette locale sans accès externe. Setup, types, CI, manifests et lockfile mis à jour.
- [Configuration OAuth](../../AUTHENTIFICATION.md), [guide local](../../DEVELOPPEMENT.md) et [suivi](../../SUIVI.md).

## Vérifications réellement exécutées

| Vérification | Résultat | Preuve |
|---|---|---|
| `pnpm check` | **43 tests réussis**, contrôle des frontières, TypeScript packages + tests | Journal (`docs/preuves/sprint-02/check.log`) |
| Tests comptes | Sessions signées, expiration/falsification, attribut Secure configuré pour HTTPS, instances distinctes, hooks concurrents, CSRF, retour externe, PKCE généré, déconnexion et quotas d’upload | Inclus dans `check.log` |
| Tests D1 | Migrations sur base vide, contraintes d’agence, marque persistante, version immuable, logo étranger et plafond de stockage | Inclus dans `check.log` |
| Tests raster | PNG/JPEG effectivement décodés et réencodés, transparence, palette, entrelacement, métadonnées supprimées, refus SVG/HTML/troncature/CRC/dimensions/poids | Inclus dans `check.log` |
| `pnpm db:migrate`, puis réapplication | Migration `0004` appliquée en local ; second passage sans migration restante | Application (`docs/preuves/sprint-02/migrations.log`), réapplication (`docs/preuves/sprint-02/migrations-repeat.log`) |
| `pnpm build:web` | Next.js 16.3.6 + OpenNext 1.20.6 ; Worker construit | Build final (`docs/preuves/sprint-02/build.log`) |
| `pnpm probe:accounts` sur ce build | Neuf groupes de contrôles HTTP réussis avec D1/R2 locaux, deux identités synthétiques, nettoyage final | Rapport (`docs/preuves/sprint-02/accounts-workerd.json`), journal (`docs/preuves/sprint-02/probe-accounts.log`) |
| `pnpm probe:foundations` et `pnpm probe:web` | Pages, protections, arrêt des générations et sonde opérateur D1/R2/cookie inchangés | Fondations (`docs/preuves/sprint-02/probe-foundations.log`), opérateur (`docs/preuves/sprint-02/probe-web.log`) |
| Inspection navigateur | Formulaire desktop, mobile 390×844, erreurs, sauvegarde, persistance après rechargement, déconnexion et accès refusé ; aucun débordement mesuré | Constats UI (`docs/preuves/sprint-02/inspection-ui.json`) |
| Scan des secrets locaux connus | Aucune occurrence dans les candidats Git | Résultat (`docs/preuves/sprint-02/secret-scan.json`) |

La sonde vérifie les autorisations avant R2 : visiteur 401, autre agence 404, propriétaire 200. Le MP4 n’est pas impliqué dans cette recette. Remplacer un logo conserve son ancien fichier et son identifiant dans une copie de marque sérialisée. Cela ne constitue pas une preuve de rendu vidéo utilisant cette marque, prévu aux sprints 06–07.

Les identités sont insérées par un script local disposant de D1 ; le reste passe par le vrai Better Auth et les vraies routes du build. Les tests Node utilisent également Miniflare pour D1. Ce sont des **données de fixtures sur des composants locaux réels**, pas une validation Google ou Cloudflare distante. Les URL d’autorisation ont été générées avec des identifiants factices, sans les ouvrir chez Google.

Le build signale un avertissement non bloquant d’esbuild sur une expression `??` de fast-png 8.0.0. Les imports, le décodage/réencodage et la livraison PNG/JPEG passent dans workerd. Un build antérieur utilisait les contrôles de types avant les derniers ajustements ; seule la version finale référencée ci-dessus constitue la preuve livrée.

Pendant le développement, les premiers tests ont mis en évidence que l’API interne de création d’utilisateur Better Auth exige son contexte OAuth, et que son contrôle d’origine dépend du contexte cookie. Les fixtures créent donc leurs utilisateurs explicitement en D1 ; l’application impose toujours son propre contrôle d’origine sur les mutations. Ces essais initiaux échoués n’ont pas été comptés comme validations.

## Critères d’acceptation

1. **Partiel** : session, rechargement et déconnexion vérifiés dans workerd avec une identité synthétique. Connexion Google réelle et cookies en staging à vérifier.
2. **Local validé** : plusieurs créations de session et initialisations concurrentes conservent une seule agence et une seule trace d’essai, sans allocation publique. Double callback OAuth réel restant dans la recette externe.
3. **Local validé** : nom/couleurs/contacts persistants et messages français vus sur mobile.
4. **Local validé** : deux propriétaires, identifiant forgé refusé, données et logos isolés. Aucune URL signée émise.
5. **Local validé** : session absente/expirée/falsifiée refusée, fichiers malveillants/corrompus refusés, normalisation effective.
6. **Validé dans cette tranche** : aucune écriture d’allocation, job ou coût et aucun appel de rendu/IA lié aux changements de marque.

## Limites et reprise

- Google OAuth à configurer puis tester réellement selon [la procédure](../../AUTHENTIFICATION.md). Le consentement, le retour fournisseur réussi et son rejeu ne sont pas simulés comme réussis.
- Staging inchangé : migrations, secrets dédiés, build/déploiement et recette de deux comptes réels à faire après reprise autorisée des essais distants. Mesurer aussi CPU/mémoire au poids maximal ; la durée locale ne prouve pas le respect de Workers Free.
- Pas d’invitations, équipe, mot de passe, paiement, suppression de compte ni éditeur. Le pipeline de génération reste fermé, sans intégration métier de l’authentification sur ses routes encore provisoires.
- Anciens logos conservés, 64 versions/32 Mio maximum par agence ; pas de purge automatique pouvant casser un manifeste. Les uploads interrompus gardent une réservation identifiable. La réconciliation des orphelins et la suppression de compte devront intégrer les références des jobs avant exploitation durable.
- Le sélecteur de fichier natif n’a pas été manipulé dans le navigateur ; les uploads ont été éprouvés par HTTP et leurs images affichées dans le formulaire.
- CI étendue à la sonde comptes, mais aucun résultat GitHub de cette tranche n’a été vérifié. Aucun commit/push de ces modifications effectué.

## Coût et état de fin

**0 appel Google réel, 0 appel API IA/TTS, 0 opération Cloudflare distante, 0 achat.** Aucun conteneur Docker lancé. Dépendances téléchargées et documentation consultée, sans consommation applicative facturable. Coût fournisseur supplémentaire attendu : **0 €** ; facture non relue, budget mensuel toujours 30 € sous réserve de sa réconciliation.

Comptes et objets de recette nettoyés, fichier temporaire de cookies supprimé. Serveur local workerd conservé sur `http://localhost:8787` pour inspection. Les tests Containers et le rendu hébergé du sprint 00 restent séparément non validés.
