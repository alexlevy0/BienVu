import {getCloudflareContext} from '@opennextjs/cloudflare';
import {respond} from '../../../lib/http';
import {listPublic} from '../../../lib/sharing';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return respond(async () => {
  const {env} = await getCloudflareContext({async: true});
  const params = new URL(request.url).searchParams;
  return Response.json(await listPublic(env.DB, params.get('cursor') ?? undefined,
    {query: params.get('q') ?? '', category: (params.get('category') ?? 'all') as 'all' | 'apartments' | 'houses' | 'exceptional',
      sort: (params.get('sort') ?? 'newest') as 'newest' | 'oldest'}));
});}
