import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 MAX_ACTIVE_DELIVERIES,DEMO_RIDERS,courierQueues,isCourierOffer,isRiderOwner,
 validateCourierAction,applyCourierAction,courierPublicOrder,courierOrderCoords,
 courierRestaurantCoords,buildCourierIssue,cleanCourierIssue,riderKey,courierViewOrders,courierViewOrder,sanitizePinAttempts,incrementPinAttempt,pinAttemptKey
} from '../src/courier-workflow.js';

const now=new Date('2026-11-19T09:00:00.000Z');
const riderA='demo-rider-1',riderB='demo-rider-2';
const order=(id,status='Listo',changes={})=>({
 id,orderNo:'#'+id,kind:'food',delivery:'delivery',status,placeId:1,placeName:'Negocio Ficticio',
 createdAt:'2026-11-19T07:00:00.000Z',name:'Cliente de prueba',address:'Calle de prueba',
 items:[{id:1,qty:1,name:'Baleada'}],pin:'123456',...changes,
});
test('Repartidores independientes de demostración tienen identidades distintas y máximo dos activas',()=>{
 assert.equal(DEMO_RIDERS.length,2);
 assert.notEqual(DEMO_RIDERS[0].id,DEMO_RIDERS[1].id);
 assert.equal(MAX_ACTIVE_DELIVERIES,2);
 assert.notEqual(riderKey(riderA),riderKey(riderB));
});
test('Ningún pedido llega a ofertas antes de la aceptación del restaurante',()=>{
 const rows=[
  order('a','Pendiente'),order('b','Programado'),order('c','Aceptado'),order('d','Preparando'),order('e','Listo'),
  order('f','Cancelación solicitada'),order('g','Cancelado'),order('h','Entregado'),
  order('i','Listo',{courierAccepted:true,courierId:riderB}),
  order('j','Listo',{delivery:'pickup'}),order('k','Listo',{kind:'grocery'}),
 ];
 const list=courierQueues(rows,riderA);
 assert.deepEqual(list.offers.map(o=>o.id),['c','d','e']);
 assert.equal(isCourierOffer(rows[0],riderA),false);
 assert.equal(isCourierOffer(rows[2],riderA),true);
 assert.equal(isCourierOffer(rows[8],riderA),false);
});
test('El repartidor debe activar disponibilidad y solo puede aceptar hasta dos pedidos',()=>{
 const rows=[order('a'),order('b'),order('c')];
 assert.equal(validateCourierAction(rows,'a','accept',riderA,{online:false}).ok,false);
 const first=applyCourierAction(rows,'a','accept',riderA,{online:true},now);
 assert.ok(first.ok);assert.equal(first.order.courierId,riderA);
 assert.equal(first.order.courierAssignedAt,now.toISOString());
 const second=applyCourierAction(first.orders,'b','accept',riderA,{online:true},now);
 assert.ok(second.ok);
 assert.equal(courierQueues(second.orders,riderA).active.length,2);
 assert.equal(courierQueues(second.orders,riderA).slotsRemaining,0);
 const third=applyCourierAction(second.orders,'c','accept',riderA,{online:true},now);
 assert.equal(third.ok,false);
 assert.strictEqual(third.orders,second.orders);
 assert.match(third.reason,/dos entregas/);
});
test('Rechazar una oferta solo afecta a este repartidor y deja la oferta disponible para otros',()=>{
 const rows=[order('a')];
 const decline=applyCourierAction(rows,'a','decline',riderA,{},now);
 assert.ok(decline.ok);
 assert.equal(courierQueues(decline.orders,riderA).offers.length,0);
 assert.equal(courierQueues(decline.orders,riderB).offers.length,1);
 assert.equal(decline.order.status,'Listo');
 assert.equal(decline.order.courierAccepted,undefined);
 assert.deepEqual(decline.order.courierDeclinedBy,[riderA]);
});
test('Un segundo repartidor jamás puede reclamar o actualizar una orden ya asignada',()=>{
 const accepted=applyCourierAction([order('a')],'a','accept',riderA,{online:true},now);
 assert.equal(validateCourierAction(accepted.orders,'a','accept',riderB,{online:true}).ok,false);
 assert.equal(validateCourierAction(accepted.orders,'a','pickup',riderB).ok,false);
 assert.equal(isRiderOwner(accepted.orders[0],riderA),true);
 assert.equal(isRiderOwner(accepted.orders[0],riderB),false);
 assert.equal(courierQueues(accepted.orders,riderB).active.length,0);
});
test('Entrega avanza en orden Listo → Recogido → En camino → En ubicación → Entregado',()=>{
 let result=applyCourierAction([order('a')],'a','accept',riderA,{online:true},now);
 result=applyCourierAction(result.orders,'a','pickup',riderA,{},new Date('2026-11-19T09:01:00Z'));
 assert.ok(result.ok);assert.equal(result.order.status,'Recogido');
 assert.ok(result.order.courierPickedUpAt);
 assert.equal(validateCourierAction(result.orders,'a','deliver',riderA,{pin:'123456'}).ok,false);
 result=applyCourierAction(result.orders,'a','route',riderA,{},new Date('2026-11-19T09:02:00Z'));
 assert.ok(result.ok);assert.equal(result.order.status,'En camino');
 assert.equal(validateCourierAction(result.orders,'a','arrive',riderA,{}).ok,false);
 result=applyCourierAction(result.orders,'a','arrive',riderA,{gpsVerified:true},new Date('2026-11-19T09:10:00Z'));
 assert.ok(result.ok);assert.equal(result.order.status,'En ubicación');
 assert.ok(result.order.courierArrivalAt);
 assert.equal(validateCourierAction(result.orders,'a','deliver',riderA,{pin:'123'}).ok,false);
 assert.equal(validateCourierAction(result.orders,'a','deliver',riderA,{pin:'000000'}).ok,false);
 result=applyCourierAction(result.orders,'a','deliver',riderA,{pin:'123456'},new Date('2026-11-19T09:11:00Z'));
 assert.ok(result.ok);assert.equal(result.order.status,'Entregado');
 assert.equal(result.order.completedAt,'2026-11-19T09:11:00.000Z');
 assert.equal(courierQueues(result.orders,riderA).active.length,0);
 assert.equal(courierQueues(result.orders,riderA).history.length,1);
});
test('Sin recogida previa no se puede iniciar ruta ni confirmar llegada',()=>{
 const accepted=applyCourierAction([order('a','Aceptado')],'a','accept',riderA,{online:true},now);
 assert.equal(validateCourierAction(accepted.orders,'a','pickup',riderA).ok,false);
 assert.equal(validateCourierAction(accepted.orders,'a','route',riderA).ok,false);
 assert.equal(validateCourierAction(accepted.orders,'a','arrive',riderA,{gpsVerified:true}).ok,false);
});
test('La cancelación en revisión detiene la progresión, una cancelada no consume cupo',()=>{
 const rows=[order('a','Cancelación solicitada',{courierAccepted:true,courierId:riderA}),order('b','Cancelado',{courierAccepted:true,courierId:riderA})];
 const q=courierQueues(rows,riderA);
 assert.deepEqual(q.active.map(o=>o.id),['a']);
 assert.deepEqual(q.history.map(o=>o.id),['b']);
 assert.equal(validateCourierAction(rows,'a','pickup',riderA).ok,false);
 assert.equal(q.slotsRemaining,1);
});
test('El objeto que recibe el panel no incluye el PIN ni identificadores personales',()=>{
 const publicOrder=courierPublicOrder(order('a','Listo',{pin:'987654',dni:'0801199000000',identity:'123'}));
 for(const field of ['pin','dni','identity'])assert.equal(Object.hasOwn(publicOrder,field),false);
 assert.equal(publicOrder.status,'Listo');
});
test('Latitudes y longitudes inválidas no se aceptan como destino verificable',()=>{
 for(const obj of [{lat:200,lng:0},{lat:0,lng:0},{lat:'NaN',lng:'NaN'},{lat:14.5,lng:199}]){
  assert.equal(courierOrderCoords({deliveryCoordinates:obj}),null);
  assert.equal(courierRestaurantCoords(obj),null);
 }
 assert.deepEqual(courierOrderCoords({deliveryCoordinates:{lat:14.78,lng:-88.77}}),{lat:14.78,lng:-88.77});
 assert.deepEqual(courierRestaurantCoords({lat:14.78,lng:-88.77}),{lat:14.78,lng:-88.77});
});
test('El reporte de incidencias solo acepta entregas propias y no afirma envío real',()=>{
 const assigned=applyCourierAction([order('a')],'a','accept',riderA,{online:true},now).order;
 assert.throws(()=>buildCourierIssue(assigned,riderB,'No encuentro al cliente',now));
 assert.throws(()=>cleanCourierIssue('Corto'),/8 a 300/);
 const issue=buildCourierIssue(assigned,riderA,'No tengo referencia del punto de entrega',now);
 assert.equal(issue.orderId,'a');
 assert.equal(issue.courierId,riderA);
 assert.match(issue.status,/Borrador local/);
 assert.equal(Object.hasOwn(issue,'address'),false);
});
test('Panel visual expone tres vistas, consentimiento GPS, PIN y test de demo explícito',()=>{
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/CourierOnlineDashboard.jsx',import.meta.url),'utf8');
 const gps=readFileSync(new URL('../src/CourierMap.jsx',import.meta.url),'utf8');
 const login=readFileSync(new URL('../src/CourierDemoLogin.jsx',import.meta.url),'utf8');
 const flags=readFileSync(new URL('../src/release-flags.js',import.meta.url),'utf8');
 for(const text of ["Disponibles","Mis entregas","Historial","Confirmar que recogí el pedido","Iniciar recorrido","Confirmar llegada al destino","Verificar PIN y finalizar entrega","Simular llegada · SOLO DEMO LOCAL","Reportar problema","Activar y probar sonido"])assert.ok(ui.includes(text),text);
 assert.ok(main.includes("page==='delivery-panel'&&INTERNAL_PREVIEW_ENABLED&&previewCourierId"));
 assert.ok(main.includes("onAction={handleCourierAction}"));
 assert.ok(main.includes("orders={courierViewOrders(orders,previewCourierId)}"));
 assert.ok(main.includes('applyCourierAction(current,orderId,action,riderId,options)'));
 assert.ok(main.includes('courierOrdersRef.current=result.orders'));
 assert.ok(main.includes("String(riderId)!==String(previewCourierId)"));
 assert.ok(login.includes('import.meta.env.DEV'));
 assert.ok(!login.includes("password==='1326'"));
 assert.ok(gps.includes("Activar mi GPS para trazar la ruta"));
 assert.ok(gps.includes('if(!gpsEnabled)return'));
 assert.ok(flags.includes('INTERNAL_PREVIEW_ENABLED'));
});
test('Accesibilidad y controles de tamaño móvil siguen presentes',()=>{
 const css=readFileSync(new URL('../src/courier-online.css',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/CourierOnlineDashboard.jsx',import.meta.url),'utf8');
 assert.ok(css.includes('@media(max-width:610px)'));
 assert.ok(css.includes('@supports not (background:color-mix'));
 assert.ok(css.includes('prefers-reduced-motion'));
 assert.ok(ui.includes('aria-label="PIN de seis dígitos"'));
 assert.ok(ui.includes('role="status"'));
});

test('El seeder de reparto genera números distintos y limita exceso de pedidos ficticios',()=>{
 const src=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(src.includes("const count=orders.filter(o=>o.demo"));
 assert.ok(src.includes("if(count>=8)"));
 assert.ok(src.includes("orderNo:prefix+'-1'"));
 assert.ok(src.includes("orderNo:prefix+'-2'"));
 assert.ok(src.includes("createdAt,acceptedAt:createdAt,readyAt:createdAt"));
});
test('La UI reanuda progreso de Preparando y no confunde errores de red con PIN malo',()=>{
 const ui=readFileSync(new URL('../src/CourierOnlineDashboard.jsx',import.meta.url),'utf8');
 assert.ok(ui.includes("status==='Preparando'||status==='Cancelación solicitada'?'Aceptado'"));
 assert.ok(ui.includes("includes('PIN incorrecto')"));
 assert.ok(ui.includes('failedPinAttempts>=3'));
 assert.ok(ui.includes('readRiderIssues(courierId)'));
 assert.ok(ui.includes("if(result?.ok)setShowArrival(false)"));
});

test('La proyección de ofertas no transmite datos privados antes de aceptar',()=>{
 const offer=order('privada','Aceptado',{
  address:'Casa privada, calle 4',name:'Persona protegida',phone:'99998888',pin:'654321',
  payment:'Efectivo',total:500,dni:'0801199912345',notes:'No tocar timbre'
 });
 const exposed=courierViewOrder(offer,riderA);
 assert.ok(exposed);
 for(const key of ['address','name','phone','pin','dni','notes','payment','total','courierId']){
  assert.equal(Object.hasOwn(exposed,key),false,key);
 }
 assert.equal(exposed.items[0].qty,1);
 assert.equal(Object.hasOwn(exposed.items[0],'name'),false);
 const claimed=applyCourierAction([offer],offer.id,'accept',riderA,{online:true},now).order;
 assert.equal(courierViewOrder(claimed,riderB),null);
 const assigned=courierViewOrder(claimed,riderA);
 assert.equal(assigned.name,'Persona protegida');
 assert.equal(assigned.address,'Casa privada, calle 4');
 assert.equal(assigned.pin,undefined);
 assert.deepEqual(courierViewOrders([offer,claimed,order('otro','Pendiente')],riderB).map(o=>o.id),['privada']);
});
test('Contador de fallos PIN se sanea, se limita a tres y se separa por identidad',()=>{
 assert.deepEqual(sanitizePinAttempts({a:1,b:30,c:-1,d:'mal',e:2}),{a:1,b:3,e:2});
 assert.deepEqual(sanitizePinAttempts('texto'),{});
 assert.deepEqual(sanitizePinAttempts(null),{});
 assert.equal(incrementPinAttempt({},'p1').p1,1);
 assert.equal(incrementPinAttempt({p1:1},'p1').p1,2);
 assert.equal(incrementPinAttempt({p1:3},'p1').p1,3);
 assert.notEqual(pinAttemptKey(riderA),pinAttemptKey(riderB));
});
test('La confirmación de aceptación y controles de PIN funcionan como flujo táctil accesible',()=>{
 const ui=readFileSync(new URL('../src/CourierOnlineDashboard.jsx',import.meta.url),'utf8');
 const modal=readFileSync(new URL('../src/CourierAcceptDialog.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/courier-accept-dialog.css',import.meta.url),'utf8');
 assert.ok(ui.includes('setPendingAccept(String(x.id))'));
 assert.ok(ui.includes('<CourierAcceptDialog order={chosenOffer||null}'));
 assert.ok(modal.includes('role="dialog"'));
 assert.ok(modal.includes("e.key==='Escape'"));
 assert.ok(modal.includes('Confirmar aceptación'));
 assert.ok(css.includes('@media(max-width:450px)'));
 assert.ok(ui.includes("type={showPin?'text':'password'}"));
 assert.ok(ui.includes('Ocultar PIN'));
 assert.ok(ui.includes('incrementPinAttempt(state,order.id)'));
 assert.ok(ui.includes('persist(pinAttemptKey(courierId),next)'));
});
test('Pago y confirmación de llegada se muestran con advertencias y GPS voluntario',()=>{
 const ui=readFileSync(new URL('../src/CourierOnlineDashboard.jsx',import.meta.url),'utf8');
 const component=readFileSync(new URL('../src/CourierGpsArrival.jsx',import.meta.url),'utf8');
 assert.ok(ui.includes('INDICACIONES DE PAGO'));
 assert.ok(ui.includes('No cobrés ni confirmés un pago sin las instrucciones'));
 assert.ok(component.includes("if(!enabled||!target)return"));
 assert.ok(component.includes('Activar GPS para verificar'));
 assert.ok(component.includes('tick-fix.timestamp<30000'));
 assert.ok(component.includes('Confirmar llegada al cliente'));
});
test('Dos toques de aceptar usan un estado adelantado inmediatamente y no anuncian un doble éxito',()=>{
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const block=main.slice(main.indexOf('function handleCourierAction('),main.indexOf('function repeatOrder('));
 assert.ok(block.includes('courierOrdersRef.current??orders'));
 assert.ok(block.includes('courierOrdersRef.current=result.orders'));
 assert.ok(!block.includes('setOrders(previous=>'));
});
