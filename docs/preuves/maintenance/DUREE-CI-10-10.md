# Durée conseillée et réparation CI — 10/10/2026

## Comportement livré

L’estimation d’import sur la home propose **30 secondes pour 7 à 9 photos**, et **40 secondes à partir de 10 photos**. Un bouton applique ce choix à la préférence de durée existante. Aucune durée n’est changée sans action ; un choix déjà suffisant ne produit pas de conseil. Dans la fiche manuelle et l’onglet Photos de Personnaliser, le conseil suit les photos effectivement sélectionnées.

Le calcul des crédits utilise toujours le contrat produit partagé : base, animations et supplément d’avatar selon sa durée. Modifier la durée ne relance pas l’import et ne lance aucun fournisseur. Les droits et contrôles serveur restent appliqués à la génération. L’essai gratuit reste classique avec filigrane.

Fichiers : `apps/web/lib/photo-duration.ts`, `components/photo-duration-advice.tsx`, `home-create.tsx`, `manual-listing-form.tsx`, `video-customizer.tsx` et `app/home-composer.css`.

## Cause de l’échec GitHub

Le [run 38044555006](https://github.com/alexlevy0/BienVu/actions/runs/38044555006) échoue dans `pnpm check`, avec quatre tests et `D1_ERROR: no such table: credit_rollover_links`. Les fixtures historiques des tests d’imports, de budget et d’animations appellent le calcul actuel des droits sans appliquer le schéma de report des crédits ajouté par 0063.

Les dépendances de schéma sont désormais appliquées avant l’appel au code courant. Les migrations dont les tests contrôlent les anciens quotas, plafonds et durées restent séparées et sont toujours vérifiées. Les fixtures de suppression et de projets sont aussi adaptées au champ d’estimation 0064 ; les données historiques sont insérées avec leurs colonnes d’époque. Aucun test n’est supprimé, désactivé ou affaibli ; aucune limite produit n’est augmentée pour faire passer la CI.

## Validation

- `pnpm check` : **622 tests réussis**, zéro échec, frontières de 484 fichiers et tous les types validés.
- `pnpm probe:voice:worker` et `pnpm probe:narration:worker` : workerd réel, fournisseurs simulés, reprises et refus vérifiés.
- Migrations locales appliquées deux fois ; `pnpm build:web` et dry-run Wrangler réussis.
- Étape complète du Worker local rejouée : fondations, SEO (41 pages publiques), web, comptes, confirmation et réinitialisation e-mail, imports manuels et portails simulés.
- Pour reproduire les paramètres CI avec le fichier local existant, prévisualisation lancée avec `--var AUTH_EMAIL_VERIFICATION_BYPASS:false` ; le fichier `.dev.vars` est conservé. Les e-mails utilisent uniquement le simulateur local Wrangler.
- Chrome sur les composants réels, fixtures privées, **1536 et 390 px** : choix initial de 20 s conservé, conseil 30 s cliquable, conseil 40 s pour 12 photos, disparition lorsque la durée est suffisante, coût actualisé, un seul import et aucun lancement avant l’action. Captures inspectées, mise en page mobile corrigée.
- Aucun import de portail réel, appel Runway/TTS/HeyGen payant ou débit de crédit produit pour la recette.

Preuves ignorées par Git : `evidence/local/duration-ci-2026-10-10/` et `evidence/local/import-estimate-2026-10-10/`.

## Publication

Worker web `f50df238-9d4c-4d42-bcb3-8a1b8e7b3e00` publié sur `bienvu.online` avec `--keep-vars --strict`. Les 56 bindings web et 32 bindings de génération sont conservés ; le Worker de génération reste inchangé. Aucune migration supplémentaire n’est nécessaire pour le conseil de durée.
