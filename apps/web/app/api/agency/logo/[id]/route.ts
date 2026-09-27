import {findAgencyLogo} from '@bienvu/db';
import {requireOwner} from '../../../../../lib/owner';
import {RequestFailure, respond} from '../../../../../lib/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  return respond(async () => {
    const {env, agency} = await requireOwner(request);
    const asset = await findAgencyLogo(env.DB, agency.id, (await params).id);
    if (!asset) throw new RequestFailure('NOT_FOUND');
    const object = await env.MEDIA.get(asset.objectKey);
    if (!object) throw new RequestFailure('NOT_FOUND');
    return new Response(object.body, {headers: {'Content-Type': 'image/png', 'Content-Length': String(object.size),
      'Content-Disposition': 'inline; filename="logo.png"', 'Content-Security-Policy': "default-src 'none'; sandbox"}});
  });
}
