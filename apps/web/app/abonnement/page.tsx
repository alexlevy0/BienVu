import {StudioFrame} from '../../components/studio-frame';
import {Offers} from '../../components/offers';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {billingAvailability} from '../../lib/billing';
import {seoMetadata} from '../../lib/seo';
import {StructuredData} from '../../components/structured-data';
import {creditPlans} from '@bienvu/contracts';
import '../landing.css';
import './offers.css';

export const metadata = seoMetadata({title:'Tarifs BienVu — 1 € HT par crédit, offres dès 50 €/mois',description:'Solo, Agence, Équipe et Réseau : 50 à 500 crédits par mois, à 1 € HT par crédit. Report plafonné à une mensualité, recharges sans expiration et essai gratuit.',path:'/abonnement'});
export const dynamic='force-dynamic';

export default async function Page() {
  const {env}=await getCloudflareContext({async:true});
  return <StudioFrame active="offers" showFooter={false}><StructuredData data={{'@context':'https://schema.org','@type':'WebApplication',name:'BienVu',url:'https://bienvu.online',applicationCategory:'BusinessApplication',operatingSystem:'Web',offers:creditPlans.map(plan=>({'@type':'Offer',name:plan.name,url:'https://bienvu.online/abonnement',price:String(plan.price),priceCurrency:'EUR',description:`${plan.credits} crédits par mois`,priceSpecification:{'@type':'UnitPriceSpecification',price:String(plan.price),priceCurrency:'EUR',valueAddedTaxIncluded:plan.price===0,unitText:'mois'}}))}}/><Offers availability={billingAvailability(env)}/></StudioFrame>;
}
