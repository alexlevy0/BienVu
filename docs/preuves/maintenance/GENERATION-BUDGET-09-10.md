# Échec de rendu après hausse du budget — 9 octobre 2026

## Diagnostic réel

La génération `8d0bc45d-4986-436e-bd04-19caceea103e`, créée à **17:21:02 UTC**, a échoué à **17:23:11 UTC** pendant `prepare-and-submit-render`. L’historique Workflow indique **`BUDGET_CONFIG_INVALID`**. Le script, les synthèses Cartesia, les deux clips HeyGen et le manifeste étaient déjà préparés. Aucun MP4 final n’a été rendu.

Le budget D1 était correctement réglé à **200 € d’enveloppe / 180 € de coupure**, mais `apps/pipeline/src/budget.ts` conservait des maximums de 100 € / 95 €. Le contrôle du rendu produit rejetait cette configuration valide. Il partage maintenant `MAX_MONTHLY_BUDGET_CENTS` avec le contrat d’administration ; les anciens journaux ne sont pas augmentés implicitement, la marge minimale et les coupe-circuits restent actifs.

## Reprise des médias préparés

Un job échoué **au rendu** peut être copié dans l’Éditeur si son manifeste est préparé, retenu, valide et conforme à son empreinte. La propriété du job et de chaque média reste contrôlée. Les photos et WAV sont vérifiés et copiés, les clips d’avatar restent liés au hash exact de la voix. Un lien **« Reprendre dans l’Éditeur »** est proposé dans Mes biens aux utilisateurs qui peuvent modifier le bien.

Cette opération ne rouvre pas le job échoué, ne réécrit pas les crédits déjà réglés et ne déclenche aucune génération fournisseur. L’utilisateur peut ensuite demander un nouvel export. À paramètres de voix, texte, présentateur et transparence identiques, les WAV et avatars sont réutilisés ; le supplément avatar réservé au nouvel export est rendu lorsque tous ses clips sont réutilisés. Modifier ces paramètres peut nécessiter une nouvelle synthèse ou de nouveaux clips.

Pour le job concerné, le crédit vidéo a été libéré ; le crédit avatar avait été consommé car les deux clips avaient été livrés. Les pistes et clips sont conservés. **La tentative originale reste en échec ; aucun nouvel export client n’a été lancé pendant cette correction.**

## Validation

- **27 tests ciblés réussis** : budget, migration mensuelle, contrôleur durable dans workerd, Workflow, avatars, voix et montage d’éditeur. La reprise d’un rendu échoué réexporte avec les mêmes WAV, deux avatars réutilisés, aucun appel texte/TTS/HeyGen supplémentaire et un seul crédit vidéo consommé dans la fixture. Les rapports de rendu de ces tests sont simulés.
- Typage complet du monorepo puis typage web/tests après l’ajout de la reprise ; frontières **476 fichiers**, build Next/OpenNext, dry-runs génération/web et `git diff --check` réussis.
- Chromium local à **1536/390 px** avec API interceptées : un seul lien de reprise pour un échec au rendu retenu, aucun pour un échec voix ou une vidéo expirée, aucun pour un lecteur ; pas de débordement. Captures inspectées. Ce test ne déclenche pas de génération réelle.
- Génération publiée à 100 % : **`ab83b5f3-e022-4bfb-9e82-987301b0ce61`** ; web publié à 100 % : **`ed5074a4-2e8d-42bc-a1fc-0da6a7884663`**. Configuration et bindings conservés ; image du renderer inchangée.

Preuves privées ignorées par Git : `evidence/local/generation-8d0bc45d-2026-10-09/` (historique Workflow, journaux D1, tests/builds/déploiements et captures). Aucune clé n’est incluse dans ce rapport.

## Coûts et limites

Les diagnostics distants sont des lectures. Aucun nouveau rendu, import, appel OpenAI, TTS, HeyGen ou Runway, aucune publication sociale, aucun crédit client consommé par la correction. Les provisions historiques restent conservées : **91,75 € engagés**, sous la coupure de **180 €** et l’enveloppe de **200 €**, à la relecture après publication du moteur. Les limites spécifiques des fournisseurs ne sont pas augmentées.

Le nouvel export réel depuis la session d’Alex reste à effectuer. Le test de récupération et de réutilisation est une recette D1/R2 locale ; il ne constitue pas un MP4 client livré en production.
