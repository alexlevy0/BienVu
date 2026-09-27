import {AgencyUpdate} from '@bienvu/contracts';
import {allowAgencyWrite, updateAgency} from '@bienvu/db';
import {requireOwner} from '../../../lib/owner';
import {assertSameOrigin, boundedJson, RequestFailure, respond} from '../../../lib/http';
export const dynamic = 'force-dynamic';
export async function PUT(request: Request) {
  return respond(async () => {
    const {env, user} = await requireOwner(request);
    assertSameOrigin(request, env);
    if (!await allowAgencyWrite(env.DB, user.id, 'brand')) throw new RequestFailure('RATE_LIMITED');
    const parsed = AgencyUpdate.safeParse(await boundedJson(request));
    if (!parsed.success) throw new RequestFailure('VALIDATION_ERROR', Object.fromEntries(parsed.error.issues.map(issue =>
      [String(issue.path[0] ?? 'form'), issue.code === 'unrecognized_keys' ? 'Ce champ ne peut pas être modifié.' : issue.message])));
    return Response.json({agency: await updateAgency(env.DB, user.id, parsed.data)});
  });
}
