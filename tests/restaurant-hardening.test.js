import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyOrderStatus,stageElapsedMinutes,decisionForOrder,allowedDecision} from '../src/restaurant-order-flow.js';
import {neutralizeSpreadsheetFormula,quoteCsv,csvFromRows,historyCsvRows} from '../src/restaurant-export.js';
import {decodeDemoStorageEvent,recordRestaurantShift,shiftLogKey,normalizeRestaurantShiftLog} from '../src/restaurant-demo-bridge.js';

const at=new Date('2026-11-19T06:00:00.000Z');
const sample={id:'100',placeId:1,status:'Pendiente',kind:'food',createdAt:'2026-11-19T05:30:00.000Z',items:[{name:'Pollo',qty:2}]};
test('Cada etapa guarda su primera marca de tiempo sin reescribir registros anteriores',()=>{
 const accepted=applyOrderStatus(sample,'Aceptado',{},at);
 assert.equal(accepted.acceptedAt,at.toISOString());
 const start=applyOrderStatus(accepted,'Preparando',{},new Date('2026-11-19T06:05:00Z'));
 const ready=applyOrderStatus(start,'Listo',{},new Date('2026-11-19T06:21:00Z'));
 assert.equal(start.acceptedAt,at.toISOString());
 assert.equal(ready.preparingAt,'2026-11-19T06:05:00.000Z');
 assert.equal(ready.readyAt,'2026-11-19T06:21:00.000Z');
 assert.equal(applyOrderStatus(ready,'Listo'),ready);
 assert.equal(stageElapsedMinutes(start,'accepted',Date.parse('2026-11-19T06:15:00Z')),15);
 assert.equal(stageElapsedMinutes(start,'preparing',Date.parse('2026-11-19T06:15:00Z')),10);
 assert.equal(stageElapsedMinutes(sample,'accepted',Date.parse('2026-11-19T06:15:00Z')),45);
});
test('Se conserva la finalización y las marcas de recogida, entrega y rechazo',()=>{
 const delivered=applyOrderStatus({...sample,status:'En camino'},'Entregado',{},at);
 assert.equal(delivered.completedAt,at.toISOString());
 assert.equal(delivered.deliveredAt,at.toISOString());
 const pickup=applyOrderStatus({...sample,delivery:'pickup',status:'Listo'},'Recogido',{},at);
 assert.equal(pickup.completedAt,at.toISOString());
 const rejected=applyOrderStatus(sample,'Rechazado',{rejectionReason:'Sin disponibilidad'},at);
 assert.equal(rejected.rejectionReason,'Sin disponibilidad');
 assert.equal(rejected.rejectedAt,at.toISOString());
});
test('No se rechaza sin motivo válido ni se aprueba una orden ya cancelada',()=>{
 assert.equal(allowedDecision(sample,'reject'),true);
 assert.equal(allowedDecision({...sample,status:'Cancelado'},'reject'),false);
 assert.throws(()=>decisionForOrder(sample,'reject','no'),/motivo/);
 assert.deepEqual(decisionForOrder(sample,'reject','Sin ingredientes'),{status:'Rechazado',metadata:{rejectionReason:'Sin ingredientes'}});
 assert.throws(()=>decisionForOrder(sample,'approve-cancel'),/no está disponible/);
});
test('Cancelación de cocina: aprobar deja cancelado o denegar retoma preparación',()=>{
 const preparing=applyOrderStatus(applyOrderStatus(sample,'Aceptado',{},at),'Preparando',{},new Date('2026-11-19T06:02:00Z'));
 const requested=applyOrderStatus(preparing,'Cancelación solicitada',{},new Date('2026-11-19T06:03:00Z'));
 assert.equal(requested.statusBeforeCancellation,'Preparando');
 assert.deepEqual(decisionForOrder(requested,'approve-cancel'),{status:'Cancelado',metadata:{}});
 assert.throws(()=>decisionForOrder(requested,'deny-cancel','no'),/motivo/);
 const denial=decisionForOrder(requested,'deny-cancel','Comida casi lista');
 const continued=applyOrderStatus(requested,denial.status,denial.metadata,new Date('2026-11-19T06:08:00Z'));
 assert.equal(continued.status,'Preparando');
 assert.equal(continued.cancelResponse,'Rechazada');
 assert.equal(continued.cancelResponseReason,'Comida casi lista');
 assert.equal(continued.preparingAt,'2026-11-19T06:02:00.000Z');
 const cancelled=applyOrderStatus(requested,'Cancelado',{},new Date('2026-11-19T06:08:00Z'));
 assert.equal(cancelled.cancelResponse,'Aprobada');
 assert.equal(cancelled.cancelledAt,'2026-11-19T06:08:00.000Z');
});
test('Exportación CSV bloquea fórmulas y conserva comas y comillas',()=>{
 for(const value of ['=HYPERLINK("http://evil")','+SUM(1,2)','-5+2','@SUM(1)',' \t=cmd']){
  assert.ok(neutralizeSpreadsheetFormula(value).startsWith("'"),value);
 }
 assert.equal(neutralizeSpreadsheetFormula('Cliente normal'),'Cliente normal');
 const csv=csvFromRows([['nombre','nota'],['=SUM(2+3)','Dijo "Hola", gracias']]);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes('"\'=SUM(2+3)"'));
 assert.ok(csv.includes('"Dijo ""Hola"", gracias"'));
 const rows=historyCsvRows([{id:1,status:'Cancelado',name:'=1+1',cancelReason:'@CMD',total:40}]);
 assert.equal(rows.length,2);
 assert.ok(csvFromRows(rows).includes('"\'=1+1"'));
 assert.ok(csvFromRows(rows).includes('"\'@CMD"'));
});
test('Sincronización entre pestañas solo acepta arrays de pedidos/restaurantes válidos',()=>{
 const orderEvent={key:'dv_orders',newValue:JSON.stringify([{id:1,status:'Pendiente'}])};
 assert.deepEqual(decodeDemoStorageEvent(orderEvent)?.rows,[{id:1,status:'Pendiente'}]);
 assert.equal(decodeDemoStorageEvent({key:'session',newValue:'[]'}),null);
 assert.equal(decodeDemoStorageEvent({key:'dv_places',newValue:'{"admin":true}'}),null);
 assert.equal(decodeDemoStorageEvent({key:'dv_orders',newValue:'[{"name":"sin ID"}]'}),null);
 assert.equal(decodeDemoStorageEvent({key:'dv_orders',newValue:'<bad>'}),null);
 assert.equal(decodeDemoStorageEvent({key:'dv_places',newValue:'x'.repeat(3_500_001)}),null);
});
test('Relevo se conserva por restaurante y muestra cuántos pedidos abiertos quedan',()=>{
 const record=recordRestaurantShift(1,'La impresora necesita papel y la cocina ya está avisada.',[
  {placeId:1,status:'Pendiente'},{placeId:1,status:'Preparando'},{placeId:1,status:'Entregado'},{placeId:2,status:'Pendiente'}
 ],at);
 assert.equal(record.activeOrders,2);
 assert.equal(record.restaurantId,'1');
 assert.equal(record.at,at.toISOString());
 assert.equal(shiftLogKey(1),'dv_online_shiftLog_1');
 assert.notEqual(shiftLogKey(1),shiftLogKey(2));
 assert.throws(()=>recordRestaurantShift(1,'ok'),/nota de relevo/);
});
test('La vista de Caja no debe modificar estados de Cocina y viceversa',()=>{
 const src=readFileSync(new URL('../src/OnlineWorkspace.jsx',import.meta.url),'utf8');
 assert.ok(src.includes("screen!==areaScreen"));
 assert.ok(src.includes("screen==='inicio'&&current.status==='Pendiente'"));
 assert.ok(src.includes("screen==='kitchen'&&current.status==='Aceptado'"));
 assert.ok(src.includes('RestaurantOrderDecisionDialog'));
 assert.ok(src.includes("onUpdate(decisionOrder.id,status,metadata,decisionOrder.status,'cashier',business?.id)"));
 assert.ok(src.includes('if(!response?.ok)'));
 assert.ok(src.includes('csvFromRows(historyCsvRows(records))'));
});
test('El guardado de pruebas es tolerante a fallas de almacenamiento',()=>{
 const src=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(src.includes('decodeDemoStorageEvent'));
 assert.ok(src.includes("window.addEventListener('storage',syncDemoTab)"));
 assert.ok(src.includes('storageAlertShown.current'));
});

