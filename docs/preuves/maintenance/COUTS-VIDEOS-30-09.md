# Coûts de narration par vidéo — 30 septembre 2026

## Résultat publié

Dans [Super admin → Vidéos](https://bienvu.online/admin?view=videos), ouvrir **Détails**. La section **Coût de la narration** affiche l’estimation OpenAI, celle de Google et la provision des appels en euros. Un tableau détaille les appels et une section dépliable expose le modèle, les tokens d’entrée/cache/sortie, la durée, la date du tarif et les identifiants de requête/réponse OpenAI. Les petits montants restent visibles grâce aux six décimales.

Les montants proviennent du journal existant, pas de nouveaux appels. La projection SQL ne sélectionne que les métriques nécessaires. Aucun prompt, résultat complet, secret ou clé de stockage n’est exposé. Les corrections OpenAI sont comprises dans les totaux et chaque ligne est comptée une fois. Les données absentes ou invalides restent inconnues ; les totaux incomplets sont signalés. Les fixtures sont explicitement non facturées. Un zéro réellement mesuré reste un zéro.

Fichiers : `packages/contracts/src/admin.ts`, `packages/db/src/admin.ts`, `apps/web/components/admin-panel.tsx`, `apps/web/app/admin/admin.css`, `tests/admin.test.ts`, `scripts/probe-admin-ui.mjs`, [guide](../../ADMINISTRATION.md) et [suivi](../../SUIVI.md). Aucune nouvelle migration ou modification des connecteurs fournisseurs.

## Vérification locale et fixtures

- `pnpm exec tsx --test tests/admin.test.ts` : **10 tests réussis**, aucun échec. Projection des métriques, montant positif/zéro/absent/négatif, appels réels/simulés, exclusion du contenu privé, provisions inchangées ; régressions Better Auth/D1/R2 et actions administratives.
- `pnpm typecheck` et `pnpm check:boundaries` : réussis, **175 fichiers** contrôlés pour les frontières.
- `pnpm build:web` et dry-run Wrangler du Worker compilé : réussis. Avertissement préexistant non bloquant de `fast-png` conservé.
- `scripts/probe-admin-ui.mjs` : **données synthétiques**, session locale, 1536 et 390 px. Montants, tokens, identifiants, total partiel, appel inconnu et fixture non facturée vérifiés. Dix onglets, pagination/recherche et actions avec motif toujours fonctionnels. Aucun débordement de page ; la table défile dans son propre conteneur sur mobile. Captures inspectées.

Les données marquées « Réel » dans cette recette UI sont des exemples synthétiques. Le navigateur de fixture n’a appelé ni OpenAI ni Google. La suite complète de 198 tests avait réussi pour le panneau initial ; cette maintenance a exécuté les **10 tests ciblés**, pas une nouvelle suite complète.

Journaux et captures ignorés dans `evidence/local/admin/` : `cost-tests.log`, `cost-types.log`, `cost-build.log`, `cost-dry-run.log`, `cost-browser.log`, `ui-report.json`, `narration-costs-1536.png`, `narration-costs-390.png`.

## Vérification réelle

Lecture opérateur D1 des **cinq jobs existants** via la même projection `adminVideoDetail`, sans modification ni appel fournisseur. Les trois requêtes OpenAI avec métriques conservées donnent **0,001863**, **0,001823** et **0,001675 USD**. Les anciens appels sans métriques restent non mesurés.

Avec la **vraie session Chrome du propriétaire**, ouverture du dernier appartement de Lyon sur le domaine :

| Mesure affichée | Valeur |
| --- | --- |
| OpenAI, un appel mesuré | 0,001863 USD |
| Modèle | gpt-5.4-mini-2026-03-17 |
| Tokens entrée / sortie / cache | 1 367 / 186 / 0 |
| Durée de l’appel | 2 690 ms |
| Date du tarif conservé | 2026-09-28 |
| Google, cinq appels mesurés | 0,007710 USD |
| Provision de ces six appels | 0,30 EUR |

Les identifiants OpenAI sont visibles dans le panneau privé. La vidéo existante charge correctement : `readyState=4`, durée **20,053 s**, aucune erreur du lecteur. Aucun débordement de page. Ces observations de production sont distinctes des fixtures ordinateur/mobile ; aucune nouvelle écoute humaine n’est revendiquée.

Preuves protégées et ignorées : `cost-remote-report.json`, `cost-remote.log`, `cost-production-browser.json`, `cost-production.png`, `cost-production-detail.png`.

## Publication et protections

Worker web **`bienvu-web-probe-staging`**, version **`2f1014af-34a8-4942-95b4-9d640c4a7127`** publiée à 100 % sur **bienvu.online**, en conservant variables, secrets, bindings et configuration du domaine (`--keep-vars --strict`). Version précédente : `ec75534e-9d49-4e5e-b7b3-86399ddd5d50`.

Contrôles HTTP distants : accueil/robots **200** ; page admin anonyme **307** vers connexion ; API aperçu, détail et média admin anonymes **401**, sans cache partagé. Les comptes ordinaires restent refusés par les tests locaux du contrôle d’accès commun. Registres réels inchangés : **2 comptes, 1 agence, 5 jobs, 0 abonnement**. Aucun POST administratif réel ou changement de quota.

Journaux ignorés : `cost-deploy.log`, `cost-production.log`, `production-report.json`, `production-after.json`.

## Interprétation et budget

Le tarif OpenAI conservé estime le coût **avant remise cache**. La [documentation officielle de GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) vérifiée durant cette maintenance affiche 0,75 USD/million de tokens d’entrée, 0,075 USD/million de tokens en cache et 4,50 USD/million de tokens de sortie. Les métriques historiques n’ont pas été recalculées avec un nouveau prix. Google conserve une estimation **avant gratuité mensuelle** ; l’utilisation gratuite effective du compte n’est pas connue du panneau.

Ces estimations sont en USD, hors taxes et conversion. La facture effective et le coût Cloudflare par vidéo restent **inconnus**. La provision EUR est une réserve préventive déjà incluse dans le budget vidéo ; elle ne s’additionne pas à nouveau au total du pilote et ne constitue pas le prix de l’appel.

Avant/après : budget D1 **44,30 €**, plus provision historique hors D1 **0,05 €**, soit **44,35 €/50 €** au suivi prudent ; marge **0,65 € avant coupure à 45 €**. Aucun nouvel appel texte/voix, import, rendu ou e-mail pour cette maintenance. La consommation d’infrastructure de la recette n’a pas été rapprochée de la facture.
