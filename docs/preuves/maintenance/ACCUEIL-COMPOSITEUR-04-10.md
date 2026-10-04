# Compositeur de l’accueil — 4 octobre 2026

Le bloc reprend la maquette : champ encadré et bouton de création en première ligne, coût sous le bouton, réglages de format et de durée, interrupteurs de voix off et de sous-titres, puis personnalisation. La saisie manuelle se trouve sous la carte. Les réglages passent sur deux lignes et le bouton occupe toute la largeur sur petit écran.

Chaque réglage occupe une cellule qui répartit l’espace disponible, avec des marges symétriques et un contenu centré entre les séparateurs. Les icônes et chevrons restent attachés aux menus lorsque leur cellule s’élargit.

Le format utilise un menu vertical/horizontal. Les handlers de création, de photos, de saisie manuelle et de personnalisation sont conservés, ainsi que l’autofocus, les préférences et les états bloqués pendant la génération. Les durées restent 20, 30 ou 40 secondes, avec 20 secondes par défaut. Désactiver la voix coupe aussi les sous-titres ; les libellés désactivés restent barrés. Un second clic sur Personnaliser ferme les réglages.

Validation : TypeScript, build web, frontières des paquets, syntaxe du probe et bundle Wrangler. Recette Chrome sur le Worker local puis sur BienVu à 1 920, 1 536, 1 280, 1 100, 900, 390 et 320 px : contenus centrés entre les séparateurs, aucune sortie de la carte ni débordement de page, saisie manuelle hors carte, persistance du format/durée/voix et ouverture/fermeture de la personnalisation.

Les probes existants vérifient la saisie manuelle et la création personnalisée à 1 536, 390 et 320 px. Le POST de génération simulé conserve ordre des photos, animations, style et narration, ainsi que le format horizontal et la durée de 40 secondes. Aucun appel de génération externe ni crédit réel utilisé. Le probe attend désormais uniquement les images chargées ou visibles et utilise les boutons actuels du calculateur de crédits.

Version web déployée : `6ab20411-f5a6-43ae-b3f0-1d8171fef4ff`. Configuration, tâches planifiées et sélection des médias de l’accueil préservées ; Workers d’import et de génération inchangés. Captures et mesures locales : `evidence/local/home-composer/` et `evidence/local/home-composer-center/` (ignorés par Git).
