import {betaGate} from '../backend/src/beta-gate.js';
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
    if (!env.DVOLADA_BETA_HOST && !env.BETA_DB && env.QA_PUSH_ALLOWED === 'true') await drainQaOrderPush(env);
  },
  async fetch(request, env, ctx) {
    const { hostname, pathname, protocol, searchParams } = new URL(request.url);
    const qa = hostname === 'dvolada-qa.dvoladanexora.workers.dev' && env.DVOLADA_QA_HOST === hostname;
    const betaHost = hostname === 'dvolada-beta.dvoladanexora.workers.dev';
    if (betaHost) {
      if (protocol !== 'https:' || env.DVOLADA_BETA_HOST !== hostname || !env.BETA_DB) return new Response(null,{status:404});
      const denied = await betaGate(request,env.BETA_DB);
      if (denied) return denied;
      if (request.headers.has('authorization') || /^\/pruebas(?:\/|$)/.test(pathname)) return new Response(null,{status:403});
      env = {...env, DB:env.BETA_DB, DVOLADA_ONLINE_HOST:hostname, CLIENT_PASSKEYS_ENABLED:'true',
        QA_PUSH_ALLOWED:'false', QA_CLIENT_ACCESS:'false', QA_RESTAURANT_COMMERCIAL:'true'};
    }
    const production = !betaHost && !qa && hostname !== 'dvolada-qa.dvoladanexora.workers.dev' &&
      env.DVOLADA_ONLINE_HOST === hostname && env.DVOLADA_ONLINE_SERVE === 'true';
    if (protocol !== 'https:' || (!betaHost && !qa && !production) || (production && /^\/pruebas(?:\/|$)/.test(pathname))) return new Response(null, { status: 404 });
    if (production) env = {...env, QA_CLIENT_ACCESS:'false', QA_PUSH_ALLOWED:'false',
      QA_FLASH:env.FLASH_ENABLED, QA_RESTAURANT_COMMERCIAL:env.RESTAURANT_COMMERCIAL_ENABLED};
    if (production && request.headers.has('authorization') && pathname.startsWith('/api/v1/'))
      return new Response(JSON.stringify({error:'SESSION_REQUIRED'}),{
        status:401,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'},
      });
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
    const route = ['/', '/cuenta', '/cuenta/', '/pruebas', '/pruebas/'].includes(pathname) ? '/index.html' : pathname;
    const asset = Object.hasOwn(assets, route) ? assets[route] : null;
    if (!asset) return new Response(null, { status: 404, headers });
    const [type, compressed] = asset;
    const gzip = Uint8Array.from(atob(compressed), char => char.charCodeAt(0));
    const body = request.method === 'HEAD' ? null
      : new Blob([gzip]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(body, {
      headers: { ...headers, 'Content-Type': type,
        ...(qa&&route==='/index.html'&&['/cuenta','/cuenta/'].includes(pathname)&&searchParams.get('panel')==='control'?{
          'Cross-Origin-Opener-Policy':'same-origin-allow-popups',
          'Content-Security-Policy': headers['Content-Security-Policy'].replace("script-src 'self'","script-src 'self' https://accounts.google.com/gsi/client").replace("style-src 'self'","style-src 'self' https://accounts.google.com/gsi/style").replace("connect-src 'self'","connect-src 'self' https://accounts.google.com/gsi/").replace("frame-ancestors 'none'","frame-src https://accounts.google.com/gsi/; frame-ancestors 'none'")
        }:{}),
        'Cache-Control': route.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store',
        ...(route === '/push/onesignal/OneSignalSDKWorker.js' ? {
          'Service-Worker-Allowed': '/push/onesignal/',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.onesignal.com; connect-src 'self' https://*.onesignal.com",
        } : {}),
      },
    });
  },
};
