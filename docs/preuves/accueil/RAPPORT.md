# Accueil BienVu — 28 septembre 2026

## Périmètre

Page publique réalisée d’après la maquette fournie par Alex : jaune pâle, titres noirs et italiques, salon et aperçu vertical, trois étapes, exemples, identité d’agence, propositions tarifaires, FAQ et pied de page. `contact@bienvu.online` est l’adresse publique confirmée par Alex. Le lien ouvre le client de messagerie ; cette tranche ne configure ni ne teste la boîte de réception.

L’ancien accueil du studio reste accessible à `/studio`. Les comptes, agences, imports, authentifications et configurations distantes existantes sont conservés. Aucune dépendance ajoutée, aucune migration ni modification de secret.

## Fonctionnement

- Le formulaire valide un lien public HTTPS, garde une préparation dans `sessionStorage` et ouvre l’inscription ou le studio. Le lien peut être repris pendant une heure dans le même onglet. Aucun import ni travail facturable n’est déclenché automatiquement.
- Après connexion, un bandeau permet de reprendre l’annonce ; le champ URL est prérempli. Le bouton de saisie manuelle prépare l’ouverture du formulaire existant.
- Menu mobile, ancres, carrousel, lecture/pause des aperçus et FAQ fonctionnels. Les aperçus sont des animations CSS muettes de photos synthétiques, explicitement indiquées comme illustrations. Ce ne sont pas des vidéos produites par le pipeline.
- Les offres 29/59/99 € HT et 10/30/60 vidéos sont des propositions, sans paiement. Les boutons expliquent leur disponibilité future. L’essai vidéo est annoncé pour l’ouverture de la génération.
- Confidentialité et conditions : informations sur la version de test, sans inventer de société, d’adresse ou de validation juridique. Le sprint 09 et sa tâche 09.5 restent incomplets.

## Fichiers

`apps/web/components/landing-page.tsx`, `app/landing.css`, `app/page.tsx`, `app/studio/page.tsx`, `lib/listing-draft.ts`, adaptations de `shell.tsx`, `login.tsx`, `generation-form.tsx`, et `scripts/probe-foundations.mjs`. Images WebP et polices WOFF2 locales dans `apps/web/public/` ; [prompts, provenance et licences](../../design/ACCUEIL-ASSETS.md).

Les captures, journaux et métadonnées de vérification sont locaux et ignorés par Git dans `evidence/local/landing/`.

## Vérification locale

- Build Next.js/OpenNext avec contrôle TypeScript et vérification des frontières applicatives.
- Sonde fondations adaptée aux huit pages, dont le nouvel accueil et `/studio`, ainsi qu’aux protections HTTP et à la génération suspendue.
- Navigateur : formulaire vide refusé, inscription présélectionnée, connexion par mot de passe d’un compte synthétique local, reprise de l’URL exacte et ouverture automatique de la saisie manuelle. Aucun import soumis.
- FAQ, précédent/suivant, lecture/pause, menu mobile, modales et fermeture clavier inspectés. Images et polices chargées ; inspection responsive en 1440×1000, 390×844 et 320×760.

Ces identités et liens de recette sont des fixtures. Cette tranche ne répète ni la recette OAuth Google réelle déjà confirmée, ni l’envoi d’e-mails, ni le pipeline vidéo.

## Mise en ligne et vérification réelle

Web déployé sur [bienvu.online](https://bienvu.online), version `a89ad5ea-1417-4517-b0fb-99cc215d1a01`. La comparaison avant/après confirme les mêmes bindings, variables, noms de secrets, options d’observabilité et restrictions de sous-domaines. Ancienne version conservée pour retour arrière : `c1f1dab4-9b64-41e4-bdc3-af726f932f77`.

Les GET réels retournent 200 pour `/`, `/studio` et `/connexion?mode=signup`, et 401 pour `/api/me` et `/api/imports` sans session. Trois images et trois polices publiées ont les mêmes empreintes SHA-256 que leurs fichiers locaux. Dans le navigateur : accueil à 320 et 1440 px, ancres, chargement des sept occurrences d’images, lecture/pause, exemples, agence, tarifs et FAQ inspectés. Aucun débordement horizontal observé. Captures `evidence/local/landing/desktop-public.png` et `mobile-public.png`.

Commandes réussies : `pnpm build:web` (OpenNext et TypeScript), `pnpm check:boundaries` (76 fichiers), `pnpm probe:foundations`, `pnpm exec wrangler whoami`, puis `wrangler deploy --dry-run --config apps/web/wrangler.staging.jsonc` et `wrangler deploy --config apps/web/wrangler.staging.jsonc --keep-vars`. Sonde HTTP publique locale `evidence/local/landing/check-public.mjs`, uniquement en lecture. Avertissement préexistant d’OpenNext sur un opérateur `??` dans le code embarqué de décodage PNG ; build réussi.

Après la recette, suppression de la seule identité synthétique créée dans D1 **local** : zéro utilisateur et zéro agence restants pour son identifiant. Le fichier local contenant son mot de passe est supprimé. La preview locale de cette tranche est arrêtée. Aucun compte distant créé ou modifié, aucun nettoyage des données d’Alex.

## Palette ajustée à la demande d’Alex

Le 28/09, le jaune initial est remplacé par `#e1e8d9`, le vert pastel exact du panneau droit de la page de connexion, relevé dans le navigateur. Fond uni ; accents et surfaces associés harmonisés, textes secondaires ajustés. CSS uniquement, avec build OpenNext/TypeScript, dry-run et inspection locale desktop/mobile. La version `a59df97f-a3b9-4838-ac8a-927e53bc09aa` est publiée puis inspectée sur bienvu.online. Preuves locales dans `evidence/local/landing-sage/` ; aucune génération d’images ou modification fonctionnelle pour cette retouche.

## Contrôle avant versionnement — 28/09/2026

À la demande d’Alex, l’accueil et sa palette sont regroupés dans un même lot Git. `pnpm check` réussit : 103 tests locaux, contrôle TypeScript et frontières applicatives sur 76 fichiers. Ces tests utilisent des fixtures ou services locaux, sans confirmer de nouvel appel externe. Le build et les inspections de la version publiée sont ceux décrits ci-dessus. `git diff --check` réussit ; les preuves générées et secrets restent ignorés, seuls les rapports Markdown et les assets publics sont versionnés.

## Limites et coûts

La page reste en accès anticipé, avec indexation désactivée comme le reste du site de test. La génération et la facturation ne sont pas activées. Les e-mails distants restent limités au destinataire de recette existant ; leur ouverture publique relève d’une prochaine tranche.

Trois illustrations créées avec le générateur intégré, sans clé API du projet. Aucun achat, nouveau service payant, import de bien, appel Browser Run, rendu ou envoi d’e-mail pour cette page. Les lectures et le déploiement web utilisent les ressources Cloudflare existantes ; surcoût attendu nul dans les allocations, facture non rapprochée. Les provisions restent à 20 € sur 30 €.
