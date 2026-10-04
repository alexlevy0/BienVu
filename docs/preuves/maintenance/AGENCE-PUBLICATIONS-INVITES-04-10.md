# Mon agence et Publications accessibles sans compte — 4 octobre 2026

Le visiteur peut remplir l’identité de son agence, importer un logo et voir son rendu sur `/agence`. Le bouton « Se connecter pour enregistrer » conserve les champs et le logo dans IndexedDB pendant une heure, puis ouvre la connexion avec retour vers l’agence. Après connexion, la saisie est reprise pour être enregistrée. Un navigateur refusant le stockage propose de se connecter dans un autre onglet sans quitter le formulaire.

Sur `/publications`, le visiteur découvre un calendrier avec trois publications d’exemple par mois et des médias publics. Navigation entre les mois, sélection d’un jour, filtres et lecture des vidéos restent utilisables. Les actions de programmation invitent à se connecter, avec retour vers le calendrier. Les données de l’agence remplacent les exemples une fois connecté.

Les routes de sauvegarde et les API sociales conservent leurs contrôles de session et de droits. Les destinations de retour après connexion sont limitées aux pages internes du studio ; la confirmation d’adresse e-mail conserve cette destination.

Vérifications locales :

- Tests de connexion et confirmation d’e-mail : 14 sous-tests ; tests de navigation et contrats des exemples : 2 tests.
- TypeScript web et tests, frontières des packages, compilation Next.js et bundle OpenNext : réussis.
- `scripts/probe-guest-studio.mjs` : parcours formulaire → connexion → reprise des champs et du logo → sauvegarde, effacement du cache après sauvegarde, retour vers Publications après connexion, calendrier interactif à 1 536, 390 et 320 pixels. Les écritures et connexions de cette recette sont simulées.
- `scripts/probe-agency-studio.mjs` : formulaire connecté, sauvegarde et lecture de l’exemple sans débordement aux trois largeurs. Son jeu de données inclut désormais la liste des connexions sociales.
- Worker local : pages publiques en 200 ; sauvegarde du formulaire, upload du logo et lecture/création/modification des publications en 401 sans session.

Rapports et captures : `evidence/local/guest-studio/` (ignorés par Git). Aucun changement de schéma, de quota ou de configuration des services n’est nécessaire.

Mise en ligne sur `bienvu.online` : version web `98a81541-fb71-4299-ab84-63f3a73291de`. La vérification avec Chrome sans session confirme les deux pages accessibles à 1 536 et 320 pixels, la lecture des vidéos d’exemple et l’absence de demandes aux API privées de l’agence ou des publications. Les paramètres et bindings, les autres Workers et les sélections de médias de l’accueil sont conservés.
