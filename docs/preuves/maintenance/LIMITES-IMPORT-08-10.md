# Imports par lien — plafond mensuel relevé le 08/10/2026

## Changement demandé

Alex a consommé 55 imports le 8 octobre et souhaite disposer d’une marge pour finir le mois. Le plafond partagé passe de **60 à 300 tentatives par mois UTC** ; les **20 tentatives quotidiennes UTC** restent en place. Ce quota est distinct des crédits vidéo et du budget financier. Il s’applique aux mois suivants également.

- Migration additive `0053_monthly_import_allowance.sql` : remplacement transactionnel du trigger `import_budget`, sans modifier `import_usage` ni les coûts provisionnés. L’admission reste atomique entre agences.
- Contrat `URL_IMPORT_QUOTAS` partagé par les droits d’import, l’admission de génération, l’affichage superadmin et les sondes opérateur. Le service de génération est publié aussi, car il utilise les droits avant d’admettre une URL.
- Les dossiers manuels et démonstrations restent hors compteur de scraping ; leurs protections financières, limites de photos et cadence de création sont conservées. Les échecs restent comptés et un rejeu idempotent ne consomme pas de nouvelle tentative.

## Vérifications locales

**14 tests ciblés réussis** : migrations historiques, compteur conservé lors de la hausse, ancien plafond de 60 débloqué, plafond quotidien, renouvellement UTC, dernière place mensuelle attribuée une seule fois sous concurrence, rejeu et budget financier indépendant. Les fixtures utilisent D1/R2 locaux et aucun fournisseur externe.

```sh
pnpm exec tsx --test --test-concurrency=2 tests/import-limit-migration.test.ts tests/import-budget.test.ts tests/import-storage.test.ts
pnpm typecheck
pnpm build:web
```

Frontières vérifiées sur **425 fichiers**, typage complet, build Next/OpenNext, dry-runs des Workers web et génération, syntaxe des sondes et `git diff --check` réussis.

La suite générale lancée pendant la compilation a rencontré deux échecs de recette (voix Cartesia et brouillon partagé), puis a été interrompue ; elle n’est pas annoncée comme réussie. Les deux fichiers correspondants ont ensuite été relancés séparément, **10 tests réussis**, sans modification de ces parcours :

```sh
pnpm exec tsx --test --test-concurrency=1 tests/cartesia-voice.test.ts tests/creation-workflow.test.ts
```

## Publication et observation distante

Sauvegarde SQL privée avant migration : **1 421 406 octets**, SHA-256 `5025c8cfab0f8e0cae8d62bdd2106d280ac810f4a3d54db048189dffd5d2deb9`. Migration `0053` appliquée seule, après confirmation des migrations déjà présentes jusqu’à `0052`.

Versions publiées à **100 %** :

| Worker | Version | Bindings conservés |
| --- | --- | --- |
| Web, `bienvu.online` | `6d500470-9f6e-4756-a875-00d7c6f9a63c` | 50 |
| Génération | `ca1e8dd6-4e10-4a9d-b5be-02e1a9ba9365` | 30 |

Les bindings avant/après sont identiques, y compris les variables, secrets, ressources et services. Le déploiement de génération utilise `--containers-rollout none` : image du renderer conservée, aucun nouveau rendu. Importer inchangé.

Lecture D1 après publication : trigger **20/jour et 300/mois**, migration enregistrée, **55 imports d’octobre conservés / 245 places restantes**, aucun défaut de clé étrangère. Les historiques d’usage, paramètres et provisions budgétaires, contrôle d’admission, politique de paiement et nombres de dossiers/jobs/recettes sont identiques avant/après.

API publiée vérifiée avec une identité synthétique jetable : `/api/me` **200**, `importRetryAt: null`, compteur réel **55/mois et 1/jour**. Le premier nettoyage rencontrait la protection du propriétaire d’agence ; la sonde a été actualisée et le compte de recette supprimé dans un [batch D1 transactionnel](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), avec restauration de la protection dans la même transaction. Identité et agence synthétiques absentes après nettoyage, définition du trigger inchangée, zéro défaut FK. Aucun compte réel n’a été utilisé pour cette sonde.

Le budget reste à **77,25 € provisionnés sur une coupure de 90 €**, avec une enveloppe de **100 €**. Les **12,75 € de marge** peuvent encore limiter les imports avant le plafond de 300 : au taux prudent de 0,50 € réservé par dossier hébergé, cela représente au plus 25 nouveaux dossiers si aucune autre provision ne consomme cette marge. Ces provisions ne sont pas des factures fournisseurs ; aucune enveloppe de dépenses n’a été augmentée.

Traces privées ignorées : `evidence/local/import-quota-2026-10-08/` et `evidence/remote/import-quota-2026-10-08/`. Aucun import d’annonce, génération vidéo, appel IA ou paiement déclenché pour vérifier cette hausse.
