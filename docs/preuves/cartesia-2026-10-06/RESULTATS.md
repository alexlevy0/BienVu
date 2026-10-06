# Voix Cartesia et comparaisons superadmin — 6 octobre 2026

## Résultat livré

Sonic 3.6 est actif sur BienVu avec 41 voix publiques natives en français de France et accent parisien, vérifiées dans le catalogue du compte puis synthétisées réellement. Inès est la voix initiale des nouveaux projets. Le panneau **Voix off** regroupe 47 voix : 41 Cartesia, trois Fish Audio et trois Google. Il permet de choisir une annonce conservée, modifier le texte commun, écouter et enregistrer la voix globale par défaut.

Les brouillons conservent leur sélection et chaque nouveau job fige sa voix au lancement. Le catalogue historique, les journaux, les WAV privés et la récupération des pistes d’éditeur restent compatibles. [Guide de configuration](../../VOIX-CARTESIA.md).

## Vérifications

- Suite générale : **378/378 tests réussis**, sans appel externe. TypeScript des applications, packages et tests validé ; frontières vérifiées sur **404 fichiers** ; build OpenNext final réussi.
- Régressions dédiées : paramètres Cartesia stricts, accents interdits, erreurs HTTP, corps excessif, silence, délai, absence de retry ; quota atomique partagé, courses, deux appels simultanés, audit immuable, historique des crédits, idempotence et voix figée.
- Better Auth et D1/R2 locaux : extrait réservé une seule fois, lecture privée vérifiée par empreinte, accès refusé à l’invité, au compte ordinaire et au compte non vérifié ; origine étrangère refusée.
- Chromium **1280/390 px** : 47 voix et trois groupes, lecture du vrai fichier Cartesia, changement du défaut, conservation du texte et absence de débordement. Les API sont simulées dans un serveur local ; le défaut distant n’est pas modifié par cette recette.
- Les 41 aperçus courts publics sont enregistrés en MP3 et disponibles sans appel TTS à chaque écoute.

Comparaison **réelle** sur le même texte de 880 caractères d’une annonce déjà importée :

| Fournisseur / voix | Durée WAV | Réécoute |
| --- | ---: | --- |
| Cartesia / Inès | 52,720 s | Cache privé, aucun nouvel appel |
| Fish Audio / Manon | 57,653 s | Cache privé, aucun nouvel appel |
| Google / Aoede | 61,640 s | Cache privé, aucun nouvel appel |

Les écoutes publiques courtes ont utilisé **4 059 caractères Cartesia** ; la comparaison réelle en a utilisé **880**. Le registre interne conserve **4 939 / 20 000 caractères**, soit **15 061 disponibles** sur 31 jours glissants, au contrôle final. Aucun abonnement fournisseur n’a été créé ou modifié et aucun crédit client BienVu n’a été décompté par cette recette. Le quota interne ne constitue pas le solde ni la facture Cartesia.

## Publication et conservation

Migration `0048_cartesia_voices.sql` appliquée avant activation. Les **73 appels de narration historiques** ont une empreinte identique avant/après : `cdee54f45d4d9f9f8c38dc00fe35623455bf2ea29c61fe56c65ff1c8cb5d2469`. Les trois registres financiers contrôlés sont restés vides ; aucun défaut de clé étrangère détecté. Aucun nouveau rendu vidéo client ou appel d’animation n’a été lancé.

| Worker | Version finale | Bindings |
| --- | --- | ---: |
| Web | `37e50720-5f6c-4270-8802-335f180a7ea7` | 44 → 50 |
| Génération | `71f063d1-da2d-4ce4-9490-c5ecf03f94e1` | 28 → 30 |

Les bindings existants, dates de compatibilité, flags, observabilité et limites sont conservés. Les ajouts concernent exclusivement les fournisseurs TTS ; aucune reconstruction ni modification du conteneur renderer. Le Worker de génération utilise `--containers-rollout none`.

Sur `bienvu.online` après publication : accueil et catalogue public **200**, extrait public Inès **200**, API et audio superadmin sans session **401**. Les secrets restent dans les environnements ignorés et Cloudflare ; leurs deux fichiers temporaires de déploiement ont été effacés. Journaux et fichiers privés de recette : `evidence/remote/cartesia-20261006/`, hors Git.

Limites : le décodage et la lecture sont vérifiés techniquement, sans validation humaine du naturel des 41 voix. Le mobile est émulé dans Chromium ; Safari et téléphone physique ne sont pas certifiés. Le workflow complet est testé avec fournisseurs/rendu simulés ; aucun nouveau MP4 Cartesia réel n’a été produit par la recette. Il ne s’agit pas d’une exécution de GitHub Actions.
