# Pages publiques de conditions et confidentialité — 30 septembre 2026

## Résultat publié

- [Conditions d'utilisation](https://bienvu.online/conditions).
- [Politique de confidentialité](https://bienvu.online/confidentialite).
- Documents français rendus côté serveur, sans connexion, logo actuel, palette crème/sauge, sommaire, navigation entre documents et contact. Huit sections par document ; mise en page sur ordinateur et mobile.
- Liens de l'accueil remplacés par de vraies pages. Liens ajoutés à la connexion, au studio et aux offres ; explication courte des données Google sous son bouton. Sitemap et `llms.txt` mis à jour.

L'état précédent du dépôt a d'abord été commité et poussé sur `main` : **e5f7ee6**, `feat: add super admin insights and photo drop workflow`.

## Recette locale

- Types web, frontières sur **183 fichiers**, build Next/OpenNext final et déploiement Wrangler à blanc réussis. Le diff ne contient ni migration, ni activation de paiement, ni changement de quota.
- Worker local workerd, données D1 locales, génération/e-mails/importéurs distants désactivés : aucun transport de fournisseur testé ni appelé. Chromium de recette à **1536×1024 et 390×844** : quatre vues de documents contrôlées, sommaires ciblant les huit sections, canoniques exactes, français, métadonnées indexables, absence de débordement. Captures des titres et du tableau de conservation inspectées.
- Connexion anonyme locale contrôlée aux deux tailles : liens publics disponibles dans le pied de page ; l'information Google et son lien restent lisibles. L'inspection a permis de corriger le style hérité qui affichait le lien sur un bloc séparé ; capture et styles `inline`, `12px` contrôlés après correction.
- JavaScript désactivé dans le navigateur : les deux documents restent complets, avec huit sections chacun. Les deux liens sont présents dans le sitemap local.
- Pas de nouvelle suite unitaire pour cette modification de contenu et de présentation ; les contrôles ont porté sur l'accès public, le HTML réellement servi et le rendu. Les tentatives de sonde préliminaires ont révélé des incompatibilités de l'API du navigateur de recette, corrigées dans la sonde ignorée ; le résultat déclaré est celui de la dernière exécution réussie.
- Le serveur local de cette recette a été arrêté. Captures, logs, scripts de recette temporaires et instantanés privés restent sous `evidence/local/legal`, ignorés par Git.

## Vérification Cloudflare réelle

Worker **bienvu-web-probe-staging**, domaine **bienvu.online**, version **ce6c0e10-01f8-48c4-acda-b5d79957679e**, active à **100 %**. Déploiement avec `--keep-vars --strict` sur les ressources existantes.

- `/conditions` et `/confidentialite` : **HTTP 200 sans cookie**, français, titre et huit sections directement dans le HTML, canonical sur le bon domaine, absence de `noindex/nofollow`. Feuilles CSS publiées accessibles en 200 et contenant les styles des documents.
- `/`, `/connexion`, `/abonnement`, `/sitemap.xml`, `/llms.txt` : **200**, chacun contient les deux liens attendus.
- API d'administration sans session : **401**.
- Comparaison avant/après des bindings, variables, secrets, date et flags de compatibilité, modèle d'usage : identiques. Turnstile, vérification e-mail, génération, administration et fréquentation conservent leurs réglages précédents ; cron existant conservé.
- **5 jobs, 2 comptes, 0 abonnement** avant/après. Registre budgétaire D1 inchangé : base **30,80 €**, engagement **44,80 €**, coupure **45 €**, pause désactivée. Ce registre n'est pas une facture ni un rapprochement de toutes les lignes historiques ; aucune nouvelle provision ajoutée pour cette maintenance.
- Aucun envoi e-mail, appel OpenAI/voix, import ou rendu vidéo nouveau. La requête de contrôle de l'accueil peut incrémenter son compteur de fréquentation existant.

La connexion à l'extension Chrome n'a pas permis une nouvelle inspection interactive distante. La recette visuelle est locale et la preuve distante est HTTP/Cloudflare : aucune lecture mobile physique, nouvelle connexion OAuth ou approbation Google n'est revendiquée.

## Informations et contrôles restant à compléter

Alex demande de publier **BienVu** et **contact@bienvu.online**, aucune entreprise n'étant constituée. Aucune identité légale, adresse ou immatriculation fictive ajoutée. L'identité exacte de l'éditeur/responsable et les coordonnées légales restent à fournir ; ces pages ne constituent pas une validation juridique complète.

Saisir les URL dans Google Auth Platform → Branding et suivre l'éventuelle procédure de vérification Google. La réception et le suivi de `contact@bienvu.online` n'ont pas été testés. Les règles de conservation encore non bornées et la suppression humaine de compte sont exposées, sans inventer de purge automatique. Conditions de vente, accords de traitement/transfert et obligations commerciales à finaliser avant paiements. [Guide](../../PAGES-INFORMATIONS.md).
