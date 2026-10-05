# Import l’Adresse et diagnostic des URL refusées — 05/10/2026

Annonce examinée : https://www.ladresse.com/annonce/achat/maison/begles-33130/14649049.

## Cause identifiée

Le HTML public contient le titre, la référence 14649049, le prix honoraires inclus de 399 000 €, la surface habitable de 88 m², les 4 pièces, la description et la galerie. Il ne contient qu’un fil d’Ariane JSON-LD : l’extracteur générique ne reconnaissait donc pas la fiche et déclenchait le navigateur.

La trace locale, avec les mêmes contrôles de domaine et un transport à IP épinglée, refuse d’abord les images sur `admin.exceladresse.com`. Les scripts de suivi sur d’autres domaines sont également refusés. L’ancien rapport Cloudflare `UNSAFE_URL` ne conservait pas l’adresse de la sous-requête : la trace explique le problème de compatibilité sans prétendre retrouver rétroactivement cette adresse dans ce rapport.

Un deuxième problème écartait les photos : le filtre des diagnostics énergétiques recherchait `ges/` sans début de segment et reconnaissait à tort la fin du dossier `images/`.

## Correction

- Adaptateur HTML dédié aux fiches de vente maison/appartement l’Adresse ; aucun script exécuté lorsque les informations sont présentes.
- Référence de l’en-tête identique à celle du lien, prix limité au bloc de prix de cette fiche, surface et pièces lus dans son titre.
- Galerie limitée à `#annonce-photos`. Chaque photo doit appartenir à `admin.exceladresse.com`, contenir la référence de la fiche dans son nom et dans ses dossiers numériques. Les annonces voisines, honoraires hors prix total et taxes ne sont pas repris.
- CDN explicite réservé à cette source. Aucun ajout de domaine de suivi ; les contrôles HTTPS, DNS publics, IP épinglées, redirections et plafonds restent actifs.
- Filtre `GES` limité à un nom de segment/fichier, sans rejet du dossier `images`.

## Diagnostic privé

Les nouveaux échecs conservent l’étape et, lorsqu’une destination est refusée, son domaine, son chemin, son type et la catégorie du refus. Le navigateur conserve la première ressource refusée ; les services transmettent ce diagnostic par un en-tête interne borné.

Le superadmin affiche ces informations dans « Imports & brouillons ». Les paramètres de requête, fragments et identifiants de connexion sont supprimés. Ni le payload brut du fournisseur ni le diagnostic privé ne sont ajoutés à la réponse publique de l’import. Les anciens imports sans précision affichent cette absence au lieu de déduire une adresse.

Un refus provenant du transport sans détail sur le DNS ou la redirection reste présenté comme tel : le domaine indiqué est celui de la ressource demandée, pas une destination de redirection supposée.

## Vérifications locales

97 tests ciblés réussis : référence et galerie, prix/surface, brouillons partiels, SSRF/DNS/redirections, limites, stockage, services d’import, accès superadmin et absence de diagnostic dans l’import public. Les régressions de génération et de médias d’accueil passent également.

La première exécution générale en parallèle avec la compilation a rencontré des interruptions de workerd ; elle a été arrêtée. Les cas concernés sont inclus dans la vérification ciblée exécutée ensuite seule et réussie.

333 fichiers vérifiés par le contrôle des frontières entre Workers, contrats et rendu. Compilation Next/OpenNext réussie ; dry runs web, import et génération réussis avec les images de conteneur existantes.

## Vérification du service déployé

Le premier contrôle juste après publication a encore renvoyé l’ancien comportement, sans le nouveau diagnostic. Le contenu du Worker publié et sa version effectivement exécutée ont été contrôlés avant le second essai. Aucun quota ni plafond n’a été augmenté pour ces deux appels.

Le second essai réel via `POST /api/imports` termine en `ready`, sans erreur, en 12,076 secondes : 11 photos distinctes, 399 000 €, 88 m² et 4 pièces. Diagnostic : 12 ressources, 3 735 783 octets source, 3 769 880 octets stockés, aucun rejet, aucun doublon, aucun navigateur.

Les 11 médias ont été relus par leur API privée : JPEG décodables, dimensions conformes, SHA-256 identiques aux métadonnées, métadonnées EXIF absentes. La lecture du résultat sans session renvoie 401. Aucun appel de génération, de voix ou d’animation n’a été effectué.

Le catalogue public conserve le dernier résultat vérifié de cette URL, avec la mention de la correction. L’échec antérieur reste documenté dans [SOURCES-05-10](SOURCES-05-10.md) et ses rapports de preuve ; il n’est pas présenté comme une limitation encore active du nouvel adaptateur.

La comparaison avant/après des empreintes confirme les bindings, variables et secrets inchangés sur les trois Workers. Versions import `35412e9b-d5a6-4acf-ad3c-b8f7402099ea`, génération `60868989-83f8-42a9-97a2-ad70e18cb724`, premier déploiement web `ec7a1e84-3957-4196-b7f0-14b5f5da3079`. Les conteneurs, crons, base D1 et bucket R2 existants sont conservés.

Le catalogue corrigé est publié dans le Worker web à 100 %, version `ca77ee0c-68ff-4e76-83da-ef88c18fcca2`. La compilation Next/OpenNext finale réussit. Les empreintes des bindings, variables et secrets des trois Workers restent identiques après cette publication.

Vérification dans un navigateur réel sur `https://bienvu.online/sources` à 14:46 UTC, en 1440 et 390 px : 19 sources, quatre réseaux avec au moins un import complet démontré, quinze autres sources, recherche et filtres, détails des annonces testées, état vide et focus clavier. Aucun débordement horizontal ni requête d’écriture. Les captures ont été inspectées ; l’Adresse affiche « Import complet testé » et les 11 photos vérifiées. Les quatre tests du catalogue réussissent également après son actualisation.

À 14:47 UTC, après le délai normal de protection des imports, les données de la fixture sont supprimées par l’API du produit. La base confirme zéro import, zéro photo et zéro génération pour cette fixture. Ses credentials et sessions sont révoqués, le fichier d’identité supprimé. Le propriétaire technique préexistant est conservé conformément aux invariants d’agence ; aucun client n’est modifié.

Les deux appels de recette restent comptabilisés : 19 tentatives quotidiennes sur 20 et 41 mensuelles sur 60. Le total provisionné atteint 63,25 € (37,25 € de base et 26,00 € réservés), sous le plafond existant de 90,00 € dans l’enveloppe de 100,00 €. Ce sont des provisions, pas des factures rapprochées. Le nettoyage ne rembourse ni provisions ni compteurs. Aucun plafond n’est modifié, aucun crédit vidéo consommé.

Les preuves privées restent hors Git dans `evidence/local/ladresse-20261005/`. Les modifications restent non committées : aucun commit ni push demandé pour cette correction.
