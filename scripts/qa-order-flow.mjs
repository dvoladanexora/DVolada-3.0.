import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createLiveApi } from '../src/live/live-api.js';

const baseUrl = 'https://dvolada-qa.dvoladanexora.workers.dev';
const { identities, restaurants } = JSON.parse(await readFile(process.argv[2], 'utf8'));
const client = (label, fetchImpl) => createLiveApi({
  baseUrl,
  getSessionToken: () => identities[label]?.token,
  fetchImpl,
});
const key = () => randomUUID();
const report = [];
const admin = client('Admin');
const before = (await admin.adminOverview()).orders.delivered;
const catalog = await client().restaurants();
assert.equal(catalog.restaurants.length, 2);

async function flow(suffix, otherSuffix) {
  const { id: restaurant, product } = restaurants[suffix];
  const customer = client('Cliente ' + suffix);
  const manager = client('Gerencia ' + suffix);
  const kitchen = client('Cocina ' + suffix);
  const courierLabel = 'Repartidor ' + suffix;
  const courier = client(courierLabel);
  const other = client('Cliente ' + otherSuffix);
  const otherManager = client('Gerencia ' + otherSuffix);
  const otherCourier = client('Repartidor ' + otherSuffix);
  const intent = {
    restaurantId: restaurant,
    deliveryMethod: 'delivery',
    deliveryAddress: 'Dirección ficticia QA ' + suffix,
    phone: suffix === 'A' ? '+50400000001' : '+50400000002',
    items: [{ productId: product, quantity: 1 }],
  };
  const requestKey = key();
  const brokenConnection = client('Cliente ' + suffix, async (...args) => {
    await fetch(...args);
    throw Error('Simulated loss of the server response');
  });
  await assert.rejects(brokenConnection.createOrder(intent, requestKey), { code: 'SIN_CONEXION' });
  const [created, repeated] = await Promise.all([
    customer.createOrder(intent, requestKey),
    customer.createOrder(intent, requestKey),
  ]);
  const { id, orderNumber } = created.order;
  assert.equal(repeated.order.id, id);
  assert.equal(repeated.replayed, true);
  assert.equal(created.replayed, true);
  const statuses = [];
  async function verify(expected) {
    const { order } = await customer.customerOrder(id);
    assert.equal(order.status, expected);
    statuses.push({ status: expected, version: order.version });
    return order;
  }
  let order = await verify('Pendiente');
  assert((await manager.restaurantOrders(restaurant)).orders.some(item => item.id === id));
  assert(!(await other.customerOrders()).orders.some(item => item.id === id));
  await assert.rejects(other.customerOrder(id), { status: 404 });
  await assert.rejects(otherManager.restaurantOrder(restaurant, id), { status: 403 });
  await assert.rejects(customer.adminOverview(), { status: 403 });

  await manager.restaurantStatus(restaurant, order, 'Aceptado', key());
  order = await verify('Aceptado');
  await kitchen.restaurantStatus(restaurant, order, 'Preparando', key());
  order = await verify('Preparando');
  await kitchen.restaurantStatus(restaurant, order, 'Listo', key());
  order = await verify('Listo');

  await manager.assignCourier(restaurant, order, identities[courierLabel].id, key());
  order = (await courier.courierOrders()).orders.find(item => item.id === id);
  assert.equal(order.courierResponse, 'offered');
  assert(!(await otherCourier.courierOrders()).orders.some(item => item.id === id));
  await courier.courierOffer(order, 'accept', key());
  order = (await courier.courierOrders()).orders.find(item => item.id === id);
  assert.equal(order.courierResponse, 'accepted');
  for (const status of ['Recogido', 'En camino', 'En ubicación']) {
    await courier.courierStatus(order, status, key());
    order = await verify(status);
  }
  const invalidPin = created.deliveryPin === '000000' ? '000001' : '000000';
  await assert.rejects(courier.courierDeliver(order, invalidPin, key()), { code: 'PIN_INVALID' });
  await verify('En ubicación');
  await courier.courierDeliver(order, created.deliveryPin, key());
  await verify('Entregado');
  const { events } = await manager.restaurantChanges(restaurant);
  const persisted = events.filter(event => event.order_id === id);
  assert(persisted.some(event => event.to_status === 'Entregado'));
  report.push({ id, orderNumber, statuses, events: persisted.length });
}
await Promise.all([flow('A', 'B'), flow('B', 'A')]);
assert.equal((await admin.adminOverview()).orders.delivered, before + 2);
if (identities.Expired) await assert.rejects(client('Expired').me(), { status: 401 });
console.log(JSON.stringify({ passed: true, orders: report, expiredSession: Boolean(identities.Expired) }, null, 2));
