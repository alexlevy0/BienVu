# Avatar IA sur toute la vidéo — 09/10/2026

Alex demande un présentateur visible pendant toute la vidéo et confirme **1 crédit supplémentaire par tranche de 10 secondes**. L’option est facultative, réservée aux comptes connectés, proposée dans Personnaliser → Avatar IA et dans les réglages audio de l’Éditeur.

| Durée | Supplément continu | Total sans animation de photo |
|---|---:|---:|
| 20 s | 2 crédits | 3 crédits |
| 30 s | 3 crédits | 4 crédits |
| 40 s | 4 crédits | 5 crédits |

L’ouverture, la conclusion ou les deux restent à +1 crédit. Le coût affiché, le calculateur des offres, les ressources d’éditeur et le simulateur de rentabilité utilisent ce barème. Les avertissements voix féminine/avatar masculin et voix masculine/avatar féminin restent non bloquants.

## Synchronisation et coûts

Les WAV déjà produits sont assemblés en un seul WAV mono 24 kHz, de la durée exacte du montage. Les offsets des phrases, leurs pauses et la fin du montage sont conservés. Un seul appel de création HeyGen est demandé. Aucun appel de texte ou de synthèse vocale supplémentaire n’est nécessaire pour ajouter l’avatar.

Le fichier assemblé est rattaché aux hashes et timings des pistes sources dans le manifeste privé. Il reste muet dans le rendu : seules les pistes originales sont jouées. Le cadre de l’avatar couvre la totalité de la timeline, en portrait et en paysage. Les clips continus sont retrouvés lors de l’ouverture dans l’Éditeur ; une voix ou un rythme différent empêche leur réutilisation.

Le supplément est réservé atomiquement sur les crédits mensuels puis les crédits achetés. Si le clip est réutilisé ou échoue, il est restitué. Un nouveau clip prêt reste facturé si le rendu final échoue ensuite ; sa reprise depuis l’Éditeur suit les règles de réutilisation. Les provisions fournisseurs ne sont jamais effacées par un remboursement client. Les plafonds HeyGen existants sont conservés.

## Migrations et contrôles

Migration **0061_full_length_avatars.sql** : ajout d’un moment `full`, de 0 à 3 unités complémentaires au drapeau historique et règlement du supplément total dans les lots d’origine. Les prix enregistrés sont immuables.

Une sauvegarde SQL distante de **3 061 607 octets**, avec permissions `600`, précède l’application. Répétition locale sur cette sauvegarde, puis comparaison distante de **14 tables et vues** : mêmes tâches, clips, réservations, allocations, réglages, audits, budgets, dépenses et affectations. Tous les anciens `avatar_extra_credits` valent zéro ; aucun défaut de clé étrangère. Les données privées et les clés ne figurent pas dans ce document.

Les **33 tests distincts** ciblés sont validés après les reprises nécessaires : contrats, assemblage audio, avatars continus, anciens avatars, Workflows, contrôleur de rendu, crédits produit, recharges, Éditeur, voix restaurées, simulation et budget mensuel. Le premier lancement concurrent a rencontré des coupures locales Workerd et une course dans le point de contrôle du Workflow ; ces tests passent lors du lancement séquentiel. La recette financière comprend six scénarios sur deux dates simulées pour respecter la limite quotidienne existante, et conserve la période de validité des crédits achetés.

Contrôles supplémentaires : TypeScript complet et compilation des tests, frontières Worker/Node, `git diff --check`, build OpenNext et dry-runs des Workers web et génération. Chrome à **1536 et 390 px** vérifie l’option désactivée initialement, les suppléments 2/3/4, le retour au mode court à +1, une piste couvrant 100 % de la durée, le placement au milieu de la vidéo, les deux avertissements et l’absence de débordement.

## Rendu et limites de la recette

Les clips réels déjà payés de Daphne du premier pilote sont allongés **uniquement pour cette recette locale**. Le MP4 est préparé avec `faststart` ; le WebM est réencodé en VP9 avec un vrai canal alpha, car une copie simple perdait l’indicateur de transparence. Ces fichiers ne sont ni une nouvelle sortie HeyGen de 40 s ni une vidéo client. Les captures Linux contrôlent les frames **30, 600 et 1100** dans les formats vertical et horizontal.

Les **12 captures** sont validées sur l’image finale, avec inspection du milieu et de la fin. Le canal alpha du WebM est aussi décodé en pixels : il contient des zones transparentes et opaques, et son indicateur écrit `ALPHA_MODE` est accepté comme `alpha_mode`. Les contrôles de codec, de dimensions, de durée et de hash sont conservés.

Le premier essai continu de 20 à 40 secondes auprès de HeyGen reste à valider sur une génération réelle. Le fournisseur peut modifier la pose du présentateur pendant les silences. Les tests de cette extension n’ont utilisé aucun nouveau crédit HeyGen, Cartesia, Google, Fish ou OpenAI, aucun crédit client et aucun achat. Les images, WAV, exports, snapshots et journaux privés sont dans `evidence/local/full-avatar-2026-10-09/`, hors Git.

Publication : génération **`be6b00ea-d3e1-4ce3-8be4-be6436d75556`**, web **`cd555214-9b22-4662-ae22-e4fc79abbab7`**. Image Linux épinglée : **`sha256:471b230c2d75dfc49ef97a6ac90d3dfc4135efcb3c084f697453f8065cd64fba`**. Les limites du fournisseur et les paramètres d’accès sont conservés avec `--keep-vars`. Aucun commit ou push pour cette extension à cette étape.

Vérification distante finale : deux versions à **100 %**, **32 bindings génération et 56 web identiques**, image de l’application Containers conforme au digest épinglé. Accueil, offres, Éditeur, catalogue et `llms.txt` en **200** ; API superadmin et crédits en **401** sans session. Le bundle client contenant le nouveau choix est relu depuis le site et correspond au fichier construit par SHA-256. Historiques et budgets identiques, aucune nouvelle tâche d’avatar ni charge de crédit client pour ces vérifications.

Pour suspendre les nouvelles créations, désactiver la disponibilité des avatars dans le superadmin. Conserver les tables, crédits réglés et médias. Après création de vidéos continues, un retour de code doit conserver un lecteur compatible avec `full` et le nouveau supplément : les versions antérieures ne savent pas relire ces nouveaux montages ni leur tarif. Les vidéos historiques ne sont pas modifiées.
