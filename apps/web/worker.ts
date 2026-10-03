// @ts-ignore Le point d'entrée OpenNext est généré au build.
import openNext from './.open-next/worker.js';
import {httpsRedirect} from './lib/https-redirect';
import {collectTraffic,purgeTraffic} from './lib/traffic';
import {runSocialBatch} from './lib/social-publisher';
import {cleanupSocial} from './lib/social';

export default {
  async fetch(request, env, ctx) {
    const response=await (httpsRedirect(request, env) ?? openNext.fetch(request, env, ctx));
    collectTraffic(request,response,env,ctx,request.cf?.country);
    return response;
  },
  async scheduled(controller,env){
    if(controller.cron==='23 3 * * *'){await purgeTraffic(env.DB);await cleanupSocial(env);}
    else await runSocialBatch(env);
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-ignore Exports OpenNext générés au build, conservés pour ses bindings internes.
export {DOQueueHandler, DOShardedTagCache, BucketCachePurge} from './.open-next/worker.js';
