# Visuels de l’accueil BienVu

Créés le 28 septembre 2026 avec le **générateur d’images intégré** (skill imagegen), à partir de la direction visuelle de la maquette fournie par Alex. Ce sont des illustrations synthétiques ; aucune annonce réelle, agence cliente ou vidéo produit n’est revendiquée.

Les trois fichiers WebP sont dans `apps/web/public/images/landing/`. Conversion WebP qualité 83 sans modification du contenu ; les originaux restent dans le dossier des images générées de Codex. Les cadrages verticaux sont réalisés en CSS. Aucun appel à l’API OpenAI du projet.

Polices auto-hébergées : [Inter Tight](https://fonts.google.com/specimen/Inter+Tight) et [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif), sous SIL Open Font License. Les licences sont dans `apps/web/public/fonts/*-OFL.txt`. Sous-ensembles latins WOFF2, aucune requête de police Google depuis le navigateur du visiteur.

## Prompts utilisés

### interieur.webp

Use case: photorealistic-natural. Asset type: wide landscape hero photograph for a premium French real-estate website, 1536x1024. Create a realistic editorial interior photograph of a luxurious yet warm Mediterranean living room. Large floor-to-ceiling oak-framed sliding windows on the LEFT open to a sunlit terrace, mature pine trees and a distant blue sea. Cream linen sofas at lower right, chunky travertine coffee table, warm pale oak floor, exposed golden limestone feature wall on the right, tasteful sculptural ceramic vase, understated furniture. Rich but natural afternoon sunshine, long soft shadows, calm lived-in elegance, high-end architecture magazine photography, wide angle 24mm camera at human eye height, straight vertical lines. No people, no text, no letters, no logo, no watermark, no UI, no borders. Full-bleed single photograph, not a collage. The right-centre area will be reused as a tall portrait crop. Avoid oversaturated colours, fantasy architecture and plastic CGI surfaces.

### riviera.webp

Use case: photorealistic-natural. Asset type: portrait real-estate editorial photograph, 1024x1536, for a French real-estate website. A tasteful Mediterranean villa terrace above the French Riviera with an infinity swimming pool in the foreground, a cream stucco house with terracotta roof at left, mature parasol pine trees at the top, bright calm azure sea and hazy coastline on the horizon. One elegant wicker sun lounger with beige cushion on right, stone pool paving, terracotta potted plants. Premium natural architecture photography, sunny late afternoon, authentic materials, crisp details, balanced composition, straight architecture. Upper third has calm dark foliage suitable for white text overlay added later by website code. No text, no people, no logo, no watermark, no UI, no border. Full-bleed single portrait photograph.

### maison.webp

Use case: photorealistic-natural. Asset type: portrait real-estate editorial photograph, 1024x1536, for a French property website. A beautiful authentic Provençal stone country house with old warm limestone walls and a weathered terracotta tile roof, sage green shutters and a pale cream door, set in a lush garden. Olive trees frame the top corners, tall cypress at the right, lavender and agapanthus beside a small curving stone path leading to the house, warm dappled afternoon sunlight, blue sky. Quiet sophisticated French country living, high-end architecture magazine photograph, realistic elegant but modest proportions, true textures. Upper third has dark leafy branches suitable for white text added later in code. No people, no text, no letters, no watermark, no branding, no UI, no border. Full-bleed single portrait photograph.
