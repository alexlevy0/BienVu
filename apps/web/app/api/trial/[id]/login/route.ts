import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../lib/http';
import {trialLoginIntent,trialResponse} from '../../../../../lib/trials';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return respond(()=>trialResponse(async()=>trialLoginIntent(request,(await getCloudflareContext({async:true})).env,(await params).id)));}
