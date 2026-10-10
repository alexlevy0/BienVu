# Comparaison du rendu Cloudflare sur 1 et 2 vCPU — 10 octobre 2026

## Résultat

Huit rendus MP4 réels, avec l’image de production épinglée et des médias existants, montrent un rendu **39 % plus rapide sans avatar** et **44 % plus rapide avec avatar** en passant de `standard-2` à `standard-3`, avec `concurrency: 2`. Le coût de calcul estimé du moteur baisse respectivement de **5,5 % et 7,6 %** avant quotas inclus. Ce sont des mesures sur deux cas représentatifs, pas une garantie pour toutes les vidéos.

Pendant cette recette, la production est restée sur **1 vCPU / 6 GiB**, avec le même Worker, la même image et les mêmes originaux. Aucun changement fonctionnel, commit ou push pendant le benchmark. Après approbation d’Alex, le passage à deux cœurs est livré séparément : [déploiement et contrôles](RENDER-PARALLELE-10-10.md).

## Méthode et périmètre

- Deux manifestes privés de **20 s / 600 frames**, **1080 × 1920 / 30 fps**, chacun avec douze photos et une carte satellite déjà préparée. Premier cas : essai anonyme, incluant la dérivée filigranée. Second cas : avatar HeyGen en médaillon présent pendant toute la vidéo, sans dérivée anonyme.
- Réutilisation des photos, tuiles, voix et clip HeyGen : **aucun appel OpenAI, Cartesia, Runway ou HeyGen**, aucun import, nouveau job client ou débit de crédit.
- Même image que la production : `bienvu-renderer@sha256:35b63227e85b6feae39c3c50daee6c2b44a4441455b9310cba9eb9dc7253bd3a`. Remotion **4.0.529**, H.264 au preset `medium`, CRF 21, AAC 192 kbit/s. Seuls la capacité CPU/RAM et le nombre d’images traitées simultanément varient.
- Worker opérateur temporaire authentifié, deux classes Containers distinctes, une seule instance de chacune, essais exécutés en série. Sorties réseau des conteneurs désactivées ; accès R2 limité au transfert des assets attendus, sans écriture R2 et sans binding D1. Le code instrumenté est une copie dans le disque temporaire ; l’image et le code de l’application restent intacts.
- Le temps du moteur comprend validation des médias, Remotion, remux, contrôle MP4/audio et, pour l’essai, aperçu filigrané. Il exclut le démarrage/transfert et le stockage R2 final. Le banc mesure séparément sa préparation et sa récupération des fichiers ; son orchestration n’est pas celle du Workflow client.
- Deux passages pour les configurations principales sans avatar ; un passage pour chaque configuration avec avatar et pour les contrôles à deux cœurs sans parallélisme supplémentaire. Les instances observées sont à **Dublin (`dub02`)**.

## Mesures du moteur

| Cas | CPU / parallélisme | Rendu + vérification | CPU actif mesuré | Calcul estimé en USD |
|---|---|---:|---:|---:|
| Classique, passage A | 1 / 1 | 162,74 s | 162,05 vCPU-s | 0,005819 |
| Classique, passage B | 1 / 1 | 148,06 s | 144,91 vCPU-s | 0,005243 |
| Classique, passage A | 2 / 2 | 92,94 s | 156,88 vCPU-s | 0,005101 |
| Classique, passage B | 2 / 2 | 97,05 s | 165,43 vCPU-s | 0,005358 |
| Classique, contrôle | 2 / 1 | 95,89 s | 148,12 vCPU-s | 0,004988 |
| Avatar continu | 1 / 1 | 186,04 s | 183,38 vCPU-s | 0,006615 |
| Avatar continu | 2 / 2 | 104,33 s | 195,42 vCPU-s | 0,006112 |
| Avatar continu, contrôle | 2 / 1 | 120,81 s | 187,65 vCPU-s | 0,006305 |

