import api from '../backend/src/index.js';
import { qaPushAppId } from '../backend/src/qa-push-identity.js';
import { drainQaOrderPush, qaOrderPushConfigured } from '../backend/src/qa-order-push.js';
import { assets } from './.qa-assets.mjs';

const headers = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.onesignal.com https://api.onesignal.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.onesignal.com https://onesignal.com https://*.onesignal.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export default {
  async scheduled(_event, env) {
    if (env.QA_PUSH_ALLOWED === 'true') await drainQaOrderPush(env);
  },
  async fetch(request, env, ctx) {
    const { hostname, pathname } = new URL(request.url);
    if (env.DVOLADA_QA_HOST !== hostname) return new Response(null, { status: 404 });
    if (pathname === '/health' || pathname.startsWith('/api/v1/')) {
      if (pathname === '/api/v1/push/identity' && env.QA_PUSH_ALLOWED !== 'true')
        return new Response(JSON.stringify({ error: 'PUSH_SETUP_PENDING' }), {
          status: 503, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      const response = await api.fetch(request, env);
      if (env.QA_PUSH_ALLOWED === 'true' && response.ok && ['POST','PATCH'].includes(request.method) &&
          /^\/api\/v1\/(customer|restaurant|courier)\/orders(?:\/|$)/.test(pathname) &&
          qaOrderPushConfigured(env)) {
        ctx.waitUntil(drainQaOrderPush(env));
      }
      return response;
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    if (pathname === '/push-config') {
      const appId = env.QA_PUSH_ALLOWED === 'true' ? qaPushAppId(request, env) : null;
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
      headers: { ...headers, 'Content-Type': type,
        'Cache-Control': route.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
        ...(route === '/push/onesignal/OneSignalSDKWorker.js' ? {
          'Service-Worker-Allowed': '/push/onesignal/',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.onesignal.com; connect-src 'self' https://*.onesignal.com",
        } : {}),
      },
    });
  },
};
