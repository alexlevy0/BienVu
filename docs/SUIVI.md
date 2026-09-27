# BienVu — suivi des sprints

Dernière mise à jour : 27 septembre 2026.

## État actuel

**Sprint 01 : fondations livrées et vérifiées en local**, à la demande d'Alex de poursuivre sans attendre Workers Paid. Interface française, contrats métier, migrations D1, CI préparée et observabilité disponibles. Installation depuis une copie propre, 30 tests, TypeScript et build OpenNext réussis. Aucun déploiement de cette tranche ; [rapport du sprint 01](preuves/sprint-01/RAPPORT.md) et [guide local](DEVELOPPEMENT.md).

**Sprint 00 : validation partielle, faisabilité globale non validée.** Le web Next.js/OpenNext est déployé sur Workers Free et la sonde distante D1/R2/cookie réussit. Une vraie annonce d'agence fournit ses données et trois photos depuis Browser Run vers R2 privé. Remotion a produit deux MP4 natifs, de 6 s et 30 s, puis un MP4 de 6 s dans Docker Linux amd64. **Le rendu Cloudflare Containers, son sommeil et sa facture restent à vérifier.**

Après reconnexion Wrangler par Alex, puis activation de R2 par Alex, deux Workers, une base D1 et un bucket R2 privés de test ont été créés. Aucun abonnement Workers Paid, achat de licence, crédit API, paiement client ou hébergeur alternatif activé.

**Consigne d'Alex du 27/09/2026 : rester en local en attendant Workers Paid.** Alex prévoit d'activer lui-même ce plan le 28/09/2026 ; l'activation n'est pas encore vérifiée. Aucun nouvel essai distant ni achat à lancer en attendant.

