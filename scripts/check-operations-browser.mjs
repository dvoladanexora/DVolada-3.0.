import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4184','--strictPort'],{env:{...process.env,VITE_DVOLADA_LIVE_MODE:'true'}});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE});
try{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4184')).ok)break}catch{}await new Promise(r=>setTimeout(r,250))}
 await mkdir('visual-checks',{recursive:true});
 for(const role of ['owner','kitchen','courier','platform_admin']){
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let contract=null,spots=[],taken=false,images={};
  const delivery={id:'55555555-5555-4555-8555-555555555555',orderNumber:'DV-DISPONIBLE',status:'Aceptado',version:2,restaurantName:'Negocio de prueba'};
  const brandPhoto=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9sAAAAASUVORK5CYII=','base64');
  await page.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname;
   const restaurant={restaurant_id:'11111111-1111-4111-8111-111111111111',staff_role:role,name:'Negocio de prueba'};
   const business=['owner','kitchen'].includes(role);
   const contractPath='/api/v1/admin/control/contracts/'+restaurant.restaurant_id;
   const spotPath='/api/v1/admin/control/spots';
   if(path===contractPath){
    if(route.request().method()==='PATCH'){const d=route.request().postDataJSON();assert.equal(d.amountMinor,75000);contract={start_date:d.startDate,next_due:d.nextDue,frequency:d.frequency,amount_minor:d.amountMinor,version:1};return route.fulfill({json:{ok:true}})}
    return route.fulfill({json:{contract,payments:[],plan:'ONLINE'}});
   }
   if(path===spotPath){
    if(route.request().method()==='POST'){const d=route.request().postDataJSON();assert.ok(d.imageBase64);assert.equal(d.placement,'carousel');spots=[{id:'44444444-4444-4444-8444-444444444444',title:d.title,advertiser:d.advertiser,placement:d.placement,starts_at:d.startsAt,ends_at:d.endsAt,duration_seconds:d.durationSeconds,link:d.link,price_minor:d.priceMinor,paid_minor:d.paidMinor,active:0,version:1}];return route.fulfill({json:{id:spots[0].id}})}
    return route.fulfill({json:{spots}});
   }
   if(path==='/api/v1/courier/orders/'+delivery.id+'/take'){
    assert.equal(route.request().postDataJSON().expectedVersion,2);
    assert.ok(route.request().headers()['idempotency-key']);
    taken=true;
    return route.fulfill({json:{order:{id:delivery.id,version:4,courierResponse:'accepted'}}});
   }
   if(path==='/api/v1/restaurant/branding')return route.fulfill({json:{images}});
   if(path.startsWith('/api/v1/restaurant/branding/')){
    assert.equal(route.request().method(),'POST');
    const kind=path.split('/').at(-1);
    const {base64}=route.request().postDataJSON();
    assert.ok(base64);
    images[kind]='data:image/jpeg;base64,'+base64;
    return route.fulfill({json:{kind,src:images[kind]}});
   }
   if(path.endsWith('/chat/dispatch'))return route.fulfill({json:{writable:true,messages:[
    {id:1,mine:false,body:'La comanda está en preparación.'}
   ]}});
   const fixtures={
    '/api/v1/restaurant/profile':{profile:{description:'',address:'',latitude:null,longitude:null,hours:Array(7).fill(null),paymentMethods:['cash']}},
    '/api/v1/restaurant/staff-access':{staff:[],history:[]},
    '/api/v1/auth/me':{
     user:{id:'22222222-2222-4222-8222-222222222222',role:business?'customer':role,
      displayName:'Participante de prueba',privilegedPasskey:['owner','platform_admin'].includes(role)},
     restaurants:business?[restaurant]:[]
    },
    '/api/v1/auth/client/config':{commercial:true,enabled:true},
    '/api/v1/admin/overview':{orders:{total:0,active:0,delivered:0},restaurants:{total:1,open:0,affiliated:0},couriers:{active:1,available:0},today:{orders:7,delivered:3},accounts:{registered:12,signedInToday:4},alerts:{claims:0,courierRequests:0,expiredOffers:0,lockedPins:0}},
    '/api/v1/admin/courier-directory':{couriers:[{id:'33333333-3333-4333-8333-333333333333',display_name:'Repartidor de prueba',rating:4.5,rating_count:2,status:'active',active:1,available:0,delivered:6,active_orders:0,max_active_orders:2,created_at:1700000000}],next:null},
    '/api/v1/admin/restaurants':{restaurants:[{id:restaurant.restaurant_id,name:restaurant.name,plan:'ONLINE',subscription_status:'inactive',online_state:'closed',order_count:0,delivery_fee_minor:500}]},
    '/api/v1/admin/control/accounts':{accounts:[]},
    '/api/v1/admin/control/claims':{claims:[]},
    '/api/v1/admin/control/coupons':{coupons:[]},
    '/api/v1/admin/control/audit':{events:[]},
    '/api/v1/courier/orders':{profile:{active:1,available:1,capacity:2},
     orders:taken?[{...delivery,courierResponse:'accepted',version:4}]:[],available:taken?[]:[delivery]},
    '/api/v1/courier/history':{orders:[],periods:[],commissions:{deliveries:0,chargedMinor:0,paidMinor:0,outstandingMinor:0},nextCursor:null}
   };
   const data=fixtures[path]??{restaurants:[],orders:[],products:[],couriers:[],
    profile:{available:0,active:1,capacity:2},enabled:false,counts:[],applications:[],rules:[],campaigns:[],settlements:[],staff:[],history:[]};
   return route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:4184/cuenta');
  await page.locator('.dvl-shortcuts').waitFor();
  const title={owner:'Restaurante',kitchen:'Cocina',courier:'Repartidor',platform_admin:'Centro de Control'}[role];
  await page.getByRole('heading',{level:1,name:title,exact:true}).waitFor();
  if(role==='kitchen')await page.locator('.dv-kitchen-lane-preparing').waitFor();
  if(role==='courier'){await page.getByText(/0 de 2 espacios ocupados/).waitFor();await page.getByRole('button',{name:'Consultar historial y ganancias',exact:true}).click();await page.getByRole('heading',{name:'Comisiones Dvolada',exact:true}).waitFor();await page.getByText('Saldo pendiente:',{exact:false}).waitFor();}
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
  if(role==='owner'){
   const nav=page.getByRole('navigation',{name:'Secciones de Restaurante Cloud'});
   await nav.getByRole('button',{name:'Cocina',exact:true}).click();
   await page.locator('.dv-kitchen-lane-preparing').waitFor();
   await nav.getByRole('button',{name:'Perfil y personal',exact:true}).click();
   await page.getByRole("heading",{name:"Perfil del restaurante",exact:true}).waitFor({timeout:5000});
   for(const label of ['Logo del restaurante','Portada del restaurante']){
    await page.getByLabel(label,{exact:true}).setInputFiles({name:'brand.png',mimeType:'image/png',buffer:brandPhoto},{timeout:6000});
    await page.getByAltText(label,{exact:true}).waitFor();
   }
  }
  if(role==='courier'){
   await page.getByRole('button',{name:'Tomar pedido',exact:true}).click();
   await page.getByText(/1 de 2 espacios ocupados/).waitFor();
   await page.getByRole('button',{name:'Chat con restaurante',exact:true}).click();
   await page.getByText('La comanda está en preparación.',{exact:true}).waitFor();
   for(const width of [390,1440]){
    await page.setViewportSize({width,height:844});
    const panel=page.getByRole('complementary',{name:'Conversación del pedido'});
    const handle=panel.getByRole('button',{name:'Mover conversación con las flechas'});
    if(await panel.getByRole('button',{name:'Minimizar conversación'}).count()===0)
     await panel.getByRole('button',{name:'Abrir conversación'}).click();
    const before=await panel.boundingBox(), grip=await handle.boundingBox();
    await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);
    await page.mouse.down();
    await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2-45,{steps:5});
    await page.mouse.up();
    assert.ok((await panel.boundingBox()).y<before.y-15);
    await panel.getByRole('button',{name:'Minimizar conversación'}).click();
    const bubble=await panel.boundingBox();
    await handle.press('ArrowUp');
    assert.ok((await panel.boundingBox()).y<bubble.y);
   }
   await page.getByRole('button',{name:'Abrir conversación'}).click();
   await page.getByRole('button',{name:'Cerrar conversación'}).click();
  }
  if(role==='platform_admin'){
   await page.setViewportSize({width:390,height:844});
   const nav=page.getByRole('navigation',{name:'Navegación principal'});
   assert.deepEqual(await nav.getByRole('button').allTextContents(),['Inicio','Afiliados','Repartidores','Publicidad','Más']);
   await page.getByRole('heading',{name:'Vista general',exact:true}).waitFor();
   assert.equal(await page.getByText('Datos de vinculación',{exact:true}).count(),0);
   await page.getByRole('button',{name:/Nuevo negocio Registrar/}).click();
   await page.getByRole('heading',{name:'Negocios afiliados',exact:true}).waitFor();
   await page.getByLabel('Nuevo restaurante',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Cerrar formulario',exact:true}).click();
   await page.getByLabel('Buscar negocio').fill('Negocio de prueba');
   await page.getByRole('button',{name:/Negocio de prueba.*Cloud/}).click();
   await page.getByRole('button',{name:'Activar suscripción',exact:true}).waitFor();
   await page.getByRole('button',{name:'Asignar plan de pago',exact:true}).click();
   await page.getByLabel('Contratación',{exact:true}).fill('2026-01-01');
   await page.getByLabel('Próximo pago',{exact:true}).fill('2026-12-01');
   await page.getByLabel('Cuota (L)',{exact:true}).fill('750');
   await page.getByRole('button',{name:'Guardar contrato',exact:true}).click();
   await page.getByRole('button',{name:'Registrar pago',exact:true}).waitFor();
   await page.screenshot({path:'visual-checks/admin-business-mobile.png'});
   await page.getByRole('button',{name:'Invitar propietario',exact:true}).click();
   await page.getByRole('heading',{name:'Invitar propietario',exact:true}).waitFor();
   await nav.getByRole('button',{name:'Repartidores',exact:true}).click();
   await page.getByText('Repartidor de prueba',{exact:true}).waitFor();
   await page.getByText('4.5 / 5 (2)',{exact:true}).waitFor();
   await page.getByRole('navigation',{name:'Opciones de Repartidores'}).getByRole('button',{name:'Solicitudes',exact:true}).click();
   await page.getByText('Vincular repartidor registrado',{exact:true}).waitFor();
   await nav.getByRole('button',{name:'Más',exact:true}).click();
   await page.getByRole('group',{name:'Más módulos'}).getByRole('button',{name:'Administrador',exact:true}).click();
   await page.getByRole('navigation',{name:'Opciones de Administrador'}).getByRole('button',{name:'Tarifas y comisiones',exact:true}).click();
   await page.getByRole('heading',{name:'Tarifas',exact:true}).waitFor();
   await nav.getByRole('button',{name:'Inicio',exact:true}).click();
   await page.getByRole('navigation',{name:'Opciones de Inicio'}).getByRole('button',{name:'Pedidos',exact:true}).click();
   await page.getByRole('heading',{name:'Seguimiento de pedidos',exact:true}).waitFor();
   await page.getByRole('navigation',{name:'Opciones de Inicio'}).getByRole('button',{name:'Reclamos',exact:true}).click();
   await page.getByRole('heading',{name:'Reclamos',exact:true}).waitFor();
   await nav.getByRole('button',{name:'Publicidad',exact:true}).click();
   await page.getByRole('heading',{name:'Spots publicitarios',exact:true}).waitFor();
   await page.getByRole('button',{name:'+ Nuevo spot',exact:true}).click();
   await page.getByLabel('Anunciante',{exact:true}).fill('Comercio de prueba');
   await page.getByLabel('Título del anuncio',{exact:true}).fill('Anuncio de prueba');
   await page.getByLabel('Imagen JPG, PNG o WebP').setInputFiles({name:'spot.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB9sAAAAASUVORK5CYII=','base64')});
   await page.getByAltText('Vista previa del spot',{exact:true}).waitFor();
   await page.getByLabel('Inicio (Honduras)',{exact:true}).fill('2026-11-01T00:00');
   await page.getByLabel('Vencimiento (Honduras)',{exact:true}).fill('2026-12-31T23:59');
   await page.getByLabel('Precio contratado (L)',{exact:true}).fill('500');
   await page.getByRole('button',{name:'Guardar spot',exact:true}).click();
   await page.getByText('Anuncio de prueba · Comercio de prueba',{exact:true}).waitFor();
   await page.getByText('Conservado en finanzas.',{exact:false}).waitFor();
   await page.screenshot({path:'visual-checks/admin-spot-mobile.png'});
   await page.getByRole('navigation',{name:'Opciones de Publicidad'}).getByRole('button',{name:'Cupones',exact:true}).click();
   await page.getByRole('heading',{name:'Cupones',exact:true}).waitFor();
   await page.getByRole('button',{name:'Mi acceso',exact:true}).click();
   await page.getByRole('heading',{name:'Mi acceso',exact:true}).waitFor();
   await page.getByText('Datos de vinculación',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Cerrar todas mis sesiones',exact:true}).waitFor();
   await page.getByRole('button',{name:'Cerrar sesión',exact:true}).waitFor();
   await page.setViewportSize({width:1440,height:960});
   await nav.getByRole('button',{name:'Administrador',exact:true}).waitFor();
   await nav.getByRole('button',{name:'Inicio',exact:true}).click();
   await page.getByRole('heading',{name:'Vista general',exact:true}).waitFor();
   console.log('Admin: módulos, navegación, negocio, invitación, repartidores, finanzas, pedidos, cupones y seguridad comprobados.');
  }
  assert.deepEqual(errors,[]);
  console.log(role,await page.locator('h1').allTextContents(),errors);
  await context.close();
 }
}finally{await browser.close();server.kill()}
