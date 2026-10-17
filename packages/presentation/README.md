# Présentation vidéo portable

Ces composants React définissent les mises en page des trois styles, en portrait et en paysage. Le renderer injecte ses images et ses pistes audio Remotion ; le navigateur utilise les mêmes coordonnées et polices sur un canevas réduit. Aucun moteur de rendu, accès Node ou appel de fournisseur ne doit entrer dans ce package.

Les animations sont calculées depuis une image de timeline, sans animation CSS. Le déplacement des photos et l’adaptation des textes sont également partagés. Les références HTML de `fixtures/presentation-layout.json` proviennent des compositions avant cette extraction.

Dans Personnaliser, les durées de narration restent indicatives et les avatars affichent un aperçu de placement. La préécoute utilise des extraits publics de voix et la musique sélectionnée ; elle ne synthétise pas le texte et ne consomme pas de crédit.
