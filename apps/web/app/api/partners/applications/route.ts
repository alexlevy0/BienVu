import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../lib/http';
import {partnerApplicationConfig,submitPartnerApplication} from '../../../../lib/partners';
export const dynamic='force-dynamic';
export async function GET(){return respond(async()=>partnerApplicationConfig((await getCloudflareContext({async:true})).env));}
export async function POST(request:Request){return respond(async()=>{const {env,cf}=await getCloudflareContext({async:true});return submitPartnerApplication(request,env,Boolean(cf?.colo));});}
