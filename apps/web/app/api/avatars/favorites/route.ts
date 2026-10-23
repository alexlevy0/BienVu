import { getCloudflareContext } from '@opennextjs/cloudflare';
import { avatarFavoritesRequest } from '../../../../lib/avatar-favorites';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return avatarFavoritesRequest(request, (await getCloudflareContext({ async: true })).env);
}
export async function PUT(request: Request) {
  return avatarFavoritesRequest(request, (await getCloudflareContext({ async: true })).env);
}
