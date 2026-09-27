import {LOGO_MAX_BYTES} from '@bienvu/contracts';
import {agencyForUser, allowAgencyWrite} from '@bienvu/db';
import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin, boundedBytes, RequestFailure, respond} from '../../../../lib/http';
import {normalizeLogo} from '../../../../lib/logo';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return respond(async () => {
    const {env, user, agency} = await requireOwner(request);
    assertSameOrigin(request, env);
    if (!await allowAgencyWrite(env.DB, user.id, 'logo')) throw new RequestFailure('RATE_LIMITED');
    const mime = request.headers.get('content-type')?.split(';')[0] ?? '';
    const logo = await normalizeLogo(await boundedBytes(request, LOGO_MAX_BYTES), mime);
    const id = crypto.randomUUID(), key = `agencies/${agency.id}/brand/${id}/${logo.hash}.png`;
    const now = new Date().toISOString();
    // Réserver la taille dans D1 AVANT R2 : les uploads interrompus sont comptés
    // dans le plafond et restent identifiables pour un rapprochement ultérieur.
    try {
      await env.DB.prepare(`INSERT INTO media_assets(id,agency_id,kind,object_key,content_hash,mime,size_bytes,width,height,created_at)
        VALUES(?,?,'brand',?,?,'image/png',?,?,?,?)`).bind(id, agency.id, key, logo.hash, logo.bytes.length, logo.width, logo.height, now).run();
    } catch (error) {
      if (error instanceof Error && error.message.includes('LOGO_STORAGE_FULL')) throw new RequestFailure('LOGO_STORAGE_FULL');
      throw error;
    }
    await env.MEDIA.put(key, logo.bytes, {httpMetadata: {contentType: 'image/png'}});
    // Chaque version possède une clé unique. Aucun remplacement/suppression d'un
    // ancien objet : un manifeste créé avant la sauvegarde garde son apparence.
    try {
      await env.DB.prepare('UPDATE agencies SET logo_asset_id=?,updated_at=?,brand_version=brand_version+1 WHERE id=? AND owner_user_id=?')
        .bind(id, now, agency.id, user.id).run();
    } catch {
      // Un résultat D1 ambigu ne justifie pas d'effacer un objet potentiellement
      // référencé. Le rapprochement des orphelins est documenté, sans purge aveugle.
      throw new RequestFailure('INTERNAL_ERROR');
    }
    return Response.json({agency: await agencyForUser(env.DB, user.id)}, {status: 201});
  });
}
