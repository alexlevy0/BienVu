// @ts-expect-error Le point d'entrée OpenNext est généré au build.
import openNext from './.open-next/worker.js';
import { httpsRedirect } from './lib/https-redirect';
import { betaHomepageRedirect } from './lib/beta-homepage';
import { collectTraffic, purgeTraffic } from './lib/traffic';
import { collectSeo, purgeSeo } from './lib/seo-analytics';
import { runSocialBatch } from './lib/social-publisher';
import { cleanupSocial } from './lib/social';
import { cleanupHomepageAssets } from './lib/homepage-media';
import { sendMailboxOutbox, cleanupMailUploads } from './lib/mailbox';
import { cleanupPartnerApplications, purgeAiQuality } from '@bienvu/db';
import { runAiQualityBatch } from './lib/ai-quality';
import { sendShowcaseNotifications } from './lib/showcase-contacts';
import { cleanupShowcases, protectShowcaseResponse } from './lib/showcase-maintenance';
import { cleanupPushDevices } from '@bienvu/db';
import { sendGenerationNotifications } from '@bienvu/notifications';
import { withServerErrorTracking, captureServerException } from './lib/error-tracking-server';
import { runAdminAlerts } from './lib/admin-alerts';
import { runScheduledTasks } from '@bienvu/observability';

export default {
  async fetch(request, env, ctx) {
    return withServerErrorTracking(request, env, ctx, async () => {
      try {
        const response = protectShowcaseResponse(
          request,
          await (betaHomepageRedirect(request) ?? httpsRedirect(request, env) ?? openNext.fetch(request, env, ctx)),
        );
        collectTraffic(request, response, env, ctx, request.cf?.country);
        collectSeo(request, response, env, ctx);
        return response;
      } catch (error) {
        captureServerException(error, { source: 'worker' });
        throw error;
      }
    });
  },
  async scheduled(controller, env) {
    if (controller.cron === '23 3 * * *') {
      // Preserve purge order and bounded D1 pressure, even after a task fails.
      await runScheduledTasks('web', env, [
        { name: 'purge_traffic', run: () => purgeTraffic(env.DB) },
        { name: 'purge_seo', run: () => purgeSeo(env.DB) },
        { name: 'cleanup_social', run: () => cleanupSocial(env) },
        { name: 'cleanup_homepage_assets', run: () => cleanupHomepageAssets(env) },
        { name: 'cleanup_mail_uploads', run: () => cleanupMailUploads(env) },
        { name: 'cleanup_partner_applications', run: () => cleanupPartnerApplications(env.DB) },
        { name: 'purge_ai_quality', run: () => purgeAiQuality(env.DB) },
        { name: 'cleanup_showcases', run: () => cleanupShowcases(env) },
        { name: 'cleanup_push_devices', run: () => cleanupPushDevices(env.DB) },
      ]);
    } else {
      await runScheduledTasks(
        'web',
        env,
        [
          { name: 'run_social_batch', run: () => runSocialBatch(env) },
          { name: 'send_mailbox_outbox', run: () => sendMailboxOutbox(env) },
          { name: 'run_ai_quality_batch', run: () => runAiQualityBatch(env) },
          { name: 'send_showcase_notifications', run: () => sendShowcaseNotifications(env) },
          { name: 'send_generation_notifications', run: () => sendGenerationNotifications(env) },
          { name: 'run_admin_alerts', run: () => runAdminAlerts(env) },
        ],
        { parallel: true },
      );
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;

// @ts-expect-error Exports OpenNext générés au build, conservés pour ses bindings internes.
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js';
