import {getCloudflareContext} from '@opennextjs/cloudflare';
import {adminHomepageRequest} from '../../../../lib/homepage-media';
export const dynamic='force-dynamic';
export async function GET(request:Request){return adminHomepageRequest(request,(await getCloudflareContext({async:true})).env);}
export const POST=GET;
