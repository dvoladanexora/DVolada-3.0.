import {bindings,defineConfig} from 'cf/config';
import * as entrypoint from './src/index.js' with {type:'cf-worker'};

// No Cloudflare account ID, database IDs, API tokens or secrets are committed.
// Use --mode staging for isolated testing. Default mode remains locked for real orders.
export default defineConfig(({mode})=>{
 const isStaging=mode==='staging';
 return {
  worker:{
   name:isStaging?'dvolada-api-staging':'dvolada-api',
   entrypoint,
   compatibilityDate:'2026-11-20',
   workersDev:true,
   observability:{
    enabled:true,
    redactQueryString:true,
    logs:{enabled:true,headSamplingRate:0.25},
    traces:{enabled:true,headSamplingRate:0.1}
   },
   env:{
    DB:bindings.d1({name:isStaging?'dvolada-staging':'dvolada-prod'}),
    SESSION_PEPPER:bindings.secret(),
    PIN_SECRET:bindings.secret(),
    CORS_ORIGINS:bindings.text(isStaging?'http://localhost:5173':'https://dvolada.example.invalid'),
    ORDER_CREATION_ENABLED:bindings.text('false'),
    // Keep Web Push disabled until OneSignal is approved and securely connected.
    ONESIGNAL_APP_ID:bindings.text('dvolada-not-configured'),
    ONESIGNAL_REST_API_KEY:bindings.secret(),
    PUSH_NOTIFICATIONS_ENABLED:bindings.text('false')
   }
  }
 };
});
