import {generationRights} from '@bienvu/db';
import {Me} from '@bienvu/contracts';
import {requireOwner} from '../../../lib/owner';
import {respond} from '../../../lib/http';
import {isSuperAdmin} from '../../../lib/admin-access';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return respond(async () => {
    const {env, user, agency} = await requireOwner(request);
    const trial = await env.DB.prepare('SELECT consumed_at FROM trial_claims WHERE owner_user_id=?').bind(user.id)
      .first<{consumed_at: string | null}>();
    const rights=await generationRights(env.DB,agency.id,env.GENERATIONS_ENABLED);
    return Response.json(Me.parse({isSuperAdmin:isSuperAdmin(env,user),user: {id: user.id, name: user.name, email: user.email}, agency,
      rights: {...rights, trial: trial?.consumed_at ? 'used' : 'eligible', watermarked: rights.creditKind==='trial'||rights.creditKind===null}}));
  });
}
