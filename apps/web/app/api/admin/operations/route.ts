import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminOperationsRequest} from '../../../../lib/admin-operations';
export const dynamic='force-dynamic';
export async function GET(request:Request){return adminOperationsRequest(request,(await getCloudflareContext({async:true})).env);}
export const POST=GET;
