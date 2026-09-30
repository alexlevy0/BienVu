# Indicateurs Super admin — 30 septembre 2026

## Résultat publié et propositions

Quatre améliorations sont disponibles dans [Super admin](https://bienvu.online/admin) :

- **Fréquentation** : chargements HTML publics par jour, page et pays, sur 7/30 jours UTC.
- **Points d’attention** : budget, échéances dépassées, échecs du jour, signalements, abonnements en retard, comptes non vérifiés et fermeture des lancements. Les cartes ouvrent les vues utiles avec leurs filtres.
- **Performance** : réussite parmi les jobs finalisés créés sur 30 jours, jobs actifs séparés et durée moyenne de la création à l’événement réel `ready`.
- **Coûts mensuels** : estimations OpenAI/Google conservées, nombre d’appels réels, mesurés, échoués et fixtures ; totaux partiels explicites.

Les propositions suivantes et leurs préalables sont détaillés dans [le guide d’administration](../../ADMINISTRATION.md) : journal de livraison e-mail, santé des imports par portail, parcours essai → compte → téléchargement, revenus Stripe et stockage/purges R2. La livraison e-mail est proposée en premier, puis les imports et la récupération des essais. Les revenus nécessitent des paiements réellement intégrés ; aucun chiffre d’affaires n’est déduit des quotas.

## Implémentation et données

Fichiers : contrats `packages/contracts/src/admin.ts`, projections `packages/db/src/admin.ts` et `traffic.ts`, migration **0024**, route privée `apps/web/lib/admin.ts`, composants `admin-panel.tsx` / `admin-insights.tsx`, CSS admin, collecte `apps/web/lib/traffic.ts`, Worker web, configuration Wrangler, typegen, texte de confidentialité, préparation distante, tests et sonde UI.

La migration additive `0024_admin_traffic.sql` ajoute uniquement `admin_traffic_daily`, à quatre colonnes **day/page/country/views**. Appliquée localement et sur D1 distant après export protégé ; aucun registre produit reconstruit. `TRAFFIC_ENABLED=true` active la collecte distante, désactivée par défaut en local. Aucun secret nouveau ou fournisseur d’analytics ajouté.

Seuls les GET HTML 200 des cinq chemins publics sur le domaine principal sont comptés. Espaces privés, API, assets, paramètres, préchargements, réponses RSC et certains robots reconnaissables sont exclus. Rechargements et visites de l’administrateur peuvent compter ; la navigation interne sans nouveau chargement HTML n’est pas mesurée. Le pays provient uniquement de [request.cf.country](https://developers.cloudflare.com/workers/runtime-apis/request/), pas du header client. C’est une origine réseau approximative, potentiellement celle d’un VPN, sans position exacte ni visiteurs uniques. Aucune IP, ville, coordonnée, session, cookie analytique, e-mail, recherche, URL complète ou référent n’est stocké dans ce registre.

UPSERT atomique lié à `ctx.waitUntil()`, compteur borné par jour/page/pays, erreur avalée avec log sans données privées. Agrégats conservés environ 31 jours ; cron web **03:23 UTC**, `23 3 * * *`, y compris lorsque la collecte est arrêtée. L’API de lecture est réservée au Super admin, avec cache privé et requêtes strictes.

Les coûts utilisent les métriques historiques, sans nouveau tarif, conversion ou facture inventée. Les fixtures ne sont pas facturées ; les mesures absentes restent inconnues. La durée utilise le véritable événement de disponibilité, pas `updated_at`, qui peut changer lors d’une purge. Les traitements actifs sont exclus du dénominateur du taux de réussite.

## Tests locaux et fixtures

- **`pnpm check` final : 202 tests réussis, zéro échec**, types complets et frontières sur **178 fichiers**.
- Typegen web, `pnpm build:web` Next/OpenNext et dry-run Wrangler final réussis. Avertissement préexistant `fast-png` non bloquant.
- Tests D1 locaux : seize UPSERT concurrents, fenêtres 7/30 jours, colonnes minimales, purge, collecte désactivée, exclusion des pages privées et tentative de pays forgé, panne de collecte sans interruption du HTML.
- Régressions admin : rôle et refus 401/403, validation des paramètres, comptes non vérifiés, coûts réels/inconnus/simulés, moyenne et stabilité après modification de rétention.
- Sonde UI **sur fixtures**, à **1536 et 390 px** : treize rubriques, fréquentation/période, performance, totaux partiels, carte d’attention vers comptes filtrés, pagination de 36 vidéos, recherche, détail et lecteur de démonstration, actions avec motif. Aucun débordement global ; captures inspectées. Aucun appel fournisseur dans cette sonde.
- Handler du Worker compilé exécuté via l’endpoint scheduled local : **HTTP 200, outcome `ok`**. La suppression d’un agrégat expiré est vérifiée séparément dans le test D1 ; cette exécution locale n’est pas la première nuit Cloudflare.

Les premiers passages ont trouvé des défauts de nouvelles fixtures/projections, corrigés avant la recette finale. Un passage général pendant un build lourd avait donné 199/202, avec délai d’un test de purge et ECONNRESET local. Les deux fichiers concernés ont ensuite passé **10/10 isolément**, sans modification du produit, puis la suite complète finale a passé **202/202**. La sonde UI a aussi été corrigée pour attendre la nouvelle réponse après un changement de rubrique. Aucun succès initial fictif n’est revendiqué.

Journaux ignorés : `evidence/local/admin/insights-check-clean.log`, `insights-types-final.log`, `insights-build-final.log`, `insights-dry-run-final.log`, `insights-browser-final.log`, `insights-regression-retry.log`, `insights-cron-local.json`. Captures fixtures : `traffic-*`, `performance-*`, `monthly-costs-*`, `overview-*`.

## Recette réelle après publication

Worker **bienvu-web-probe-staging**, version **`c7621f57-eefa-441d-b83c-dabdc52b9663`**, publiée à **100 %** sur **bienvu.online** avec `--keep-vars --strict`. Version précédente : `2f1014af-34a8-4942-95b4-9d640c4a7127`. Bindings, secrets, variables, compatibilité et modèle d’usage antérieurs contrôlés et conservés ; seule la variable de collecte est ajoutée. Cron enregistré auprès de Cloudflare. Sa première exécution nocturne distante reste **à observer** ; elle n’est pas déclarée réalisée.

HTTP distant : accueil/robots 200, admin anonyme 307 vers connexion, API admin aperçu/fréquentation/détail/média anonymes 401 et `no-store`. Registres produit et provisions identiques avant/après : **5 jobs, 2 comptes, 0 abonnement**.

Lecture D1 réelle et vraie session Chrome du propriétaire :

| Indicateur | Mesure observée |
| --- | --- |
| Jobs finalisés sur 30 jours | 4 prêts, 1 échec, aucun actif |
| Réussite | 80 % |
| Durée moyenne, 4 vidéos chronométrées | 202,453 s, affichée 202 s |
| OpenAI, septembre | 0,005361 USD, **3 appels mesurés sur 4**, partiel |
| Google, septembre | 0,023370 USD, **15 appels mesurés sur 20**, partiel |
| Points d’attention | Budget à surveiller ; un compte non vérifié |
| Carte des comptes à suivre | Ouvre Comptes avec « Non vérifié » sélectionné |
| Fréquentation initiale | Aucune mesure, collecte active |
| Après un vrai chargement de l’accueil | **1 page, FR/France, home**, premier jour 2026-09-30 |
| Période 7 jours | Même agrégat réel visible |

Les treize rubriques et l’absence de débordement ont été contrôlées dans le navigateur réel. Le chargement de l’accueil de recette est inclus dans la fréquentation, pas présenté comme un visiteur client. Aucun historique de visites antérieures n’est reconstitué. La relecture opérateur D1 avait reçu un 403 ; après contrôle d’authentification Wrangler, elle a réussi. La page privée continuait à fonctionner pendant ce refus opérateur.

Preuves protégées et ignorées : `insights-before-migration.sql`, `insights-production-before.json`, `insights-production-after.json`, `insights-production-report.json`, `insights-remote-report.json`, `insights-production-browser.json`, `insights-production.png`, `insights-production-country.png`, logs de migration/déploiement/recette. Le backup et les données brutes ne sont pas ajoutés à Git.

## Budget, limites et vérifications restantes

Budget D1 avant/après **44,30 €**, plus provision historique hors D1 **0,05 €** : suivi prudent **44,35 €/50 €**, marge **0,65 € avant coupure à 45 €**. Aucun import, rendu, appel OpenAI/Google, e-mail ou POST administratif réel lancé pour cette maintenance. Le compteur de trafic écrit dans D1 et le cron utilise l’infrastructure existante ; cette consommation n’a pas été rapprochée de la facture et n’est pas déclarée gratuite.

Restant : première purge nocturne Cloudflare à observer ; rapprochement des factures fournisseur/infrastructure ; nouvelles fonctions proposées encore non implémentées. Les coûts affichés sont des estimations historiques avant remise cache/gratuité et ne donnent pas le prix complet d’une vidéo. La recette mobile repose sur des fixtures ; le contrôle distant utilise la vraie session de bureau. Le serveur de recette local est arrêté en fin de travail. Aucun commit/push demandé pour cette maintenance.
