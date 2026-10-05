import {StudioFrame} from '../../components/studio-frame';
import {Offers} from '../../components/offers';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {billingAvailability} from '../../lib/billing';
import '../landing.css';
import './offers.css';

export const metadata = {title: 'Découvrir les offres',alternates:{canonical:'/abonnement'}};
export const dynamic='force-dynamic';

export default async function Page() {
  const {env}=await getCloudflareContext({async:true});
  return <StudioFrame active="offers" showFooter={false}><Offers availability={billingAvailability(env)}/></StudioFrame>;
}
