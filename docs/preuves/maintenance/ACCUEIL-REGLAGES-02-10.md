# Ajustements de l’accueil — 2 octobre 2026

Demande d’Alex : retirer la ligne sous « Votre studio immobilier », ajouter une ombre légère au formulaire principal et fermer la personnalisation au second clic sur son bouton.

`landing.css` retire la bordure uniquement sur l’en-tête de l’accueil. Le compositeur reçoit une ombre discrète dans les états accueil et conversation, conservée avec l’indicateur de focus clavier.

`home-create.tsx` partage la même fermeture entre le bouton Personnaliser et le bouton Retour des réglages. Le second clic masque la personnalisation ; les photos, champs et réglages sont conservés. L’aperçu d’une URL sans connexion revient à l’accueil en conservant le lien et les réglages. Une réouverture depuis un brouillon ne relance pas son import.

## Recette locale

TypeScript web, build OpenNext, dry-run Wrangler et diff réussis. Chrome à **1536 / 390 px**, connecté puis anonyme sur API simulées :

- en-tête sans bordure et ombre présente ;
- ouverture, fermeture au second clic et réouverture ;
- style Cinéma, voix désactivée, sous-titres désactivés et durée de 40 s conservés ;
- six photos et prix du brouillon connecté conservés, aucune répétition de l’import ;
- URL anonyme conservée, aucun débordement horizontal.

Captures et traces privées ignorées : `evidence/local/home-polish/`. Les écritures API sont bloquées côté navigateur lors de la recette sur assets distants ; aucune génération réelle ou requête fournisseur nécessaire.

## Publication

Web **`e3f39d18-d241-49ad-88ef-bb1376f7b7b5`** à **100 %** sur `bienvu.online`, **25 bindings et compatibilité conservés**. Accueil/connexion/abonnement 200, API crédits/admin sans session 401. Budget engagé **45,35 €**, 13 jobs et aucun actif : état inchangé.

Les quatre scénarios Chrome passent aussi sur les assets publiés. Un premier contrôle avait encore reçu l’ancienne ombre ; le HTML courant référence ensuite la nouvelle feuille et son SHA-256 distant est identique au build (`ae319f4c…4b501`). Captures après fin des animations inspectées ; aucune purge de cache générale ou modification des données.
