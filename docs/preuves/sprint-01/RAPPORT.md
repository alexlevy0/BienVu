# Sprint 01 — Fondations locales

27 septembre 2026 · `/Users/alexlevy0/Dev/BienVu` · aucun commit, push ou déploiement de cette tranche.

Alex a demandé d'avancer sur le sprint suivant en restant en local, puis de reprendre Containers après son activation de Workers Paid. L'architecture Next.js/OpenNext et Cloudflare est conservée. **Le sprint 00 reste partiellement validé.**

**Sprint 01 livré et vérifié en local.** Installation depuis une copie propre, tests, migrations et build adaptés réussis. Aucun environnement distant n'a été mis à jour.

## Résultat utilisable

- Coque française responsive : tableau de bord, création, identité d'agence, historique, abonnement et connexion. Les fonctionnalités non intégrées sont désactivées et signalées. Pas de faux compte, de quota attribué, d'import simulé ou de vidéo présentée comme une création réelle. Le champ URL ne fait qu'une validation syntaxique.
- Contrats runtime : faits sourcés vérifiés/absents/contradictoires, vente et loyer mensuel, unités explicites, photos isolées par agence/annonce, jobs et manifeste limité aux fichiers de son traitement. Filigrane obligatoire pour l'essai, médias et narration cohérents.
- Base initiale D1 : agences, annonces, allocations, réservations, jobs, médias, intentions de lancement, trace d'essai, abonnements, coûts et indicateur de pause. Contraintes d'agence, unicité d'idempotence et d'un job actif, index d'accès et migrations versionnées.
- Scripts d'installation, développement, migrations, vérification et arrêt des générations. CI GitHub Actions préparée sans appel payant. Contrôle des imports pour isoler renderer Node, composition React et code Workers.
- Identifiants de requête, messages publics français, diagnostics sur liste blanche, coûts persistants dédupliqués. `POST /api/generations` refuse les nouvelles générations côté serveur.

Fichiers principaux : `apps/web/app`, `apps/web/components`, `packages/contracts/src/product.ts`, `packages/contracts/src/errors.ts`, `packages/db`, `packages/observability`, `fixtures/contracts.ts`, `tests`, `scripts`, `.github/workflows/ci.yml`, lockfile et [guide de développement](../../DEVELOPPEMENT.md).

## Vérifications exécutées

| Vérification | Résultat et portée |
|---|---|
| `pnpm check:boundaries` | 29 fichiers contrôlés ; dépendances de rendu bloquées côté Workers, pas d'API Node dans les modules portables |
| `pnpm check` | **30 tests réussis**, puis TypeScript sur les packages et les tests ; [log](check.log) |
| `pnpm build:web` | Build Next.js/OpenNext final réussi, sans erreur de copie de package ; [log](build-web-final.log) |
| Copie propre | Neuf commandes réussies : installation hors ligne avec lockfile, secrets locaux neufs, fixtures, types, contrôles, migrations deux fois et build. Dossier temporaire supprimé ; [résultat](clean-copy.json), [log complet](clean-copy.log) |
| D1 sous Miniflare/workerd | Six sous-tests et leur test parent : références inter-agences rejetées, comparaison exacte du préfixe média, lecture limitée à l'agence, concurrence/idempotence, rollback intégral, coûts dédupliqués et pause |
| Migrations locales | Migrations appliquées ; une seconde exécution n'applique rien ; [log](migrations.log) |
| Commande d'arrêt locale | `generation_control.enabled=0` confirmé ; [log](pause.log) |
| Routes sous workerd | Sept pages HTTP 200, français et headers vérifiés ; générations POST 503, identifiants serveur distincts, historique et sonde sans secret 401 ; [preuve](web-workerd.json) |
| D1/R2/cookie opérateur | Six contrôles locaux réussis, objets nettoyés ; [log](probe-web.log) |
| Interface | Inspection sur ordinateur et mobile, lien dangereux refusé, validation de format honnête, champs/boutons futurs désactivés ; [compte rendu](inspection-ui.json) |
| Secrets | Aucun des cinq secrets locaux trouvé dans les 195 fichiers candidats Git contrôlés ; [preuve](secret-scan.json) |

Les 30 tests comprennent 23 tests de contrats/fixtures et six sous-tests SQL D1 plus leur parent. Toutes les données de ces essais sont synthétiques. Miniflare exécute réellement le SQL et les bindings **en local** ; ce résultat n'est pas un essai sur le service D1 distant. Les requêtes HTTP de cette tranche visent uniquement localhost. Les imports réels, MP4 locaux et dépenses du sprint 00 restent dans son propre rapport.

## Choix et corrections

- Les sondes et schémas du sprint 00 restent disponibles. Les contrats produit sont distincts ; leur intégration au pipeline métier n'est pas prétendue réalisée.
- Les références jobs/réservations sont vérifiées en fin de batch. Aucun modèle de transaction interactive D1 n'est ajouté. La réservation/consommation/libération complète des quotas reste aux sprints métier suivants.
- La migration `0003` évite que `_` dans un identifiant d'agence soit traité comme un joker SQL. Les migrations déjà appliquées ne sont pas réécrites pour ce correctif.
- Le premier test Miniflare utilisait la forme d'options v4 directement. La version 5 alpha déjà fournie par Wrangler exige son convertisseur ; correction faite sans changer de version du runtime.
- Une exécution simultanée de TypeScript et du build a rencontré les types `.next` en cours de régénération. Les contrôles documentés et la CI les exécutent séquentiellement.
- Les exports des trois packages partagés utilisés par le web ont été exprimés sous forme d'objet, compatible avec le traitement OpenNext des conditions `workerd`. Aucun patch de dépendance ni upgrade de framework.

## Limites et dépenses

**Aucun nouvel appel fournisseur payant, rendu Docker/Containers, import distant, achat ou activation d'abonnement dans ce sprint.** Coût fournisseur supplémentaire attendu : 0 €. Aucune nouvelle lecture de facture ; l'estimation de budget du sprint 00 n'est pas transformée en montant facturé.

La CI est configurée mais n'a pas été exécutée sur GitHub. Le staging contient toujours le code du sprint 00. Avant une livraison distante des fondations : appliquer les migrations au D1 de staging avec son identifiant explicite, déployer la nouvelle version, vérifier les pages, les bindings, la pause et les réglages de journalisation. Garder R2 privé et les générations désactivées.

La connexion, l'enregistrement réel de l'agence, le pipeline de génération, les webhooks et les quotas commerciaux sont volontairement hors de cette tranche. Les contrats et tables les préparent, sans leur attribuer de validation métier. La recette Containers → R2, le sommeil et les coûts restent attendus au sprint 00 après Workers Paid.
