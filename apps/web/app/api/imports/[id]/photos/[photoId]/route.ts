import {requireOwner} from '../../../../../../lib/owner';
import {respond} from '../../../../../../lib/http';
import {privateImportPhoto} from '../../../../../../lib/imports';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: {params: Promise<{id: string; photoId: string}>}) {
  return respond(async () => {const {env, agency} = await requireOwner(request); const {id, photoId} = await context.params;
    return privateImportPhoto(env, agency.id, id, photoId);});
}
