# Super admin — recette du 30 septembre 2026

## Livré

Le propriétaire a confirmé **alexlevy0@gmail.com**. Le menu du compte affiche « Super admin » après « Mon abonnement » uniquement pour cette adresse vérifiée. La page privée est disponible sur [bienvu.online/admin](https://bienvu.online/admin).

Dix rubriques : vue d’ensemble, vidéos, agences, comptes, abonnements, quotas, imports/brouillons, signalements, service/budget et journal. Les vidéos comprennent tous les jobs conservés, y compris anonymes, échecs et tests internes. Recherche, statut/origine, dates UTC, pagination stable de 30 éléments, détail, lecteur privé et export CSV des lignes affichées. Les métadonnées d’un job expiré restent visibles ; un fichier supprimé ne devient pas récupérable. La colonne « Fichier » tient compte des droits réels de lecture, et ne présente pas une génération échouée comme un MP4 disponible.

Les actions disponibles sont l’ajustement d’un quota actif, le traitement d’un signalement et la pause/reprise des nouveaux lancements. Un motif est obligatoire. Validation, modification et audit passent par une seule écriture D1 avec des triggers atomiques ; conflit si la valeur attendue a changé. Pas de remise à zéro des crédits consommés/réservés, pas de changement de type de crédit, pas d’essai supérieur à un crédit. Journal immuable et limite de 20 modifications/minute par administrateur.

## Fichiers

- `packages/contracts/src/admin.ts`, `agency.ts` : requêtes strictes, actions et projections, indicateur de rôle dérivé côté serveur.
- `packages/db/src/admin.ts`, `migrations/0023_admin_audit.sql` : requêtes paramétrées, pagination, indicateurs et audit.
- `apps/web/lib/admin-access.ts`, `admin.ts`, `app/admin`, `app/api/admin` : contrôle de session/rôle sur la page et chacune des API, lecture privée R2, protection des POST.
- `apps/web/components/admin-panel.tsx`, `studio-sidebar.tsx`, `studio-frame.tsx`, `home-icons.tsx` : interface, menu et actions.
- Configuration serveur, exemple local, préparation distante, types Cloudflare et exclusion `/admin` dans `robots.txt`.
- `tests/admin.test.ts`, `scripts/probe-admin-ui.mjs`, [guide d’exploitation](../../ADMINISTRATION.md).

## Vérifications locales et fixtures

**`pnpm check` réussi : 198 tests, 0 échec**, typage des applications/packages/tests et frontières sur 175 fichiers. Les neuf tests administratifs emploient Better Auth et D1/R2 locaux avec des identités synthétiques signées : compte invité, compte ordinaire, adresse non vérifiée, rôle configuré, projections sans secrets, paramètres invalides, injection SQL, recherche littérale et curseurs avec accents, 36 jobs sans doublon, médias/ranges/HEAD, expiration, CSRF, quota, conflit, journal atomique et immuable. Les tests existants d’isolation restent verts.

**`pnpm build:web`**, typegen et dry-run `wrangler deploy --keep-vars --strict --dry-run` réussis. Avertissement préexistant non bloquant de `fast-png` sur `??`, sans erreur de compilation.

La sonde HTTP du Worker compilé local contrôle les neuf lectures admin, `/api/me`, la page 307 sans session, la page 404 pour un compte ordinaire, les API 401/403 et leurs en-têtes privés, sans remplacement des réponses HTTP. La recette UI est distincte : API et action de quota simulées dans le navigateur, session locale signée requise par le serveur, vidéo de démonstration existante. À **1536 et 390 px**, les dix rubriques, 36 résultats/pagination, recherche vide, détail vidéo, formulaire avec motif, sauvegarde simulée, ouverture/annulation des autres actions et menu passent, sans débordement de la page. La disponibilité d’un MP4 échoué est aussi vérifiée. Les captures ont été inspectées.

Commandes de recette :

```sh
pnpm check
pnpm build:web
pnpm --filter @bienvu/web typegen
node scripts/probe-admin-ui.mjs
```

Les preuves brutes sont ignorées dans `evidence/local/admin` : `full-check.log`, `build.log`, `dry-run.log`, `http-report.json`, `ui-report.json`, captures ordinateur/mobile. Les sessions/configurations synthétiques n’entrent pas dans Git. La recette UI nécessite leur préparation locale ; elle ne doit pas être exécutée contre une base de production.

## Vérifications réelles Cloudflare

Migration additive **0023** appliquée à la D1 du domaine sans modification des anciens comptes, jobs ou crédits. Worker web publié à 100 % : **`ec75534e-9d49-4e5e-b7b3-86399ddd5d50`**. Tous les autres bindings, variables, noms de secrets, paramètres de compatibilité et domaine conservés ; seule l’adresse serveur Super admin a été ajoutée. Le Worker de génération et son renderer n’ont pas été redéployés.

Lectures administratives réelles des huit listes et de la vue d’ensemble via l’opérateur D1, sans usurpation ni écriture dans les comptes. Résultats au moment de la recette : **1 agence client, 2 comptes, 5 jobs, 4 prêts, 1 échec, 0 abonnement, 0 signalement**. Les agences anonymes/internes ne gonflent pas le compteur des clients.

Avec le contrôle Chrome et la session existante d’Alex, la vraie page a été relue : menu « Mon abonnement → Super admin », dix rubriques, compteurs correspondants, liste des cinq générations, détail, événements et appels fournisseurs historiques, abonnements vides et service/budget. Le master d’une vidéo existante charge via l’API admin privée : durée **20,053 s**, `readyState=4`, aucune erreur média. Cette vérification de lecture ne constitue pas une nouvelle écoute humaine de la voix. Aucun formulaire administratif n’a été validé en production. Captures privées conservées dans `evidence/local/admin/production-*.png`.

HTTP réel sans session : accueil et robots **200**, page `/admin` **307** vers la connexion, API globale/détail/MP4 **401** avec `no-store`. `/admin` exclu de l’indexation, pages publiques toujours accessibles. Les refus d’un compte ordinaire et les POST sont vérifiés localement ; aucune session réelle du second compte n’est utilisée pour leur recette distante.

## Budget et limites

Aucun nouvel import, rendu, appel OpenAI/Google TTS ou e-mail. D1 avant/après conserve **30,80 € de base + 13,50 € d’imports = 44,30 €**, coupure **45 €**. Avec les **0,05 € historiques hors registre**, le total prudent reste **44,35 €/50 €**, soit **0,65 € sous la coupure**. Factures, taxes et trafic d’exploitation restent à rapprocher.

Les abonnements reflètent le registre existant ; l’intégration des paiements Stripe reste à faire. Une ancienne allocation « Payant » ne prouve pas un encaissement. La vue n’invente pas de chiffre d’affaires. Le stockage est un total de métadonnées médias/imports, pas l’inventaire R2 complet. Les e-mails et les logs Cloudflare ne disposent pas encore d’un historique exhaustif de livraison dans l’application. Les imports/faits déjà purgés ne sont pas recréés.

Les actions de quota, signalement et pause/reprise sont vérifiées sur D1 local et sur fixtures UI ; elles n’ont pas été rejouées sur les données réelles. Les preuves du déploiement, de configuration et de budget restent protégées dans `production-report.json`, `production-before.json`, `production-after.json`, `remote-data-report.json` et les logs locaux ignorés.
