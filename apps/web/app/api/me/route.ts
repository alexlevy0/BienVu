import {Me} from '@bienvu/contracts';
import {requireOwner} from '../../../lib/owner';
import {respond} from '../../../lib/http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return respond(async () => {
    const {env, user, agency} = await requireOwner(request);
    const trial = await env.DB.prepare('SELECT consumed_at FROM trial_claims WHERE owner_user_id=?').bind(user.id)
      .first<{consumed_at: string | null}>();
    return Response.json(Me.parse({user: {id: user.id, name: user.name, email: user.email}, agency,
      rights: {generationEnabled: false, trial: trial?.consumed_at ? 'used' : 'eligible', watermarked: true}}));
  });
}
