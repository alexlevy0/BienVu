# Correctif body-parser — octobre 2026

L’alerte GitHub #33 concerne `body-parser 2.3.0`, apporté par `@opennextjs/cloudflare 1.20.13` → `@opennextjs/aws 4.1.12` → `express 5.2.1`. [Avis GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), correctif officiel [2.4.0](https://github.com/expressjs/body-parser/releases/tag/v2.4.0).

## Changement et validation locale

Override borné `body-parser@>=2.0.0 <2.4.0: 2.4.0` dans `pnpm-workspace.yaml`, lockfile actualisé uniquement pour ce remplacement et `qs 6.16.1`, exigé par 2.4.0. Pas de mise à jour générale. Le graphe installé ne contient qu’une version de body-parser : **2.4.0**. Aucun fichier applicatif, de narration ou de migration modifié ; le correctif de code `d0a5599c5ef61f08015de4ec313019d112577d01` ne change que ces deux fichiers YAML.

Sonde locale isolée dans un processus Node : une requête gzip contenant un JSON valide puis des octets supplémentaires fait terminer **2.3.0** avec une erreur de décompression non gérée (code 1). Même cas avec **2.4.0** : **200**, processus vivant après le délai d’observation. Deux autres contrôles passent : JSON gzip normal et formulaire à champs imbriqués. Serveur sur `127.0.0.1`, données synthétiques, aucun trafic de test hostile vers la production. La sonde est privée sous `evidence/local/body-parser-deploy/` ; aucun nouveau test applicatif ne copie le code du paquet.

Installation avec `--frozen-lockfile --ignore-scripts`, audit npm sans vulnérabilité connue au relevé, lint, formatage, frontières et typage complet réussis. Build racine `pnpm build:web` réussi, release **d0a5599c5ef6**, sourcemaps privées PostHog EU envoyées. Worker local workerd : sondes foundations/web et **51 pages SEO** réussies, artefacts synthétiques nettoyés. Le preview utilise exclusivement les bindings locaux et les générations désactivées. Migration locale 0085 appliquée pour ce preview ; aucune migration distante nécessaire pour le correctif de dépendance.

GitHub marque automatiquement l’alerte #33 **fixed** depuis **2026-10-23T21:52:17Z** ; aucune alerte n’a été masquée ou classée manuellement comme résolue. Le bundle Cloudflare final préparé compte **425 sources**, sans source body-parser, et est publié sans recompilation après l’envoi de sa map privée.

## Publication et CI

Commit **`d0a5599c5ef61f08015de4ec313019d112577d01`** poussé sur `main`. Publication vérifiée le **24/10/2026 à 00:09 CEST**, release **`d0a5599c5ef6`**, Worker web **`bd1d3357-8b79-414a-881b-b9dda7cdcae5`** actif à **100 %** sur `bienvu.online`. SHA-256 du module distant identique au module préparé : **`d50c86b5f098e8e51434d6fc3d13cc4f722631cd71dd8645283aa52c8502d6cb`**. Map finale privée identifiée par **`ff2e376f-9a93-5904-8dda-fdd97f8ec5a6`** ; publication `no_bundle`, `--keep-vars --strict`.

**64 bindings / 23 secrets**, domaines, deux crons et paramètres du Worker conservés, hors identifiants de release/sourcemap attendus. Workers génération, import, mail et narration non redéployés ; conteneurs renderer **v37** et import **v8** inchangés. Migration distante 0085 conservée et enregistrée une seule fois ; aucune nouvelle migration distante appliquée. Schémas des **163 tables métier** existantes et **16 tables / 424 lignes** de crédits, budgets, jobs, intentions et narration comparés avant/après : identiques. Publication enregistrée dans l’historique du superadmin.

Pages publiques **200**, accès privés **401**, Beta **302**, release HTML/RSC cohérente. Deux assets publics identiques aux fichiers locaux et leurs maps **404**. **51 pages SEO** vérifiées en production ; recette Chromium desktop/mobile (1536 et 390 px), mensuel/annuel, sans erreur JavaScript ni débordement. Offres conservées, dont Solo **50 € / 50 crédits** ; Stripe reste en mode test.

[CI fonctionnelle du correctif](https://github.com/alexlevy0/BienVu/actions/runs/40029833209) et [CI sécurité](https://github.com/alexlevy0/BienVu/actions/runs/40029833068) **réussies intégralement** pour le même commit publié. **914/914 tests**, zéro échec et zéro test ignoré ; types, sondes voix/narration locales, migrations rejouées, build et recette du Worker validés. La CI sécurité inclut la construction des images Linux et un rendu synthétique sans réseau. La [CI des crons](https://github.com/alexlevy0/BienVu/actions/runs/40028741868), encore en cours à la publication précédente, est également **réussie** avec **914/914 tests**.

## Limites et autres alertes

Quatre autres alertes GitHub, **#34 à #37**, concernent `fast-uri 3.1.8` (deux moyennes, deux faibles, correctif annoncé 3.1.9). Elles sont distinctes de l’alerte body-parser demandée et restent ouvertes au relevé. Un audit npm réussi ne prouve donc pas l’absence de ces avis GitHub récents. Aucune affirmation d’audit global sans vulnérabilité.

Aucun appel de génération payant ni email de recette. Coût des essais fournisseurs : **0 €**. Preuves, configurations et journaux privés ignorés sous `evidence/local/body-parser-deploy/`.
