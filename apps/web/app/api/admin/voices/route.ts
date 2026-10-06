import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminVoicesRequest} from '../../../../lib/voices';
export const dynamic='force-dynamic';
const handle=async(request:Request)=>adminVoicesRequest(request,(await getCloudflareContext({async:true})).env);
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
