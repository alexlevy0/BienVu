import {getCloudflareContext} from '@opennextjs/cloudflare';
import {heygenWebhookRequest} from '../../../../lib/avatars';
export const dynamic='force-dynamic';
export async function POST(request:Request){return heygenWebhookRequest(request,(await getCloudflareContext({async:true})).env);}
