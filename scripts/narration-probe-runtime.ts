import {join} from 'node:path';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

export function narrationProbeRuntime(directory: string) {
  // Miniflare 5 ignore les anciennes options d1Persist/r2Persist dans le
  // convertisseur v4. Un seul répertoire explicite conserve les deux bindings.
  return new Miniflare({...convertV4MiniflareOptions({modules: true,
    script: 'export default {fetch(){return new Response("private probe")}}',
    compatibilityDate: '2026-09-27', d1Databases: ['DB'], r2Buckets: ['MEDIA']}),
    resourcePersistencePath: join(directory, 'storage')});
}
