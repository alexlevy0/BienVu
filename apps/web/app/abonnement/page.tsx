import {StudioFrame} from '../../components/studio-frame';
import {Offers} from '../../components/offers';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {billingAvailability} from '../../lib/billing';
import {seoMetadata} from '../../lib/seo';
import {StructuredData} from '../../components/structured-data';
import '../landing.css';
import './offers.css';

export const metadata = seoMetadata({title:'Tarifs BienVu — Abonnements et crédits vidéo immobilière',description:'Comparez les offres BienVu : 3 crédits gratuits, Plus à 19 € HT avec 40 crédits et Pro à 49 € HT avec 120 crédits par mois. Recharges sans expiration.',path:'/abonnement'});
export const dynamic='force-dynamic';

export default async function Page() {
  const {env}=await getCloudflareContext({async:true});
  return <StudioFrame active="offers" showFooter={false}><StructuredData data={{'@context':'https://schema.org','@type':'WebApplication',name:'BienVu',url:'https://bienvu.online',applicationCategory:'BusinessApplication',operatingSystem:'Web',offers:[
    {name:'Gratuit',price:0,credits:3},{name:'Plus',price:19,credits:40},{name:'Pro',price:49,credits:120}
  ].map(plan=>({'@type':'Offer',name:plan.name,url:'https://bienvu.online/abonnement',price:String(plan.price),priceCurrency:'EUR',description:`${plan.credits} crédits par mois`,priceSpecification:{'@type':'UnitPriceSpecification',price:String(plan.price),priceCurrency:'EUR',valueAddedTaxIncluded:plan.price===0,unitText:'mois'}}))}}/><Offers availability={billingAvailability(env)}/></StudioFrame>;
}
