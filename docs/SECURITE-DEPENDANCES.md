# Sécurité des dépendances — 12 octobre 2026

L'audit initial du lockfile complet remonte **18 avis : 5 élevés, 9 modérés et 4 faibles**. Après les correctifs ci-dessous, `pnpm audit --json` remonte **zéro avis connu**, sans exclusion et en incluant les dépendances de développement et optionnelles. Ce résultat concerne les dépendances npm ; il ne constitue pas un audit exhaustif du code, du système Debian ou de la configuration Cloudflare.

La page GitHub consultée avant publication affiche **20 alertes**. Plusieurs avis Next.js sont présents à la fois dans `apps/web/package.json` et `pnpm-lock.yaml` ; sa liste et celle du registre npm ne se comptent donc pas de la même façon. Les deux couvrent les quatre familles corrigées ci-dessous.

Après mise à jour de `main` et réanalyse explicite, GitHub affiche **0 alerte ouverte / 28 fermées**, fichiers contrôlés le 12 octobre à 14:21 (Europe/Paris). Aucune alerte n'a été écartée manuellement. La [CI complète](https://github.com/alexlevy0/BienVu/actions/runs/38246457592) réussit sous Node 24.21.0 (**698 tests**) et la [CI de sécurité](https://github.com/alexlevy0/BienVu/actions/runs/38246457588) réussit aussi, y compris la construction et le contrôle des deux images Linux.

## Correctifs

| Dépendance    | Avant  | Après  | Avis              | Emplacement                                                      |
| ------------- | ------ | ------ | ----------------- | ---------------------------------------------------------------- |
| Next.js       | 16.3.6 | 16.3.8 | 6, dont 1 élevé   | Application web et adaptateur OpenNext                           |
| Undici        | 7.29.0 | 7.29.1 | 10, dont 2 élevés | Miniflare utilisé par les tests et Wrangler                      |
| Sharp         | 0.35.4 | 0.35.5 | 1 élevé           | Copie transitive de Miniflare ; importer/renderer déjà en 0.35.5 |
| source-map-js | 1.2.1  | 1.2.2  | 1 élevé           | PostCSS, compilation Next.js et bundler Remotion                 |

