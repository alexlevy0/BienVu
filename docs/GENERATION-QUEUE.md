# Générations simultanées

La création automatique utilise une file persistante D1 et les attentes durables de Cloudflare Workflows. Plusieurs vidéos peuvent avancer en même temps ; une vidéo n’occupe un serveur de rendu que lorsque sa préparation est terminée.

## Réglages initiaux

| Ressource | Limite initiale | Fonctionnement |
|---|---:|---|
| Préparation | 5 vidéos, dont 2 par agence | Import, carte, narration et préparation des médias. |
| Runway | 1 au tier actuel | Minimum entre le plafond opérateur de 5 et la limite réelle de `gen4_turbo`. Les photos d’une vidéo restent traitées successivement. |
| HeyGen | Réglage existant des avatars | Les passages non soumis attendent une place au lieu d’être marqués en échec. |
| Rendu | 3 serveurs | Un rendu par serveur standard-4 : quatre vCPU et parallélisme Remotion de quatre. Réglable jusqu’à cinq serveurs. |
| Demandes actives ou en attente | 40 au total, 5 par agence | Une demande au-delà du plafond est refusée avant toute réservation. |
| Attente | 20 minutes maximum par ressource | Vérification toutes les 30 secondes, sans serveur de rendu allumé pendant l’attente. |

Ces limites sont réglables dans **Superadmin → Vidéos → File et générations simultanées**. Réduire une limite laisse les traitements actifs se terminer. Le panneau affiche les nombres actifs et en attente ; le bouton Actualiser relit leur état. La modification des réglages exige une session superadmin, une origine valide et la révision courante ; elle est journalisée.

Les liens non encore importés par un Workflow passent successivement par l’importeur existant. Cette courte lecture est libérée dès que les photos et la fiche sont enregistrées ; elle ne bloque pas les narrations ou les rendus des vidéos précédentes. Les annonces déjà préparées par le studio et les saisies manuelles passent directement aux préparations parallèles. Cette protection évite de saturer le serveur d’import et son navigateur lors d’un lot de demandes.

La limite Runway est lue par le SDK officiel, au plus toutes les trente minutes lors des animations et de la réconciliation périodique. Le bouton « Relire les limites Runway » permet une actualisation manuelle. Cette consultation n’est pas une génération payante. Un quota inconnu, périmé depuis une heure ou dont la dernière lecture a échoué limite la file à une animation simultanée. Une hausse du tier est utilisée après la prochaine lecture, dans la limite du plafond opérateur.

## Fiabilité et coûts

- L’admission conserve les réservations atomiques de crédits, l’idempotence et le budget monétaire global. Les plafonds du pilote de cinq générations par jour et trente par mois sont remplacés par les limites de file ; les quotas commerciaux, les quotas d’import et les protections des essais restent applicables.
- Une seule écriture conditionnelle D1 attribue la plus ancienne demande éligible et une place libre. Un index unique interdit deux titulaires d’une même place. Les préparations d’une agence saturée et les essais saturés laissent avancer une autre demande éligible.
- Chaque rendu conserve son numéro de serveur dans `generation_runs.render_slot`. Les appels de statut, les flux progressifs et la réconciliation utilisent ce numéro. Les vidéos historiques continuent d’utiliser leur contrôleur d’origine.
- Les fichiers R2 sont vérifiés puis l’arrêt du serveur est confirmé avant de publier le résultat terminal et de libérer la place. Un arrêt incertain conserve la réservation ; un ancien nettoyage ne peut pas arrêter le rendu suivant.
- Les délais globaux sont de deux heures pour les demandes connectées et d’au moins une heure pour les essais. Ils incluent les attentes ; les plafonds des étapes de rendu et des fournisseurs restent bornés. Les crédits sont consommés au règlement, ou libérés selon les règles existantes si la vidéo échoue. Les provisions de dépenses déjà engagées sont conservées.
- Les étapes en attente n’allument pas de VM. Pour un même nombre de vidéos, le coût dépend du calcul réellement exécuté, du démarrage et des médias, et non du nombre maximal de serveurs configuré. Cette évolution ne modifie aucun abonnement fournisseur et n’augmente pas l’enveloppe mensuelle.
- La position publique contient uniquement un nombre et le nom de l’étape. Aucun identifiant d’une autre agence ou d’une autre vidéo n’est exposé. Un utilisateur connecté peut démarrer une autre création depuis le studio ; son essai anonyme conserve sa restriction par session.

## Mise en service et retour arrière

La migration **0072_generation_queue.sql** crée les tickets et les réglages, supprime l’ancien index imposant une seule vidéo active par agence et adapte les gardes d’admission. **0073_legacy_job_serialization.sql** conserve la restriction des anciens producteurs de jobs qui ne passent pas par la file et ses protections. Le Worker de génération et le site doivent être mis à jour ensemble. L’application Containers conserve son image de rendu et passe à `max_instances: 5` ; D1 limite les rendus à trois par défaut.

Procédure : sauvegarder versions, configuration et point de restauration D1 ; suspendre les nouvelles admissions ; attendre qu’aucune vidéo ne soit active ; appliquer la migration ; publier le pipeline et le site en conservant leurs bindings et secrets ; contrôler les API privées et les réglages ; rétablir l’admission. Aucune génération payante n’est nécessaire pour cette vérification de déploiement.

Pour revenir à la version précédente, suspendre l’admission et laisser se terminer les vidéos actives avant de rétablir les anciennes versions. Conserver les nouvelles colonnes et l’historique de file. Revenir temporairement à une concurrence de un via les réglages est possible sans restaurer la base. Une restauration globale D1 n’est pas un retour arrière ordinaire : elle pourrait effacer des modifications d’utilisateurs effectuées depuis le déploiement.

## Validation

Les tests de `generation-queue`, `generation-queue-workflow`, `generation-workflow`, `trial-workflow`, `avatars`, `video-coordinator`, `anonymous-trials` et `admin` vérifient l’admission concurrente, les budgets/crédits, l’isolation, les révisions, l’attente du troisième rendu, le routage vers deux contrôleurs distincts, la réduction de capacité, la persistance des places après redémarrage et l’arrêt incertain.

Le test de trois Workflows utilise de vrais D1, R2, Workflows et Durable Objects locaux dans workerd, avec des fournisseurs et sorties MP4 simulés. Il prouve l’orchestration, pas une mesure de performances de trois VM Cloudflare réelles. Miniflare n’a pas restauré un moteur Workflow déjà endormi après destruction du processus ; la persistance D1 des demandes et places actives a été vérifiée séparément, ainsi que la conservation des résultats après redémarrage. La reprise de Workflows en production repose sur le service durable Cloudflare.

La recette navigateur des composants réels couvre 1536, 390 et 320 px, les bornes, la sauvegarde, le conflit de révision, la reprise après erreur et la position affichée. Les preuves privées sont dans `evidence/local/generation-queue/` ; elles ne contiennent pas de nouvelles générations client.
