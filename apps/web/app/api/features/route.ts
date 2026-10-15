import {getCloudflareContext} from '@opennextjs/cloudflare';
import {publicSiteFeaturesRequest} from '../../../lib/site-features';
export const dynamic='force-dynamic';
export async function GET(){return publicSiteFeaturesRequest((await getCloudflareContext({async:true})).env.DB);}
