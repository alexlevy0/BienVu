# Bilan des sprints — 28 septembre 2026

État après reprise de la recette du sprint 02 et portage Cloudflare du sprint 03. Les anciens rapports conservent leurs résultats datés ; les preuves locales sur fixtures, les appels aux agences réelles et les fixtures exécutées sur l'infrastructure distante restent distincts.

| Sprint | État | Suite |
|---|---|---|
| [00 — Faisabilité](sprints/SPRINT-00-FAISABILITE.md) | Technique démontrée | Facture/métriques du compte à rapprocher ; pas de nouvelle vidéo dans cette tranche |
| [01 — Fondations](sprints/SPRINT-01-FONDATIONS.md) | Terminé | CI à observer après prochain commit/push des changements actuels |
| [02 — Comptes et marque](sprints/SPRINT-02-COMPTES-MARQUE.md) | Terminé, recette distante complétée | Marque appliquée aux vidéos aux sprints 06–07 ; ouverture des e-mails et exploitation au lancement |
| [03 — Import agences](sprints/SPRINT-03-IMPORT-AGENCES.md) | Terminé, recette Cloudflare validée | Portails au sprint 04 ; échantillon réel limité à trois ventes |
| [04 — Portails](sprints/SPRINT-04-PORTAILS.md) | À faire | Échantillons, adaptateurs et couverture datée des quatre portails |
| [05 — Texte/voix](sprints/SPRINT-05-TEXTE-VOIX.md) | À faire | Script factuel, TTS, timing, écoute française et coût |
| [06 — Vidéo produit](sprints/SPRINT-06-VIDEO.md) | À faire ; renderer technique réutilisable | Vraies photos, voix, marque, sous-titres et filigrane |
| [07 — Parcours complet](sprints/SPRINT-07-PARCOURS.md) | À faire | Jobs/Workflow, reprises, historique, aperçu et téléchargement |
| [08 — Abonnements](sprints/SPRINT-08-ABONNEMENTS.md) | À faire | Stripe test, quotas atomiques et attribution de l'essai unique |
| [09 — Lancement](sprints/SPRINT-09-LANCEMENT.md) | À faire | Recette payante, conservation, exploitation, pages et décision commerciale |

## Sprint 02

Alex confirme le nouvel e-mail sur bienvu.online, son mot de passe choisi et la même agence retrouvée avec Google. Un seul compte, deux méthodes et une seule agence sont observés en D1. Les deux messages initiaux sur workers.dev conservent leur valeur de preuve historique.

Sur deux identités synthétiques du vrai service : création concurrente unique, marque persistante, refus inter-agences, PNG/JPEG privés et versionnés, fichiers hostiles/oversize refusés, session révoquée puis reconnexion, aucun crédit/rendu créé. Dans le navigateur : mobile 390 px, erreur lisible, sauvegarde/rechargement, upload/remplacement par le sélecteur. Expiration et consommation unique de jetons de reset testées à distance sur le seul compte synthétique B, sans envoi supplémentaire.

Les callbacks OAuth négatifs sont des requêtes de test ; les consentements réels sont ceux confirmés par Alex. [Rapport complet et limites](preuves/sprint-02/RECETTE-DISTANTE.md).

## Sprint 03

Le pont Node local est désormais réutilisé dans un **Cloudflare Container privé `basic`**, connecté par Service Binding. Il épingle les IP validées avec TLS, contrôle les redirections et décode/réencode les photos avec Sharp. Browser Run délègue son trafic autorisé au même transport. Le renderer vidéo et ses compteurs restent en pause. [ADR 0003](adr/0003-transport-import-cloudflare.md).

| Critère | Preuve |
|---|---|
| Fixtures extraction | Vente/location, prix absent, contradictions, doublons et hors annonce ; tests locaux déterministes |
| Trois agences réelles | Espaces Atypiques / Orpi / Century 21 : 12 / 11 / 7 photos, descriptions persistantes, D1/R2 privés relus |
| Réseau | Vrais refus distants d'IP privées, DNS loopback, redirection privée et sous-requête Browser Run ; rebinding/mixte/flux hostiles avec ports injectés |
| Navigateur | Page JS synthétique importée par le parcours produit ; quatre cycles réels avec défauts injectés ; six fermetures normales dans l'historique fournisseur |
| Sans IA | Aucun appel texte/TTS/image IA dans cette tranche |
| Description | Source et paragraphes conservés, provenance séparée des faits vérifiés ; relecture D1/API/interface |
| Saisie manuelle | Location/photos synthétiques, vrai transport hébergé, reprise, normalisation, isolation et consultation |
| Purge | Cron dix minutes, dossiers abandonnés/expirés, refus des écritures tardives et protection par job ; rapport détaillé de recette |

Les locations et la page JS sont synthétiques. L'échantillon d'agences ne démontre ni compatibilité nationale ni adaptation aux portails. Les photographies des agences conservent leurs filigranes. [Résultats, coûts et preuves](preuves/sprint-03/CLOUDFLARE.md).

## Validation, budget et Git

103 tests locaux réussis, types des applications/packages et tests, frontières, build OpenNext. Migration `0009` appliquée, service d'import et web déployés. Les contrôles distants incluent le sixième import refusé 429, aucune session Browser Run restante et conteneur import arrêté. Le cron réel de 13:30 UTC a supprimé l'abandon et protégé le dossier lié au job synthétique. Les données de recette sont ensuite retirées, sans remboursement des compteurs ni suppression des données d'Alex.

20 € de provisions cumulées : 8 € fixes, 2,50 € rendus antérieurs, 6 € domaine, 3,50 € cette campagne. Alex confirme aucune autre dépense. Marge estimée 10 € sur 30 € ; alerte 20 €, coupure 25 €, facture réelle/TTC toujours non rapprochés. Les cinq imports du jour UTC ont utilisé le plafond technique, partagé entre toutes les agences. Le nettoyage ne le remet pas à zéro.

Aucun commit/push demandé pour cette tranche. La [dernière CI main vérifiée](https://github.com/alexlevy0/BienVu/actions/runs/36404738405) valide le commit `3d83abf`, pas ces modifications encore locales. Après leur prochain push, vérifier la nouvelle CI.

Prochaine tranche fonctionnelle : **sprint 04 — portails**, puis 05 → 06 → 07 → 08 → 09. Les prix d'abonnement restent des propositions ; l'essai public, les paiements et le pipeline vidéo ne sont pas activés par cette recette.
