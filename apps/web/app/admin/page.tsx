import {headers} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {requireAdmin} from '../../lib/admin-access';
import {RequestFailure} from '../../lib/http';
import {StudioFrame} from '../../components/studio-frame';
import {AdminPanel} from '../../components/admin-panel';
import '../landing.css';
import './admin.css';
import './homepage.css';
export const dynamic='force-dynamic';
export const metadata={title:'Super admin — BienVu',robots:{index:false,follow:false}};
export default async function Page(){
  const {env}=await getCloudflareContext({async:true});
  try{await requireAdmin(new Request(env.BETTER_AUTH_URL+'/admin',{headers:await headers()}),env);}
  catch(error){if(error instanceof RequestFailure){if(error.code==='UNAUTHORIZED')redirect('/connexion');notFound();}throw error;}
  return <StudioFrame active="admin" showFooter={false}><AdminPanel/></StudioFrame>;
}