Moyennes classiques : **155,40 → 94,99 s**, soit **−38,9 %** et **0,005531 → 0,005229 USD** (**−5,5 %**). Avatar : **186,04 → 104,33 s**, soit **−43,9 %** et **−7,6 %** de calcul estimé. Le contrôle confirme que deux cœurs accélèrent déjà le code actuel ; le parallélisme de deux images apporte davantage sur l’avatar (**120,81 → 104,33 s**) que sur les photos seules.

Les coûts sont calculés avec le CPU actif Linux relevé dans `/proc/stat` (compteur global de la VM), la durée, la RAM et le disque provisionnés. Tarifs : **0,000020 USD/vCPU-s**, **0,0000025 USD/GiB-s**, **0,00000007 USD/GB-s** ; configurations **1/6/12** et **2/8/16**. Ce compteur CPU est une approximation de l’usage Cloudflare, pas une facture. [Tarifs Containers](https://developers.cloudflare.com/containers/platform/pricing/).

En incluant démarrage, transferts et récupération du fichier dans le banc, la baisse estimée est plus petite : **4,4 %** pour le classique, **5,3 %** pour l’avatar. Workers/DO, opérations R2, réseau, taxes et conversion monétaire ne sont pas compris. Les quotas mensuels du compte peuvent absorber le calcul ; ils sont partagés avec les autres conteneurs.

Les huit essais terminés représentent **0,0483 USD estimés**, ou **0,0532 USD** en supposant les CPU occupés à 100 % pendant toute leur session. Trois essais incomplets de préparation du banc sont exclus des comparaisons ; une provision conservatrice supplémentaire de **0,015 USD** couvre ces démarrages et l’interruption du premier essai avatar. L’ensemble reste **sous 0,10 USD de calcul estimé**, bien en dessous de l’enveloppe de 1 USD annoncée. Le problème de démarrage et la reprise d’une ancienne alarme de test ont été corrigés uniquement dans le banc temporaire.

## Qualité, protection et nettoyage

**8/8 fichiers validés** : H.264/AAC, 1080 × 1920, 600 frames à 30 fps, durée 20,053 s, SHA-256 vérifié au téléchargement, contrôles du moteur et aperçu filigrané. Les masters à un cœur reproduisent les originaux de production octet pour octet. Les deux réglages de parallélisme sur deux cœurs produisent aussi le même MP4 pour un même cas.

Comparaison complète des images par SSIM : **0,993602** sans avatar, **0,991995** avec avatar ; différences liées au MP4 encodé sur deux cœurs, sans changement des réglages de qualité. Pistes audio décodées identiques par SHA-256 dans chaque cas. Comparaisons visuelles inspectées à 5/17 s et 5/15 s : cadrage, avatar, détails du bien et transitions conservés.

Le Worker de test **`bienvu-render-benchmark-20261010`** et ses **deux applications Containers** sont supprimés ; absence vérifiée via API. L’image partagée est conservée. La configuration et les empreintes des deux originaux sont vérifiées intactes. Les conteneurs étaient arrêtés avant suppression. Docker local, démarré pour les comparaisons FFmpeg, est arrêté après les contrôles.

Preuves privées ignorées : `evidence/local/render-benchmark/` — manifestes, scripts, rapports, chronométrages, consommation CPU, MP4, SSIM, comparaisons visuelles, vérifications et nettoyage. Aucun média privé ni jeton n’est versionné.

## Recommandation

Tester une adoption de **2 vCPU avec parallélisme 2** sur les nouveaux rendus, en conservant résolution, fps et CRF, avec suivi de durée et coût. Le bénéfice principal est environ une minute d’attente gagnée dans ces cas ; l’économie de calcul reste modeste. Les vidéos plus longues, les clips Runway, les cartes 3D et les avatars transparents devront être mesurés si le réglage est généralisé. Cette recette n’applique pas ce changement à la production.
