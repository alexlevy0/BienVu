# Visuels du nouvel accueil studio BienVu

Créés le 29 septembre 2026 avec le générateur d’images intégré, d’après la maquette fournie par Alex. Ces quatre illustrations représentent des biens fictifs ; les noms et sceaux d’agences sont également fictifs. Les mentions correspondantes sont visibles dans la galerie et les lecteurs. Aucun appel à l’API OpenAI du projet.

## Fichiers livrés

- Images : `apps/web/public/images/studio-home/{paris,sud,lyon,bordeaux}.webp`, 768 × 1024, 766 158 octets au total. Conversion et redimensionnement WebP qualité 84 avec Sharp ; aucune retouche du contenu après génération.
- Aperçus : `apps/web/public/videos/studio-home/{paris,sud,lyon,bordeaux}.mp4`, 600 × 800, H.264 à 24 images/s, 28/32/27/30 secondes, sans piste audio. Chargés uniquement à l’ouverture du lecteur, pas au chargement initial de l’accueil.
- Reproduction des animations : `node scripts/prepare-home-demos.mjs` depuis la racine. Déplacement lent dans la photo générée, encodage FFmpeg local ; aucun appel fournisseur ni rendu Cloudflare. Il ne s’agit pas d’une vidéo issue du pipeline produit avec narration.
- Logo et sceaux : SVG natifs dans `apps/web/components/home-icons.tsx`. Polices locales déjà présentes conservées ; aucun chargement Google Fonts externe.

Les originaux PNG sont conservés dans le dossier local d’images générées de Codex, hors dépôt. Les fichiers WebP et MP4 optimisés sont les assets publics versionnables.

## Prompts exacts

### paris.webp

Use case: photorealistic-natural. Asset type: portrait 3:4 editorial real-estate photograph for a premium French property-video studio website. Generate only a single full-bleed photograph, never website/UI. Natural realistic materials, refined architectural magazine quality, straight architectural lines, warm atmospheric sunshine, believable photography. No people, no text, no watermark, no logos, no frame, no collage. A Haussmann apartment living room in Paris, tall French windows and wrought iron balcony on the left, a Paris stone facade visible outside. Cream walls with fine mouldings, ornate ceiling, warm herringbone oak floor, carved pale stone fireplace with antique gold mirror on the right, cream linen sofa, round travertine coffee table and ceramic vase. Sunlight spills across the floor. Eye-level vertical wide-angle editorial photograph, inviting quiet elegance. Windows occupy upper left half, furnishings lower third.

### sud.webp

Use case: photorealistic-natural. Asset type: portrait 3:4 editorial real-estate photograph for a premium French property-video studio website. Generate only a single full-bleed photograph, never website/UI. Natural realistic materials, refined architectural magazine quality, straight architectural lines, warm atmospheric sunshine, believable photography. No people, no text, no watermark, no logos, no frame, no collage. Contemporary cream stucco villa in southern France next to a pale turquoise swimming pool, mature olive branches frame the top, softly rolling green countryside in distance and a clear muted blue sky. Spacious stone terrace and elegant curved rattan loungers with cream cushions on the right, green Mediterranean plants, no ocean. Eye-level composition from the poolside, water in lower half, olive leaves across top left, modern white villa and terrace on right.

### lyon.webp

Use case: photorealistic-natural. Asset type: portrait 3:4 editorial real-estate photograph for a premium French property-video studio website. Generate only a single full-bleed photograph, never website/UI. Natural realistic materials, refined architectural magazine quality, straight architectural lines, warm atmospheric sunshine, believable photography. No people, no text, no watermark, no logos, no frame, no collage. A beautiful converted industrial loft in Lyon, warm sandstone walls and three very tall black metal arched factory windows on the left. Sunlight streams through into a living room with a cognac leather sofa, low timber coffee table with a few books, soft neutral rug, large leafy plants and shelves in the background. Refined lived-in warmth, authentic brick and stone textures, no clutter. Vertical composition with the graceful arched windows filling upper half and sofa below.

### bordeaux.webp

Use case: photorealistic-natural. Asset type: portrait 3:4 editorial real-estate photograph for a premium French property-video studio website. Generate only a single full-bleed photograph, never website/UI. Natural realistic materials, refined architectural magazine quality, straight architectural lines, warm atmospheric sunshine, believable photography. No people, no text, no watermark, no logos, no frame, no collage. An elegant light limestone townhouse in Bordeaux seen through a lush enclosed garden, classic symmetrical French facade with tall white painted shuttered windows and a central glazed door, climbing green vines, a small iron balcony above. Dappled sunlight through leafy branches at the top, soft lawn and white flowering plants in foreground, a stone path to the entrance, welcoming very green private garden, two simple garden chairs to the right. Vertical eye-level architectural garden photograph, facade fully visible and centred.
