import { getCloudflareContext } from '@opennextjs/cloudflare';
import { adminWorkspaceRequest } from '../../../../lib/admin-workspace';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return adminWorkspaceRequest(request, (await getCloudflareContext({ async: true })).env);
}
export const POST = GET;
