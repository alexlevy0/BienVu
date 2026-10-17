import {StudioFrame} from '../../components/studio-frame';
import {Offers} from '../../components/offers';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {billingAvailability} from '../../lib/billing';
import {seoMetadata} from '../../lib/seo';
import {StructuredData} from '../../components/structured-data';
import {creditPlans,subscriptionPricing} from '@bienvu/contracts';
import {publicFreeOffer} from '../../lib/free-offer';
import {anonymousTrialsConfigured} from '../../lib/trials';
import '../landing.css';
import './offers.css';

export const metadata = seoMetadata({title:'Tarifs BienVu — Offres mensuelles et annuelles −10 %',description:'Solo, Agence, Équipe et Réseau : 50 à 500 crédits par mois. Paiement mensuel sans engagement ou annuel avec 10 % de réduction. Report plafonné à une mensualité et essai gratuit.',path:'/abonnement'});
export const dynamic='force-dynamic';

export default async function Page({searchParams}:{searchParams:Promise<{facturation?:string}>}) {
  const interval=(await searchParams).facturation==='year'?'year':'month';
  const {env}=await getCloudflareContext({async:true});
  const freeOffer=await publicFreeOffer(env.DB,anonymousTrialsConfigured(env));
  return <StudioFrame active="offers" showFooter={false}><StructuredData data={{'@context':'https://schema.org','@type':'WebApplication',name:'BienVu',url:'https://bienvu.online',applicationCategory:'BusinessApplication',operatingSystem:'Web',offers:creditPlans.filter(plan=>plan.price>0||freeOffer?.monthlyCredits!=null).flatMap(plan=>(plan.price?(['month','year'] as const):(['month'] as const)).map(interval=>{
    const pricing=subscriptionPricing(plan.price,interval);
    return {'@type':'Offer',name:`${plan.name}${plan.price?(interval==='year'?' annuel':' mensuel'):''}`,url:'https://bienvu.online/abonnement'+(interval==='year'?'?facturation=year':''),price:String(pricing.amountCents/100),priceCurrency:'EUR',description:`${plan.price?plan.credits:freeOffer!.monthlyCredits} crédits par mois${interval==='year'?', paiement annuel en une fois, remise de 10 %':''}`,priceSpecification:{'@type':'UnitPriceSpecification',price:String(pricing.amountCents/100),priceCurrency:'EUR',valueAddedTaxIncluded:plan.price===0,unitText:interval==='year'?'an':'mois'}};
  }))}}/><Offers availability={billingAvailability(env)} initialInterval={interval} freeOffer={freeOffer}/></StudioFrame>;
}
