# Estimation des crédits dès la saisie d’un lien — 10/10/2026

## Comportement

Sur la home, un lien HTTPS valide déclenche après 800 ms une préparation privée pour l’agence connectée. Les photos utilisables de l’importeur sont comptées, avec ses contrôles de format, doublons, domaines, poids et limite de 12 photos. Une nouvelle annonce propose **toutes ces photos animées par IA** : coût estimé = 1 crédit vidéo + 1 par photo animée + supplément éventuel du présentateur selon la durée. Exemple : 8 photos → 9 crédits sans présentateur. Les animations déjà conservées peuvent réduire le débit final côté serveur ; l’affichage reste une estimation du montage demandé.

Le bouton de génération attend cette estimation. Pendant la lecture, il affiche « Estimation en cours… ». Une erreur conserve le lien et propose une nouvelle tentative ou la saisie manuelle. Un changement de lien ne peut afficher le résultat tardif du précédent. Les réglages de durée/format ne relancent pas l’import. Personnaliser reprend les photos préparées et permet de réduire les animations ; le montant de la fiche suit les choix effectifs.

La préparation réutilise `/api/imports`, la même promesse et la même clé d’idempotence. Personnaliser ou Créer active l’import préparé sans relire la source ni retransférer les photos. Aucun job, appel Runway/TTS/HeyGen ou débit de crédit vidéo ne démarre avant l’action explicite. **L’import automatique utilise cependant une tentative normale d’import et les ressources Cloudflare habituelles**, avec les quotas et budgets existants. Les échecs ne remboursent pas ce compteur.

Les essais sans compte gardent la vidéo classique avec filigrane et la validation humaine. Aucun nouvel endpoint anonyme ne contourne Turnstile ; les animations IA et leur estimation nécessitent une connexion. Le formulaire manuel et les projets existants conservent leurs choix.

## Données et migration

`0064_automatic_import_estimates.sql` ajoute `estimate_only`, initialisé à 0 pour les imports existants. Une préparation automatique reste hors de Mes biens et des récents, avec une conservation d’un jour si elle est abandonnée. L’action explicite la révèle et prolonge sa conservation à 30 jours. L’admission d’une génération la révèle aussi atomiquement. Les médias existants, crédits, jobs et historiques restent intacts. Les contrôles d’agence et d’origine de l’importeur restent appliqués.

Les recettes historiques reçoivent leurs dépendances de schéma actuelles (imports, avatar, étapes et report de crédits) sans appliquer les migrations de quotas ou de budget dont elles vérifient les anciennes limites. Le test de migration des projets prépare désormais ses anciens enregistrements avec les anciennes colonnes et vérifie leur visibilité après migration.

## Vérifications

- Test D1/R2 local : import caché, TTL, promotion sans réseau, compteur inchangé au rejeu, aucun crédit réservé par l’estimation, isolation des agences, admission et purge d’un abandon.
- Navigateur sur composants réels avec fixtures privées : 1536 et 390 px, délai, 8 photos/9 crédits, réutilisation, désactivation d’une animation, réponse obsolète ignorée, sélection transmise à la création, texte libre, erreur/reprise et essai invité conservé. Captures inspectées visuellement.
- Types et build Worker, vérification complète et contrôle HTTP local : résultats consignés dans `docs/SUIVI.md` après exécution.
- Aucun import de portail réel ni génération fournisseur payé pendant la recette. Les tests de générations et de Runway emploient leurs fixtures existantes.

Preuves locales ignorées par Git : `evidence/local/import-estimate-2026-10-10/`.

## Mise en ligne

Migration 0064 appliquée à `bienvu-s00-staging`, avec bookmark D1 préalable. Comptages avant/après identiques ; les 60 imports existants restent à `estimate_only=0`. Worker web `1a33c44e-1f83-4093-8ed8-a11a7ac4f58b` déployé avec `--keep-vars --strict` ; 56 bindings conservés. Le Worker de génération conserve sa version précédente et ses 32 bindings. Home et nouveau bundle accessibles (200), lectures privées et POST d’estimation sans connexion refusés (401). La validation fonctionnelle de l’estimation a été réalisée avec les composants réels et des fixtures locales ; aucun portail réel ni génération payante n’a été appelé.
