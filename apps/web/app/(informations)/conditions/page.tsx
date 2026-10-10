import type {Metadata} from 'next';
import Link from 'next/link';
import {LegalDocument, LegalSection} from '../../../components/legal-document';
import {seoMetadata} from '../../../lib/seo';

export const metadata: Metadata = seoMetadata({title:'Conditions d’utilisation et crédits — BienVu',description:'Les conditions d’utilisation de BienVu : création de vidéos immobilières, compte, essai, crédits et partage public.',path:'/conditions'});

const contents = [
  {id: 'service', title: 'Le service BienVu'},
  {id: 'compte', title: 'Votre compte'},
  {id: 'essai', title: 'Essai et crédits vidéo'},
  {id: 'offres', title: 'Offres et abonnements'},
  {id: 'contenus', title: 'Vos contenus et vos droits'},
  {id: 'partage', title: 'Vidéos et partage public'},
  {id: 'disponibilite', title: 'Disponibilité et sécurité'},
  {id: 'contact', title: 'Évolution et contact'},
] as const;

export default function Page() {
  return <LegalDocument kind="conditions" title="Conditions d’utilisation" introduction="Les règles pour créer, retrouver et partager vos vidéos immobilières avec BienVu." contents={contents}>
    <LegalSection {...contents[0]}>
      <p>BienVu transforme les informations et les photos d’un bien en une vidéo verticale 9:16 ou horizontale 16:9, avec une voix off française facultative et, pour les comptes disposant d’une charte, l’identité de leur agence. Vous pouvez partir d’un lien d’annonce compatible ou préparer une annonce manuellement. L’Éditeur permet de retoucher la timeline, le cadrage des photos, les textes et le mixage audio, puis de préparer un nouvel export.</p>
      <p>BienVu est le nom du projet, actuellement en accès anticipé, sans société constituée à ce jour. Vous pouvez joindre son équipe à <a href="mailto:contact@bienvu.online">contact@bienvu.online</a>.</p>
      <div className="legal-callout">Le service évolue encore. Les créations peuvent être limitées par les quotas, les contrôles de sécurité et la capacité disponible. Les paiements sont actuellement proposés uniquement en environnement Stripe de test, sans encaissement réel.</div>
    </LegalSection>
    <LegalSection {...contents[1]}>
      <p>La connexion est disponible avec Google ou avec une adresse e-mail et un mot de passe. Fournissez des informations exactes, utilisez une adresse à laquelle vous avez accès et gardez vos moyens de connexion confidentiels. La confirmation de l’adresse peut être nécessaire pour accéder à votre espace.</p>
      <p>Votre compte permet de conserver votre identité d’agence et de retrouver vos créations. Si vous agissez pour une agence, vous devez être autorisé à utiliser son nom, son logo, ses coordonnées et les annonces présentées.</p>
      <p>En cas de connexion suspecte ou pour demander la fermeture de votre compte, contactez-nous. La fermeture est traitée sur demande ; elle n’est pas encore proposée directement dans l’interface.</p>
    </LegalSection>
    <LegalSection {...contents[2]}>
      <p>Lorsqu’il est disponible, l’essai anonyme permet de générer un aperçu avec filigrane après un contrôle anti-abus. Retrouvez-le dans le même navigateur tant que sa session est valide. Effacer les cookies ou changer de navigateur peut empêcher de récupérer cet essai.</p>
      <p>Pour enregistrer cette vidéo dans votre compte et télécharger la version sans filigrane, connectez-vous depuis le navigateur de l’essai. Les nouveaux essais disposent d’un crédit offert ; leur récupération ne débite pas les crédits mensuels du compte. Les essais réalisés sous le précédent fonctionnement conservent leur règle initiale de récupération avec un crédit.</p>
      <p>Une génération réserve 1 crédit, plus 1 crédit par photo sélectionnée pour une animation IA. L’animation IA nécessite un compte confirmé. Une vidéo terminée consomme 1 crédit. Chaque nouvelle animation réussie consomme 1 crédit et reste réutilisable pendant 90 jours pour la même photo au même format, sans second supplément. Ce crédit d’animation reste consommé si le montage échoue ; le crédit vidéo est alors restitué. Une animation échouée est remplacée par un mouvement classique et son supplément est restitué. Les crédits restitués reviennent à leur lot d’origine ; ils ne prolongent pas sa validité et n’augmentent pas un report déjà calculé. L’option Présentateur IA ajoute 1 crédit pour l’introduction et/ou la conclusion, ou 1 crédit par tranche de 10 secondes pour une présence sur toute la vidéo. Les limites d’import, de tentatives et de génération peuvent aussi s’appliquer pour protéger le service. Le solde de crédits et la date de renouvellement sont indiqués dans votre espace.</p>
    </LegalSection>
    <LegalSection {...contents[3]}>
      <p>Les offres présentées sur <Link href="/abonnement">la page des abonnements</Link> sont : Gratuit, avec 3 crédits par mois ; Solo, à 50 € HT pour 50 crédits par mois ; Agence, à 100 € HT pour 100 crédits ; Équipe, à 200 € HT pour 200 crédits ; et Réseau, à 500 € HT pour 500 crédits. Le compte gratuit doit avoir une adresse confirmée et ses crédits ne sont pas reportés. Les abonnements Plus et Pro déjà souscrits conservent leur prix, leurs quotas et leur absence de report.</p>
      <p>Les recharges ponctuelles proposées sont : 20 crédits à 20 € HT, 50 crédits à 50 € HT et 100 crédits à 100 € HT. Les achats antérieurs conservent les montants et les crédits de leur commande. Elles donnent lieu à un achat unique, sans modifier votre abonnement. Les recharges proposées sans expiration restent disponibles lors du renouvellement mensuel. Après renouvellement payé d’une nouvelle offre Solo, Agence, Équipe ou Réseau, les crédits mensuels inutilisés et non réservés sont reportés pendant un seul mois supplémentaire, dans la limite du nombre de crédits de la nouvelle mensualité. Les crédits déjà reportés ne sont pas reportés une seconde fois. Sans renouvellement payé, le report n’est pas disponible. Les crédits reportés sont consommés avant la mensualité en cours, puis les recharges les plus anciennes. Les crédits restitués après un échec reviennent dans leur solde d’origine. Le solde est crédité après confirmation du paiement par Stripe.</p>
      <p>Les droits réellement actifs sont ceux affichés dans votre compte. Le parcours Stripe de test permet de vérifier la souscription, le renouvellement des crédits et la résiliation, sans paiement réel. Utilisez uniquement les moyens de paiement de test dans ce parcours.</p>
      <p>Le parcours présente le tarif mensuel HT et demande votre accord avant ouverture de Stripe. Les abonnements se renouvellent automatiquement ; la résiliation demandée dans le portail prend effet à la fin de la période déjà payée. Le portail permet aussi de gérer les factures et le moyen de paiement. Pour changer d’offre, contactez contact@bienvu.online. L’encaissement réel reste à ouvrir après configuration des informations de facturation applicables.</p>
    </LegalSection>
    <LegalSection {...contents[4]}>
      <p>Vous conservez les droits dont vous disposez sur vos photos, textes, logos et autres éléments transmis. Vous autorisez BienVu et ses prestataires à les traiter dans la mesure nécessaire pour importer l’annonce, produire la narration et la vidéo, stocker les fichiers et les rendre accessibles selon vos choix.</p>
      <p>Transmettez uniquement des éléments que vous êtes autorisé à exploiter, y compris pour leur transformation en vidéo et leur publication éventuelle. Un lien accessible au public ne suffit pas à donner des droits sur les photos ou les textes de son auteur.</p>
      <p>N’ajoutez pas de contenu illicite, de données confidentielles inutiles ou d’informations sur des tiers sans autorisation. Vérifiez les faits du bien et le résultat avant de le diffuser : les traitements automatiques peuvent produire des erreurs. Vous restez responsable de l’exactitude et des mentions nécessaires à votre annonce.</p>
      <p>La compatibilité des liens dépend des sites sources et peut changer. Un import peut être refusé ou incomplet ; la saisie manuelle permet alors d’ajouter vos propres informations et photos. BienVu n’est pas affilié aux portails immobiliers cités.</p>
    </LegalSection>
    <LegalSection {...contents[5]}>
      <p>Vous pouvez inviter des collaborateurs dans votre agence, avec les rôles lecteur, éditeur ou administrateur. Leur accès porte sur les médias, dossiers et crédits de cette agence ; le propriétaire conserve la gestion des administrateurs.</p>
      <p>Un lien privé de validation donne accès à une version précise à son destinataire, pour la commenter ou la valider. Toute personne possédant ce lien peut l’ouvrir jusqu’à sa révocation ou son expiration. Il ne publie pas la vidéo dans Explorer.</p>
      <p>Les vidéos sont privées par défaut. Une publication volontaire dans Explorer rend la vidéo, le nom de l’agence et les informations affichées sur sa page accessibles au public, y compris aux moteurs de recherche. Ne publiez que les informations que vous souhaitez rendre publiques.</p>
      <p>Vous pouvez retirer une publication depuis Mes biens. Cela ferme son accès public sur BienVu, sans supprimer les copies qu’un tiers aurait déjà enregistrées ni garantir l’effacement immédiat des caches des moteurs de recherche.</p>
      <p>Les vidéos réussies et leurs ressources de montage sont conservées sans date d’expiration automatique. Cette règle s’applique aussi aux essais anonymes réussis ; leur récupération dans un compte nécessite une session de navigateur valide. Les fichiers déjà purgés avant cette règle ne sont pas restaurés. Vous pouvez demander la suppression de vos données à contact@bienvu.online.</p>
      <p>Les démonstrations sont identifiées comme telles. Elles peuvent présenter des biens, des agences et des visuels fictifs ; elles ne constituent pas des annonces disponibles à la vente ou à la location.</p>
    </LegalSection>
    <LegalSection {...contents[6]}>
      <p>BienVu utilise des services externes pour l’hébergement, l’import et la génération. Une panne, une maintenance ou une restriction d’un prestataire peut interrompre certaines fonctions. Le service en accès anticipé ne garantit pas une disponibilité continue ni un délai fixe de génération.</p>
      <p>N’essayez pas de contourner les quotas, de collecter les espaces privés ou de perturber le service. Un accès ou une publication peut être suspendu en cas d’abus, de risque de sécurité ou de contenu illicite. Contactez-nous pour signaler une erreur ou contester une restriction.</p>
      <p>Le traitement des données personnelles est décrit dans la <Link href="/confidentialite">politique de confidentialité</Link>.</p>
    </LegalSection>
    <LegalSection {...contents[7]}>
      <p>Ces conditions peuvent évoluer avec le service. La date figurant en haut de la page indique la version en vigueur. Une évolution importante des conditions d’utilisation sera portée à votre connaissance ; les conditions commerciales seront précisées avant l’ouverture des abonnements.</p>
      <p>Pour toute question, signalement ou demande relative à votre compte, écrivez à <a href="mailto:contact@bienvu.online">contact@bienvu.online</a>.</p>
    </LegalSection>
  </LegalDocument>;
}
