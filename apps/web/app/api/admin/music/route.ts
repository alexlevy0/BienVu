import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminMusicRequest} from '../../../../lib/music-library';
export const dynamic='force-dynamic';
export async function GET(request:Request){return adminMusicRequest(request,(await getCloudflareContext({async:true})).env);}
