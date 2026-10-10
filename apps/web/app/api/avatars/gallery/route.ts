import {getCloudflareContext} from '@opennextjs/cloudflare';
import {publicAvatarGalleryRequest} from '../../../../lib/avatars';
export const dynamic='force-dynamic';
export async function GET(request:Request){return publicAvatarGalleryRequest(request,(await getCloudflareContext({async:true})).env);}
