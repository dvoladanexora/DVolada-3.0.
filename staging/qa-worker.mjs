import api from '../backend/src/index.js';
import { qaPushAppId } from '../backend/src/qa-push-identity.js';
import { assets } from './.qa-assets.mjs';

const headers = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.onesignal.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.onesignal.com https://onesignal.com https://*.onesignal.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export default {
  async fetch(request, env) {
    const { hostname, pathname } = new URL(request.url);
    if (env.DVOLADA_QA_HOST !== hostname) return new Response(null, { status: 404 });
    if (pathname === '/health' || pathname.startsWith('/api/v1/')) return api.fetch(request, env);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    if (pathname === '/push-config') {
      const appId = qaPushAppId(request, env);
      return new Response(request.method === 'HEAD' ? null : JSON.stringify({ enabled: Boolean(appId), appId }), {
        headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    const route = ['/', '/pruebas', '/pruebas/'].includes(pathname) ? '/index.html' : pathname;
    const asset = Object.hasOwn(assets, route) ? assets[route] : null;
    if (!asset) return new Response(null, { status: 404, headers });
    const [type, compressed] = asset;
    const gzip = Uint8Array.from(atob(compressed), char => char.charCodeAt(0));
    const body = request.method === 'HEAD' ? null
      : new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(body, {
      headers: { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store',
        ...(route === '/push/onesignal/OneSignalSDKWorker.js' ? {
          'Service-Worker-Allowed': '/push/onesignal/',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.onesignal.com; connect-src 'self' https://*.onesignal.com",
        } : {}),
      },
    });
  },
};
