# Halo lumineux de la vidéo principale — 11 octobre 2026

Le lecteur de la home reçoit un halo qui suit les couleurs et les zones de la vidéo. Une affiche floutée fournit le halo avant la lecture, puis une transition remplace cette affiche par les images du lecteur. Le visuel et la vidéo sélectionnés dans l’administration de la home sont réutilisés. Après le retour d’Alex sur l’effet initial trop discret, le masque a été retiré, la projection agrandie et le flou renforcé. Une bordure plus discrète laisse le halo ressortir ; texte et formulaire restent devant sa couche graphique.

L’intention visuelle reprend le [Backlight de Magic UI](https://magicui.design/docs/components/backlight). La réalisation est locale, avec les API du navigateur, sans nouvelle dépendance ni second lecteur. Les cadres, commandes et choix de lecture existants restent en place : boucle et démarrage silencieux sur ordinateur, lecture volontaire sur mobile.

## Fonctionnement et performances

- Canvas décoratif, limité à **96 pixels sur son plus grand côté**, actualisé avec les nouvelles images décodées de la vidéo. Chaque zone conserve sa place dans la projection : haut, bas et côtés ont leurs propres couleurs. Les clips locaux donnent environ **24 à 30 dessins par seconde**, selon leur cadence, contre cinq dans la première version.
- Les images proviennent de la vidéo déjà décodée. Aucun téléchargement vidéo dédié au halo, lecture de pixels ou mise à jour React par image. L’affiche utilise le même composant, les mêmes tailles et les mêmes URLs d’image que le lecteur.
- [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) lorsque disponible ; repli vers requestAnimationFrame pour les images ayant changé, plafonné à 30 dessins par seconde. Aucun timer accumulant des images à afficher en retard. Ce mécanisme ne promet pas une synchronisation matérielle parfaite sur tous les appareils.
- Arrêt des dessins pendant la pause, hors écran, lorsque la page est masquée, lorsque l’interface bloque la lecture, ou au démontage. Reprise à partir du lecteur existant. Un canvas non disponible laisse l’affiche fournir le halo.
- Avec `prefers-reduced-motion: reduce`, le halo reste sur l’affiche statique. Aucun dessin ni transition du canvas ; la préférence peut aussi changer pendant la visite.
- Halo derrière le lecteur, décoratif, sans interception des clics et exclu de l’arbre d’accessibilité. Rayonnement plus contenu sur mobile, sans débordement horizontal. Le wrapper conserve les dimensions du lecteur.

Les vérifications portent sur le nombre de lecteurs, les requêtes, la taille du canvas, l’échantillonnage et les arrêts/reprises. Aucun score Lighthouse ni gain chiffré de Core Web Vitals n’est revendiqué ; aucun outil MCP Chrome DevTools de trace n’est disponible dans cette session.

## Validation locale

Fichiers : `apps/web/components/hero-backlight.tsx`, `home-hero-video.tsx` et `apps/web/app/landing.css`.

- `pnpm --filter @bienvu/web typecheck`, `pnpm check:boundaries` et `pnpm build:web` réussis ; **519 fichiers** pour les frontières.
- Recette des vrais composants et d’un MP4 local à **1 536, 390, 320 et 844 px**, plus mouvement réduit, API de frame vidéo indisponible et canvas indisponible. Deux vérifications spatiales supplémentaires desktop/mobile utilisent un WebM de quadrants colorés en mouvement, fabriqué localement avec MediaRecorder. **Neuf parcours passent**, sans erreur JavaScript, lecteur supplémentaire ou requête externe.
- Pixels capturés **18 px à l’extérieur** du lecteur : bleu/cyan en haut à gauche, orange à droite, blanc en bas à gauche et rose à droite. Les assertions portent sur le halo effectivement visible, pas seulement sur le contenu du canvas sous la vidéo. À 1 536 px : bleu/cyan `(99,225,238)`, blanc `(239,243,236)` ; contrôles équivalents à 390 px.
- Cadence mesurée autour de 24 fps sur le MP4 et 29–30 fps sur la fixture colorée ; aucune nouvelle image pendant la pause, hors écran, avec page masquée ou mouvement réduit. Déplacement entre deux positions explicites dans la vidéo, reprise et démontage vérifiés ; captures inspectées. La page masquée est reproduite avec l’événement et l’état de visibilité dans cette recette locale. Un premier contrôle de seek utilisait une position pouvant déjà être affichée ; la recette a été corrigée pour comparer deux positions distinctes.
- Autoplay silencieux desktop et absence d’autoplay mobile, y compris en paysage, confirmés. Halo d’affiche visible avant clic mobile ; commandes, son et boucle du lecteur conservés. Aucun débordement.

Preuves initiales dans `evidence/local/hero-backlight/`, révision temps réel dans `evidence/local/hero-backlight-live/`. Les tentatives de fixture avec le FFmpeg natif ont échoué sur ses filtres/formats restreints ; la fixture finale utilise uniquement le navigateur local. Aucun import, appel IA, rendu serveur, paiement ou crédit utilisateur consommé pour ces recettes.

## Première publication et contrôle distant

Préparation des sourcemaps privées Next/Worker et déploiement `--keep-vars --strict` réussis. Web **`a46e3283-507f-4f0c-902b-dcdfd80ce4e7`**, **100 % du trafic**, **60 bindings conservés**. JavaScript/CSS distants contenant le halo comparés par SHA-256 au build ; home 200, accès aux flux privés sans session refusé.

Recette réelle sur `bienvu.online` à **1 536, 390 et 320 px**, avec les médias actuellement publiés : halo dessiné, lecture native, autoplay silencieux desktop, clic mobile, arrêt des dessins en pause et absence de débordement/erreur. Captures inspectées. Services tiers d’analyse/support bloqués dans cette navigation de recette ; aucun import ni génération déclenché.

Pipeline **`b2851d0b-0d06-432a-9668-bc9a4061fb97`** et ses **32 bindings** conservés. Renderer version **30**, image épinglée, quatre vCPU et une instance ; budget et admissions contrôlés identiques. Aucun nouveau service, variable, migration ou changement de crédits. Aucun commit/push à cette étape.

## Révision : halo plus visible et synchronisation temps réel

Build, préparation des sourcemaps privées et déploiement `--keep-vars --strict` réussis. Web **`a17b6e83-0c2c-4ea7-8b1f-647228248ce4`**, **100 %**, **60 bindings conservés**. JavaScript/CSS publiés comparés par SHA-256 au build. Pipeline, renderer version 30/quatre vCPU/une instance, image et budgets conservés ; admissions actives.

Recette réelle finale sur `bienvu.online` à **1 536, 390 et 320 px**, avec la vidéo immobilière choisie dans le superadmin : **26,7 / 30 / 30 actualisations par seconde** relevées sur une fenêtre de 2,1 s. Halo visible et spatial, boucle, commandes natives, autoplay desktop silencieux, clic mobile, pause sans nouveaux dessins et absence de débordement/erreur confirmés. Captures inspectées, dont un cadrage de la vidéo et de son halo. Aucun import, appel IA, assemblage serveur ou débit utilisateur pendant cette révision ; les navigations ne chargent pas les services tiers d’analyse/support.

La recette mesure les actualisations graphiques et la répartition des couleurs ; elle ne constitue pas un benchmark de GPU sur tous les appareils. Le petit canvas, les arrêts hors écran/page masquée et le mode statique avec mouvement réduit sont conservés. Contrôles Chrome et mobile émulé ; pas de nouveau test sur appareil physique iOS/Safari. Aucun commit/push.
