import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {offeredExtrasFor,validateCartCatalog,splitRestaurantCart,cartCheckoutTotal} from '../src/customer-order-rules.js';
import {canMoveRestaurantOrder,kitchenQueues,scheduledOrderState} from '../src/kitchen-operations.js';
import {applyOrderStatus,decisionForOrder} from '../src/restaurant-order-flow.js';
import {cancelDemoOrder,changeDemoRestaurantOrder} from '../src/order-demo-operations.js';
import {courierQueues,applyCourierAction,courierViewOrder,validateCourierAction} from '../src/courier-workflow.js';

const today=new Date('2026-11-19T10:00:00.000Z');
const restaurant=(id,name,item)=>({id,name,items:[item],hours:null,isOpen:true});
const item=(id,name,price,extras=[])=>({id,name,price,available:true,extras});
const a=restaurant(1,'Restaurante A',item(101,'Baleada grande',95,['Queso extra','Salsa extra']));
const b=restaurant(2,'Restaurante B',item(202,'Pizza',120,['Queso extra']));
const first={id:'101-x',productId:101,placeId:1,placeName:a.name,name:'Baleada grande + Queso extra',qty:2,price:105,extras:['Queso extra']};
const second={id:'202',productId:202,placeId:2,placeName:b.name,name:'Pizza',qty:1,price:120,extras:[]};

