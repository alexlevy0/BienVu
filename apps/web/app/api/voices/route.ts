import {getCloudflareContext} from '@opennextjs/cloudflare';
import {publicVoiceCatalog} from '../../../lib/voices';
import {respond} from '../../../lib/http';
export const dynamic='force-dynamic';
export async function GET(){return respond(async()=>Response.json(await publicVoiceCatalog((await getCloudflareContext({async:true})).env)));}
