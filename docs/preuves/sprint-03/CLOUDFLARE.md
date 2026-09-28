# Sprint 03 — imports hébergés sur Cloudflare

Recette du 28 septembre 2026 sur **https://bienvu.online**, Worker de développement existant. Les imports URL/manuels sont branchés au service privé `bienvu-import-staging`, Container `basic`, D1/R2 existants. Aucun service externe d'hébergement, IA/TTS ou rendu vidéo déclenché. [Décision et limites](../../adr/0003-transport-import-cloudflare.md).

## Résultats réels d'agences

Chaque URL a été tentée une fois ; un rejeu identique retrouve le dossier sans recontacter la source. Images réencodées, stockées dans R2 privé, relues, décodées puis comparées par SHA-256. Aucune photo étrangère visible sur les trois premières de chaque galerie inspectées ; les filigranes des agences sont conservés.

| Source et bien | Résultat | Latence HTTP | Corps source | Photos stockées | Description |
|---|---|---:|---:|---:|---:|
| [Espaces Atypiques, Lyon, réf. 14713](https://www.espaces-atypiques.com/ventes/69007-lyon-ancien-renove-au-coeur-du-7eme-14713/) | Vente, 470 000 €, Lyon, 4 pièces | 11 971 ms | 4 890 717 octets | 12 / 4 497 150 octets | 2 141 caractères |
| [Orpi, Paris 12, réf. ddbf1828](https://www.orpi.com/annonce-vente-appartement-t2-paris-12-75012-ddbf1828-1eb9-4ebe-885c-85f7e30057f1/) | Vente, 379 000 €, 42,06 m², 2 pièces | 14 125 ms | 2 794 181 octets | 11 / 2 744 429 octets | 1 456 caractères |
| [Century 21, Lyon, réf. 16965965448](https://www.century21.fr/trouver_logement/detail/16965965448/) | Vente, 190 000 €, 61 m², 3 pièces | 4 746 ms | 514 281 octets | 7 / 244 461 octets | 1 251 caractères |

Ces trois pages sont extraites statiquement, sans Browser Run. Les descriptions sont sauvegardées dans `listings.description_json`, relues par l'API et affichées comme texte avec paragraphes. Espaces Atypiques conserve une **surface structurée absente** et un avertissement : le parseur ne confond pas surface Carrez/au sol/pondérée ; les 124 m² du texte source ne deviennent pas automatiquement un fait vérifié. Ce résultat est volontairement prudent.

## Infrastructure réelle avec fixtures explicites

- **Page JavaScript contrôlée :** le HTML initial ne contient pas de JSON-LD ; celui-ci est créé par le JavaScript. Le parcours produit active réellement Browser Run, extrait l'annonce synthétique, stocke trois photos et la description ; 6 742 ms HTTP. Le registre compte aussi le rechargement du HTML par le navigateur, distinct des quatre ressources nominales du parseur.
- **Saisie manuelle :** location synthétique à 950 €/mois charges comprises, 42,5 m², deux pièces, deux paragraphes, trois images de couleurs. 8 717 ms pour création/upload/finalisation/relecture/isolation. Faits `user_provided`, pas de source web inventée ; upload étranger et contenu modifié refusés, même slot repris, finalisation étrangère refusée. Consultation visible dans le navigateur.
- **Réseau :** appels depuis le vrai Container vers IPv4/IPv6 privées, domaine résolvant réellement vers loopback et redirection publique vers IP privée : `UNSAFE_URL`, ressource cible non récupérée. Une vraie page Browser Run tente un `fetch` privé : rejet avant le transport ; un seul chargement autorisé est observé. DNS rebinding/mixte, redirections d'images, plafonds et flux interrompus sont aussi couverts par les tests à ports réseau injectés ; ne pas les présenter comme une attaque DNS réelle montée chez un fournisseur.
- **Cycles Browser Run :** quatre navigateurs réellement ouverts/fermés par le helper produit, avec succès, exception injectée, signal d'expiration injecté après ouverture et livraison tardive de l'instance. Aucun travail commencé après livraison tardive. Ces tests ne prétendent pas avoir attendu une panne naturelle de 60 secondes. Historique fournisseur : **six nouvelles sessions**, toutes `NormalClosure`, aucune active (quatre cycles, réseau hostile, annonce JS).
- **Local Docker amd64 :** vrai décodage PNG→JPEG, retrait des métadonnées, fichier invalide et image 25 mégapixels refusés, authentification et DNS privé testés. Premier démarrage trop lent sous émulation puis arrêt du moteur Docker ; reprise avec lancement Node direct, succès et suppression du seul conteneur créé pour la recette.

## Isolation, stockage et purge

Session, CSRF, URL privée et authentification du service vérifiés réellement. Pour chacun des cinq résultats, consultation/photo anonyme ou d'une autre agence refusée ; sauvegarde/relecture D1 et R2 privé cohérentes. Aucun droit d'essai, crédit vidéo, appel IA ou génération créé par les imports.

Le cron `*/10 * * * *` est déployé. La recette de purge prépare un dossier manuel synthétique antidaté d'un jour (aucun téléchargement source ni normalisation), une photo et un job D1 synthétique protégeant un autre dossier. L'antidatage teste l'abandon ; il est visible dans le rapport et ajoute une tentative technique au jour précédent, **sans effacer aucun compteur**. Upload expiré 404 puis bail expiré 409, avant appel du transport. La vérification du passage planifié et le nettoyage final sont consignés à la fin du rapport.

## Mesures, budget et arrêt

Alex confirme aucune dépense supplémentaire depuis Workers Paid 5 € et domaine 4,99 USD. Base prudente : 8 € fixes + 2,50 € d'anciens rendus + 6 € domaine = 16,50 €. Nouvelle campagne plafonnée à **3,50 € de réservations**, sept lignes D1 de 0,50 € : cinq imports et deux groupes opérateur. Total prudent **20 €**, **10 € de marge sur 30 €** ; facture/TTC réels non rapprochés. Les provisions ne sont pas des dépenses effectivement facturées et les allocations partagées ne sont pas déduites plusieurs fois.

Le sixième import est refusé 429 : cinq tentatives du jour et 350 centimes réservés inchangés. Le plafond de recette est partagé par toutes les agences ; la purge n'en autorise pas une sixième. Le renderer reste arrêté et en pause avec ses cinq anciennes tentatives ; son instantané historique à 10,50 € n'inclut pas le domaine ni cette campagne.

Le conteneur d'import est observé arrêté après inactivité ; dernier cycle 83,294 s, estimation brute haute CPU/RAM/disque de ce **dernier cycle seulement** : 0,000648 USD, hors démarrage avant hook, transfert et autres services. Cette mesure ne prétend ni totaliser toute la campagne ni remplacer la facture. Les six sessions de navigateur sont fermées. Les fixtures publiques/opérateur payantes sont désactivées après la recette, les imports produit conservent les gardes budgétaires.

## Validation et versions

**103 tests locaux réussis**, types packages et tests, frontières, build OpenNext, vrai conteneur Docker. Une fixture de configuration a été adaptée au nouveau fichier Wrangler ; un test concurrent a échoué pendant la forte charge de construction amd64, puis passé isolément et dans la suite complète. Un import de type dans un nouveau test a été corrigé, sans changement du produit.

Migration distante `0009_hosted_import_budget.sql` appliquée sans réinitialisation. Web : `c1f1dab4-9b64-41e4-bdc3-af726f932f77`. Premier service d'import : `7ce41c67-0d70-4da9-b897-e5037226fc3f`, application Containers `a03e9474-90b1-4ec0-be95-95534f08dcd5`. Version finale `00556d2b-46f3-499b-a05c-7faa30e40301` : routes de fixtures désactivées sans reconstruire ni réveiller le conteneur.

Preuves brutes ignorées : `evidence/remote/imports-cloudflare/` (rapports `import-*.json`, `manual.json`, `operator-*.json`, registre de coûts, historique des sessions, états des conteneurs, migrations/build/tests et captures). Les images et descriptions complètes des agences ne sont pas versionnées. Pas de commit/push automatique pendant cette tranche ; la CI de ces modifications sera à observer au prochain push.

Les locations réelles, d'autres agences et les portails ne sont pas couverts par cet échantillon. Le sprint 04 traite les portails ; les sprints 05–09 restent nécessaires avant une offre payante publique.

## Clôture : cron et nettoyage

Le **28/09 à 13:30 UTC**, l'événement Cloudflare planifié se termine `ok` : deux candidats examinés, un dossier abandonné supprimé. La lecture D1 confirme sa disparition et le maintien du dossier `ready` protégé par le job synthétique ; sa photo R2 reste téléchargeable, celle de l'abandon ne l'est plus. Une purge opérateur répétée retire zéro dossier. Le rapport `purge.json` conserve aussi les refus d'écriture tardive et les compteurs inchangés ; `cron-events.json` contient l'événement planifié réel.

Après ce contrôle, retrait du job/allocation/réservation synthétiques, puis purge des **cinq dossiers produit de recette** et de leurs photos. Les identités, sessions et logos synthétiques sont supprimés séparément ; les données d'Alex sont conservées. Les trois images publiques de la page JS de recette sont retirées et ses routes restent désactivées. Les rapports et marqueurs empêchant un rejeu automatique des sondes payantes sont conservés hors Git.

État opérationnel : imports activés sous plafond mensuel de **25 €**, provision de base 16,50 € et réservations 3,50 €, soit alerte à 20 €. Cinq tentatives produit consommées le 28/09 UTC, plus une seule tentative synthétique antidatée au 27/09 pour le cron ; rien n'est remis à zéro. Les essais utilisateur pourront reprendre le **29/09 à 02:00, heure de Paris**, selon la disponibilité du budget. Le renderer reste en pause.
