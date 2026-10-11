import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../lib/http';
import {recordShowcaseEvent} from '../../../../../lib/showcase-contacts';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){return respond(async()=>{const{env,cf}=await getCloudflareContext({async:true});return recordShowcaseEvent(request,env,(await params).slug,Boolean(cf?.colo));});}