[Next.js 16.3.8](https://github.com/vercel/next.js/releases/tag/v16.3.8) corrige notamment le SSRF de l'optimisation d'images et les problèmes de cache. Les correctifs [Undici](https://github.com/nodejs/undici/releases/tag/v7.29.1), [Sharp](https://github.com/lovell/sharp/releases/tag/v0.35.5) et [source-map-js](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2) sont des mises à jour de patch. Le lockfile ne change que ces familles et leurs binaires associés ; versions de Remotion, Wrangler, Miniflare et adaptateur OpenNext conservées.

Les trois overrides de `pnpm-workspace.yaml` ne ciblent que les versions vulnérables exactes. Ils ne bloquent pas les versions plus récentes choisies à l'avenir par les dépendances parentes. Les supprimer seulement quand plus aucun parent ne peut sélectionner ces anciennes versions, puis refaire l'audit et les builds.

## Node.js et images Docker

La vérification supplémentaire de `process.versions.undici` détecte **7.28.0 dans Node 24.17.0**, en dehors du lockfile npm. Le projet, la CI et les Dockerfiles importer/renderer passent donc à **Node 24.21.0**, dont le binaire local annonce **Undici 7.29.1 / OpenSSL 3.5.8**. La [publication officielle Node](https://nodejs.org/en/blog/release/v24.21.0) confirme ces mises à jour.

Image officielle épinglée : `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`. Mettre à jour le Dockerfile ne remplace pas une image déjà déployée : les deux images doivent être reconstruites et publiées pour appliquer ces correctifs aux conteneurs existants. Le Worker utilise le runtime Cloudflare ; changer la version de Node locale ne modifie pas son runtime.

Les deux images corrigées sont maintenant publiées : importer **version 7**, renderer **version 33**, rollouts terminés à **100 %** et sans erreur. Quatre vCPU/12 GiB pour le rendu, plafonds d'instances et concurrence métier conservés. La [CI avec rendu natif](https://github.com/alexlevy0/BienVu/actions/runs/38250278415) produit et vérifie une vidéo synthétique de six secondes en **16,5 s**, sans réseau externe ni appel IA payant. Digests et contrôles distants détaillés dans `SUIVI.md` ; preuves privées dans `evidence/local/security-dependencies/containers-published.json`.

## Liste des avis traités

| Avis                                                                     | Dépendance    | Niveau  |
| ------------------------------------------------------------------------ | ------------- | ------- |
| [GHSA-cjq9-62q9-8jv4](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) | next          | Élevée  |
| [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | sharp         | Élevée  |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js | Élevée  |
| [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) | undici        | Élevée  |
| [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3) | undici        | Élevée  |
| [GHSA-3w37-wq28-93x7](https://github.com/advisories/GHSA-3w37-wq28-93x7) | next          | Modérée |
| [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) | next          | Modérée |
| [GHSA-f87g-xv8r-7p7x](https://github.com/advisories/GHSA-f87g-xv8r-7p7x) | next          | Modérée |
| [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p) | next          | Modérée |
| [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j) | undici        | Modérée |
| [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v) | undici        | Modérée |
| [GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm) | undici        | Modérée |
| [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x) | undici        | Modérée |
| [GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq) | undici        | Modérée |
| [GHSA-39w2-rjm5-chcv](https://github.com/advisories/GHSA-39w2-rjm5-chcv) | next          | Faible  |
| [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968) | undici        | Faible  |
| [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv) | undici        | Faible  |
| [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r) | undici        | Faible  |

## Prévention

- `pnpm audit:dependencies` interroge le registre sur le lockfile complet et échoue dès le niveau faible. Aucune option `--ignore`, `--prod` ou `--ignore-registry-errors` n'est utilisée.
- `.github/workflows/security.yml` exécute ce contrôle à chaque push, pull request, lancement manuel et chaque jour à 06:31 UTC. L'audit ne lance aucun script de dépendance et ne demande aucun secret externe. Sur push/PR, un second job construit les deux images Linux, vérifie leur copie d'Undici intégrée à Node et produit une vidéo synthétique de six secondes : H.264/AAC, dimensions, durée et son décodé contrôlés. Les scripts de build autorisés s'exécutent uniquement dans ces conteneurs de CI sans secret ; la recette vidéo coupe le réseau externe et n'utilise aucun fournisseur payant.
- `.github/dependabot.yml` prépare les mises à jour npm chaque semaine, avec des groupes Cloudflare, Remotion et application pour les patchs/mineures. Les versions majeures restent proposées séparément, sans fusion automatique. GitHub Actions et les images de base des deux Dockerfiles sont également suivis.
- Le premier passage du bot a échoué : sa règle d'attente de 72 heures refusait des versions PostHog déjà épinglées, testées et déployées, lors de mises à jour d'autres paquets. `minimumReleaseAgeExclude` exempte uniquement quatre versions existantes : `@posthog/nextjs-config@1.11.2`, `@posthog/plugin-utils@2.0.1`, `@posthog/browser-common@0.9.4` et `@posthog/core@1.58.0`, dont les dates de publication du registre confirment qu'elles ont moins de 72 heures. Les versions futures restent soumises à la règle ; aucun avis de sécurité n'est exclu. La commande de résolution utilisée par Dependabot est reproduite dans une copie isolée, sans changer les versions retenues dans le projet. `posthog-js@1.438.5`, également refusé lors d'une reprise, a ensuite atteint les 72 heures et ne reçoit aucune exception.
- Une mise à jour doit passer l'audit, l'installation figée, les tests, les types, le build OpenNext et le bundle/rendu des composants affectés avant livraison. Ne pas fermer manuellement les alertes pour masquer une version encore vulnérable.
- Après mise à jour de la branche par défaut, vérifier la réanalyse Dependabot. Le compteur GitHub peut différer de celui de pnpm ou rester temporairement ancien ; seul un résultat distant confirme la fermeture de ses alertes.

## Preuves

Rapports privés dans `evidence/local/security-dependencies/` : audits avant/après et contrôle de la barrière CI. La commande prévue pour la CI refuse bien une copie du lockfile initial (**18 avis, code 1**) et accepte le lockfile corrigé (**zéro avis, code 0**). L'installation figée et hors ligne du lockfile corrigé réussit. Résultats finaux des tests, builds et éventuelle publication dans [SUIVI.md](SUIVI.md).
