import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminAiQualityRequest} from '../../../../lib/ai-quality';
export const dynamic='force-dynamic';
const handle=async(request:Request)=>adminAiQualityRequest(request,(await getCloudflareContext({async:true})).env);
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
