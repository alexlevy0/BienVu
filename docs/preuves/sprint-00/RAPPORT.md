# Sprint 00 — rapport de faisabilité

27 septembre 2026 · dépôt `/Users/alexlevy0/Dev/BienVu` · branche `codex/sprint-00-faisabilite` · aucun commit/push.

**Faisabilité partiellement démontrée, sprint non terminé.** Le web fonctionne sur Workers Free, une annonce d'agence fournit ses données et trois photos depuis Cloudflare, et Remotion produit des MP4 natifs de 6 s et 30 s. Le rendu **dans Cloudflare Containers**, son sommeil et son coût réel restent non vérifiés. Aucun abonnement Workers Paid n'a été activé.

## Résultats démontrés

| Risque | Preuve réelle | Limite |
|---|---|---|
| Next.js/OpenNext | Production déployée sur Workers ; démarrage au déploiement 19 ms ; six contrôles distants réussis | Sonde opérateur, pas le SaaS complet ni Better Auth |
| D1/R2/cookie | Migration distante, écritures/lectures concordantes, cookie Secure/HttpOnly/Strict, refus sans secret/cookie, nettoyage | Isolation inter-agences et auth client hors sprint |
| Agence Espaces Atypiques | Référence 16624, titre, Paris, vente, prix 949 000 €, trois JPEG distincts de 1620 ou 1621×1080 téléchargés, décodés chez Cloudflare, hachés et stockés dans R2 | Un cas statique avec galerie HTML ; ne prouve pas une couverture générale des agences |
| Le Figaro 108944355 | Tentative Browser Run distante : `SOURCE_BLOCKED`, accès refusé par la source | Annonce non qualifiée de retirée ; aucun contournement |
| Remotion natif | MP4 synthétiques 6 s et 30 s, H.264/AAC, 1080×1920, 30 fps ; vrai protocole HTTP asynchrone contrôlé | Ne valide pas Linux/Containers ni une voix française |
| Linux amd64 | Image construite et vrai MP4 6 s réussi, réseau externe désactivé | Émulation Rosetta locale ; 30 s non testé dans Linux/Containers |
| Confidentialité/arrêt | R2 public désactivé, aucun domaine public, purge `probes/` après 30 jours ; historique des sessions navigateur relevé | Pas encore de sommeil Containers observé |
| Budget | Aucun appel IA/TTS, aucune activation payante ; consommation navigateur mesurée par le fournisseur | Facture non consultée ; gratuité estimée à partir des quotas et de la consommation |

