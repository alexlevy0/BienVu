import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond,boundedBytes} from '../../../../lib/http';
import {stripeWebhook} from '../../../../lib/billing';
export const dynamic='force-dynamic';
export async function POST(request:Request){return respond(async()=>{const {env}=await getCloudflareContext({async:true});return Response.json(await stripeWebhook(env,new TextDecoder().decode(await boundedBytes(request,262144)),request.headers.get('stripe-signature')));});}
