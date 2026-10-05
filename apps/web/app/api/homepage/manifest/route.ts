import {getCloudflareContext} from '@opennextjs/cloudflare';
import {publicHomepageManifest} from '../../../../lib/homepage-media';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(await publicHomepageManifest((await getCloudflareContext({async:true})).env.DB),{headers:{'Cache-Control':'public, max-age=60, must-revalidate','X-Content-Type-Options':'nosniff'}});}