test('Carrito de dos restaurantes mantiene extras permitidos, tarifas separadas y suma exacta',()=>{
 assert.equal(validateCartCatalog([first,second],[a,b]),null);
 const groups=splitRestaurantCart([first,second],[a,b],7.25,15.5);
 assert.equal(groups.length,2);
 assert.deepEqual(groups.map(g=>g.id),['1','2']);
 assert.equal(groups[0].subtotal,210);
 assert.equal(groups[0].total,232.75);
 assert.equal(groups[1].total,142.75);
 assert.equal(cartCheckoutTotal(groups),375.5);
 assert.equal(groups.reduce((sum,g)=>sum+g.total,0),375.5);
 assert.equal(groups[0].items[0].placeId,1);
 assert.equal(groups[1].items[0].placeId,2);
});
test('Importes fraccionarios se calculan en centavos sin añadir cargos invisibles',()=>{
 const x={...a,items:[item(101,'Baleada grande',25.15,[])]};
 const lines=[{id:'101',placeId:1,name:'Baleada grande',price:25.15,qty:3,extras:[]}];
 assert.equal(validateCartCatalog(lines,[x]),null);
 const groups=splitRestaurantCart(lines,[x],0.1,0.2);
 assert.equal(groups[0].subtotal,75.45);
 assert.equal(groups[0].total,75.75);
 assert.equal(cartCheckoutTotal(groups),75.75);
});
test('Cambios de catálogo, extras inexistentes y productos agotados impiden confirmar',()=>{
 assert.match(validateCartCatalog([{...first,extras:['Hamburguesa extra']}],[a,b]),/extras/);
 assert.match(validateCartCatalog([{...first,extras:['Queso extra','Queso extra'],price:115}],[a,b]),/extras/);
 assert.match(validateCartCatalog([{...first,price:106}],[a,b]),/precio/);
 assert.match(validateCartCatalog([{...first,qty:100}],[a,b]),/cantidad/);
 assert.match(validateCartCatalog([first],[{...a,items:[{...a.items[0],soldOut:true}]}]),/agotado/);
 assert.match(validateCartCatalog([first],[{...a,isOpen:false}]),/cerrado/);
 assert.equal(validateCartCatalog([first],[{...a,isOpen:false}],{scheduleMode:'later'}),null);
 assert.match(validateCartCatalog([],[]),/vacío/);
 assert.deepEqual(offeredExtrasFor({id:1,name:'Fresco de limón',price:25}),['Azúcar extra','Leche extra','Sin hielo']);
 assert.deepEqual(offeredExtrasFor(item(1,'Fresco de limón',25,[])),[]);
 const withoutExtras={...a,items:[{...a.items[0],extras:[]}]};
 assert.match(validateCartCatalog([first],[withoutExtras]),/extras/);
});
test('El cliente y el editor de restaurante usan la misma fuente de extras',()=>{
 const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(app.includes('offeredExtrasFor(foodChoice.item).map'));
 assert.ok(app.includes('validateCartCatalog(cart,places,{scheduleMode})'));
 assert.ok(app.includes('splitRestaurantCart(cart,places,serviceFee,deliveryFee)'));
 assert.ok(app.includes('cartCheckoutTotal(cartGroups)'));
 assert.ok(app.includes('total:group.total'));
});
test('Pedido completo Cliente → Caja → Cocina → Repartidor → Entregado',()=>{
 const order={id:'demo-a',orderNo:'#DV-demo-a',kind:'food',delivery:'delivery',placeId:1,placeName:a.name,
  name:'Cliente ficticio',address:'Dirección ficticia',items:[first],payment:'Efectivo',pin:'123456',status:'Pendiente',
  createdAt:today.toISOString()};
 const ride='demo-rider-1',rider2='demo-rider-2';
 assert.equal(kitchenQueues([order],1,Date.parse(today)).pending.length,1);
 assert.equal(canMoveRestaurantOrder(order.status,'Aceptado','cashier'),true);
 let o=applyOrderStatus(order,'Aceptado',{},today);
 assert.equal(courierQueues([o],ride).offers.length,1);
 const projected=courierViewOrder(o,ride);
 assert.equal(Object.hasOwn(projected,'address'),false);
 assert.equal(Object.hasOwn(projected,'pin'),false);
 let assigned=applyCourierAction([o],o.id,'accept',ride,{online:true},today);
 assert.ok(assigned.ok);
 assert.equal(validateCourierAction(assigned.orders,o.id,'accept',rider2,{online:true}).ok,false);
 o=applyOrderStatus(assigned.order,'Preparando',{},today);
 assert.equal(kitchenQueues([o],1,Date.parse(today)).preparing.length,1);
 o=applyOrderStatus(o,'Listo',{},today);
 assert.equal(kitchenQueues([o],1,Date.parse(today)).ready.length,1);
 assigned=applyCourierAction([o],o.id,'pickup',ride,{},today);
 assert.ok(assigned.ok);
 assigned=applyCourierAction(assigned.orders,o.id,'route',ride,{},today);
 assert.ok(assigned.ok);
 assigned=applyCourierAction(assigned.orders,o.id,'arrive',ride,{demoSimulation:true},today);
 assert.ok(assigned.ok);
 assert.equal(validateCourierAction(assigned.orders,o.id,'deliver',ride,{pin:'000000'}).ok,false);
 assigned=applyCourierAction(assigned.orders,o.id,'deliver',ride,{pin:'123456'},today);
 assert.ok(assigned.ok);
 assert.equal(assigned.order.status,'Entregado');
 assert.equal(courierQueues(assigned.orders,ride).history.length,1);
 assert.equal(courierQueues(assigned.orders,ride).slotsRemaining,2);
});
test('Cancelación aceptada detiene recogida hasta que Caja responda',()=>{
 const order={id:'cancel',kind:'food',delivery:'delivery',placeId:1,status:'Aceptado',pin:'123456'};
 const rider='demo-rider-1';
 let result=applyCourierAction([order],order.id,'accept',rider,{online:true},today);
 assert.ok(result.ok);
 const inReview=applyOrderStatus(result.order,'Cancelación solicitada',{},today);
 assert.equal(courierQueues([inReview],rider).active.length,1);
 assert.equal(validateCourierAction([inReview],order.id,'pickup',rider).ok,false);
 const approved=applyOrderStatus(inReview,decisionForOrder(inReview,'approve-cancel').status,{},today);
 assert.equal(approved.status,'Cancelado');
 assert.equal(courierQueues([approved],rider).active.length,0);
 const rejected=decisionForOrder(inReview,'deny-cancel','Ya se está preparando');
 assert.equal(rejected.status,'Aceptado');
});
test('Programado solo llega a Caja cuando vence y nunca se ofrece directamente a repartidor',()=>{
 const pending={id:'scheduled',kind:'food',delivery:'delivery',placeId:1,status:'Programado',scheduledFor:'2026-11-19T09:00:00Z'};
 assert.equal(scheduledOrderState(pending,Date.parse(today)),'due');
 assert.equal(courierQueues([pending],'demo-rider-1').offers.length,0);
 assert.equal(canMoveRestaurantOrder(pending.status,'Pendiente','cashier'),true);
 const active=applyOrderStatus(pending,'Pendiente',{},today);
 assert.equal(kitchenQueues([active],1,Date.parse(today)).pending.length,1);
});
test('Deslizar confirma solo tras validación correcta; permite reintento',()=>{
 const slider=readFileSync(new URL('../src/SlideConfirm.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(slider.includes('if(confirmed===false)'));
 assert.ok(slider.includes('locked.current=false;setDone(false);setProgress(0)'));
 assert.ok(slider.includes('await onConfirm?.()'));
 const start=app.indexOf('function placeOrder(){'),end=app.indexOf('function sendMandado(){',start);
 const checkout=app.slice(start,end);
 assert.ok((checkout.match(/return false/g)||[]).length>=13);
 assert.ok(checkout.includes("registrado · PIN privado generado');return true"));
});
test('PWA cachea shell público, nunca intercepta llamadas API o version.json',async()=>{
 const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 const events={};const added=[],stored=[],deleted=[];
 const caches={
  open:async()=>({add:async x=>{added.push(x)},put:async (...args)=>{stored.push(args)}}),
  keys:async()=>['dvolada-shell-old','other-cache'],
  delete:async key=>{deleted.push(key)},
  match:async()=>undefined
 };
 const self={location:{origin:'https://dvoladanexora.github.io'},clients:{claim:async()=>{}},
  addEventListener:(event,callback)=>{events[event]=callback},skipWaiting:()=>{}};
 const fetchImpl=async()=>({ok:true,type:'basic',clone(){return this}});
 runInNewContext(source,{self,caches,fetch:fetchImpl,URL,Response,Promise});
 assert.equal(typeof events.install,'function');
 let installing;events.install({waitUntil:p=>{installing=p}});await installing;
 assert.ok(added.includes('/DVolada-3.0./'));
 assert.ok(added.includes('/DVolada-3.0./index.html'));
 let intercepted=false;
 const mockRequest=path=>({method:'GET',url:'https://dvoladanexora.github.io'+path,mode:'navigate'});
 events.fetch({request:mockRequest('/DVolada-3.0./api/v1/orders'),respondWith:()=>{intercepted=true}});
 assert.equal(intercepted,false);
 events.fetch({request:mockRequest('/DVolada-3.0./version.json'),respondWith:()=>{intercepted=true}});
 assert.equal(intercepted,false);
 events.fetch({request:{method:'GET',url:'https://dvoladanexora.github.io/DVolada-3.0./uploads/private-avatar.png',mode:'no-cors'},respondWith:()=>{intercepted=true}});
 assert.equal(intercepted,false);
 assert.ok(source.includes('STATIC_PUBLIC.has(url.pathname)'));
 let responsePromise;
 events.fetch({request:mockRequest('/DVolada-3.0./'),respondWith:p=>{responsePromise=p}});
 assert.ok(responsePromise);
 assert.ok((await responsePromise).ok);
 await Promise.resolve();
 assert.equal(source.includes("req.method!=='GET'"),true);
});
test('La ruta pública mantiene los accesos internos cerrados hasta autenticación',()=>{
 const flags=readFileSync(new URL('../src/release-flags.js',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 for(const route of ['driver','admin','delivery-panel'])assert.ok(flags.includes("'"+route+"'"));
 assert.ok(flags.includes('import.meta.env.DEV'));
 assert.ok(main.includes("page==='delivery-panel'&&INTERNAL_PREVIEW_ENABLED&&previewCourierId"));
 assert.ok(main.includes("orders={courierViewOrders(orders,previewCourierId)}"));
});

test('Cliente puede borrar únicamente datos locales Dvolada con confirmación explícita',()=>{
 const src=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const start=src.indexOf('function clearLocalDemoData()'),end=src.indexOf("const nav=[['home'",start);
 assert.ok(start>0&&end>start);
 const action=src.slice(start,end);
 assert.ok(action.includes('window.confirm(confirmation)'));
 assert.ok(action.includes("key.startsWith('dv_')"));
 assert.ok(action.includes('localStorage.removeItem(key)'));
 assert.ok(action.includes('window.location.assign(import.meta.env.BASE_URL)'));
 assert.ok(src.includes('Borrar datos de prueba de este dispositivo'));
});

test('Cancelación abierta en Pendiente se reevalúa si Caja aceptó antes de confirmar',()=>{
 const base={id:'stale-1',kind:'food',placeId:1,status:'Pendiente',delivery:'delivery'};
 const accepted=applyOrderStatus(base,'Aceptado',{},today);
 const result=cancelDemoOrder([accepted],base.id,'Me equivoqué al pedir',today);
 assert.equal(result.ok,true);
 assert.equal(result.immediate,false);
 assert.equal(result.order.status,'Cancelación solicitada');
 assert.equal(result.order.statusBeforeCancellation,'Aceptado');
 assert.equal(result.order.cancelReason,'Me equivoqué al pedir');
});
test('Cancelación cliente no puede borrar pedidos listos, entregados ni ya cancelados',()=>{
 for(const status of ['Listo','Recogido','En camino','En ubicación','Entregado','Cancelado','Rechazado','Cancelación solicitada']){
  const current={id:'stale-2',kind:'food',placeId:1,status};
  const result=cancelDemoOrder([current],current.id,'Cambio de dirección',today);
  assert.equal(result.ok,false,status);
  assert.strictEqual(result.orders[0],current);
 }
});
test('Cancelar un pedido programado o pendiente conserva auditoría e inmediatez',()=>{
 for(const status of ['Programado','Pendiente']){
  const o={id:status,kind:'food',placeId:1,status};
  const result=cancelDemoOrder([o],o.id,'El cliente ya no desea comer',today);
  assert.equal(result.ok,true);
  assert.equal(result.immediate,true);
  assert.equal(result.order.status,'Cancelado');
  assert.equal(result.order.statusBeforeCancellation,status);
  assert.ok(result.order.cancelRequestedAt);
  assert.ok(result.order.cancelledAt);
 }
});
test('Caja rechaza aceptación duplicada y pedidos de otros negocios',()=>{
 const original={id:'ca-1',kind:'food',placeId:1,status:'Pendiente'};
 const accepted=changeDemoRestaurantOrder([original],{orderId:original.id,restaurantId:1,expectedStatus:'Pendiente',toStatus:'Aceptado',area:'cashier'},today);
 assert.equal(accepted.ok,true);
 assert.equal(accepted.order.status,'Aceptado');
 const stale=changeDemoRestaurantOrder(accepted.orders,{orderId:original.id,restaurantId:1,expectedStatus:'Pendiente',toStatus:'Aceptado',area:'cashier'},today);
 assert.equal(stale.ok,false);
 assert.match(stale.reason,/cambió/);
 const wrongBusiness=changeDemoRestaurantOrder([original],{orderId:original.id,restaurantId:2,expectedStatus:'Pendiente',toStatus:'Aceptado',area:'cashier'},today);
 assert.equal(wrongBusiness.ok,false);
 assert.match(wrongBusiness.reason,/restaurante/);
});
test('Cocina no puede saltar de Aceptado a Listo ni modificar órdenes canceladas',()=>{
 const o={id:'k-1',kind:'food',placeId:1,status:'Aceptado'};
 const skip=changeDemoRestaurantOrder([o],{orderId:o.id,restaurantId:1,expectedStatus:'Aceptado',toStatus:'Listo',area:'kitchen'},today);
 assert.equal(skip.ok,false);
 const first=changeDemoRestaurantOrder([o],{orderId:o.id,restaurantId:1,expectedStatus:'Aceptado',toStatus:'Preparando',area:'kitchen'},today);
 assert.equal(first.ok,true);
 const second=changeDemoRestaurantOrder(first.orders,{orderId:o.id,restaurantId:1,expectedStatus:'Preparando',toStatus:'Listo',area:'kitchen'},today);
 assert.equal(second.ok,true);
 assert.equal(second.order.status,'Listo');
 const cancelled=changeDemoRestaurantOrder([{...o,status:'Cancelado'}],{orderId:o.id,restaurantId:1,expectedStatus:'Cancelado',toStatus:'Preparando',area:'kitchen'},today);
 assert.equal(cancelled.ok,false);
});
test('Programados solo pueden activarse después de hora y desde Caja',()=>{
 const o={id:'p-1',kind:'food',placeId:1,status:'Programado',scheduledFor:'2026-11-19T11:00:00.000Z'};
 const before=changeDemoRestaurantOrder([o],{orderId:o.id,restaurantId:1,expectedStatus:'Programado',toStatus:'Pendiente',area:'cashier'},today);
 assert.equal(before.ok,false);
 const after=changeDemoRestaurantOrder([o],{orderId:o.id,restaurantId:1,expectedStatus:'Programado',toStatus:'Pendiente',area:'cashier'},new Date('2026-11-19T11:00:00Z'));
 assert.equal(after.ok,true);
 const kitchen=changeDemoRestaurantOrder([o],{orderId:o.id,restaurantId:1,expectedStatus:'Programado',toStatus:'Pendiente',area:'kitchen'},new Date('2026-11-19T11:00:00Z'));
 assert.equal(kitchen.ok,false);
});
test('Rechazo y revisión de cancelación requieren motivo y etapa válida',()=>{
 const pending={id:'r-1',kind:'food',placeId:1,status:'Pendiente'};
 const noReason=changeDemoRestaurantOrder([pending],{orderId:pending.id,restaurantId:1,expectedStatus:'Pendiente',toStatus:'Rechazado',area:'cashier'},today);
 assert.equal(noReason.ok,false);
 const declined=changeDemoRestaurantOrder([pending],{orderId:pending.id,restaurantId:1,expectedStatus:'Pendiente',toStatus:'Rechazado',area:'cashier',metadata:{rejectionReason:'Fuera de cobertura'}},today);
 assert.equal(declined.ok,true);
 assert.equal(declined.order.rejectionReason,'Fuera de cobertura');
 const cancelled={id:'r-2',kind:'food',placeId:1,status:'Cancelación solicitada',statusBeforeCancellation:'Preparando'};
 const invalidRestore=changeDemoRestaurantOrder([cancelled],{orderId:cancelled.id,restaurantId:1,expectedStatus:'Cancelación solicitada',toStatus:'Aceptado',area:'cashier',metadata:{cancelResponseReason:'Pedido en curso'}},today);
 assert.equal(invalidRestore.ok,false);
 const denied=changeDemoRestaurantOrder([cancelled],{orderId:cancelled.id,restaurantId:1,expectedStatus:'Cancelación solicitada',toStatus:'Preparando',area:'cashier',metadata:{cancelResponseReason:'La comida ya está lista'}},today);
 assert.equal(denied.ok,true);
 assert.equal(denied.order.cancelResponse,'Rechazada');
});
test('Cliente, Caja y Cocina muestran conflicto en lugar de falso éxito',()=>{
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const restaurant=readFileSync(new URL('../src/OnlineWorkspace.jsx',import.meta.url),'utf8');
 assert.ok(main.includes('cancelDemoOrder(current,cancelOrder.id,reason)'));
 assert.ok(main.includes('changeDemoRestaurantOrder(current,{orderId:id,restaurantId,expectedStatus,toStatus:status,area,metadata})'));
 assert.ok(restaurant.includes('if(!response?.ok)'));
 assert.ok(restaurant.includes('currentOrder.status,area,business?.id'));
 assert.ok(restaurant.includes("decisionOrder.status,'cashier',business?.id"));
});
