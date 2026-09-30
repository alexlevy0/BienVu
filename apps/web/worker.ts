// @ts-ignore Le point d'entrée OpenNext est généré au build.
import openNext from './.open-next/worker.js';
import {httpsRedirect} from './lib/https-redirect';
import {collectTraffic,purgeTraffic} from './lib/traffic';

export default {
  async fetch(request, env, ctx) {
    const response=await (httpsRedirect(request, env) ?? openNext.fetch(request, env, ctx));
    collectTraffic(request,response,env,ctx,request.cf?.country);
    return response;
  },
  async scheduled(_controller,env){await purgeTraffic(env.DB);},
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-ignore Exports OpenNext générés au build, conservés pour ses bindings internes.
export {DOQueueHandler, DOShardedTagCache, BucketCachePurge} from './.open-next/worker.js';
