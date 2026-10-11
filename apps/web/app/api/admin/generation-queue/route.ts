import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminGenerationQueueRequest} from '../../../../lib/generation-queue';
export const dynamic='force-dynamic';
const handle=async(request:Request)=>adminGenerationQueueRequest(request,(await getCloudflareContext({async:true})).env);
export const GET=handle;
export const PATCH=handle;
export const POST=handle;
