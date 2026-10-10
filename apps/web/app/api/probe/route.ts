import {cookies} from 'next/headers';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {timingSafeEqual} from 'node:crypto';
import {publicFailure} from '@bienvu/contracts';
import {requestContext, logDiagnostic} from '@bienvu/observability';
import {captureServerException} from '../../../lib/error-tracking-server';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
async function context(request: Request) {
  const {env} = await getCloudflareContext({async: true});
  const expected = env.PROBE_TOKEN;
  const received = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!expected || expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(received) || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return null;
  return env;
}
async function post(request: Request) {
  const env = await context(request);
  if (!env) return reply({error:'UNAUTHORIZED'}, 401);
  const jar = await cookies();
  const previous = jar.get('bienvu_probe')?.value;
  if (previous) {
    const old = await env.DB.prepare('SELECT object_key FROM probe_sessions WHERE id = ?').bind(previous).first<{object_key:string}>();
    if (old) await env.MEDIA.delete(old.object_key);
    await env.DB.prepare('DELETE FROM probe_sessions WHERE id = ?').bind(previous).run();
  }
  const id = crypto.randomUUID();
  const objectKey = `probes/sessions/${id}.json`;
  const value = {id, createdAt:new Date().toISOString(), mode:env.PROBE_MODE};
  await env.MEDIA.put(objectKey, JSON.stringify(value), {httpMetadata:{contentType:'application/json'}});
  try {
    await env.DB.prepare('INSERT INTO probe_sessions (id, created_at, expires_at, object_key) VALUES (?, ?, ?, ?)').bind(id,value.createdAt,Date.now()+600_000,objectKey).run();
  } catch (error) {await env.MEDIA.delete(objectKey); throw error;}
  jar.set('bienvu_probe', id, {httpOnly:true, secure:true, sameSite:'strict', path:'/', maxAge:600});
  return reply({ok:true, mode:env.PROBE_MODE, d1:'written', r2:'written', cookie:'issued'},201);
}
async function get(request: Request) {
  const env = await context(request);
  if (!env) return reply({error:'UNAUTHORIZED'},401);
  const id = (await cookies()).get('bienvu_probe')?.value;
  if (!id) return reply({error:'COOKIE_REQUIRED'},401);
  const row = await env.DB.prepare('SELECT object_key FROM probe_sessions WHERE id = ? AND expires_at > ?').bind(id,Date.now()).first<{object_key:string}>();
  if (!row) return reply({error:'SESSION_NOT_FOUND'},404);
  const object = await env.MEDIA.get(row.object_key);
  if (!object) return reply({error:'OBJECT_NOT_FOUND'},500);
  const stored = await object.json<{id:string}>();
  return reply({ok:stored.id===id, mode:env.PROBE_MODE, d1:'read', r2:'read', cookie:'read'});
}
async function remove(request: Request) {
  const env = await context(request);
  if (!env) return reply({error:'UNAUTHORIZED'},401);
  const jar = await cookies(); const id = jar.get('bienvu_probe')?.value;
  if (id) {
    const row = await env.DB.prepare('SELECT object_key FROM probe_sessions WHERE id = ?').bind(id).first<{object_key:string}>();
    if (row) await env.MEDIA.delete(row.object_key);
    await env.DB.prepare('DELETE FROM probe_sessions WHERE id = ?').bind(id).run();
  }
  jar.delete('bienvu_probe');
  return reply({ok:true, cleaned:true});
}

async function observed(action: (request: Request) => Promise<Response>, request: Request) {
  const trace = requestContext();
  try {
    const response = await action(request);
    response.headers.set('X-Request-ID', trace.requestId);
    logDiagnostic(trace, {event: 'request_completed', status: response.status});
    return response;
  } catch (error) {
    captureServerException(error,{source:'api',requestId:trace.requestId,path:'/api/probe'});
    const failure = publicFailure('INTERNAL_ERROR', trace.requestId);
    logDiagnostic(trace, {event: 'request_failed', status: 500, code: 'INTERNAL_ERROR'});
    return Response.json(failure.body, {status: 500, headers: {'Cache-Control': 'no-store', 'X-Request-ID': trace.requestId}});
  }
}
export const POST = (request: Request) => observed(post, request);
export const GET = (request: Request) => observed(get, request);
export const DELETE = (request: Request) => observed(remove, request);
