# Temps restant estimé pendant l’assemblage — 11 octobre 2026

Le résultat conversationnel sur la home et le suivi partagé des générations affichent un compte à rebours à côté du pourcentage réel : `40 % · ≈ 53 s restantes`. Le temps est présenté comme une estimation et actualisé chaque seconde, sans modifier le pourcentage envoyé par le serveur.

## Calcul et limites

- Les différences de dates des checkpoints serveur mesurent la vitesse d’assemblage ; leurs dates de réception dans le navigateur ancrent le compte à rebours. Un décalage entre les deux horloges ne transforme pas le temps d’attente antérieur en temps de rendu.
- Le calcul commence après deux checkpoints croissants, au moins trois points de pourcentage et deux secondes de mesure. Il utilise jusqu’à six checkpoints et se réajuste si le rendu accélère ou ralentit.
- Le renderer réserve les derniers pourcentages à la vérification et à la publication du fichier. Le calcul projette le rendu jusqu’à son seuil actuel de 85 %, puis ajoute une marge indicative de dix secondes pour la finalisation. Cette marge n’est pas une durée garantie ni un benchmark de transfert.
- Lorsque la marge est écoulée, « Finalisation en cours… » remplace les secondes ; aucun zéro ne promet une vidéo prête avant confirmation serveur.
- Avant les premières mesures, après 25 secondes sans progression ou pour une projection supérieure à dix minutes, « Estimation en cours… » remplace une échéance peu fiable. Une perte de connexion affiche « Actualisation en attente ».
- Une reprise ou une autre génération recommence sa mesure. Un rechargement nécessite également de nouveaux checkpoints ; aucune estimation n’est enregistrée en base. Les étapes import, voix, carte, avatar et animations ne reçoivent pas de durée inventée.
- Les timers sont nettoyés au démontage et suspendent leurs mises à jour d’affichage lorsque l’onglet est masqué ; le retour au premier plan recalcule le temps écoulé.

Fichiers : `apps/web/lib/generation-estimate.ts`, composant/CSS `generation-estimate`, `conversation-generation.tsx`, `generation-progress.tsx`, styles de la home et `tests/generation-estimate.test.ts`. La ligne d’assemblage s’adapte aux écrans étroits. Le contenu de la bulle de demande peut se réduire dans son conteneur flex, pour conserver l’ellipse et éviter un débordement mobile existant.

## Vérifications

- `pnpm exec tsx --test tests/generation-estimate.test.ts tests/generation-preparation.test.ts` : **5 tests passent**. Mesure tardive, horloges différentes, ralentissement, doublons, dates invalides, stagnation, indisponibilité et finalisation sans faux zéro.
- `pnpm --filter @bienvu/web typecheck`, `pnpm exec tsc -p tsconfig.tests.json` et `pnpm check:boundaries` : passent, **518 fichiers** pour les frontières.
- Recette navigateur des vrais composants, avec checkpoints et horloge contrôlés, à **1 536, 390 et 320 px** : compte à rebours, recalcul, connexion interrompue, attente, nouvelle tentative, nouvelle génération, fin et erreur. Aucun débordement ou erreur JavaScript ; captures inspectées.

Les réponses de recette sont locales : elles valident le comportement de l’interface, pas une promesse de durée pour tous les rendus réels. Aucun nouvel appel IA, import, rendu payant, paiement ou débit utilisateur pendant cette recette. Preuves et scripts privés dans `evidence/local/generation-estimate/`.

## Publication

`pnpm build:web`, préparation des sourcemaps privées avec `pnpm prepare:web --config apps/web/wrangler.staging.generation-estimate.jsonc`, puis déploiement du bundle préparé avec `wrangler deploy --config .open-next/posthog-worker/wrangler.jsonc --keep-vars --strict` : réussis.

Web **`f46e85f6-1634-4cd8-a727-4a3730aa2541`**, **100 % du trafic**, **60 bindings conservés**. JavaScript et CSS contenant le nouveau composant comparés par SHA-256 au build publié ; home 200 et accès aux flux privés sans session refusé. Le premier contrôle de preuve cherchait les CSS dans le sous-dossier des chunks JavaScript ; la recherche a été corrigée vers l’ensemble des assets `_next/static`, puis le contrôle a réussi.

Pipeline **`b2851d0b-0d06-432a-9668-bc9a4061fb97`**, ses **32 bindings**, renderer version **30** à quatre vCPU/une instance et son image épinglée conservés. Budget distant identique (baseline 4 935 cents, plafond 18 000, ouvert) et admissions actives. Aucune migration, nouveau service, modification de crédits ou génération payante pour cette livraison. Aucun commit/push à cette étape.
