import {getCloudflareContext} from '@opennextjs/cloudflare';
import {publicAvatarRequest} from '../../../lib/avatars';
export const dynamic='force-dynamic';
export async function GET(){return publicAvatarRequest((await getCloudflareContext({async:true})).env);}
