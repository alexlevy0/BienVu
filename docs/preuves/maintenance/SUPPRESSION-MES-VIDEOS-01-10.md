# Suppression des annonces à compléter — 1 octobre 2026

## Résultat

Dans [Mes vidéos](https://bienvu.online/historique), chaque carte « Annonces à compléter » possède un menu **… → Supprimer**, comme dans la barre latérale. Le même composant appelle le DELETE existant ; la suppression retire le brouillon des deux listes et nettoie sa copie locale. Les vidéos finalisées ne sont pas concernées. Une erreur conserve le brouillon et permet de réessayer ; la requête en cours empêche les doubles clics.

Fichiers : `apps/web/components/draft-actions.tsx` (menu partagé), `studio-sidebar.tsx` (réutilisation), `generation-history.tsx` (menu et focus de repli), `apps/web/app/historique/history.css` (positionnement), `scripts/probe-workflow-ui.mjs` (recette ciblée). Aucun changement de route serveur, migration, ressource, quota ou configuration.

## Vérifications locales

Commandes exécutées depuis la racine :

```sh
pnpm check:boundaries
pnpm --filter @bienvu/web typecheck
pnpm exec tsx --test tests/draft-delete.test.ts
pnpm build:web
pnpm exec wrangler dev --config evidence/local/admin/wrangler.ui.json --persist-to evidence/local/admin/storage --port 8790 --local
node scripts/probe-workflow-ui.mjs --history-draft-actions-only
node scripts/probe-workflow-ui.mjs --draft-actions-only
git diff --check
```

- Types, frontières sur **184 fichiers**, build Next/OpenNext et diff réussis.
- Test de suppression avec **D1/R2 locaux** réussi : isolation des agences, upload tardif, reprise du nettoyage R2 et conservation des limites/provisions après purge.
- **2 parcours navigateur sur fixtures**, à **1536×980 et 390×844** : brouillons manuel/URL avec et sans photo, menu et focus clavier, fermeture par Échap, erreur 503 puis reprise, double clic sans double suppression, synchronisation des récentes, persistance après rechargement, conservation d'une autre annonce et de la vidéo existante, disparition de la section vide et focus sur le titre. Aucun débordement horizontal ; captures de la liste et du menu inspectées aux deux tailles.
- **8 régressions sur fixtures** du menu latéral et de l'animation de saisie manuelle réussies. Zéro admission de vidéo dans ces parcours.
- Les API, identités et suppressions des parcours navigateur sont simulées. Le test serveur local est distinct ; aucun brouillon utilisateur distant n'a été supprimé pour la recette.

Rapports et captures ignorés par Git sous `evidence/local/workflow-ui` ; logs et instantanés privés sous `evidence/local/history-drafts`. Serveur de recette arrêté après vérification.

## Publication et contrôles Cloudflare réels

Dry-run puis déploiement avec `--config apps/web/wrangler.staging.jsonc --keep-vars --strict`. Worker **bienvu-web-probe-staging**, version **1f6a44b1-868c-4a8b-9980-cb40e3fdcc63**, active à **100 %** sur **bienvu.online** ; planification existante conservée.

- `/historique` : **200**, ses **14 fichiers CSS/JS** : **200**, empreintes SHA-256 identiques au build local, menu présent dans le bundle publié.
- DELETE sans session sur un identifiant fictif : **401**. Cette requête n'a supprimé aucune donnée.
- Bindings, variables, secrets, date et flags de compatibilité, modèle d'usage : identiques avant/après.
- **5 jobs, 2 comptes, 0 abonnement, 10 imports** avant/après. Registre de septembre inchangé : base **30,80 €**, engagement **44,80 €**, coupure **45 €**, pause désactivée. Aucune nouvelle provision ni ouverture du mois d'octobre.
- La première lecture API a reçu 401 avec le jeton Wrangler expiré ; `wrangler whoami` a renouvelé l'authentification existante, puis les lectures et la publication ont réussi. Aucun secret partagé ou modifié.

La preuve distante est HTTP/Cloudflare. La suppression avec une vraie session sur le domaine et un téléphone physique n'est pas déclarée testée. Aucun appel OpenAI/TTS, import, rendu vidéo ou envoi e-mail ajouté ; les lectures et le déploiement utilisent les ressources Cloudflare existantes. Les provisions restent distinctes de la facture effective.
