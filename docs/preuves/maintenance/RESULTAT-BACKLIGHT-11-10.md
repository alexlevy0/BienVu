# Backlight du résultat de génération — 11 octobre 2026

Le résultat reçoit le même halo spatial que la vidéo principale de la homepage. Le composant et ses styles sont partagés : `VideoBacklight` projette les images du lecteur existant dans un canvas décoratif de 96 px maximum, avec `requestVideoFrameCallback` et un repli limité à 30 fps. Aucun second lecteur vidéo ni rendu React à chaque image.

Le halo est présent dès l’envoi de la demande, avant les photos : un dégradé aux couleurs de BienVu assure ce premier état. La première photo prend le relais lorsqu’elle arrive, puis les images du flux progressif et de la vidéo finale. La photo indisponible conserve le dégradé. Les remplacements de source MSE/MP4 réinitialisent la projection ; la reprise conserve les règles de lecture existantes, notamment la position et la pause volontaire.

Le cadre extérieur laisse diffuser le halo ; la surface intérieure garde le découpage et les coins arrondis du lecteur. Les étapes et actions restent devant la lumière. Le résultat de la conversation reçoit aussi le halo avant l’assemblage, et le lecteur partagé le reçoit dans les autres vues de suivi. Arrêt des dessins pendant la pause, hors écran, page masquée et au démontage ; halo statique avec mouvement réduit ou canvas indisponible. Lecture toujours volontaire sur le résultat.

## Validation

- Typecheck web, vérification des frontières (521 fichiers), contrôle des espaces du diff et build OpenNext.
- Cinq recettes navigateur des vrais composants, avec serveur local, photos et segments HLS préexistants : desktop 1536 px, mobile 390 px/essai anonyme, mobile 320 px/photo indisponible, format horizontal et mouvement réduit.
- Halo mesuré à l’extérieur du cadre dès l’attente ; transition photo/flux/fichier final, première image sans clic, absence d’autoplay, attente du segment suivant, reprise, pause, repli vers le fichier final avec position conservée, démontage, absence de débordement et d’erreur JavaScript. Captures inspectées.
- Quatre recettes de régression du hero : couleurs spatiales desktop/mobile mesurées hors du lecteur, environ 29,5–30 dessins/s, pause/seek/hors écran/page masquée/nettoyage, mouvement réduit et canvas indisponible. Un seul lecteur vidéo et aucun appel externe.

Preuves privées ignorées : `evidence/local/result-backlight/`. Ces parcours reproduisent les étapes de génération avec des médias locaux ; aucune nouvelle génération de production ni validation anti-robot automatisée. Aucun appel IA, rendu serveur, import, achat ou crédit utilisateur consommé.

## Publication

Publication et contrôles de la version web consignés dans `docs/SUIVI.md` et les preuves privées `published.json`. Les empreintes des assets publics sont comparées au build. Les bindings, pipeline, renderer, budget et admissions sont contrôlés avant/après, et les accès anonymes à des flux inconnus restent refusés. Aucun commit/push dans cette demande.