[Laboratoire déployé du sprint 00, inchangé](https://bienvu-web-probe-staging.alexlevy0.workers.dev) · [rapport](preuves/sprint-00/RAPPORT.md) · [procédure](preuves/sprint-00/PROCEDURE.md) · [ADR](adr/0001-hebergement-sprint-00.md).

| Sprint | Statut | Preuves | Reste |
|---|---|---|---|
| 00 | Code livré, validation partielle | Workers/D1/R2/cookie distants ; import agence avec trois photos ; MP4 natifs 6/30 s ; image Linux et rendu 6 s réussis ; son local entendu par Alex | Durée cible Linux, Containers/R2/sommeil, recette du MP4 distant et facture |
| 01 | Livré et vérifié en local | Copie propre, 30 tests, types, migrations, build OpenNext, sondes workerd et inspection mobile/ordinateur | Déploiement/migrations de staging et exécution GitHub CI non faits ; validation Containers du sprint 00 distincte |
| 02 | À faire | — | Compte et marque |
| 03 | À faire | — | Import agences et sécurité d'URL client |
| 04 | À faire | — | Portails et couverture générique |
| 05 | À faire | — | Script et voix |
| 06 | À faire | — | MP4 et filigrane produit |
| 07 | À faire | — | Pipeline durable complet |
| 08 | À faire | — | Facturation et quotas |
| 09 | À faire | — | Recette de lancement |

## Décisions et hypothèses

| Sujet | État | Preuve / limite |
|---|---|---|
| Produit | SaaS payant, quotas par abonnement, une vidéo d'essai filigranée après inscription, charte enregistrée, aucun éditeur | Décisions confirmées par Alex ; parcours client non implémenté dans ce sprint |
| Adaptation Next.js | Next 16.3.6, React 19.3.0, OpenNext 1.20.6, Wrangler 4.142.0 | Build, workerd local et Worker distant réussis ; pas de migration silencieuse |
| Rendu | Remotion 4.0.529, Node 24.17.0, Linux amd64 prévu pour Containers | Rendus natifs 6/30 s et Linux 6 s réussis ; hébergement Containers non validé |
| Taille / concurrence | standard-2 proposé, un rendu simultané | Mesure distante à faire |
| Auth client | Better Auth + Google OAuth | Proposition, pas une décision confirmée |
| Texte / voix | API OpenAI, modèles et voix configurables | Aucun appel ; qualité française et coût non mesurés |
| Prix et quotas | 29/59/99 € HT pour 10/30/60 vidéos | Hypothèses commerciales non validées |
| Format | 1080×1920, environ 30 s, un modèle | Valeurs proposées, éprouvées sur médias synthétiques |
| Conservation | 30 jours | Règle effective sur le préfixe de test R2 `probes/` ; conditions client futures à préciser |
| Licence Remotion | Gratuite pour l'équipe déclarée de 1 à 3 personnes | FAQ officielle vérifiée ; réévaluer si l'équipe grandit |
| Budget | 30 €/mois tout compris ; dépenses initiales déclarées : 0 € | Aucun upgrade Workers ; coût supplémentaire estimé à 0 €, facture non consultée |

## Sprint 00 — résultats et commandes

- **Dépôt :** `/Users/alexlevy0/Dev/BienVu`, branche `codex/sprint-00-faisabilite`. Git Homebrew utilisé car le Git système demande l'accord Xcode ; aucun accord accepté, aucun commit/push.
- **Livré :** monorepo TypeScript, laboratoire Next.js, sondes opérateur, extraction contrôlée, renderer Node/Remotion, contrôleur Containers, fixtures, budget persistant et coupe-circuit. Aucun éditeur ou saisie manuelle de photos ajouté.
- **Fichiers principaux :** `apps/web`, `apps/pipeline`, `apps/renderer`, `packages/contracts`, `packages/importers`, `packages/video`, migration D1, `scripts`, `tests`, lockfile et documentation. Reprise : vérification WAV/PCM native, lanceur `renderer-native.mjs`, état Browser Run, galerie HTML, diagnostic photo et délai d'inactivité corrigés.
- **Fixtures :** 17 tests réussis, sans API facturable : URL/DNS privés, plafonds de taille, identité/prix contradictoires, location, photos étrangères, contrats de rendu, budget et journal d'échec via HTTP simulé. [Résultat](preuves/sprint-00/tests-fixtures-final.log).
- **TypeScript :** contrôle complet réussi, puis nouveau contrôle du pipeline après le dernier correctif. La fixture HTTP n'est pas présentée comme un vrai rendu.
- **Web réel :** build OpenNext, workerd local puis déploiement Workers Free. Les six contrôles distants passent : autorisation, cookie, D1, R2, refus d'un cookie inconnu et nettoyage. [Preuve](preuves/sprint-00/web-cloudflare.json). Page de laboratoire inspectée visuellement.
- **Import réel :** cinq sessions Browser Run : agence initiale, Figaro, puis trois contre-vérifications nommées et réservées. Succès final agence en 6,828 s, trois JPEG distincts réellement décodés et stockés dans R2 ; échecs antérieurs conservés. Le carrousel supprimait les ancres du DOM ; lecture du HTML initial ajoutée. La fermeture par inactivité durant les transferts a été observée et corrigée. [Succès](preuves/sprint-00/browser-agency-success.json), [inspection des photos et empreintes](preuves/sprint-00/inspection-photos.json).
- **Sources limitées :** l'essai réussi utilise le HTML initial avec ressources annexes bloquées. Il ne valide pas toutes les agences ni les pages dépendant d'une hydratation externe. Surface omise en cas de définitions ambiguës ; droits commerciaux sur les photos non établis.
- **Le Figaro :** `SOURCE_BLOCKED` observé chez Cloudflare ; aucun contournement, aucune conclusion d'annonce retirée. [Preuve](preuves/sprint-00/browser-figaro.json).
- **Remotion réel sur fixtures :** MP4 natifs 6 s et 30 s, H.264/AAC, 1080×1920, 30 fps, filigrane. Tailles : 735 464 et 2 500 320 octets ; rendu/vérification : 39,321 et 177,000 s. Piste AAC réellement décodée, niveau RMS environ −32,8 dBFS. [Court](preuves/sprint-00/mp4-native-short.json), [cible](preuves/sprint-00/mp4-native-target.json).
- **Service Node réel :** secret requis, 202 avant fin, replay idempotent, conflits et concurrence refusés, fichier disponible après vérification. [Preuve](preuves/sprint-00/render-server-native.json). Serveurs locaux ensuite arrêtés.
- **Inspection :** trois images du MP4 final vues à 1, 15 et 29 s, textes et filigrane lisibles. La piste audio contient un signal synthétique de test, sans voix off. Sa présence, son décodage et son niveau sonore sont vérifiés. **Alex confirme le 27/09/2026 avoir écouté la vidéo locale et entendu le son.** [Retour utilisateur](preuves/sprint-00/ecoute-utilisateur.md). L'audibilité locale est donc confirmée ; une inspection visuelle continue n'est pas attestée par ce retour. La recette du futur MP4 distant devra comprendre lecture complète et écoute.
- **Linux :** image amd64 construite, dépendances, bundle et Chromium inclus ; digest `sha256:bace81bba111d48da01d4b4b36fa247cd8f27710ec65b4876ffdce9f3e0fcf01`. Rendu Linux court réussi : 6 s, 735 772 octets, 471,485 s de rendu/vérification sous Rosetta avec quota 1 vCPU. Trois images du MP4 inspectées. VM Docker : environ 3,83 GiB au total, moins que les 6 GiB permis par la commande. Ce temps ne prédit pas Cloudflare. [Preuve MP4](preuves/sprint-00/mp4-linux-short.json). [Build](preuves/sprint-00/build-docker-reprise.log).
- **Arrêt distant :** imports désactivés, un nouvel appel renvoie 503, état sans secret refusé, zéro session active. Cinq sessions totalisent **63,301 s** selon le fournisseur, dont une fermeture `BrowserIdle` avant correction ; la dernière fermeture est normale. [Preuve](preuves/sprint-00/browser-shutdown.json).
- **R2 :** `r2.dev` désactivé, aucun domaine public, purge 30 jours. Base D1 `bienvu-s00-staging`, bucket `bienvu-s00-private`. [Inventaire](preuves/sprint-00/ressources-staging.json). Secrets distincts de staging hors Git.
- **Commandes exécutées :** installation, fixtures, types, tests, build OpenNext, migrations locale/distante, déploiements web/import, sondes web/browser/status, diagnostic et lecture de photos R2, rendu natif court/cible, sonde HTTP Node, build Docker. Commandes détaillées et reprise Containers dans la procédure.
- **Historique conservé :** auth expirée puis rétablie à 18:11 UTC ; premier refus R2 avant activation par Alex ; timeouts Chromium locaux ; premier build Docker interrompu ; deux nouvelles vérifications audio natives échouées avant correction. Aucun de ces essais n'est compté comme succès.
- **Nettoyage demandé par Alex :** 11 conteneurs `jakt` actifs arrêtés/supprimés à 18:31 UTC, puis les deux arrêtés restants à 18:32 UTC. Volumes et images conservés. [Preuve historique](preuves/sprint-00/docker-cleanup-all.json). Aucun ancien projet relancé. Le conteneur temporaire BienVu `--rm` a terminé avec le code 0 et a été supprimé automatiquement ; zéro conteneur reste au dernier contrôle. [Nettoyage final](preuves/sprint-00/cleanup-reprise.json).
- **Coût :** 0 € supplémentaire estimé dans les quotas Free, 30 € restants estimés, facture non consultée. Aucun appel texte/TTS ni rendu Containers. [Mesure et hypothèses](preuves/sprint-00/budget-reprise.json).
- **Limite centrale :** Containers exige Workers Paid. Son activation, le rendu hébergé, le sommeil, la durée active facturée et le coût par vidéo distante utilisable restent non validés. Ne pas marquer le sprint terminé sur la base des MP4 locaux.

## Sprint 01 — fondations locales

- **Périmètre autorisé :** poursuivre le sprint 01 en local en attendant l'activation de Workers Paid par Alex le 28/09/2026. L'architecture retenue est conservée ; la faisabilité Containers n'est pas supposée acquise.
- **Interface :** tableau de bord, création, identité d'agence, historique, abonnement et connexion. Navigation française responsive ; vérification syntaxique d'URL ; génération, compte, enregistrement et achat explicitement indisponibles. Aucun import ou job simulé présenté comme réel, aucun prix non validé publié.
- **Données et contrats :** `packages/contracts/src/product.ts` et `errors.ts`, fixtures vente/location/absence/contradiction, `packages/db` avec migrations `0002`/`0003`. Métadonnées par agence, références croisées protégées, un job actif, idempotence, intentions durables, réservations et coûts préparés. Le flux complet des quotas reste aux sprints métier.
- **Sécurité et diagnostic :** `packages/observability`, UUID de requête généré côté serveur, erreurs françaises sans secrets, logs sur liste blanche, query strings masquées dans la configuration. `POST /api/generations` renvoie 503 par défaut et ne peut pas créer de travail même si la pause est levée sans authentification. `pnpm generations:pause` fonctionne sur D1 local.
- **Reproductibilité :** `pnpm check`, `db:migrate`, `preview`, `probe:foundations`, `scripts/verify-clean.mjs` et `.github/workflows/ci.yml`. Versions du sprint 00 conservées ; Miniflare épinglé à la version déjà fournie par Wrangler. Exports des packages web adaptés au traitement OpenNext.
- **Tests réellement exécutés :** 30 réussis, dont six sous-tests SQL sous Miniflare/workerd et leur parent, plus TypeScript sur les packages et les tests. Deux batches concurrents, refus inter-agences, rollback complet, limites de contrat, audio tronqué et droits d'essai contrôlés. [Log](preuves/sprint-01/check.log).
- **Exécution locale :** migrations sur la base locale et sur une copie propre, seconde application sans changement ; build OpenNext réussi. Sept pages HTTP 200, refus serveur des générations, UUID et headers vérifiés ; D1/R2/cookie opérateur réussis avec nettoyage. Aucun de ces résultats n'est présenté comme un test distant de la tranche 01. [Sondes](preuves/sprint-01/web-workerd.json), [copie propre](preuves/sprint-01/clean-copy.json).
- **Inspection :** tableau de bord et agence vus sur ordinateur, plusieurs pages vues à 390 px ; champs désactivés et refus d'une URL locale vérifiés dans le navigateur. Aucun débordement horizontal sur les pages mesurées. [Compte rendu](preuves/sprint-01/inspection-ui.json).
- **Limites / coût :** authentification, enregistrement de marque, génération et facturation non intégrés. CI non exécutée sur GitHub ; staging inchangé. Aucun nouveau conteneur Docker, appel payant ou déploiement. Coût fournisseur supplémentaire attendu : 0 € ; facture non relue. [Rapport complet](preuves/sprint-01/RAPPORT.md).

## Couverture des sources

| Source | Mode effectivement testé | Liens uniques | Tentatives Cloudflare | Succès | Limite / résultat |
|---|---|---:|---:|---:|---|
| Espaces Atypiques 16624 | HTML de l'annonce, galerie, trois photos décodées → R2 privé | 1 | 4 | 1 | Deux angles du séjour et une vue extérieure ; trois échecs conservés ; autres agences non couvertes |
| Le Figaro 108944355 | Browser Run distant | 1 | 1 | 0 | Accès refusé ; source non qualifiée de retirée |
| SeLoger | Non testé | 0 | 0 | 0 | — |
| Leboncoin | Non testé | 0 | 0 | 0 | — |
| Bien'ici | Non testé | 0 | 0 | 0 | — |

## Dépenses

| Date | Poste | Consommation / engagement | Estimation facturable | Facture | Budget estimé restant |
|---|---|---|---:|---|---:|
| 27/09/2026 | Local | Fixtures, builds et rendus ; matériel/électricité non mesurés | 0 € fournisseur | Sans objet | 30 € |
| 27/09/2026 | Cloudflare Workers/D1/R2 | Deux Workers de test, une base, quelques Mo privés, quelques dizaines d'opérations R2 | 0 € dans les quotas Free | Non consultée | 30 € |
| 27/09/2026 | Browser Run | 5 sessions, 63,301 s mesurées, échecs compris ; 536,699 s de quota quotidien restantes | 0 € après quota ; brut théorique 0,001582525 USD | Non consultée | 30 € |
| 27/09/2026 | Texte/TTS, Remotion | 0 appel API ; licence gratuite pour 1–3 personnes | 0 € | Aucun achat | 30 € |
| 27/09/2026 | Sprint 01 local | Tests de contrats, D1/workerd local, builds et inspection UI ; aucun appel fournisseur payant | 0 € fournisseur attendu | Aucun achat ; facture non relue | 30 € estimés |
| À venir, non engagé | Workers Paid + Containers | Provision indicative 8 € fixes et 0,50 €/tentative, 3 essais initiaux / 5 max | À recalculer avec change/taxes et facture | Aucun achat | Non engagé |

## Prochaine vérification

Les fondations du sprint 01 sont disponibles en local (`pnpm preview`, port 8787). Attendre l'activation de Workers Paid annoncée par Alex pour le 28/09/2026 avant les essais Containers du sprint 00 : courte vidéo puis 30 s, MP4 récupéré depuis R2 privé, lecture/écoute, concurrence, fin effective, sommeil et consommation facturable, dans les limites déjà préparées. L'audibilité locale est confirmée ; le rendu hébergé reste à démontrer. La future mise à jour du staging avec le sprint 01 nécessitera ses migrations et une nouvelle sonde web distante ; aucun de ces actes n'a été effectué pendant la phase locale.
