# Bilan des sprints — 29 septembre 2026

État après la clôture du renderer (06) et du parcours durable Cloudflare (07), avec confirmation humaine du nouveau MP4 distant. Les anciens rapports conservent leurs résultats datés ; fixtures locales, données synthétiques sur infrastructure distante et vraies annonces restent distinguées.

| Sprint | État | Suite |
|---|---|---|
| [00 — Faisabilité](sprints/SPRINT-00-FAISABILITE.md) | Technique démontrée | Facture/métriques du compte à rapprocher ; pas de nouvelle vidéo dans cette tranche |
| [01 — Fondations](sprints/SPRINT-01-FONDATIONS.md) | Terminé | CI du commit accueil `01b67bf` réussie ; prochain lot à vérifier après push |
| [02 — Comptes et marque](sprints/SPRINT-02-COMPTES-MARQUE.md) | Terminé, recette distante complétée | Marque appliquée aux vidéos aux sprints 06–07 ; ouverture des e-mails et exploitation au lancement |
| [03 — Import agences](sprints/SPRINT-03-IMPORT-AGENCES.md) | Terminé, recette Cloudflare validée | Portails au sprint 04 ; échantillon réel limité à trois ventes |
| [04 — Portails](sprints/SPRINT-04-PORTAILS.md) | Tranche déployée et recettée ; non clôturé | Sept liens explorés localement et quatre essais Cloudflare sans succès complet ; acquisition/galerie Bien’ici non validées (04.3) |
| [05 — Texte/voix](sprints/SPRINT-05-TEXTE-VOIX.md) | Terminé, recette Cloudflare validée | Naturel et rythme de 20 s approuvés par Alex ; vrais appels depuis Workers, D1/R2 privés, reprise 0/0 ; Workflow désormais validé au sprint 07 |
| [06 — Vidéo produit](sprints/SPRINT-06-VIDEO.md) | Terminé, rendu réel et confirmation humaine distante | Même renderer validé par le nouvel export du sprint 07 ; téléphone physique/Safari non vérifiés |
| [07 — Parcours complet](sprints/SPRINT-07-PARCOURS.md) | Terminé, déployé sous accès de développement | Deux vidéos Cloudflare, Workflow, reprise, historique privé et téléchargement ; un crédit pour Alex, essai public au sprint 08 |
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

## Sprint 04

Registre de sources à hôtes/chemins exacts, alias explicites, diagnostic des refus sans relance et page `/sources` avec information sous le champ URL. Sept annonces réelles consultées depuis le poste : Figaro 0/3, SeLoger 0/1, Leboncoin 0/1, Bien’ici 0/2 imports complets. Les deux DOM publics Bien’ici ont été inspectés dans un navigateur ordinaire ; la vente est extraite hors ligne, la location refusée pour un écart de prix. Les images admissibles et le navigateur automatique ne sont pas validés. Les fixtures synthétiques ne modifient pas cette couverture.

La tranche est déployée. Sur Cloudflare : Figaro/SeLoger/Leboncoin refusés sans navigateur ni retry ; Bien’ici reçoit le HTML puis rencontre le garde-fou réseau du navigateur. 0/4 imports complets, une session fermée normalement, aucun fichier de photo stocké. Les données de recette sont nettoyées, le conteneur est endormi. Migration `0010` : 10 imports/jour demandés par Alex, compteurs et 30/mois conservés. Crawlee étudié mais ni installé ni testé. [Résultats, tests et réserve 04.3](preuves/sprint-04/RAPPORT.md).

## Sprint 06

Composition, marque, sous-titres, conclusion, filigrane intégré et manifeste serveur immuable livrés. Après un premier échec conservé, le même manifeste produit un vrai MP4 dans **Cloudflare Containers** : **600 frames, 20,054 s, H.264/AAC, 1080 × 1920**, rendu/vérification en **169,57 s**. Annonce/photos synthétiques, cinq WAV Google déjà approuvés ; aucun nouvel appel texte/TTS.

R2 privé, contrôle du hash et du poids, lecture par plages, deux demandes simultanées regroupées, rejeu sans nouveau calcul, relecture après redéploiement et arrêt automatique vérifiés. **156 tests** réussissent. La reprise explicite conserve les échecs et les dépenses, sans changer le nom du contrôleur. Les pannes injectées utilisent D1/R2/DO locaux et un renderer simulé ; le MP4 Cloudflare est une preuve indépendante.

