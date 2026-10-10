import {getCloudflareContext} from '@opennextjs/cloudflare';
import {promotionsRequest} from '../../../../lib/subscription-promotions';
export const dynamic='force-dynamic';
export async function GET(request:Request){return promotionsRequest(request,(await getCloudflareContext({async:true})).env);}
export const POST=GET;
