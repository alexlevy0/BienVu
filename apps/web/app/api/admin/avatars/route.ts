import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminAvatarRequest} from '../../../../lib/avatars';
export const dynamic='force-dynamic';
const handle=async(request:Request)=>adminAvatarRequest(request,(await getCloudflareContext({async:true})).env);
export const GET=handle;
export const PATCH=handle;
export const POST=handle;
