# Rapports et preuves de recette

Git conserve les **comptes rendus et procédures Markdown** de ce dossier : résultats, commandes exécutées, distinction fixtures/réel, coûts et vérifications restantes. Chaque validation distante doit rester expliquée dans son rapport, même quand ses fichiers de mesure ne sont pas publiés.

Les sorties générées sont **locales et ignorées par Git** : rapports JSON, journaux, captures, médias et exports DNS. Les 96 fichiers de ce type déjà suivis ont été retirés de l'index sans être supprimés du disque. Les anciens commits les contiennent toujours ; aucune réécriture d'historique n'est effectuée.

Les chemins `docs/preuves/…` mentionnés en texte dans les rapports désignent ces archives locales. Ils peuvent être absents d'un nouveau clone. Les nouvelles sondes écrivent leurs résultats dans `evidence/local/` ou `evidence/remote/`, également ignorés. Ne pas relancer des appels externes payants simplement pour reconstituer une archive ; suivre la procédure et le budget du sprint concerné.

Les fixtures synthétiques nécessaires aux tests restent versionnées dans `fixtures/imports/`. Les médias de synthèse de `fixtures/generated/` se recréent avec `pnpm fixtures`. Les artefacts de recette locale sélectionnés par la CI restent consultables dans GitHub Actions après une exécution réussie ; ils n'entrent pas dans le code source.

Consulter [SUIVI.md](../SUIVI.md) pour l'état actuel et les rapports de chaque sprint. Avant de publier un nouveau rapport Markdown, retirer les secrets, cookies, liens d'authentification et données personnelles inutiles. Ne pas forcer l'ajout des sorties ignorées avec `git add -f`.