Frames du MP4 inspectées, lecture complète Chromium desktop/mobile **émulé**. Après validation du MP4 local, Alex confirme image et voix du nouvel export entièrement Cloudflare du sprint 07. Cette confirmation du même renderer clôt la réserve humaine du sprint 06, sans prétendre être une seconde lecture du premier fichier d’essai. Téléphone physique/Safari non validés. Service de recette du sprint 06 désactivé et en pause, conteneur arrêté. [Rapport](preuves/sprint-06/RAPPORT.md).

## Sprint 07

Deux vidéos de 20,054 s produites de bout en bout par Cloudflare : annonce Century 21 réellement importée, puis annonce manuelle synthétique sauvegardée. Temps totaux **201,569 s** et **190,391 s**. Deux appels OpenAI, dix Google, deux rendus et deux crédits consommés, sans duplication après rejeu/redéploiement. Alex approuve image et voix du MP4 URL.

**158 tests** passent, ainsi que types, frontières et build OpenNext. Reprise avant lancement/après upload sur fixtures workerd, arrêt confirmé avant restitution, annulation ancienne sans impact sur un nouveau job. Sur le vrai service : statuts/historique/MP4 isolés entre agences, plages et téléchargement du même objet, pause sans perte des vidéos existantes. Lectures ordinateur/mobile émulé complètes ; pas de téléphone physique/Safari. Formulaire manuel inspecté ; uploads complets déjà vérifiés au sprint 03, annonce préchargée pour cette campagne.

Le parcours est déployé sur bienvu.online, avec **un crédit de développement pour Alex**, sans attribution de l’essai public. Le plafond d’import du 28/09 UTC reste atteint : reprise le **29/09 à 02:00 Paris**. Aucun compteur réinitialisé ; refus URL avant provision vidéo et indication de l’attente dans l’interface. La campagne isolée est désactivée, conteneur arrêté. [Rapport détaillé](preuves/sprint-07/RAPPORT.md) · [Architecture et exploitation](GENERATIONS.md).

## Validation, budget et Git

Pour les sprints 02–03 : 103 tests locaux réussis, types des applications/packages et tests, frontières, build OpenNext. Le sprint 04 porte la suite locale à 117 tests ; les vérifications propres à cette tranche figurent dans son rapport. Migration `0009` appliquée, service d'import et web déployés. Les contrôles distants incluent le sixième import refusé 429, aucune session Browser Run restante et conteneur import arrêté. Le cron réel de 13:30 UTC a supprimé l'abandon et protégé le dossier lié au job synthétique. Les données de recette sont ensuite retirées, sans remboursement des compteurs ni suppression des données d'Alex.

**29,85 € de provisions cumulées après le sprint 07** : ancien cumul 26,35 € conservé + campagne complète de 3,50 € réservée avant les essais. Enveloppe **40 €/mois**, coupure **35 €** ; marge **10,15 €**, dont 5,15 € avant coupure. Les sous-journaux restent inclus, aucun remboursement fictif. Les douze appels API de cette campagne représentent **0,019224 USD estimés avant gratuité** ; dernier cycle renderer **0,0060505088 USD** de calcul brut, distinct de la facture/TTC non rapprochée. Imports toujours 10/jour UTC et 30/mois, compteurs du 28/09 UTC 10/10 et 11/30 conservés. Campagne isolée fermée ; un crédit de développement inutilisé pour Alex sur le site principal, essai public fermé. [Budget](BUDGET-ET-OFFRES.md) · [Preuves](preuves/sprint-07/RAPPORT.md).

Les sprints 02–03 ont été poussés sur `main` (`9e0c732`), puis l’accueil vert pastel (`01b67bf`). La [CI de ce dernier commit](https://github.com/alexlevy0/BienVu/actions/runs/36444985953) est réussie. Les modifications des sprints 04–07 sont regroupées pour la livraison sur `main` demandée par Alex le 29/09 ; vérifier leur propre CI sur GitHub après push.

Reste du **sprint 04 : acquisition automatique et galerie Bien’ici (04.3)**, sans prétendre que les portails sont compatibles. Les sprints 05–07 sont terminés sur les agences éprouvées et la saisie manuelle. Prochain sprint : **08 — abonnements et essai unique**. Les prix restent des propositions ; aucun essai public, abonnement ou paiement réel activé.
