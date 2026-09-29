import {requireOwner} from '../../../../lib/owner';
import {respond} from '../../../../lib/http';
import {ownerShares} from '../../../../lib/sharing';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {return respond(async () => {
  const {env, agency} = await requireOwner(request);
  return Response.json({shares: await ownerShares(env.DB, agency.id)});
});}
