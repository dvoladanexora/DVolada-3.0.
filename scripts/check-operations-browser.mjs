import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4184','--strictPort'],{env:{...process.env,VITE_DVOLADA_LIVE_MODE:'true'}});
const browser=await chromium.launch();
try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4184')).ok)break}catch{}await new Promise(r=>setTimeout(r,250))}
 await mkdir('visual-checks',{recursive:true});
 for(const role of ['owner','kitchen','courier','platform_admin']){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const restaurant={restaurant_id:'11111111-1111-4111-8111-111111111111',staff_role:role,name:'Negocio de prueba'};
   const business=['owner','kitchen'].includes(role);
   const fixtures={
    '/api/v1/auth/me':{
     user:{id:'22222222-2222-4222-8222-222222222222',role:business?'customer':role,
      displayName:'Participante de prueba',privilegedPasskey:['owner','platform_admin'].includes(role)},
     restaurants:business?[restaurant]:[]
    },
    '/api/v1/auth/client/config':{commercial:true,enabled:true},
    '/api/v1/admin/overview':{orders:{total:0,active:0,delivered:0},restaurants:{total:0},couriers:{active:0}}
   };
   const data=fixtures[path]??{restaurants:[],orders:[],products:[],couriers:[],
    profile:{available:false,max_active_orders:2},enabled:false,counts:[],applications:[],rules:[],campaigns:[],settlements:[]};
   return route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:4184/cuenta');
  await page.locator('.dvl-shortcuts').waitFor();
  const title={owner:'Restaurante',kitchen:'Cocina',courier:'Repartidor',platform_admin:'Centro de Control'}[role];
  await page.getByRole('heading',{level:1,name:title,exact:true}).waitFor();
  if(role==='kitchen')await page.locator('.dv-kitchen-lane-preparing').waitFor();
  for(const width of [360,390,430,768,1440]){
   await page.setViewportSize({width,height:width<768?844:960});
   for(const theme of ['light','dark']){
    await page.getByLabel('Tema visual').selectOption(theme);
    await page.waitForFunction(expected=>document.documentElement.dataset.theme===expected,theme);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=1,role+' '+width+' px: '+overflow);
    await page.screenshot({path:'visual-checks/'+role+'-'+width+'-'+theme+'.png'});
   }
  }
  assert.deepEqual(errors,[]);
  console.log(role,await page.locator('h1').allTextContents(),errors);
  await context.close();
 }
}finally{await browser.close();server.kill()}
