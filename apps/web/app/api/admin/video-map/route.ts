import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminVideoMapRequest} from '../../../../lib/video-map-settings';
export const dynamic='force-dynamic';
const handle=async(request:Request)=>adminVideoMapRequest(request,(await getCloudflareContext({async:true})).env);
export const GET=handle;
export const PATCH=handle;
