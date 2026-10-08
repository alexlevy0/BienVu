import {getCloudflareContext} from '@opennextjs/cloudflare';
import {analyticsConfiguration} from '../../../../lib/analytics-policy';

export async function GET(){
  const {env}=await getCloudflareContext({async:true});
  const config=analyticsConfiguration(env as {POSTHOG_ENABLED?:string;POSTHOG_PROJECT_TOKEN?:string;POSTHOG_HOST?:string});
  // This is the public ingestion token, never a personal API key or an OAuth credential.
  return Response.json(config.enabled?config:{enabled:false},{headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
}
