# BienVu — dossier de construction pour Codex

Version 1.0 · 27 septembre 2026 · Projet neuf · Langue produit : français.

**Promesse : coller le lien d'une annonce immobilière, obtenir une vidéo verticale avec voix off, la prévisualiser et la télécharger.**

Ce dossier est un cahier de construction. Il ne contient pas encore d'application, de déploiement ou de résultats de tests. Les critères ci-dessous sont à vérifier par Codex pendant l'implémentation.

## Utilisation

1. Décompresser ce dossier et le placer dans le futur dépôt, par exemple sous `docs/bienvu/`.
2. Ouvrir le dépôt dans Codex. Aucun starter n'est présupposé.
3. Faire lire les documents de référence, puis commencer par le sprint 00.
4. Exécuter les sprints dans l'ordre. Mettre à jour `SUIVI.md` avec les preuves, les limites et les décisions réelles.
5. Les sprints sont des lots fonctionnels, pas des engagements d'une semaine ou d'un nombre d'heures.

## Documents de référence

| Document | Usage |
|---|---|
| [CADRAGE.md](CADRAGE.md) | Choix d'Alex, parcours et périmètre |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Services Cloudflare et séparation des environnements |
| [CONTRATS.md](CONTRATS.md) | Données, états, droits d'accès et règles de quota |
| [BUDGET-ET-OFFRES.md](BUDGET-ET-OFFRES.md) | Budget de 30 €, coûts et offres proposées |
| [CONSIGNES-CODEX.md](CONSIGNES-CODEX.md) | Manière de travailler et définition d'un sprint terminé |
| [SOURCES.md](SOURCES.md) | Sources officielles et points à revérifier |
| [SUIVI.md](SUIVI.md) | Avancement initial, à mettre à jour pendant le développement |

## Ordre des sprints

| Sprint | Résultat démontrable | Dépendances |
|---|---|---|
| [00 — Faisabilité](sprints/SPRINT-00-FAISABILITE.md) | Preuves Next.js + navigateur + rendu Cloudflare, premiers coûts | Aucune |
| [01 — Fondations](sprints/SPRINT-01-FONDATIONS.md) | Monorepo, schémas, environnements et première interface | 00 |
| [02 — Comptes et marque](sprints/SPRINT-02-COMPTES-MARQUE.md) | Inscription, agence et identité enregistrée | 01 |
| [03 — Import agences](sprints/SPRINT-03-IMPORT-AGENCES.md) | URL d'agence → données fiables et photos privées | 02 |
| [04 — Portails](sprints/SPRINT-04-PORTAILS.md) | Couverture mesurée des portails et import générique | 03 |
| [05 — Texte et voix](sprints/SPRINT-05-TEXTE-VOIX.md) | Script factuel et narration française synchronisable | 04 |
| [06 — Vidéo](sprints/SPRINT-06-VIDEO.md) | MP4 vertical de marque et version d'essai filigranée | 05 |
| [07 — Parcours complet](sprints/SPRINT-07-PARCOURS.md) | Job durable, aperçu et téléchargement après un seul lien | 06 |
| [08 — Abonnements](sprints/SPRINT-08-ABONNEMENTS.md) | Stripe, crédits atomiques et essai gratuit unique | 07 |
| [09 — Lancement](sprints/SPRINT-09-LANCEMENT.md) | Recette payante, exploitation et limites publiées | 08 |

Les sprints 00 à 07 utilisent un accès de développement contrôlé. L'essai public et les paiements ne sont activés qu'une fois les règles de quota du sprint 08 intégrées. Un portail bloqué doit apparaître comme tel : cela n'autorise pas à supprimer l'objectif multi-sites ni à annoncer une compatibilité inexistante.

## Premier message à donner à Codex

```text
Nous créons BienVu à partir de zéro. Lis les fichiers README.md, CADRAGE.md,
ARCHITECTURE.md, CONTRATS.md, BUDGET-ET-OFFRES.md et CONSIGNES-CODEX.md
dans ce dossier, puis exécute SPRINT-00-FAISABILITE.md.

Commence par inspecter le dépôt et ses instructions existantes. Respecte
les décisions confirmées : SaaS payant, quotas par abonnement, une vidéo
d'essai avec filigrane après inscription, charte d'agence enregistrée,
aucun éditeur et hébergement Cloudflare autant que techniquement possible.

Le budget des premiers tests est de 30 € par mois, hébergement et API compris.
Crée les fichiers nécessaires, implémente la tranche du sprint et vérifie
son fonctionnement. Distingue les tests sur fixtures des tests réels.
Si un accès externe manque, termine le travail local vérifiable et consigne
précisément la vérification restante. Ne déclare pas la faisabilité validée
sur la seule base d'une maquette. Mets à jour SUIVI.md à la fin.
```

## Ce que ce dossier ne garantit pas

- La récupération de tous les liens des portails, ni de toutes leurs galeries.
- Un coût réel inférieur à 30 € sans mesure, limitation et suivi de facturation.
- La compatibilité de toutes les versions de Next.js, de leurs adaptateurs et des services encore en bêta.
- La disponibilité de la marque BienVu ou d'un nom de domaine ; aucun achat n'est prévu pour les premiers tests.
