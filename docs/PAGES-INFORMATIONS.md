# Conditions et confidentialité — 30 septembre 2026

## Liens publics pour Google OAuth

Dans **Google Auth Platform → Branding → App Domain**, utiliser :

| Champ | URL |
|---|---|
| Application home page | https://bienvu.online/ |
| Privacy policy | https://bienvu.online/confidentialite |
| Terms of service | https://bienvu.online/conditions |

Conserver le domaine autorisé `bienvu.online` et la redirection déjà validée `https://bienvu.online/api/auth/callback/google`. Ces liens ne modifient pas le client OAuth ni ses secrets. Leur saisie dans Google et l'éventuelle vérification de marque restent des opérations de console distinctes ; créer ces pages ne prouve pas une approbation Google.

Les pages sont rendues côté serveur, publiques, en français et indexables. L'accueil remplace les anciens dialogues courts par ces liens. La connexion affiche un lien vers l'explication des données Google ; les pieds de page du studio et des offres les proposent aussi. Sitemap et `llms.txt` les référencent.

## Contenu fondé sur le service actuel

- Google : scopes `openid/email/profile` de Better Auth, identifiant/e-mail/nom/image, compte et agence D1, jetons écartés par les hooks. L'e-mail du compte initialise les coordonnées d'agence : la politique distingue ce réemploi des jetons et de l'identité OAuth.
- Créations : photos privées, narration OpenAI `store:false`, voix Google Cloud Text-to-Speech, médias R2, partage Explorer volontaire. `store:false` ne vaut pas Zero Data Retention chez OpenAI.
- Conservation : sessions 7 jours, brouillons/imports 30 jours, médias généralement 7 jours, essai non récupéré 24 h, preuve anonyme 30 jours, suppression de l'empreinte IP de génération au cron au-delà de 48 h, fréquentation agrégée environ 31 jours. La date vidéo affichée prévaut, notamment après récupération d'un essai.
- Limites réelles : l'expiration des médias ne supprime pas tout l'historique. Les traces d'extraction de texte peuvent conserver une empreinte IP protégée et leur résultat ; aucune purge générale de toutes les métadonnées n'est actuellement appliquée. Ce fait est indiqué, sans promettre une purge qui n'existe pas.
- Offres confirmées : Gratuit 3 vidéos/mois ; Plus 19 € HT/20 ; Pro 49 € HT/60. Paiements toujours fermés, aucune nouvelle condition Stripe ni acceptation de contrat payant ajoutée.
- Fermeture et droits : demandes à `contact@bienvu.online`, traitement humain ; aucune suppression automatique de compte annoncée dans l'interface.

## Informations à compléter

Alex a demandé d'utiliser **BienVu** et **contact@bienvu.online** et a indiqué qu'aucune entreprise n'était constituée. Aucun nom de société, SIRET, adresse professionnelle ou identité légale n'a donc été inventé. Le nom du projet et le contact sont publiés ; l'identité exacte de l'éditeur/responsable et les coordonnées légales restent à compléter. Ces pages ne valent pas validation juridique complète ni clôture du sprint de lancement commercial.

Avant ouverture des paiements : compléter l'éditeur, les conditions de vente et de résiliation, les informations de facturation applicables et les garanties contractuelles de traitement/transfert avec les prestataires. Définir une conservation bornée et une purge effective des traces encore conservées, et une procédure documentée de fermeture/effacement. Vérifier que la boîte `contact@bienvu.online` est effectivement reçue et suivie : aucun e-mail ne lui a été envoyé pour cette livraison.

## Sources officielles consultées

- [Google — configuration de marque OAuth](https://support.google.com/cloud/answer/15549049?hl=en-uk) : liens publics sur le domaine, mêmes URL dans le produit et l'écran de consentement.
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
- [CNIL — information des personnes](https://www.cnil.fr/fr/informer-les-personnes) et [droits](https://www.cnil.fr/fr/mes-demarches/les-droits-pour-maitriser-vos-donnees-personnelles).
- [OpenAI — données API](https://developers.openai.com/api/docs/guides/your-data).
- [Google Cloud — journalisation Text-to-Speech](https://docs.cloud.google.com/text-to-speech/docs/data-logging?hl=en).
- [Cloudflare — confidentialité](https://www.cloudflare.com/privacypolicy/).

Le code de BienVu reste la référence pour les pratiques propres au service. Les politiques fournisseur ne prouvent pas à elles seules qu'un accord spécifique, une localisation UE exclusive ou une purge applicative sont en place.
