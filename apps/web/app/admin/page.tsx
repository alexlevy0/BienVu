import {headers} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {requireStaff,isSuperAdmin} from '../../lib/admin-access';
import {RequestFailure} from '../../lib/http';
import {StudioFrame} from '../../components/studio-frame';
import {AdminPanel} from '../../components/admin-panel';
import '../landing.css';
import './admin.css';
import './homepage.css';
import './mailbox.css';
import './voices.css';
import './pricing.css';
import './promotions.css';
export const dynamic='force-dynamic';
export const metadata={title:'Administration — BienVu',robots:{index:false,follow:false}};
export default async function Page(){
  const {env}=await getCloudflareContext({async:true});
  let restricted=true;
  try{const user=await requireStaff(new Request(env.BETTER_AUTH_URL+'/admin',{headers:await headers()}),env);restricted=!isSuperAdmin(env,user);}
  catch(error){if(error instanceof RequestFailure){if(error.code==='UNAUTHORIZED')redirect('/connexion');notFound();}throw error;}
  return <StudioFrame active="admin" showFooter={false}><AdminPanel restricted={restricted}/></StudioFrame>;
}
