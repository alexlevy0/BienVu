# Fixtures du sprint 00

`pnpm fixtures` crée dans `generated/` trois images géométriques PNG, un signal sonore WAV à trois fréquences et deux manifestes de 6 et 30 secondes. Ce sont des données synthétiques, créées par le code du projet, sans droits de tiers. Ce signal n'est pas une voix off et ne valide pas la qualité du TTS français.

Les tests d'import utilisent des données JSON-LD synthétiques. Les cas distants sont nommés et limités ; une recherche web n'est jamais comptée comme un import Browser Run.
# Fixtures métier du sprint 01

`contracts.ts` contient des données entièrement synthétiques de vente, location mensuelle, prix/surface absents et surface contradictoire, ainsi qu'une marque et un manifeste de recette. Aucune URL de fixture n'est consultée et aucun asset décrit dans ce fichier n'est importé. Les tests distinguent les données normalisées de celles autorisées pour une génération.
