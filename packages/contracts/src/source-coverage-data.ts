// Public acceptance results. Raw reports and credentials stay in ignored evidence.
// Research and methodology: docs/preuves/maintenance/SOURCES-05-10.md.
// César & Brutus and new iad sample: docs/preuves/maintenance/SOURCES-06-10.md.
// Adapted readers and successful retests: docs/preuves/maintenance/SOURCES-ADAPTATEURS-06-10.md.
// New hosted retests: docs/preuves/maintenance/SOURCES-NAVIGATEUR-08-10.md.
import type {CoverageSourceId, SourceCoverageEntry} from './source-coverage';

export const sourceCoverageData = {
  "orpi": {
    "summary": "Une annonce importée avec 12 photos. Un autre lien n’était pas accessible : utilisez l’adresse d’un bien encore en ligne.",
    "samples": [
      {
        "url": "https://www.orpi.com/annonce-vente-maison-t5-ambillou-37340-5c1c5619-6a68-42ad-9e32-137820296b32/",
        "label": "Maison · Ambillou",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le lien testé n’était pas accessible lors de l’essai."
      },
      {
        "url": "https://www.orpi.com/annonce-vente-maison-t5-sanary-sur-mer-83110-6a8bf038-8658-47a4-8b4c-1ba6ef93b7fc/",
        "label": "Maison · Sanary-sur-Mer",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 12,
        "note": "Informations et 12 photos récupérées et vérifiées."
      }
    ]
  },
  "century21": {
    "summary": "Un import complet lors du précédent essai. Le nouveau lien testé n’a pas fourni toutes les informations nécessaires : le résultat dépend de l’annonce.",
    "samples": [
      {
        "url": "https://www.century21.fr/trouver_logement/detail/16965965448/",
        "label": "Appartement · Lyon (essai précédent)",
        "checkedAt": "2026-09-28",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 7,
        "note": "Informations et 7 photos récupérées lors de l’essai du 28 septembre."
      },
      {
        "url": "https://www.century21.fr/trouver_logement/detail/16010487006/",
        "label": "Maison · Saint-Martin-Boulogne",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Les informations nécessaires n’ont pas toutes pu être vérifiées."
      }
    ]
  },
  "laforet": {
    "summary": "La page est récupérée, mais sa lecture et ses ressources ne sont pas encore prises en charge par l’import. Vous pouvez renseigner le bien et ajouter vos photos manuellement.",
    "samples": [
      {
        "url": "https://www.laforet.com/agence-immobiliere/caluire/acheter/lyon-03/appartement-3-pieces-52297980",
        "label": "Appartement · Lyon 3e",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:20:51.338Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "La page est récupérée, mais sa lecture et ses ressources ne sont pas encore prises en charge par l’import."
      },
      {
        "url": "https://www.laforet.com/agence-immobiliere/caluire/acheter/lyon-03/appartement-3-pieces-52297980",
        "label": "Appartement · Lyon 3e",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Un lien de l’annonce ou de sa galerie n’est pas pris en charge par l’import."
      }
    ]
  },
  "human": {
    "summary": "Import complet confirmé sur l’annonce de Tulle : informations du bien, description et 6 photos. Les autres formats du site restent à vérifier.",
    "samples": [
      {
        "url": "https://www.human-immobilier.fr/annonce-achat-appartement-tulle_259-4183",
        "label": "Appartement · Tulle",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T16:39:00.355Z",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 6,
        "note": "Fiche importée automatiquement avec le prix, la surface, les pièces, la description et 6 photos."
      },
      {
        "url": "https://www.human-immobilier.fr/annonce-achat-appartement-tulle_259-4183",
        "label": "Appartement · Tulle",
        "checkedAt": "2026-10-08",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Essai avant la correction du transport : accès à la fiche refusé, aucune photo importée."
      },
      {
        "url": "https://www.human-immobilier.fr/annonce-achat-appartement-tulle_259-4183",
        "label": "Appartement · Tulle",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le site a refusé l’accès à l’import lors de l’essai."
      }
    ]
  },
  "guy-hoquet": {
    "summary": "La page est récupérée, mais sa lecture et ses ressources ne sont pas encore prises en charge par l’import. Vous pouvez renseigner le bien et ajouter vos photos manuellement.",
    "samples": [
      {
        "url": "https://courbevoie.guy-hoquet.com/achat-vente/appartement-3-pieces-courbevoie-92400-1894440",
        "label": "Appartement · Courbevoie",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:21:03.806Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "La page est récupérée, mais sa lecture et ses ressources ne sont pas encore prises en charge par l’import."
      },
      {
        "url": "https://courbevoie.guy-hoquet.com/achat-vente/appartement-3-pieces-courbevoie-92400-1894440",
        "label": "Appartement · Courbevoie",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Un lien de l’annonce ou de sa galerie n’est pas pris en charge par l’import."
      }
    ]
  },
  "nestenn": {
    "summary": "Le lien testé est importé avec ses informations et ses 7 photos. Le portail Nestenn et le sous-domaine de l’agence Lyon 8 sont pris en charge ; les autres formats et sous-domaines restent à vérifier.",
    "samples": [
      {
        "url": "https://nestenn.com/appartement-3-pieces-de-65m2-avec-balcon-place-de-stationnement-cave-ref-39584333",
        "label": "Appartement · Lyon 8e",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T13:34:23.063Z",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 7,
        "note": "Après adaptation Nestenn : 199 000 €, 65 m², 3 pièces, description et 7 photos enregistrées et vérifiées."
      },
      {
        "url": "https://nestenn.com/appartement-3-pieces-de-65m2-avec-balcon-place-de-stationnement-cave-ref-39584333",
        "label": "Appartement · Lyon 8e",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Des informations contradictoires empêchent de valider l’annonce."
      }
    ]
  },
  "era": {
    "summary": "La fiche et les ressources de sa galerie ne sont pas encore prises en charge automatiquement. Vous pouvez renseigner le bien et ajouter vos photos manuellement.",
    "samples": [
      {
        "url": "https://www.eraimmobilier.com/agence-immobiliere-saint-nazaire-133/annonces/576636",
        "label": "Appartement · Saint-Nazaire",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:21:12.071Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "La fiche et les ressources de sa galerie ne sont pas encore prises en charge automatiquement."
      },
      {
        "url": "https://www.eraimmobilier.com/agence-immobiliere-saint-nazaire-133/annonces/576636",
        "label": "Appartement · Saint-Nazaire",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Un lien de l’annonce ou de sa galerie n’est pas pris en charge par l’import."
      }
    ]
  },
  "ladresse": {
    "summary": "L’annonce testée est importée avec ses informations et ses 11 photos. Les autres formats de fiches restent à vérifier.",
    "samples": [
      {
        "url": "https://www.ladresse.com/annonce/achat/maison/begles-33130/14649049",
        "label": "Maison · Bègles",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 11,
        "note": "Après ajout de la prise en charge l’Adresse : informations et 11 photos récupérées et vérifiées."
      }
    ]
  },
  "foncia": {
    "summary": "Le lien testé renvoie une annonce introuvable. Essayez le lien direct d’un bien encore en ligne. Vous pouvez renseigner le bien et ajouter vos photos manuellement.",
    "samples": [
      {
        "url": "https://fr.foncia.com/achat/toulouse-31300/appartement/00669388.htm",
        "label": "Appartement · Toulouse",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:21:18.353Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le lien testé renvoie une annonce introuvable. Essayez le lien direct d’un bien encore en ligne."
      },
      {
        "url": "https://fr.foncia.com/achat/toulouse-31300/appartement/00669388.htm",
        "label": "Appartement · Toulouse",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le lien testé n’était pas accessible lors de l’essai."
      }
    ]
  },
  "citya": {
    "summary": "Import complet confirmé sur l’annonce de Toulouse : prix, surface, pièces, description et 11 photos. Les fiches d’appartements à vendre de ce format sont prises en charge ; les autres formats restent à vérifier.",
    "samples": [
      {
        "url": "https://www.citya.com/annonces/vente/appartement/toulouse-31555/TAPP176-971928",
        "label": "Appartement · Toulouse",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:21:22.009Z",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 11,
        "note": "Après adaptation Citya : 240 000 €, 45 m², 2 pièces, description et 11 photos récupérées et vérifiées."
      },
      {
        "url": "https://www.citya.com/annonces/vente/appartement/toulouse-31555/TAPP176-971928",
        "label": "Appartement · Toulouse",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Les informations nécessaires n’ont pas toutes pu être vérifiées."
      }
    ]
  },
  "square-habitat": {
    "summary": "Des informations contradictoires empêchent de valider cette annonce lors du nouvel essai. Vous pouvez renseigner le bien et ajouter vos photos manuellement.",
    "samples": [
      {
        "url": "https://www.squarehabitat.fr/square-habitat-anjou-maine/annonces/biens/achat-ancien/appartement/angers/bbebaa4f-9a09-41ce-b887-9ab93ed28a73",
        "label": "Appartement · Angers",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:21:41.970Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Des informations contradictoires empêchent de valider cette annonce lors du nouvel essai."
      },
      {
        "url": "https://www.squarehabitat.fr/square-habitat-anjou-maine/annonces/biens/achat-ancien/appartement/angers/bbebaa4f-9a09-41ce-b887-9ab93ed28a73",
        "label": "Appartement · Angers",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Des informations contradictoires empêchent de valider l’annonce."
      }
    ]
  },
  "arthurimmo": {
    "summary": "Le nouvel essai ne permet toujours pas de récupérer une fiche exploitable. Vous pouvez renseigner le bien et ajouter vos photos manuellement.",
    "samples": [
      {
        "url": "https://www.arthurimmo.com/annonces/achat/appartement/nantes-44000/33839703.htm",
        "label": "Appartement · Nantes",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:21:45.243Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le nouvel essai ne permet toujours pas de récupérer une fiche exploitable."
      },
      {
        "url": "https://www.arthurimmo.com/annonces/achat/appartement/nantes-44000/33839703.htm",
        "label": "Appartement · Nantes",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "BienVu n’a pas pu récupérer cette annonce lors de l’essai."
      }
    ]
  },
  "iad": {
    "summary": "L’annonce de Lyon 4e a été importée complètement après adaptation : 8 photos et les informations du bien. Les premiers essais restent détaillés ci-dessous ; les autres annonces peuvent varier.",
    "samples": [
      {
        "url": "https://www.iadfrance.fr/annonce/appartement-vente-3-pieces-lyon-55m2/r2125326",
        "label": "Appartement · Lyon 4e · 55 m²",
        "checkedAt": "2026-10-06",
        "testedAt": "2026-10-06T15:30:09.867Z",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 8,
        "note": "Après adaptation de l’import : prix, surface, pièces et description récupérés, avec les 8 photos de la galerie vérifiées."
      },
      {
        "url": "https://www.iadfrance.fr/annonce/appartement-vente-3-pieces-lyon-55m2/r2125326",
        "label": "Appartement · Lyon 4e · 55 m²",
        "checkedAt": "2026-10-06",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "La page a été récupérée, mais l’import échoue à la lecture des informations du bien, avant de télécharger les photos.",
        "testedAt": "2026-10-06T13:59:57.615Z"
      },
      {
        "url": "https://www.iadfrance.fr/annonce/appartement-vente-3-pieces-lyon-69m2/r2060690",
        "label": "Appartement · Lyon 8e",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Les informations nécessaires n’ont pas toutes pu être vérifiées."
      }
    ]
  },
  "cesar-brutus": {
    "summary": "L’annonce testée a été importée complètement après adaptation : 12 photos et les informations du bien. Les premiers essais restent détaillés ci-dessous.",
    "samples": [
      {
        "url": "https://www.cesaretbrutus.com/bien/vente-dune-maison-de-famille-7-pieces-27165-m%c2%b2-a-limonest-mcl-10287-cesaretbrutus69/",
        "label": "Maison · Limonest · 7 pièces",
        "checkedAt": "2026-10-06",
        "testedAt": "2026-10-06T15:29:42.777Z",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 12,
        "note": "Après adaptation de l’import : prix, surface, pièces et description récupérés, avec 12 photos vérifiées. La galerie est limitée à 12 photos par import."
      },
      {
        "url": "https://www.cesaretbrutus.com/bien/vente-dune-maison-de-famille-7-pieces-27165-m%c2%b2-a-limonest-mcl-10287-cesaretbrutus69/",
        "label": "Maison · Limonest · 7 pièces",
        "checkedAt": "2026-10-06",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "La page a été récupérée, mais l’import échoue à la lecture des informations du bien, avant de télécharger les photos.",
        "testedAt": "2026-10-06T13:59:24.824Z"
      }
    ]
  },
  "remax": {
    "summary": "L’annonce testée a été importée complètement après adaptation : 12 photos et les informations du bien. Les premiers essais restent détaillés ci-dessous.",
    "samples": [
      {
        "url": "https://remax.fr/fr/mandats/vente-maison-ch3-charente-maritime---17-etaules/749351027-200",
        "label": "Maison · Étaules · 112 m²",
        "checkedAt": "2026-10-06",
        "testedAt": "2026-10-06T15:30:26.187Z",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 12,
        "note": "Après adaptation de l’import : prix, surface, 4 pièces et description récupérés, avec 12 photos de la galerie en haute résolution. La galerie est limitée à 12 photos par import."
      },
      {
        "url": "https://remax.fr/fr/mandats/vente-maison-ch3-charente-maritime---17-etaules/749351027-200",
        "label": "Maison · Étaules · 112 m²",
        "checkedAt": "2026-10-06",
        "testedAt": "2026-10-06T14:16:55.000Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Premier essai : la page a été récupérée, mais une ressource externe non prise en charge a interrompu l’import."
      }
    ]
  },
  "safti": {
    "summary": "Une annonce importée avec 9 photos. Vérifiez les informations et la galerie avant de créer votre vidéo.",
    "samples": [
      {
        "url": "https://www.safti.fr/annonces/achat/maison/villefranche-sur-saone-69400/1724083",
        "label": "Maison · Villefranche-sur-Saône",
        "checkedAt": "2026-10-07",
        "testedAt": "2026-10-07T13:45:06.292Z",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 9,
        "note": "Prix, surface habitable et nombre de pièces récupérés. Vérifiez les informations avant de créer votre vidéo."
      },
      {
        "url": "https://www.safti.fr/annonces/achat/maison/cergy-95000/1695331",
        "label": "Maison · Cergy",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Un lien de l’annonce ou de sa galerie n’est pas pris en charge par l’import."
      }
    ]
  },
  "espaces-atypiques": {
    "summary": "Une annonce importée avec 12 photos. Vérifiez les informations et la galerie avant de créer votre vidéo.",
    "samples": [
      {
        "url": "https://www.espaces-atypiques.com/ventes/69580-sathonay-village-maison-avec-jardin-au-calme-dune-impasse-15053/",
        "label": "Maison · Sathonay-Village",
        "checkedAt": "2026-10-05",
        "environment": "cloudflare",
        "outcome": "complete",
        "photos": 12,
        "note": "Informations et 12 photos récupérées et vérifiées."
      }
    ]
  },
  "figaro": {
    "summary": "Le serveur du site a refusé l’accès à l’import, y compris avec la nouvelle lecture par navigateur. Privilégiez le lien du même bien sur le site de son agence ou la saisie manuelle.",
    "samples": [
      {
        "url": "https://immobilier.lefigaro.fr/annonces/annonce-109267703.html",
        "label": "Annonce n° 109267703",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:21:50.073Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le serveur du site a refusé l’accès à l’import, y compris avec la nouvelle lecture par navigateur."
      },
      {
        "url": "https://immobilier.lefigaro.fr/annonces/annonce-109267703.html",
        "label": "Annonce n° 109267703",
        "checkedAt": "2026-09-28",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le site a refusé l’accès à l’import lors de l’essai."
      }
    ]
  },
  "seloger": {
    "summary": "Le site a de nouveau refusé l’accès à l’import lors de cet essai. Privilégiez le lien du même bien sur le site de son agence ou la saisie manuelle.",
    "samples": [
      {
        "url": "https://www.seloger.com/annonce/achat/auvergne-rhone-alpes/rhone-69/lyon-69000/26M7SYHC5MVH",
        "label": "Appartement · Lyon",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:22:03.191Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le site a de nouveau refusé l’accès à l’import lors de cet essai."
      },
      {
        "url": "https://www.seloger.com/annonce/achat/auvergne-rhone-alpes/rhone-69/lyon-69000/26M7SYHC5MVH",
        "label": "Appartement · Lyon",
        "checkedAt": "2026-09-28",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le site a refusé l’accès à l’import lors de l’essai."
      }
    ]
  },
  "leboncoin": {
    "summary": "Le site a de nouveau refusé l’accès à l’import lors de cet essai. Privilégiez le lien du même bien sur le site de son agence ou la saisie manuelle.",
    "samples": [
      {
        "url": "https://www.leboncoin.fr/ad/ventes_immobilieres/3222183771",
        "label": "Annonce n° 3222183771",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:22:06.100Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le site a de nouveau refusé l’accès à l’import lors de cet essai."
      },
      {
        "url": "https://www.leboncoin.fr/ad/ventes_immobilieres/3222183771",
        "label": "Annonce n° 3222183771",
        "checkedAt": "2026-09-28",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Le site a refusé l’accès à l’import lors de l’essai."
      }
    ]
  },
  "bienici": {
    "summary": "Les informations de l’annonce et les ressources nécessaires à sa lecture ne sont pas encore prises en charge automatiquement. Privilégiez le lien du même bien sur le site de son agence ou la saisie manuelle.",
    "samples": [
      {
        "url": "https://www.bienici.com/annonce/vente/nice/appartement/2pieces/apimo-86775374",
        "label": "Appartement · Nice",
        "checkedAt": "2026-10-08",
        "testedAt": "2026-10-08T17:22:09.188Z",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "Les informations de l’annonce et les ressources nécessaires à sa lecture ne sont pas encore prises en charge automatiquement."
      },
      {
        "url": "https://www.bienici.com/annonce/vente/nice/appartement/2pieces/apimo-86775374",
        "label": "Appartement · Nice",
        "checkedAt": "2026-09-28",
        "environment": "cloudflare",
        "outcome": "failed",
        "photos": 0,
        "note": "BienVu n’a pas pu récupérer les informations et les photos de cette annonce."
      }
    ]
  }
} satisfies Readonly<Record<CoverageSourceId, SourceCoverageEntry>>;