test('Cancelación de un pedido aceptado puede volver a Aceptado al rechazar la solicitud',()=>{
 const accepted=applyOrderStatus(sample,'Aceptado',{},at);
 const requested=applyOrderStatus(accepted,'Cancelación solicitada',{},new Date('2026-11-19T06:10:00Z'));
 const result=decisionForOrder(requested,'deny-cancel','Ya empezó la preparación');
 assert.equal(result.status,'Aceptado');
 const saved=applyOrderStatus(requested,result.status,result.metadata,new Date('2026-11-19T06:15:00Z'));
 assert.equal(saved.status,'Aceptado');
 assert.equal(saved.acceptedAt,at.toISOString());
 assert.equal(saved.cancelResponse,'Rechazada');
});
test('Cancelaciones de pedidos aceptados se revisan en Caja, no se borran directamente',()=>{
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(main.includes('cancelDemoOrder(latest,cancelOrder.id,reason)'));
 assert.ok(main.includes('courierOrdersRef.current=outcome.orders'));
});

test('Preview local permite probar varios restaurantes sin exponer login ficticio en la web pública',()=>{
 const login=readFileSync(new URL('../src/AffiliateOnline.jsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.ok(login.includes('Restaurante de demostración'));
 assert.ok(login.includes('places.map(p=><option'));
 assert.ok(login.includes('onLogin(restaurantId)'));
 assert.ok(login.includes('import.meta.env.DEV'));
 assert.ok(main.includes('restaurantId={previewRestaurantId??places[0]?.id}'));
 assert.ok(main.includes('INTERNAL_PREVIEW_ENABLED&&affiliateSession'));
});

test('Relevo local dañado no rompe Caja ni muestra notas de otro negocio',()=>{
 const good=recordRestaurantShift('A','Se entregó el inventario al siguiente turno.',[],at);
 const other={...good,id:'other',restaurantId:'B'};
 assert.deepEqual(normalizeRestaurantShiftLog('texto','A'),[]);
 assert.deepEqual(normalizeRestaurantShiftLog({records:[good]},'A'),[]);
 assert.deepEqual(normalizeRestaurantShiftLog(null,'A'),[]);
 const recovered=normalizeRestaurantShiftLog([
  null,[],{id:'invalid',restaurantId:'A',note:'',at:'mal',activeOrders:'dos'},
  other,good,{...good,id:'bad-date',at:'no es fecha'},
  {...good,id:'bad-orders',activeOrders:-3}
 ],'A');
 assert.equal(recovered.length,1);
 assert.equal(recovered[0].restaurantId,'A');
 assert.equal(recovered[0].note,good.note);
 assert.equal(recovered[0].activeOrders,0);
 const long=Array.from({length:35},(_,i)=>({...good,id:'shift-'+i}));
 assert.equal(normalizeRestaurantShiftLog(long,'A').length,25);
 const workspace=readFileSync(new URL('../src/OnlineWorkspace.jsx',import.meta.url),'utf8');
 assert.ok(workspace.includes('normalizeRestaurantShiftLog(get('));
});

test('Eventos de otras pestañas rechazan productos dañados antes de cambiar la tienda',()=>{
 const valid={key:'dv_places',newValue:JSON.stringify([{id:1,name:'Negocio',items:[{id:100,name:'Pizza',price:90}]}])};
 assert.deepEqual(decodeDemoStorageEvent(valid)?.rows[0].items[0].name,'Pizza');
 const invalid=[
  {key:'dv_places',newValue:JSON.stringify([{id:1,items:[null]}])},
  {key:'dv_places',newValue:JSON.stringify([{id:1,items:[{id:100,name:'Pizza',price:{bogus:true}}]}])},
  {key:'dv_orders',newValue:JSON.stringify([{id:1,status:null}])},
 ];
 for(const event of invalid)assert.equal(decodeDemoStorageEvent(event),null);
 assert.deepEqual(decodeDemoStorageEvent({key:'dv_orders',newValue:JSON.stringify([{id:'X',status:'Pendiente'}])})?.rows[0].status,'Pendiente');
});
