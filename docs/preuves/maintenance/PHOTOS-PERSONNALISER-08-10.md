# Affichage des photos dans Personnaliser — 08/10/2026

## Diagnostic

La galerie, les exemples de style et l’affiche utilisaient les JPEG originaux privés. Leur réponse `private, no-store` imposait leur téléchargement complet à chaque réouverture. Le formulaire masqué rendait également ces images sans chargement différé. La hauteur du cadre photo pouvait dépendre du rapport original et des boutons de la carte, avec une grande zone vide pendant le décodage.

Le lien iad fourni est mesuré sur les huit JPEG déjà importés, sans nouvel import extérieur : **2 013 150 octets** d’originaux, contre **147 768 octets** pour les huit aperçus WebP, soit **93 % de données en moins**. Les dimensions originales atteignent 1 846 pixels sur leur grand côté. La conversion locale prend 28 à 59 ms par photo ; ces durées ne mesurent pas le délai réseau du parcours complet.

## Changement

- Aperçus WebP de 640 pixels maximum sur le grand côté, qualité 65, sans agrandissement. Les originaux et leurs références pour la génération restent inchangés.
- Route privée `/api/imports/:id/photos/:photoId/preview` : session, agence, état du brouillon, clé R2, taille et empreinte sont contrôlés avant un 200 ou un 304. `private, no-cache`, ETag versionné et `Vary: Cookie` permettent une réutilisation avec validation ; les erreurs restent `private, no-store`.
- Conversion dans le conteneur Node/Sharp existant : deux traitements simultanés maximum, file de douze requêtes, corps et délais bornés. Aucun nouvel objet R2, aucune nouvelle source extérieure ni service Images. La lecture d’aperçu ne réserve pas de nouvel import et ne modifie pas son compteur de ressources.
- Les trois premières images sont prioritaires ; les suivantes et les photos du formulaire masqué utilisent le chargement différé. Les URL blob et les médias de démonstration gardent leur comportement. En cas d’échec d’aperçu, un seul repli vers l’original est possible.
- Cadres photo à rapport stable, remplis avec `object-fit: cover`, quel que soit le format de l’original. La copie d’un import vers un brouillon traite deux photos indépendantes à la fois et attend chaque lot, y compris lors d’une erreur.

## Vérifications locales

La recette utilise les vrais composants React et les huit médias fournis, avec des API locales fermées : **1 536, 390 et 320 pixels**, aucun débordement, cadres identiques, images décodées, zéro requête d’original pour la galerie ou le formulaire masqué. Sélection, ordre, animation et style restent utilisables. Un échec volontaire d’aperçu déclenche une seule requête d’original. Le navigateur valide aussi les aperçus à la réouverture complète de la page : réponses HTTP 304 observées dans la recette Chromium locale, distinctes de la réutilisation en mémoire au sein d’une même navigation.

Les tests D1/R2 réels sous Miniflare vérifient le 200 WebP, le 304 après contrôle d’accès, le refus de l’agence voisine et d’un import supprimé, les originaux inchangés et l’absence d’objet dérivé. Les tests existants de stockage, upload, copie et personnalisation restent requis.

Les captures, JPEG, WebP et réponses détaillées sont conservés dans `evidence/local/photo-previews-2026-10-08` et `evidence/remote/photo-previews-2026-10-08`, ignorés par Git et à accès privé.

La première recette hébergée a détecté des réponses 500 lors de la transmission directe du flux R2, alors que le convertisseur appelé directement répondait 200 WebP. Le transport utilise maintenant un corps de bytes borné à 10 Mio, comme la normalisation des uploads existante. La première fixture a été retirée puis purgée normalement ; sa provision est conservée. **481 tests** passent avant cette adaptation, puis **16 tests ciblés** de previews, copie, uploads et stockage sont revérifiés après elle, ainsi que le typage complet et les frontières **432 fichiers**.

## Vérification Cloudflare

La recette finale utilise un compte technique déjà existant, sans accès ni identifiant client modifié. Huit JPEG sont envoyés au brouillon privé par les routes produit. Les originaux contrôlés pèsent **2 015 963 octets**, les aperçus **147 842 octets**, **93 % de données en moins**. Chaque aperçu répond 200 WebP, sa validation ETag 304 sans corps, et le visiteur sans session 401. Un nouveau contrôle avec l’ETag après retrait du brouillon répond 404, avec `no-store` ; Next ajoute également ses directives de non-stockage sur ce 404. Les huit originaux relus restent identiques, aucun objet dérivé n’est créé et les provisions de l’import ne changent pas pendant la lecture des aperçus. Le protocole complet de lecture, validations et contre-vérification dure 8 154 ms ; ce n’est pas un délai d’affichage de l’interface.

Web final **`2dccf7f9-a9fb-449b-9ace-721dd738bab9`**, import **`73b62fe3-3f68-44b4-adbc-f290483190ec`**, à 100 %. Génération **`edb83aef-a61d-4148-ab1f-74a7a82e435f`** et renderer inchangés. Bindings, variables dashboard, noms de secrets et configuration runtime conservés. Accueil/Sources 200, API visiteur 401, chunk client contrôlé par son empreinte exacte. Le conteneur utilise `bienvu-photo-previews@sha256:b2858f3fca6582152d6e43713fac707c6483dbe45ff8f638cfd2052760bf9964`, Linux/amd64, le même conteneur basic et les mêmes limites. Aucun nouvel import URL, rendu, appel TTS ou animation n’est lancé.

Nettoyage terminé à **2026-10-08T18:19:46.524Z** : zéro import, objet, génération, session ou credential techniques ; accès révoqué et fichier d’identité supprimé. Deux fixtures manuelles au total ont réservé **1 €**, sans nouvel import URL ; aucune provision ni aucun compteur remis à zéro. Provisions finales **87,35 €/90 €**, plafond d’enveloppe 100 €, usage jour **18/20** et mois **72/300**, limites conservées. Zéro défaut de clé étrangère, verrou navigateur libéré. Les JPEG fournis et médias client ne sont pas supprimés. Aucun commit/push.

## Limites

Le premier affichage dépend encore de la vitesse d’import, de la préparation du brouillon, de R2 et du démarrage éventuel du conteneur. Une baisse de 93 % du poids des aperçus ne promet pas une baisse identique du délai total. Le repli peut exceptionnellement charger l’original si le service d’aperçu est indisponible. Les essais locaux ne constituent pas une mesure Lighthouse ou de Core Web Vitals en production.
