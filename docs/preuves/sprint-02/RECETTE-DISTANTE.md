# Sprint 02 — recette complémentaire sur bienvu.online

28 septembre 2026. **Critères fonctionnels du sprint 02 satisfaits.** Les validations ci-dessous complètent les recettes e-mail, Google et domaine antérieures. Le site reste un environnement de développement, sans paiement ni génération publique.

## Réel avec Alex

Un seul nouvel e-mail de récupération est demandé depuis `https://bienvu.online`, au destinataire déjà autorisé, bypass désactivé. Alex confirme : message reçu, lien sur le domaine, mot de passe choisi, reconnexion par e-mail puis Google, **même agence retrouvée**. D1 confirme un seul utilisateur, une agence, les deux méthodes, le changement du mot de passe et la consommation du jeton. Aucun mot de passe ni lien de récupération n'est conservé dans le rapport.

Les deux envois antérieurs avaient vérifié confirmation initiale et reset sur workers.dev. Ce troisième message valide l'origine actuelle ; on ne présente pas la confirmation initiale comme un nouvel envoi sur ce domaine.

## Infrastructure distante réelle, données synthétiques

`scripts/probe-accounts.mjs --remote --keep-fixtures` crée exactement deux identités `example.invalid` par l'accès opérateur D1, puis obtient leurs sessions par les vraies routes mot de passe. Aucun mail n'est envoyé à ces adresses et cette injection ne valide pas leur vérification d'adresse.

Treize contrôles HTTP passent : session anonyme refusée, réponses sans jetons, création concurrente d'une agence unique, marque persistante, CSRF, identifiant d'agence client refusé, lectures et logos étrangers refusés, PNG/JPEG réellement décodés dans le Worker et privés dans R2, versions immuables, fichiers SVG/tronqués/trop lourds rejetés, refus des endpoints hors périmètre, déconnexion/révocation/reconnexion avec agence inchangée, aucune allocation ni génération créée par la marque. Les callbacks Google sans état, avec état forgé réutilisé ou erreur d'annulation ne créent pas de session ; ce sont des requêtes négatives de recette, pas des consentements Google humains supplémentaires.

Le plafond 1 024 × 1 024 px est accepté, 1 025 px refusé. Le fichier de mesure contient taille encodée et latence HTTP ; aucune consommation mémoire ou facture n'est déduite de cette seule durée.

`scripts/probe-auth-expiry.mjs` injecte deux jetons **du compte synthétique B seulement** : expiré refusé, valide consommé une fois, rejeu refusé, ancienne session invalidée, reconnexion réussie sans nouvelle agence. Aucun envoi et aucune modification de l'identité réelle d'Alex dans cette sonde.

## Navigateur

Sur le compte synthétique A, connexion au formulaire, nom vide refusé en français, sauvegarde du nom/couleurs/contacts, rechargement avec valeurs conservées. Upload PNG puis remplacement JPEG via le sélecteur natif ; message de succès, logo chargé et valeurs relues. Vue mobile 390 px sans débordement horizontal, puis taille normale restaurée. Captures et état de recette conservés hors Git.

## Preuves et limites

`evidence/remote/sprint-02-acceptance/` : `accounts-workerd.json`, `browser-ui.json`, `email-domain.json`, `expiry-replay.json`, captures mobile/ordinateur. Les secrets/cookies de fixtures ont été stockés en fichiers 0600 puis supprimés lors du nettoyage final. Le script refuse d'écraser une recette encore présente.

Nettoyage vérifié après la purge des imports : zéro compte synthétique restant, logos et sessions de recette retirés ; Alex conserve un utilisateur, une agence et ses deux méthodes de connexion. Rapport `cleanup.json`. Aucun compteur d'import ni registre de coût n'a été effacé.

Première sonde interrompue par le format de sortie de l'import SQL Wrangler : correction du lecteur opérateur, nettoyage exact des identités concernées, puis recette réussie. Un jeton OAuth Wrangler expiré a été renouvelé avant le troisième e-mail ; aucun double envoi. Le sélecteur du navigateur a nécessité de remettre le bouton dans la vue ; l'upload a ensuite été vérifié.

Les effets d'une marque immuable sur une vidéo produit relèvent toujours des sprints 06–07. La suppression de compte, purge des logos orphelins, ouverture des envois aux autres destinataires et tests de charge relèvent du lancement. La recette ne prétend pas les livrer.
