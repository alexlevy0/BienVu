// @ts-ignore Le point d'entrée OpenNext est généré au build.
import openNext from './.open-next/worker.js';
import {httpsRedirect} from './lib/https-redirect';
import {collectTraffic,purgeTraffic} from './lib/traffic';
import {collectSeo,purgeSeo} from './lib/seo-analytics';
import {runSocialBatch} from './lib/social-publisher';
import {cleanupSocial} from './lib/social';
import {cleanupHomepageAssets} from './lib/homepage-media';
import {sendMailboxOutbox,cleanupMailUploads} from './lib/mailbox';
import {cleanupPartnerApplications,purgeAiQuality} from '@bienvu/db';
import {runAiQualityBatch} from './lib/ai-quality';
import {withServerErrorTracking,captureServerException} from './lib/error-tracking-server';

export default {
  async fetch(request, env, ctx) {
   return withServerErrorTracking(request,env,ctx,async()=>{try{
    const response=await (httpsRedirect(request, env) ?? openNext.fetch(request, env, ctx));
    collectTraffic(request,response,env,ctx,request.cf?.country);
    collectSeo(request,response,env,ctx);
    return response;
   }catch(error){captureServerException(error,{source:'worker'});throw error;}});
  },
  async scheduled(controller,env,ctx){
   return withServerErrorTracking(null,env,ctx,async()=>{try{
    if(controller.cron==='23 3 * * *'){await purgeTraffic(env.DB);await purgeSeo(env.DB);await cleanupSocial(env);await cleanupHomepageAssets(env);await cleanupMailUploads(env);await cleanupPartnerApplications(env.DB);await purgeAiQuality(env.DB);}
    else await Promise.all([runSocialBatch(env),sendMailboxOutbox(env),runAiQualityBatch(env)]);
   }catch(error){captureServerException(error,{source:'scheduled'});throw error;}});
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-ignore Exports OpenNext générés au build, conservés pour ses bindings internes.
export {DOQueueHandler, DOShardedTagCache, BucketCachePurge} from './.open-next/worker.js';
