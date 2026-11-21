/* Separate Firebase project for Dvolada; these browser config keys are not secrets.
 * No Firebase SDK is initialized in GitHub Pages demo builds.
 */
export const firebaseWebConfig={
 apiKey:import.meta.env.VITE_DVOLADA_FIREBASE_API_KEY||'',
 authDomain:import.meta.env.VITE_DVOLADA_FIREBASE_AUTH_DOMAIN||'',
 projectId:import.meta.env.VITE_DVOLADA_FIREBASE_PROJECT_ID||'',
 appId:import.meta.env.VITE_DVOLADA_FIREBASE_APP_ID||''
};
export const firebaseReady=Object.values(firebaseWebConfig).every(Boolean);
let runtime;
export async function firebaseAuth(){
 if(!firebaseReady)throw Error('Todavía no se configuró Firebase Auth para Dvolada.');
 if(runtime)return runtime;
 const [{initializeApp,getApps},{getAuth}]=await Promise.all([import('firebase/app'),import('firebase/auth')]);
 const app=getApps().find(a=>a.name==='dvolada')||initializeApp(firebaseWebConfig,'dvolada');
 runtime=await import('firebase/auth').then(auth=>({auth:getAuth(app),...auth}));
 return runtime;
}
