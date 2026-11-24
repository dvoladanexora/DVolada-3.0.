import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

// Isolated browser contract test: production-built UI, deterministic API fixtures.
// It neither changes the deployed D1 nor substitutes for backend integration tests.
const origin='http://127.0.0.1:4173';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{env:{...process.env,VITE_DVOLADA_LIVE_MODE:'true'},stdio:'inherit'});
let browser;
try{
 for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break}catch{}await new Promise(r=>setTimeout(r,250))}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const account='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333',oid='44444444-4444-4444-8444-444444444444';
 const restaurant={id:rid,name:'Comedor de fixture',online_state:'open',delivery_fee_minor:500};
 const product={id:pid,name:'Baleada de fixture',price_minor:5000,category:'Baleadas',options:[]};
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 await context.addInitScript(({account,rid,pid})=>{
  sessionStorage.setItem('dvolada:cart:v1:'+account,JSON.stringify({restaurantId:rid,items:[{productId:pid,name:'Baleada de fixture',priceMinor:5000,quantity:1}]}));
  localStorage.setItem('dv_sound_onboard_seen','1');
  localStorage.setItem('dv_local_profile',JSON.stringify({sound:false}));
 },{account,rid,pid});
 let created=0;let orders=[];
 const unexpected=[],errors=[];
 await context.route('**/api/v1/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname;
  const data={
   '/api/v1/auth/client/config':{enabled:true,commercial:true},
   '/api/v1/auth/me':{user:{id:account,role:'customer',displayName:'Cliente de fixture'},restaurants:[]},
   '/api/v1/catalog/restaurants':{restaurants:[restaurant],next:null},
   ['/api/v1/catalog/restaurants/'+rid+'/products']:{restaurant,products:[product]},
   '/api/v1/catalog/flash':{enabled:false,campaigns:[]},
   '/api/v1/customer/favorites':{ids:[]},
   '/api/v1/customer/courier-application':{requested:false},
  };
  if(p==='/api/v1/customer/orders'){
   if(req.method()==='POST'){
    const body=req.postDataJSON();assert.equal(body.restaurantId,rid);assert.equal(body.items[0].quantity,2);assert.equal(body.expectedTotalMinor,10000);assert.ok(req.headers()['idempotency-key']);created++;
    orders=[{id:oid,restaurantId:rid,orderNumber:'DV-FIXTURE',status:'Pendiente',version:1,deliveryMethod:'pickup',totalMinor:10000}];
    return route.fulfill({status:201,json:{order:orders[0],deliveryPin:null}});
   }
   return route.fulfill({json:{orders}});
  }
  if(Object.hasOwn(data,p))return route.fulfill({json:data[p]});
  unexpected.push(p);return route.fulfill({status:404,json:{error:'FIXTURE_NOT_IMPLEMENTED'}});
 });
 await context.route('**/push-config',r=>r.fulfill({json:{enabled:false}}));
 const page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/cuenta');
 await page.locator('.dv-tools-header').waitFor();
 assert.equal(await page.locator('.dv-sidebar').count(),1);
 assert.equal(await page.locator('.dvl-account-shell').count(),0);
 assert.equal(await page.getByText('ID de vinculación:',{exact:false}).count(),0);
 assert.deepEqual(await page.locator('.mobile-nav button').allTextContents(),['Inicio','Restaurantes','Pedidos','Más']);
 await page.locator('.mobile-nav').getByRole('button',{name:'Más',exact:true}).click();
 await page.getByRole('button',{name:'Mis favoritos',exact:true}).waitFor();
 await page.getByRole('button',{name:'Invitar amigos',exact:true}).waitFor();
 await page.getByRole('button',{name:'Cerrar más opciones',exact:true}).click();
 await page.locator('.dv-cart-header-toggle').click();
 await page.getByRole('heading',{name:'Tu carrito',exact:true}).waitFor();
 await page.getByText('Mi presupuesto y entrega o retiro',{exact:true}).click();
 await page.getByRole('button',{name:'Guardar carrito',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Recuperar carrito',exact:true}).isEnabled(),true);
 await page.getByText('Mi presupuesto y entrega o retiro',{exact:true}).click();
 await page.getByRole('button',{name:'Agregar uno de Baleada de fixture'}).click();
 await page.getByRole('button',{name:'Continuar pedido'}).click();
 await page.getByRole('button',{name:'Recoger',exact:true}).click();
 await page.getByLabel('Teléfono de Honduras (+504)').fill('99999999');
 await page.getByRole('slider').press('Enter');
 await page.getByRole('heading',{name:'Mis pedidos',exact:true}).waitFor();
 await page.getByText('Orden DV-FIXTURE',{exact:true}).waitFor();
 assert.equal(created,1);
 assert.equal(await page.locator('.dv-tools-header').count(),1);
 assert.equal(await page.locator('.dvl-account-shell').count(),0);
 await page.locator('.mobile-nav').getByRole('button',{name:'Más',exact:true}).click();
 await page.getByRole('button',{name:'Mi perfil',exact:true}).click();
 await page.getByRole('heading',{name:'Mi cuenta',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Nombre y apellido').inputValue(),'Cliente de fixture');
 await page.getByText('Preferencias alimentarias',{exact:true}).click();
 await page.getByLabel('Vegetariano',{exact:true}).check();
 await page.getByText('Accesibilidad',{exact:true}).click();
 await page.getByLabel('Texto grande',{exact:true}).check();
 await page.getByText('Mis direcciones guardadas',{exact:true}).waitFor();
 assert.equal(await page.locator('.dv-tools-header').count(),1);
 assert.deepEqual(errors,[]);
 assert.deepEqual(unexpected,[]);
 console.log(JSON.stringify({originalAuthenticatedShell:true,originalCart:true,orderFlow:true,profile:true,fixtureOrders:created,viewport:390}));
}finally{if(browser)await browser.close();server.kill()}
