import {requireOwner} from '../../../../../lib/owner';
import {assertSameOrigin, respond} from '../../../../../lib/http';
import {publishGeneration, revokeGeneration} from '../../../../../lib/sharing';
export const dynamic = 'force-dynamic';
type Context = {params: Promise<{id: string}>};
export async function POST(request: Request, context: Context) {return respond(async () => {
  const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
  return Response.json(await publishGeneration(env, agency.id, (await context.params).id));
});}
export async function DELETE(request: Request, context: Context) {return respond(async () => {
  const {env, agency} = await requireOwner(request); assertSameOrigin(request, env);
  await revokeGeneration(env.DB, agency.id, (await context.params).id);
  return Response.json({ok: true});
});}
