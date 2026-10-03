import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../../../lib/http';
import {reviewVideo} from '../../../../../lib/agency-workspace';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){return respond(async()=>{const {env}=await getCloudflareContext({async:true});return reviewVideo(env,request,(await params).token);});}
export const HEAD=GET;
