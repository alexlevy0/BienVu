# Administration de BienVu

L’espace [Super admin](https://bienvu.online/admin) apparaît dans le menu du compte, après « Mon abonnement ». Il reprend la présentation du studio et s’adapte au mobile.

## Accès

`SUPER_ADMIN_EMAIL` est une variable **serveur** du Worker web, contenant une seule adresse exacte. Une valeur vide ou invalide ferme l’accès. La session Better Auth doit être valide et son adresse doit être vérifiée ; aucune valeur du navigateur ne peut accorder le rôle. Le propriétaire a confirmé `alexlevy0@gmail.com` le 30/09/2026. Aucun compte supplémentaire n’est promu.

En local, définir cette variable dans `apps/web/.dev.vars`. Pour générer une configuration distante avec `scripts/prepare-staging.mjs`, fournir `BIENVU_SUPER_ADMIN_EMAIL` en plus des variables existantes. La configuration distante existante doit conserver ses autres bindings, secrets, variables et son domaine. Déployer avec `--keep-vars --strict` ; une modification de cette adresse reste une opération d’administration Cloudflare. Aucun secret Cloudflare opérateur n’est embarqué dans le panneau.

La page vérifie le rôle côté serveur : redirection vers la connexion si aucune session vérifiée, 404 pour un compte ordinaire. Les API JSON et les routes MP4 effectuent chacune le même contrôle (401/403), sans cache partagé. `/admin` n’est pas indexé ni inclus dans le sitemap/llms.txt ; `robots.txt` l’exclut. Les contrôles d’accès des autres agences et de l’essai anonyme sont conservés.

## Rubriques

- **Vue d’ensemble** : agences client (espaces anonymes/internes exclus), comptes vérifiés, jobs prêts/en cours/échoués, abonnements actifs, signalements ouverts, activité UTC sur 14 jours et budget du pilote.
- **Points d’attention** : sur la vue d’ensemble, budget utilisé à plus de 80 % (critique à 95 %), dépassements d’échéance, échecs créés aujourd’hui, signalements ouverts, abonnements en retard et comptes non vérifiés. Chaque carte ouvre la rubrique correspondante ; les comptes et échecs sont filtrés. Une absence de vérification ne prouve pas une non-livraison e-mail.
- **Vidéos** : tous les jobs conservés, sans filtre d’agence ni d’expiration ; recherche, origine compte/anonyme/interne, statut et dates. Détail, événements, appels texte/voix, signalements et lecture MP4 privée si le fichier est encore disponible. Le détail affiche les estimations OpenAI et Google en USD à six décimales, les provisions EUR à part, puis le modèle, les tokens (dont cache), le temps et les identifiants de chaque requête OpenAI. Les appels inconnus et les fixtures ne deviennent pas un coût nul ou facturé. Un master anonyme non débité reste protégé ; sa prévisualisation filigranée est lisible tant qu’elle existe.
- **Agences** : propriétaire, contacts, ville, marque, nombre de vidéos, statut d’abonnement et accès à l’historique filtré de l’agence.
- **Comptes** : identité, vérification, agence liée, fournisseurs de connexion et nombre de sessions non expirées. Aucun mot de passe, cookie, jeton ou IP n’est sélectionné.
- **Abonnements** : état, offre, période et résiliation prévue dans le registre Stripe existant. Une table vide correspond à l’absence d’abonnement enregistré ; les paiements en ligne attendent toujours le sprint Stripe. Le panneau ne prétend pas avoir encaissé les tarifs proposés.
- **Quotas** : toutes les périodes client conservées, type de crédit, quota consommé/réservé/disponible et ajustement de la période active. Un crédit `paid` peut être une allocation de développement historique : il ne prouve pas un paiement.
- **Imports & brouillons** : annonces encore conservées, URL ou saisie manuelle, photos et erreurs ; dates et filtres. Les données déjà purgées ne sont pas reconstituées. Les compteurs d’usage restent consultables dans le service.
- **Signalements** : commentaire, catégorie, vidéo concernée et transition Nouveau / En traitement / Clos.
- **Service & budget** : configuration utile, autorisation des lancements, limites, usage des imports, erreurs regroupées, appels texte/voix réels ou fixtures, provisions et sous-budget narration. Pause/reprise des **nouveaux** lancements ; les jobs déjà lancés continuent et les autres gardes (budget, flags, quotas, anti-abus) restent nécessaires à la reprise.
- **Journal** : modifications avec auteur, cible, avant/après, motif et date.
- **Fréquentation** : chargements HTML réussis des cinq pages publiques suivies, sur 7/30 jours UTC, par jour, page et pays d’origine réseau. Compteurs agrégés uniquement ; aucun visiteur unique ou emplacement précis revendiqué.
- **Performance** : réussite parmi les jobs finalisés créés sur 30 jours calendaires UTC, traitements actifs séparés et durée moyenne création → événement `ready`, attente/reprises comprises. Les durées absentes ne valent pas zéro et une modification ultérieure de rétention ne change pas la durée.
- **Coûts mensuels** : sommes des métriques OpenAI/Google conservées, appels réels/mesurés/échoués et fixtures séparés. Les totaux incomplets sont signalés ; aucune nouvelle facture ou marge commerciale n’est inventée.

Les listes utilisent une pagination stable de 30 lignes, sans limite de deux éléments ni troncature de l’historique. Les curseurs sont liés aux filtres ; changer les critères exige une nouvelle première page. Les requêtes sont paramétrées et les projections de champs explicites. L’export CSV porte sur les **lignes affichées**, protège les cellules qui pourraient être interprétées comme formules et reste local au navigateur.

Pour confirmer une modification, renseigner un **motif obligatoire d’au moins 5 caractères** (hors espaces de début/fin). La boîte de dialogue précise cette condition lorsque le bouton est grisé, puis indique que le motif sera conservé dans le journal dès qu’il est valide. L’ajustement d’un quota propose un exemple de motif sans le remplir à la place de l’administrateur.

## Actions et migration

Appliquer `0023_admin_audit.sql` avant de déployer le Worker. Cette migration ajoute une table et des index ; aucun registre existant n’est reconstruit. Les modifications passent par un seul INSERT D1 et des triggers : validation optimiste de la valeur précédente, mutation et audit sont atomiques. Une période expirée, un quota inférieur à `consommé + réservé`, un essai porté au-delà d’un crédit ou une valeur devenue obsolète provoquent un conflit sans audit de succès. Le type de crédit ne change jamais avec un ajustement. Le journal est immuable, et les modifications sont limitées à 20/minute par administrateur. Les POST imposent une origine identique, des corps bornés et un motif de 5 à 300 caractères.

Aucune commande de suppression globale, d’usurpation d’un compte, de facturation, de relance payante ou d’augmentation du budget n’est ajoutée. Les actions existantes de l’opérateur Cloudflare restent séparées du service public.

## Collecte du trafic

Migration additive `0024_admin_traffic.sql` : table à quatre colonnes `day/page/country/views`, clé primaire composée. `TRAFFIC_ENABLED=true` sur le Worker web active la collecte ; valeur absente/fausse = aucune écriture. Variable serveur locale désactivée par défaut ; le générateur de configuration accepte `BIENVU_TRAFFIC_ENABLED=true`. Aucun service analytique externe ou nouveau secret n’est nécessaire.

Seules les réponses HTML **200** à un **GET** sur l’origine `BETTER_AUTH_URL` et les chemins `/`, `/connexion`, `/explorer`, `/abonnement`, `/sources` comptent. Paramètres, sous-pages publiques, espaces privés, API, fichiers, erreurs, préchargements et réponses RSC sont exclus. Certains robots sont filtrés par leur user-agent, lu sans être stocké. D’autres robots, les rechargements et les visites de l’administrateur peuvent compter. Les navigations internes sans rechargement HTML ne sont pas mesurées.

Le pays vient uniquement de `request.cf.country`, fourni par Cloudflare ; le header client `CF-IPCountry` n’est jamais utilisé pour la collecte. Pays absent/invalide/TOR = `XX`, affiché « Pays inconnu ». Il s’agit du pays du réseau, potentiellement d’un VPN, pas de la position d’un utilisateur. Aucune adresse IP, ville, coordonnée GPS, cookie analytique, identifiant, e-mail, URL complète ou référent n’est ajouté au registre.

L’UPSERT atomique est attaché à `ctx.waitUntil()`. Une erreur de collecte produit seulement le log `traffic_write_failed` et n’interrompt pas la page. Un compteur est borné à un million de chargements par combinaison/jour. Cron web **`23 3 * * *`**, à 03:23 UTC : purge les jours antérieurs à `aujourd’hui - 30 jours`, soit environ 31 jours calendaires conservés. La purge reste active si la collecte est désactivée. Le cron utilise le binding D1 existant.

L’API `GET /api/admin?section=traffic&days=7|30` applique le même contrôle Super admin et le même cache privé que les autres API. Elle ne renvoie que des agrégats. La collecte démarre lors de son activation ; les visites antérieures ne sont pas reconstituées. Le texte de confidentialité de l’accueil indique cette mesure et sa conservation. La configuration du cron est vérifiable au déploiement ; sa première exécution nocturne est distincte de la recette locale du handler.

## Propositions et priorités

Les quatre premières améliorations sont implémentées : **fréquentation par pays/pages**, **alertes avec accès direct**, **performance réelle du pipeline** et **coûts mensuels détaillés**. Elles exploitent les registres existants et des compteurs agrégés, sans lancer d’import ou de génération supplémentaires.

| Proposition suivante | Intérêt | Donnée manquante / préalable |
| --- | --- | --- |
| Journal de livraison des e-mails | Expliquer une inscription bloquée, distinguer demande/envoi accepté/rejet/bounce | Registre des envois et événements du fournisseur ; un envoi accepté ne prouve pas la réception |
| Santé des imports par portail | Identifier les blocages Orpi et les changements d’extracteur | Résultats agrégés persistants des imports, y compris ceux purgés, avec version de l’adaptateur |
| Parcours essai → compte → téléchargement | Repérer les abandons et vérifier la récupération anonyme | Définir les cohortes et compléter les événements existants ; les pages servies ne sont pas des personnes uniques |
| Revenus, impayés et résiliations | Gérer l’activité commerciale et rapprocher les factures | Sprint Stripe et paiements réellement enregistrés ; aucun chiffre d’affaires déduit des quotas |
| Stockage réel et état des purges | Détecter des objets orphelins et suivre la conservation | Inventaire R2 borné et dernier résultat des nettoyages ; les métadonnées D1 ne couvrent pas tout le bucket |

Priorité proposée : livraison e-mail, santé des imports, parcours anonyme, puis finances dès l’ouverture des paiements. Aucune notification externe, facturation ou reprise payante automatique n’est ajoutée.

## Lecture des chiffres

Les jobs échoués et internes sont compris dans les totaux de vidéos et explicitement filtrables. Les MP4 expirés restent dans le registre ; les faits personnels d’un essai purgé peuvent avoir été effacés (titre « Vidéo archivée »). Un fichier supprimé n’est jamais présenté comme récupérable.

Les estimations par requête proviennent des seuls champs métriques du journal `narration_calls.result_json` ; le prompt, la réponse complète et les credentials ne sont pas exposés. OpenAI conserve un prix daté **avant remise cache**, Google un prix **avant gratuité**. Aucun nouveau tarif ni taux de change n’est appliqué rétroactivement. Les requêtes de correction sont comprises dans la somme, une reprise du même appel ne le double pas. Les mesures manquantes donnent un montant inconnu ou un total partiel ; la facture fournisseur et le coût Cloudflare par vidéo restent inconnus.

Le budget D1 décrit des provisions préventives. Il n’est ni une facture Cloudflare, ni le rapprochement TTC de toutes les dépenses. Les sous-provisions texte/voix ne doivent pas être additionnées aveuglément aux réservations vidéo. Le stockage montré est celui des métadonnées médias/imports, pas un inventaire exhaustif du bucket R2. La configuration Google/e-mail indique les bindings configurés, sans lancer un appel de vérification payant. La livraison des e-mails et les logs d’infrastructure n’ont pas encore de registre complet dans l’application.

## Vérification

`pnpm exec tsx --test tests/admin.test.ts tests/admin-traffic.test.ts` teste Better Auth et D1/R2 locaux, les refus, la pagination, les médias privés, CSRF, quotas, journal, projections des coûts et agrégats/purge du trafic. `pnpm check` couvre aussi les protections existantes du produit. `scripts/probe-admin-ui.mjs` vérifie les treize rubriques à 1536/390 px avec une session locale signée et des données synthétiques ; il utilise uniquement une vidéo de démonstration déjà présente, sans appel fournisseur. Sa configuration et ses sessions sont dans le dossier ignoré `evidence/local/admin`, jamais dans Git. Les preuves distantes et les limites sont consignées dans [la recette initiale du 30/09](preuves/maintenance/ADMINISTRATION-30-09.md), [les coûts par vidéo](preuves/maintenance/COUTS-VIDEOS-30-09.md) et [les indicateurs et la fréquentation](preuves/maintenance/ADMIN-INSIGHTS-30-09.md).

## Régler le budget mensuel

Dans **Service & budget**, le formulaire règle l’enveloppe, la coupure des nouveaux traitements et la suspension du budget pour le mois UTC courant. Une confirmation affiche les montants et exige un motif ; le journal conserve les réglages avant/après. Octobre 2026 est ouvert à **100 €**, coupure **90 €**, base **8 €** de frais fixes provisionnés.

La coupure doit couvrir les engagements et garder au moins 5 € de marge dans l’enveloppe. Le pilote est autorisé jusqu’à 100 € ; le formulaire permet de diminuer les montants ou de les relever dans cette borne. Aucun budget de session. Chaque nouveau mois doit être ouvert explicitement, en indiquant les frais fixes et éventuelles dépenses déjà engagées. Les montants ne remboursent ni ne réinitialisent les coûts des échecs.

`monthly_budget` passe par les mêmes contrôles serveur que les autres actions : adresse exacte vérifiée, session, origine, JSON strict, limite 20 actions/minute, motif et révision attendue. Le trigger D1 applique budget, politique anonyme et narration atomiquement ; une modification concurrente demande un rechargement. La narration possède un sous-plafond de 25 € maximum, compris dans les provisions de génération. Le renderer produit relit le plafond D1 avant chaque nouveau rendu et conserve le journal du mois précédent. Les limites 5 générations/jour et 30/mois restent appliquées par D1, indépendamment de l’enveloppe.
