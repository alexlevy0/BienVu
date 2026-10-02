# Accueil studio — 2 octobre 2026

Demande : rapprocher l’accueil de la maquette « Studio BienVu pour vos vidéos immobilières » fournie par Alex.

## Rendu

- Grand bloc vert pastel arrondi, titre aligné à gauche sur trois lignes et dernière ligne en italique soulignée.
- Formulaire blanc intégré au bloc : réglages regroupés, durée avec une horloge, séparation et actions Personnaliser / Créer ma vidéo. Le coût en crédits reste visible.
- Démonstration verticale à droite, avec lecture dans le dialogue existant. Réutilisation des médias Paris déjà disponibles, sans nouvelle génération ; les biens fictifs sont signalés sous les inspirations et dans le dialogue.
- Cartes d’inspiration plus compactes, titre de section en sérif. Adaptation mobile sur une colonne, démonstration après le formulaire.
- Le compositeur reste monté lors du passage en conversation : saisie manuelle, annulation, personnalisation et choix utilisateur conservés. La présentation des pages Historique / Explorer / Agence reste indépendante.

Fichiers : `landing-page.tsx`, `landing.css`, `home-create.tsx`, `home-icons.tsx`.

## Vérification

TypeScript web, build OpenNext, dry-run Wrangler et `git diff --check` réussis. Contrôles Chrome à **1536 / 390 / 320 px**, en local puis sur les assets publiés, avec API métier interceptées et écritures API bloquées côté navigateur en production :

- absence de débordement horizontal ; captures d’accueil et formulaire inspectées ;
- lecture de la démonstration réelle : 28 s, 600 px de large, lecture effective ;
- passage vers la saisie manuelle et annulation, aperçu masqué et même nœud d’input conservé ;
- voix / sous-titres / durée, styles, ordre des photos et sélection Runway ; coût de trois crédits pour deux animations ;
- narration modifiée conservée et requête de génération capturée dans la fixture ; aucune création réelle ;
- offres et historique de crédits simulés toujours fonctionnels.

Ces vérifications UI utilisent un compte de recette simulé. Elles ne constituent pas une nouvelle génération payante ni une validation d’authentification réelle. Aucun nouveau MP4 produit ni appel OpenAI / Fish / Google / Runway.

## Publication

Web **`4a57fdb2-cc6e-4c51-835f-54e47f5d58c0`** à **100 %** sur `bienvu.online`. Les **25 bindings**, date et flags de compatibilité sont strictement conservés. Workers génération / renderer et base de données non modifiés pour ce redesign.

Accueil, connexion et abonnement : **HTTP 200** ; API crédits et admin sans session : **401**. Le HTML distant contient le nouveau bloc, la démo et le réglage de durée.

État avant/après : 13 jobs, aucun actif, une animation historique, générations ouvertes. Budget engagé **45,35 €** inchangé sur l’enveloppe mensuelle existante ; aucun crédit client dépensé pour la recette.

Traces privées ignorées : `evidence/local/home-redesign/` (captures, fixtures et snapshots Cloudflare). Les modifications antérieures du système de crédits restent dans le dépôt ; aucun commit ou push effectué dans cette maintenance.
