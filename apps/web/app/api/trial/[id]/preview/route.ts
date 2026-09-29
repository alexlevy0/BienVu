import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../lib/http';
import {trialPreview,trialResponse} from '../../../../../lib/trials';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return respond(()=>trialResponse(async()=>trialPreview(request,(await getCloudflareContext({async:true})).env,(await params).id)));}
export const HEAD=GET;
