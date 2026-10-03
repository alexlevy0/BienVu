import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond,assertSameOrigin,boundedJson} from '../../../../lib/http';
import {reviewView,reviewResponse} from '../../../../lib/agency-workspace';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){return respond(async()=>{const {env}=await getCloudflareContext({async:true});return Response.json(await reviewView(env,(await params).token));});}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){return respond(async()=>{const {env}=await getCloudflareContext({async:true});assertSameOrigin(request,env);return Response.json(await reviewResponse(env,(await params).token,await boundedJson(request)));});}
