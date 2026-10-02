import type {Metadata} from 'next';
import Link from 'next/link';
import {LegalDocument, LegalSection} from '../../../components/legal-document';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
  description: 'Les conditions d’utilisation de BienVu : création de vidéos immobilières, compte, essai, quotas et partage public.',
  alternates: {canonical: '/conditions'},
};

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
      <p>BienVu transforme les informations et les photos d’un bien en une vidéo verticale 9:16 ou horizontale 16:9, avec une voix off française facultative et, pour les comptes disposant d’une charte, l’identité de leur agence. Vous pouvez partir d’un lien d’annonce compatible ou préparer une annonce manuellement. Le service ne propose pas d’éditeur vidéo.</p>
      <p>BienVu est le nom du projet, actuellement en accès anticipé, sans société constituée à ce jour. Vous pouvez joindre son équipe à <a href="mailto:contact@bienvu.online">contact@bienvu.online</a>.</p>
      <div className="legal-callout">Le service évolue encore. Les créations peuvent être limitées par les quotas, les contrôles de sécurité et la capacité disponible. Les abonnements payants ne sont pas encore ouverts à la souscription.</div>
    </LegalSection>
    <LegalSection {...contents[1]}>
      <p>La connexion est disponible avec Google ou avec une adresse e-mail et un mot de passe. Fournissez des informations exactes, utilisez une adresse à laquelle vous avez accès et gardez vos moyens de connexion confidentiels. La confirmation de l’adresse peut être nécessaire pour accéder à votre espace.</p>
      <p>Votre compte permet de conserver votre identité d’agence et de retrouver vos créations. Si vous agissez pour une agence, vous devez être autorisé à utiliser son nom, son logo, ses coordonnées et les annonces présentées.</p>
      <p>En cas de connexion suspecte ou pour demander la fermeture de votre compte, contactez-nous. La fermeture est traitée sur demande ; elle n’est pas encore proposée directement dans l’interface.</p>
    </LegalSection>
    <LegalSection {...contents[2]}>
      <p>Lorsqu’il est disponible, l’essai anonyme permet de générer un aperçu avec filigrane après un contrôle anti-abus. Retrouvez-le dans le même navigateur tant que sa session et ses médias n’ont pas expiré. Effacer les cookies ou changer de navigateur peut empêcher de récupérer cet essai.</p>
      <p>Pour enregistrer cette vidéo dans votre compte et télécharger la version sans filigrane, connectez-vous depuis le navigateur de l’essai et disposez d’un crédit vidéo. Cette récupération utilise un crédit ; elle ne donne pas droit à une vidéo supplémentaire hors quota.</p>
      <p>Une génération réserve un crédit. Une création terminée le consomme ; une création échouée libère son crédit. Les limites d’import, de tentatives et de génération peuvent aussi s’appliquer pour protéger le service. Le nombre de vidéos disponibles et la date de renouvellement sont indiqués dans votre espace.</p>
    </LegalSection>
    <LegalSection {...contents[3]}>
      <p>Les offres présentées sur <Link href="/abonnement">la page des abonnements</Link> sont : Gratuit, avec trois vidéos par mois ; Plus, à 19 € HT par mois pour vingt vidéos ; et Pro, à 49 € HT par mois pour soixante vidéos.</p>
      <p>Les droits réellement actifs sont ceux affichés dans votre compte. Les offres Plus et Pro sont annoncées mais leur paiement n’est pas disponible. Aucun abonnement payant ne peut être souscrit sur le site à cette date.</p>
      <p>Avant l’ouverture des paiements, les modalités de facturation, de renouvellement, de changement d’offre et de résiliation seront présentées avant toute commande. Cette page ne vaut pas confirmation d’une souscription payante.</p>
    </LegalSection>
    <LegalSection {...contents[4]}>
      <p>Vous conservez les droits dont vous disposez sur vos photos, textes, logos et autres éléments transmis. Vous autorisez BienVu et ses prestataires à les traiter dans la mesure nécessaire pour importer l’annonce, produire la narration et la vidéo, stocker les fichiers et les rendre accessibles selon vos choix.</p>
      <p>Transmettez uniquement des éléments que vous êtes autorisé à exploiter, y compris pour leur transformation en vidéo et leur publication éventuelle. Un lien accessible au public ne suffit pas à donner des droits sur les photos ou les textes de son auteur.</p>
      <p>N’ajoutez pas de contenu illicite, de données confidentielles inutiles ou d’informations sur des tiers sans autorisation. Vérifiez les faits du bien et le résultat avant de le diffuser : les traitements automatiques peuvent produire des erreurs. Vous restez responsable de l’exactitude et des mentions nécessaires à votre annonce.</p>
      <p>La compatibilité des liens dépend des sites sources et peut changer. Un import peut être refusé ou incomplet ; la saisie manuelle permet alors d’ajouter vos propres informations et photos. BienVu n’est pas affilié aux portails immobiliers cités.</p>
    </LegalSection>
    <LegalSection {...contents[5]}>
      <p>Les vidéos sont privées par défaut. Une publication volontaire dans Explorer rend la vidéo, le nom de l’agence et les informations affichées sur sa page accessibles au public, y compris aux moteurs de recherche. Ne publiez que les informations que vous souhaitez rendre publiques.</p>
      <p>Vous pouvez retirer une publication depuis Mes vidéos. Cela ferme son accès public sur BienVu, sans supprimer les copies qu’un tiers aurait déjà enregistrées ni garantir l’effacement immédiat des caches des moteurs de recherche.</p>
      <p>Les médias ont une durée de disponibilité limitée, généralement sept jours pour une création de compte et vingt-quatre heures après préparation pour un essai anonyme non récupéré. La récupération d’un essai peut prolonger ce délai : consultez la date affichée pour votre vidéo. Téléchargez et sauvegardez les fichiers utiles avant leur expiration. Les métadonnées d’historique peuvent subsister après l’expiration des médias.</p>
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
