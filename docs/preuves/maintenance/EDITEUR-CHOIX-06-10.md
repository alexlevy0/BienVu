# Choix du projet dans l’Éditeur — 6 octobre 2026

Le bouton « Nouveau projet » de l’écran d’accueil de l’Éditeur ouvre désormais
la même modale que le parcours sans connexion : « Utiliser la démo » ou
« Nouveau projet ». Le composant `EditorProjectChoice` est commun aux deux
parcours et conserve la présentation sur ordinateur et mobile.

Pour un compte connecté, la démo publiée est copiée dans un brouillon privé de
l’agence avec les photos, les animations, la voix off et la musique existantes.
La copie utilise le transfert déjà disponible pour l’essai anonyme. Elle ne
consomme aucun crédit et ne déclenche aucun appel de génération. Le projet vide
utilise la création de brouillon existante, avec ses modèles d’agence habituels.

L’ouverture et l’annulation de la modale ne créent aucun brouillon. Les boutons
sont bloqués pendant la création et une erreur laisse la modale ouverte pour
réessayer. La reprise conserve la clé de création et le brouillon de destination
pour éviter les doublons. Les accès Lecteur restent en lecture seule.

## Vérifications

- TypeScript web et compilation Next.js/OpenNext réussis.
- Neuf tests existants passent : démo publique, stockage local, copie privée
  idempotente sans débit, isolation des agences, éditeur et conservation de voix.
- Contrôle des frontières réussi sur 390 fichiers et diff sans erreur d’espace.
- Six scénarios Chrome sur le Worker local : compte propriétaire avec démo et
  reprise après un échec simulé, projet vide mobile, accès Éditeur avec démo mobile,
  accès Lecteur, démo anonyme et projet vide anonyme mobile. Le focus reste dans
  la modale, Échap permet d’annuler, aucune exception JavaScript ni débordement
  horizontal n’est constaté. Les quatre plans, quatre clips de voix et la musique
  sont présents après le choix de la démo.

Les scénarios navigateur utilisent des comptes et réponses API simulés, sans
écriture dans les comptes réels. Les tests D1/R2 couvrent séparément les copies
et les droits sur les médias. Les captures et rapports sont conservés dans
`evidence/local/editor-choice/`. La simulation stricte du déploiement réussit.

## Mise en ligne

La version `8a6af89e-68c1-4e43-8606-f5c84d32e83d` est publiée à 100 % sur
`bienvu.online`. Les six scénarios navigateur passent aussi sur cette version,
toujours avec des réponses API interceptées et sans écriture distante. Les
requêtes HEAD réelles sur l’Éditeur et les exemples de photo, animation, voix
et musique renvoient 200 avec leurs types de contenu attendus.

Les empreintes des 44 bindings web, 9 bindings d’import et 28 bindings de
génération sont identiques avant et après. Seul le Worker web a été publié :
aucune migration, modification de secret ou publication du moteur de rendu.
