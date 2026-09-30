import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminRequest} from '../../../lib/admin';
export const dynamic='force-dynamic';
export async function GET(request:Request){return adminRequest(request,(await getCloudflareContext({async:true})).env);}
export const POST=GET;
