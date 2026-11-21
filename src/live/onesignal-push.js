// Web Push for Dvolada's live PWA. Intentionally not initialized on first visit:
// the browser and OneSignal permission request only run after explicit user action.
// App ID is public, not a secret. API keys must never be used in browser code.
const appId=String(import.meta.env.VITE_ONESIGNAL_APP_ID||'').trim();
const SDK_URL='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
let clientPromise;

export const isDvoladaPushConfigured=()=>/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(appId);

export function dvoladaPushCapability(){
 if(!isDvoladaPushConfigured())return 'not-configured';
 if(typeof window==='undefined'||typeof navigator==='undefined')return 'unsupported';
 if(!window.isSecureContext||!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))
  return 'unsupported';
 const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent||'');
 const standalone=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
 if(ios&&!standalone)return 'install-ios';
 if(window.Notification.permission==='denied')return 'blocked';
 return 'available';
}

function sdk(){
 if(clientPromise)return clientPromise;
 clientPromise=new Promise((resolve,reject)=>{
  let finished=false;
  const fail=e=>{if(!finished){finished=true;clientPromise=null;reject(e instanceof Error?e:new Error('No se pudo conectar OneSignal'))}};
  window.OneSignalDeferred=window.OneSignalDeferred||[];
  window.OneSignalDeferred.push(async instance=>{
   try{
    await instance.init({
     appId,
     notifyButton:{enable:false},
     promptOptions:{slidedown:{prompts:[{type:'push',autoPrompt:false}]}},
     // Existing Dvolada PWA worker controls /. OneSignal uses a separate scope.
     serviceWorkerPath:'push/onesignal/OneSignalSDKWorker.js',
     serviceWorkerParam:{scope:'/push/onesignal/'},
     welcomeNotification:{disable:true}
    });
    if(!finished){finished=true;resolve(instance)}
   }catch(e){fail(e)}
  });
  if(!document.querySelector('script[data-dvolada-onesignal]')){
   const script=document.createElement('script');
   script.src=SDK_URL;script.async=true;script.dataset.dvoladaOnesignal='1';
   script.onerror=()=>fail(new Error('No se pudo cargar el servicio de notificaciones'));
   document.head.appendChild(script);
  }
 });
 return clientPromise;
}

export async function enableDvoladaPush(){
 const capability=dvoladaPushCapability();
 if(capability!=='available')return {status:capability};
 const instance=await sdk();
 await instance.Notifications.requestPermission();
 if(!instance.Notifications.permission)return {status:'blocked'};
 await instance.User.PushSubscription.optIn();
 return {status:instance.User.PushSubscription.optedIn?'enabled':'pending'};
}

export async function disableDvoladaPush(){
 if(!isDvoladaPushConfigured())return {status:'not-configured'};
 const instance=await sdk();
 await instance.User.PushSubscription.optOut();
 return {status:'disabled'};
}
