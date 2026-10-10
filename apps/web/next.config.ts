import type {NextConfig} from 'next';
const config: NextConfig = {
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
export default config;
