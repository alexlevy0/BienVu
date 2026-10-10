import type {NextConfig} from 'next';
import {withPostHogConfig} from '@posthog/nextjs-config';
const release=process.env.BIENVU_RELEASE??process.env.GITHUB_SHA??'development';
const config: NextConfig = {
  env:{NEXT_PUBLIC_BIENVU_RELEASE:release},
  poweredByHeader: false,
  transpilePackages: ['@bienvu/contracts', '@bienvu/db', '@bienvu/observability', '@bienvu/importers', '@bienvu/maps'],
  async redirects() {return [{source:'/studio',destination:'/',permanent:true},{source:'/generer',destination:'/',permanent:true}];},
  async headers() {
    return [{source: '/:path*', headers: [
      {key: 'X-Content-Type-Options', value: 'nosniff'},
      {key: 'Referrer-Policy', value: 'no-referrer'},
      {key: 'X-Frame-Options', value: 'DENY'},
      {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
    ]},{source:'/api/admin/mailbox/messages/:messageId/html',headers:[{key:'X-Frame-Options',value:'SAMEORIGIN'}]}];
  },
};
// Upload credentials are build-only, never a browser variable or Worker binding.
export default process.env.POSTHOG_PERSONAL_API_KEY?withPostHogConfig(config,{
  personalApiKey:process.env.POSTHOG_PERSONAL_API_KEY,projectId:'299212',host:'https://eu.posthog.com',
  sourcemaps:{enabled:true,releaseName:'bienvu-web',releaseVersion:release,deleteAfterUpload:true},
}):config;