URL web : [laboratoire de staging](https://bienvu-web-probe-staging.alexlevy0.workers.dev). Cette page décrit les sondes, sans achat, compte client ou éditeur. L'interface a été vue dans le navigateur intégré ; pas de recette responsive exhaustive.

## Import distant : essais et corrections conservés

Source : [Espaces Atypiques, annonce 16624](https://www.espaces-atypiques.com/ventes/75015-paris-appartement-bourgeois-avec-vue-panoramique-16624/). L'identité canonique, la référence, le titre et le prix affiché sont confrontés aux données embarquées. La surface est omise parce que la page distingue plusieurs définitions.

| Cas | Durée de la sonde | Résultat |
|---|---:|---|
| `agency` | 26,697 s | Galerie absente du DOM transformé ; échec conservé |
| `figaro` | 3,287 s | Accès source refusé ; navigateur fermé normalement |
| `agency-gallery-check` | 5,591 s | 17 liens retrouvés dans le HTML initial, mais aucun transfert de photo abouti |
| `agency-static-check` | 60,224 s | Deux photos stockées ; timeouts réseau et fermeture fournisseur `BrowserIdle` |
| `agency-keepalive-check` | 6,828 s | **Succès : trois photos**, sans rejet ; fermeture demandée dans `finally` |

Le diagnostic HTTP isolé d'une photo a renvoyé 200 et 501 918 octets, sans ouvrir de navigateur. Le coût des ressources auxiliaires sur Workers Free était une hypothèse d'investigation, pas une erreur fournisseur prouvée. Le correctif limite la navigation au document pour ce cas et règle l'inactivité navigateur à 60 s ; le timer de session active reste de 60 s. La collecte s'arrête à trois photos. Un script externe nécessaire à une autre agence demanderait un cas distinct.

Les cinq tentatives sont bornées par cinq clés R2 distinctes et conditionnelles ; aucun échec ni aucune réservation n'a été effacé. Les deux cas initiaux ont été complétés par trois cas de correction explicites. Aucun retry automatique et aucune collecte massive.

Le rapport réussi contient trois empreintes distinctes :
- `e171c560…323054a` — 501 918 octets ;
- `4ffa0f8a…fc0dfd` — 356 890 octets ;
- `fddc5db4…6e7afd` — 546 058 octets.

Total de la galerie retenue : **1 404 866 octets**. Les objets restent privés ; aucune photo réelle n'a été intégrée au MP4 synthétique ni publiée. Les droits commerciaux de réutilisation ne sont pas établis par cet essai. Les photos de l'agence portent son filigrane d'origine.

Preuves : `browser-agency-first.json`, `browser-agency-gallery.json`, `browser-agency-static.json`, `browser-agency-success.json`, `browser-figaro.json`, `photo-diagnostic.json` et historiques navigateur.

## Vidéos natives réellement produites

| Artefact local | Durée vidéo / conteneur MP4 | Taille | Rendu et vérification | Audio RMS |
|---|---|---:|---:|---:|
| `node-1790536106820.mp4` | 6 s / 6,058667 s | 735 464 octets | 39,321 s | −32,79 dBFS |
| `local-target-reprise-03.mp4` | 30 s / 30,058667 s | 2 500 320 octets | 177,000 s | −32,76 dBFS |

Fichiers dans `evidence/local/renderer/`, hors Git. Images géométriques générées localement et signal WAV de synthèse : aucune vraie annonce et aucun TTS. Vérifications : codecs H.264/AAC, dimensions, cadence, durée, décodage de l'AAC en PCM non silencieux, taille et SHA-256.

Le service Node a passé les contrôles avec un vrai rendu : accès sans secret refusé, réponse 202 avant achèvement, replay idempotent, conflit de contenu rejeté, second job concurrent rejeté, statut `ready` uniquement après vérification du MP4. Preuve : `render-server-native.json`.

Le premier nouvel essai a échoué faute de `ffprobe` système ; le suivant a identifié un format PCM brut absent du FFmpeg minimal Remotion. Ces deux échecs restent conservés. Le code utilise désormais WAV/PCM et le lanceur natif trouve FFmpeg/FFprobe dans le package Remotion macOS, sans installation Homebrew ni changement système.

Les images extraites du MP4 de 30 s à 1, 15 et 29 secondes ont été inspectées : textes, marque, filigrane et trois séquences visibles, sans découpe observée. La piste contient un signal synthétique de test, sans voix off ; sa présence, son décodage et son niveau sonore sont vérifiés. **Alex confirme le 27/09/2026 avoir écouté la vidéo locale et entendu le son.** Voir le [retour utilisateur](ecoute-utilisateur.md). L'audibilité locale est confirmée ; ce retour n'atteste pas une inspection visuelle continue ni l'écoute d'un rendu Containers. `inspection-native.json` conserve l'état de l'inspection initiale de l'agent, antérieure à cette confirmation.

## Linux et Containers

La construction Linux amd64 a réussi après suppression, à la demande d'Alex, des anciens conteneurs Docker : `build-docker-reprise.log`, image `sha256:bace81bba111d48da01d4b4b36fa247cd8f27710ec65b4876ffdce9f3e0fcf01`. Node 24.17.0 et FFmpeg 5.1.9 sont relevés dans le conteneur. La commande autorise 6 GiB, mais la VM Docker fournit 4 109 111 296 octets au total (environ 3,83 GiB) ; la mémoire disponible est moindre. Le rendu Linux court a réussi : **6 s, 735 772 octets, 471,485 s de rendu/vérification**, H.264/AAC, 1080×1920, 30 fps, environ −32,79 dBFS. Le processus x64 était exécuté sous Rosetta avec un quota de 1 vCPU ; cette durée ne prédit pas celle de Containers. Preuves : `mp4-linux-short.json`, `render-linux-short.log` et `linux-runtime-versions.json`. Trois images décodées à 1, 3 et 5 s ont été vues ; police de repli différente de macOS, mais pas de découpe observée. Le conteneur `--rm` a quitté avec le code 0 et a été supprimé ; zéro conteneur reste au contrôle. Ne pas attribuer les durées macOS à Linux ni à Cloudflare.

**Aucun rendu Containers n'a été exécuté.** Le Worker de contrôle et son Dockerfile sont préparés ; `--containers-rollout none` dans un dry-run compile le Worker sans construire l'image. Les réservations persistantes, le slot unique, le dépôt R2 et le sommeil doivent être exercés chez Cloudflare.

[Containers exige Workers Paid](https://developers.cloudflare.com/containers/platform/pricing/), à partir de 5 USD/mois, avec consommation supplémentaire éventuelle. Activer R2 ne souscrit pas à ce plan. Une recette locale réussie ne valide pas ce critère central.

## Environnements, commandes et versions

Next.js 16.3.6, React 19.3.0, OpenNext 1.20.6, Wrangler 4.142.0, Node 24.17.0, pnpm 10.33.2, Remotion 4.0.529, Playwright Cloudflare 1.3.6 et Containers SDK 0.3.7. Lockfile exact ; image Node de base épinglée par digest. L'ADR conserve Next.js/OpenNext sans migration silencieuse vers vinext.

Commandes réellement exécutées lors de la reprise :
- `wrangler r2 bucket list/create`, `d1 list/create`, migration D1 distante, configuration Free, secrets de staging hors Git ;
- `wrangler deploy` pour le web et le navigateur ; `probe:web` avec cible distante ;
- cinq `probe:browser`, diagnostic HTTP de photo, états `/status`, vérifications R2 et lecture d'objets privés ;
- `render:local` sur fixtures synthétiques, sonde HTTP Node, métadonnées, décodage audio et extraction de trois images du MP4 ;
- build Docker amd64 de reprise ; contrôles TypeScript et 17 tests sur fixtures.

Les **17 tests déterministes** ne contactent ni navigateur distant, ni TTS, ni Containers. Ils protègent URL/DNS privés, limites de taille, identité et prix contradictoires, location, photos hors référence, contrats de rendu, budget et journal d'échec HTTP simulé. Ils restent distincts des essais réels ci-dessus.

Les échecs antérieurs (auth expirée, R2 non activé, Chromium local en timeout, build Docker interrompu sur machine saturée) sont historiques et conservés. Auth rétablie à 18:11 UTC, web local reconstruit et vérifié à 18:39 UTC, puis R2 activé par Alex et staging distant créé. Les logs historiques ne décrivent plus l'état actuel.

## Dépenses et limites financières

Aucun Workers Paid, crédit API ou licence payante acheté. L'équipe de 1 à 3 personnes déclarée par Alex relève de la [licence gratuite Remotion](https://www.remotion.dev/docs/license/faq) à la date de vérification.

[Browser Run Free](https://developers.cloudflare.com/browser-run/pricing/) inclut 10 minutes par jour. Le compteur fournisseur passe de 0 à **63,301 s** pour cinq sessions, échecs compris ; 536,699 s du quota quotidien restent disponibles au contrôle. Quatre fermetures sont normales, une par inactivité avant correction. Le dernier contrôle confirme zéro session active, appels désactivés et HTTP 503 pour un nouvel import. Voir `browser-shutdown.json` et `budget-reprise.json`. La durée de la requête Worker est différente de la durée du navigateur et n'est pas une facture.

[R2 Standard](https://developers.cloudflare.com/r2/pricing/) inclut 10 GB-mois, 1 million d'opérations A et 10 millions B par mois ; les dépassements sont facturables. Les objets de cette recette représentent quelques Mo et quelques dizaines d'opérations. D1 et Workers restent dans leurs quotas Free pour ces sondes.

**Dépense supplémentaire estimée de cette reprise : 0 € ; budget restant estimé : 30 €. Facture Cloudflare non consultée.** Le journal final sépare compteur mesuré, estimation après quotas et coût brut théorique. Les frais locaux d'électricité/matériel ne sont pas mesurés.

Le scénario `pnpm budget 120` reste hypothétique : standard-2, 120 s de CPU et de fonctionnement, environ 0,0043008 USD de calcul brut, hors forfait, autres services, change et taxes. Alternative interne Cloudflare si la capacité manque : standard-3, 2 vCPU/8 GiB/16 GB, 0,0073344 USD pour le même scénario de 120 s. Aucune taille ni aucun hébergeur de remplacement activé.

## Vérifications encore nécessaires

1. Lors de la recette distante, lire intégralement et écouter le MP4 produit dans Containers. L'audibilité de la vidéo locale est déjà confirmée par Alex ; le signal synthétique ne valide pas une future narration française.
2. La courte recette Linux est réussie ; la durée cible de 30 s est prouvée seulement sur macOS. Vérifier cette durée sur la cible Linux/Containers lors de la recette distante.
3. Alex prévoit d'activer lui-même Workers Paid le 28/09/2026 et demande de rester en local jusque-là. Après confirmation de l'activation, initialiser le budget du contrôleur avec les engagements réels et exécuter la recette Containers → R2 : courte vidéo puis durée cible, trois premiers essais, cinq au maximum, échecs compris. Aucun nouvel essai distant ni achat en attendant.
4. Observer démarrage, concurrence, fin effective, sommeil après 30 s, téléchargement R2 sans réveil, durée active/facturée, stockage et facture.
5. Maintenir le refus explicite du Figaro et ne pas étendre la couverture sans nouveau cas testé.

La recommandation reste de poursuivre l'architecture Cloudflare proposée. Le web et un import d'agence sont démontrés en Free ; le rendu natif est disponible. **Le coût et le fonctionnement du rendu hébergé demeurent le verrou de validation du sprint.**
