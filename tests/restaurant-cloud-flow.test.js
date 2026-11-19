import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kitchenQueues,elapsedMinutes,kitchenTicketHtml,belongsToRestaurant,openKitchenTicket} from '../src/kitchen-operations.js';

const order=(id,status,placeId='r1',options={})=>({
 id,orderNo:'#DV-'+id,kind:'food',placeId,status,delivery:'delivery',name:'Cliente',
 createdAt:'2026-11-18T18:00:00.000Z',items:[{name:'Pollo con tajadas',qty:2}],...options,
});
const now=Date.parse('2026-11-18T19:00:00.000Z');
test('Caja recibe pendientes; Cocina solo órdenes aceptadas, preparando y listos',()=>{
 const orders=[order('a','Pendiente'),order('b','Aceptado'),order('c','Preparando'),order('d','Listo'),order('e','Cancelado'),order('f','Entregado')];
 const q=kitchenQueues(orders,'r1',now);
 assert.deepEqual(q.pending.map(o=>o.id),['a']);
 assert.deepEqual(q.accepted.map(o=>o.id),['b']);
 assert.deepEqual(q.preparing.map(o=>o.id),['c']);
 assert.deepEqual(q.ready.map(o=>o.id),['d']);
 assert.ok(!['e','f'].some(id=>Object.values(q).some(a=>a.some(o=>o.id===id))));
});
test('Aísla restaurante; evita mostrar pedidos programados para más tarde',()=>{
 const orders=[order('a','Aceptado'),order('b','Aceptado','r2'),order('c','Aceptado','r1',{scheduledFor:'2026-11-19T21:00:00.000Z'}),order('d','Aceptado','r1',{createdAt:'2026-11-17T17:00:00.000Z'})];
 assert.deepEqual(kitchenQueues(orders,'r1',now).accepted.map(x=>x.id),['d','a']);
 assert.deepEqual(kitchenQueues(orders,'r2',now).accepted.map(x=>x.id),['b']);
 assert.equal(belongsToRestaurant({kind:'grocery',placeId:'r1'},'r1'),false);
 assert.deepEqual(kitchenQueues(orders,undefined,now).accepted,[]);
});
test('Cronómetro de cocina tolera falta de fecha sin tiempo negativo',()=>{
 assert.equal(elapsedMinutes(order('b','Preparando'),now),60);
 assert.equal(elapsedMinutes(order('b','Preparando','r1',{createdAt:'2026-11-19T00:00:00.000Z'}),now),0);
 assert.equal(elapsedMinutes(order('b','Preparando','r1',{createdAt:'fecha inválida'}),now),null);
});
test('La comanda es exclusiva de cocina, sin precio, PIN, dirección ni teléfono',()=>{
 const o=order('b','Aceptado','r1',{name:'Cliente Privado',pin:'1234',phone:'9999-9999',address:'Barrio Central',total:750,notes:'Sin cebolla',items:[{name:'Baleada',qty:3,extras:['Aguacate','Queso'],instructions:'Bien caliente'}]});
 const html=kitchenTicketHtml(o,'Comedor Los Pinos',new Date(now));
 assert.match(html,/Comedor Los Pinos/);
 assert.match(html,/#DV-b/);
 assert.match(html,/3 ×/);
 assert.match(html,/Aguacate/);
 assert.match(html,/Bien caliente/);
 assert.match(html,/Sin cebolla/);
 for(const privateValue of ['9999-9999','Barrio Central','1234','Cliente Privado','750'])assert.ok(!html.includes(privateValue),privateValue);
 assert.match(html,/No es factura ni comprobante fiscal/);
 assert.throws(()=>kitchenTicketHtml(order('a','Pendiente')),/Solo se imprime/);
 assert.throws(()=>kitchenTicketHtml(order('a','Cancelado')),/Solo se imprime/);
});
test('Escapa caracteres peligrosos de los pedidos al generar ticket',()=>{
 const html=kitchenTicketHtml(order('b','Aceptado','r1',{notes:'<script>alert("x")</script>',items:[{name:'<img src=x onerror="bad">',qty:1}]}),'Restaurante "Seguro"');
 assert.ok(!html.includes('<script>alert'));
 assert.ok(!html.includes('<img src=x'));
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(html.includes('&lt;img'));
 assert.ok(html.includes('&quot;Seguro&quot;'));
});
test('La impresión siempre nace de una acción explícita y controla popups bloqueados',()=>{
 assert.equal(openKitchenTicket(order('a','Pendiente'),'Negocio',()=>{throw Error('No se debe abrir')}),false);
 assert.equal(openKitchenTicket(order('b','Aceptado'),'Negocio',()=>null),false);
 let written='',printed=false,focused=false,closed=false;
 const fakeWindow={document:{write:x=>{written=x},close:()=>{closed=true}},focus:()=>{focused=true},print:()=>{printed=true}};
 assert.equal(openKitchenTicket(order('b','Aceptado'),'Negocio',()=>fakeWindow),true);
 assert.ok(written.includes('COMANDA DE COCINA'));
 assert.ok(focused&&closed&&printed);
});
test('Separación de pantallas y estados en el panel Online',()=>{
 const src=readFileSync(new URL('../src/OnlineWorkspace.jsx',import.meta.url),'utf8');
 const kitchen=readFileSync(new URL('../src/RestaurantKitchenDisplay.jsx',import.meta.url),'utf8');
 const cashier=readFileSync(new URL('../src/RestaurantCashierConsole.jsx',import.meta.url),'utf8');
 assert.ok(src.includes("['inicio','Caja / Recepción'"));
 assert.ok(src.includes("['kitchen','Cocina'"));
 assert.ok(src.includes("<RestaurantCashierConsole"));
 assert.ok(src.includes("<RestaurantKitchenDisplay"));
 assert.ok(src.includes("const list=orders.filter(o=>o.kind==='food'&&business&&String(o.placeId)===String(business.id))"));
 assert.ok(cashier.includes("onAccept(order)"));
 assert.ok(cashier.includes('Aceptar y enviar a cocina'));
 assert.ok(kitchen.includes("kitchenQueues(orders,restaurantId,now)"));
 assert.ok(kitchen.includes("onChange(order,stage.next)"));
 assert.ok(kitchen.includes('Comanda'));
 assert.ok(kitchen.includes('Las nuevas solicitudes'));
 assert.ok(kitchen.includes('se requiere la conexión segura del servidor'));
});
