import Link from 'next/link';
import {partnerProgram} from '@bienvu/contracts';
import {StudioFrame} from '../../components/studio-frame';
import {HomeIcon,HomeWordmark} from '../../components/home-icons';
import {PartnerSimulator} from '../../components/partner-simulator';
import {PartnerApplicationForm} from '../../components/partner-application';
import {PartnerHeroVideo} from '../../components/partner-hero-video';
import {partnerFaq} from '../../lib/partner-content';
import {seoMetadata,schemaJson,breadcrumbs} from '../../lib/seo';
import '../landing.css';
import './partenaires.css';

export const metadata=seoMetadata({title:'Programme partenaires BienVu — 15 % de commission pendant 12 mois',
  description:'Recommandez BienVu aux professionnels de l’immobilier. Recevez 15 % des paiements HT encaissés pendant 12 mois. Simulez vos commissions et candidatez.',path:'/partenaires'});
const audiences=[
  {name:'Photographes immobiliers',text:'Complétez votre offre avec une solution vidéo simple et performante.',image:'/images/partners/photographe',alt:'Un photographe réalise les photos d’un intérieur lumineux.'},
  {name:'Formateurs & consultants',text:'Recommandez un outil fiable et concret à vos communautés.',image:'/images/partners/consultante',alt:'Une consultante échange avec un professionnel de l’immobilier.'},
  {name:'Professionnels de l’immobilier',text:'Faites découvrir BienVu à vos confrères et partenaires : agences, mandataires, réseaux.',image:'/images/studio-home/paris',alt:'Un salon lumineux mis en valeur pour une présentation immobilière.'},
];
export default function PartnersPage() {
  return <StudioFrame active="create" showFooter={false}><div className="partners-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:schemaJson(breadcrumbs([{name:'BienVu',path:'/'},{name:'Programme partenaires',path:'/partenaires'}]))}}/>
    <section className="partner-hero" aria-labelledby="partner-title">
      <div className="partner-hero-copy"><p className="partner-eyebrow">LE PROGRAMME PARTENAIRES BIENVU</p>
        <h1 id="partner-title">Votre réseau.<br/><em>De nouvelles opportunités.</em></h1>
        <p className="partner-intro">Recommandez BienVu autour de vous et recevez {partnerProgram.commissionPercent} % de commission sur les paiements HT encaissés par vos clients, pendant {partnerProgram.months} mois.</p>
        <div className="partner-hero-actions"><a className="partner-button" href="#candidature">Devenir partenaire <HomeIcon name="arrow" size={18}/></a>
          <a className="partner-text-link" href="#comment-ca-marche">Comment ça marche <HomeIcon name="arrow" size={16}/></a></div>
      </div>
      <div className="partner-hero-visual"><img className="partner-hero-photo" src="/images/studio-home/paris.webp"
        srcSet="/images/studio-home/paris-640.webp 640w, /images/studio-home/paris.webp 768w"
        sizes="(max-width:800px) 92vw, (max-width:1200px) 50vw, 670px" width="768" height="1024" fetchPriority="high" alt="Un intérieur lumineux présenté en photo et en vidéo avec BienVu."/>
        <PartnerHeroVideo/><div className="partner-commission-badge"><strong>{partnerProgram.commissionPercent} %</strong><span>pour vous</span></div>
      </div>
    </section>
    <section className="partner-benefits" aria-label="Les conditions du programme">
      <div><HomeIcon name="coins" size={34}/><p><strong>{partnerProgram.commissionPercent} % de commission</strong><span>Sur les paiements HT encaissés</span></p></div>
      <div><HomeIcon name="calendar" size={34}/><p><strong>Pendant {partnerProgram.months} mois</strong><span>À partir du premier paiement<br/>du client</span></p></div>
      <div><HomeIcon name="document" size={34}/><p><strong>Des versements mensuels</strong><span>Une rémunération simple<br/>et transparente</span></p></div>
    </section>
    <section className="partner-value" aria-labelledby="partner-value-title"><div className="partner-value-copy"><h2 id="partner-value-title">Votre réseau<br/>a de la valeur.</h2>
      <p>Photographes, formateurs, consultants ou professionnels de l’immobilier : recommandez BienVu à votre réseau et générez un revenu récurrent, simplement.</p></div><PartnerSimulator/></section>
    <section className="partner-how" id="comment-ca-marche" aria-labelledby="partner-how-title"><div className="partner-section-heading"><h2 id="partner-how-title">Comment ça marche ?</h2>
      <p>Un programme simple pour valoriser votre réseau<br/>tout en aidant les professionnels de l’immobilier à mieux communiquer.</p></div>
      <ol className="partner-steps"><li><span>01</span><h3>Recommandez</h3><p>Parlez de BienVu à votre réseau de professionnels de l’immobilier : photographes, agences, clients, contacts…</p></li>
        <li><span>02</span><h3>Ils deviennent clients</h3><p>Vos contacts commencent à utiliser BienVu. Notre équipe valide manuellement les clients que vous avez recommandés.</p></li>
        <li><span>03</span><h3>Vous êtes rémunéré</h3><p>Vous recevez {partnerProgram.commissionPercent} % de commission sur les paiements HT encaissés, pendant {partnerProgram.months} mois, par versements mensuels.</p></li></ol>
    </section>
    <section className="partner-audiences" aria-labelledby="partner-audiences-title"><div className="partner-section-heading"><h2 id="partner-audiences-title">Un programme pour votre réseau.</h2>
      <p>BienVu s’adresse aux professionnels qui accompagnent<br/>au quotidien les acteurs de l’immobilier.</p></div>
      <div className="partner-audience-grid">{audiences.map((audience,index)=><article key={audience.name}>
        <img src={audience.image+(index===2?'-640.webp':'-800.webp')} srcSet={index===2?`${audience.image}-320.webp 320w, ${audience.image}-640.webp 640w`:`${audience.image}-400.webp 400w, ${audience.image}-800.webp 800w`}
          sizes="(max-width:600px) 90vw, (max-width:1000px) 30vw, 350px" width={index===2?640:800} height={index===2?853:348} loading="lazy" alt={audience.alt}/>
        <h3>{audience.name}</h3><p>{audience.text}</p></article>)}</div>
    </section>
    <section className="partner-faq" aria-labelledby="partner-faq-title"><div className="partner-section-heading"><h2 id="partner-faq-title">Les réponses à vos questions.</h2>
      <p>Tout ce qu’il faut savoir sur le programme partenaire.</p></div>
      {partnerFaq.map(item=><details key={item.question}><summary>{item.question}<HomeIcon name="chevron" size={18}/></summary><p>{item.answer}</p></details>)}
      <details id="conditions-programme" className="partner-program-conditions"><summary>Conditions du programme<HomeIcon name="chevron" size={18}/></summary>
        <p>Votre candidature est étudiée par notre équipe. Elle ne vaut pas acceptation automatique au programme. Les recommandations et l’attribution de chaque client sont validées manuellement.</p>
        <p>Pour une recommandation validée, la commission est de {partnerProgram.commissionPercent} % des paiements HT effectivement encaissés, pendant {partnerProgram.months} mois à compter du premier paiement du client, avec des versements mensuels. L’utilisation gratuite de BienVu ne génère pas de commission.</p>
        <p>Le simulateur fournit une estimation indicative. Notre équipe vous précise les modalités de participation et de versement avant de confirmer votre partenariat. <a href="mailto:contact@bienvu.online">Contactez-nous</a> pour toute question.</p>
      </details>
    </section>
    <section className="partner-application" id="candidature" aria-labelledby="partner-application-title"><div className="partner-application-copy"><h2 id="partner-application-title">Rejoignez le programme partenaire.</h2>
      <p>Remplissez le formulaire pour commencer.<br/>Notre équipe vous recontacte rapidement.</p></div><PartnerApplicationForm/></section>
    <footer className="partner-footer"><Link href="/" aria-label="BienVu, accueil"><HomeWordmark/></Link><nav aria-label="Informations du programme partenaires">
      <a href="#conditions-programme">Conditions du programme</a><Link href="/confidentialite">Confidentialité</Link><a href="mailto:contact@bienvu.online">Contact</a></nav></footer>
  </div></StudioFrame>;
}
