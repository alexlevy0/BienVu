# Carrousel du hero

Sur desktop (à partir de 761 px), la vidéo principale reste sélectionnée à
l’arrivée. Les deux emplacements `hero.left.video` et `hero.right.video` ajoutent
des cartes latérales inclinées. Ils se configurent dans Super admin → Page
d’accueil → En haut de page, avec le même brouillon, aperçu privé, publication
et retrait que les autres médias. Si un emplacement manque, le hero conserve
son lecteur unique.

La sélection déplace les trois cartes avec Motion, sans rotation automatique.
Les boutons latéraux, la pagination et les flèches du clavier changent la
sélection. Le mouvement est immédiat si l’utilisateur réduit les animations.

Une seule vidéo joue à la fois. Les vidéos latérales ne reçoivent une source
qu’après sélection sur desktop ; les couvertures sont des images. Une vidéo
masquée, hors écran ou dans un onglet caché est mise en pause. Les lecteurs et
leurs contrôles restent montés pour préserver la position. Le présentateur et
son badge disparaissent lorsque la vidéo principale passe à l’arrière ; ils ne
sont jamais superposés à une autre narration. Les calques du film principal
restent protégés par la vérification de son SHA décrite dans
`homepage-hero-depth.md`.

Sur mobile, le lecteur principal et son poster existants restent inchangés.
Les deux vidéos supplémentaires et leurs couvertures ne sont pas chargées.
Les médias sélectionnés sont des copies marketing publiées explicitement,
jamais une recherche publique automatique dans les dernières générations.

Sélection initiale du 18 octobre 2026 : Huez
(`5425d19b-8ceb-421e-bff6-fed396f5a823`) à gauche, Le Rouret au centre, et
Le François (`ff13622f-c4aa-48c6-9019-edf87adecb99`) à droite. Les deux nouveaux
films sont issus du compte du propriétaire et n’ont pas d’avatar.
