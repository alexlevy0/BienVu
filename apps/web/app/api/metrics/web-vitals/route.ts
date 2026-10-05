import {getCloudflareContext} from '@opennextjs/cloudflare';
import {webVitalRequest} from '../../../../lib/seo-analytics';
export async function POST(request:Request) {return webVitalRequest(request,(await getCloudflareContext({async:true})).env);}
