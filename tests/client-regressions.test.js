import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const chat=readFileSync(new URL('../src/DraggableChatFab.jsx',import.meta.url),'utf8');

test('R10: catalog shows each item photo when available and a placeholder otherwise',()=>{
 assert.match(app,/item\.image\?<img src=\{item\.image\}/);
 assert.match(app,/dv-food-photo-placeholder/);
});
test('R14/R15: cart groups and orders are separated by restaurant',()=>{
 assert.match(app,/const cartGroups=\[\.\.\.new Set\(cart\.map\(i=>String\(i\.placeId\)\)\)\]/);
 assert.match(app,/const groups=\[\.\.\.new Set\(cart\.map\(x=>String\(x\.placeId\)\)\)\]/);
 assert.match(app,/placeId:items\[0\]\.placeId,placeName:items\[0\]\.placeName/);
 assert.doesNotMatch(app,/¿Cambiar de restaurante\?/);
});
test('R14: quantity and notes target product and restaurant',()=>{
 assert.match(app,/quantity\(i\.id,-1,i\.placeId\)/);
 assert.match(app,/quantity\(i\.id,1,i\.placeId\)/);
 assert.match(app,/editCartInstruction\(i\.id,e\.target\.value,i\.placeId\)/);
});
test('R17: coupon field accepts input but does not invent a discount',()=>{
 assert.match(app,/id="dv-coupon-code"/);
 assert.match(app,/onChange=\{e=>setCoupon/);
 assert.doesNotMatch(app,/id="dv-coupon-code"[^>]*disabled/);
 assert.match(app,/descuentos todavía no están activos/);
});
test('R20: home catalog searches food by item and restaurant',()=>{
 assert.match(app,/const homeFoodCatalog=customerCatalog\.filter/);
 assert.match(app,/\[item\.name,item\.category,place\.name\]/);
});
test('R23: chat FAB has drag gestures and stored position',()=>{
 assert.match(chat,/dv_chat_fab_position/);
 assert.match(chat,/onPointerMove/);
});

test('Inicio: search ignores accents and case and explains empty categories',()=>{
 assert.match(app,/normalizeFoodSearch=value=>/);
 assert.match(app,/\.normalize\('NFD'\)/);
 assert.match(app,/const homeFoodQuery=normalizeFoodSearch\(headerSearch\)/);
 assert.match(app,/normalizeFoodSearch\(v\)\.includes\(homeFoodQuery\)/);
 assert.match(app,/No hay productos disponibles en esta categoría/);
});

const homeCss=readFileSync(new URL('../src/home-catalog.css',import.meta.url),'utf8');
test('Inicio: responsive theme and keyboard accessibility safeguards',()=>{
 assert.match(homeCss,/\[data-theme="dark"\] \.dv-food-feed-card/);
 assert.match(homeCss,/\.dv-food-feed-open:focus-visible/);
 assert.match(homeCss,/@media\(max-width:360px\)/);
 assert.match(homeCss,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(homeCss,/overflow-wrap:anywhere/);
});

test('Restaurantes: search tolerates accents and missing item lists',()=>{
 assert.match(app,/normalizeFoodSearch\(\[p\.name,p\.type,\.\.\.\(p\.items\|\|\[\]\)/);
 assert.match(app,/\.includes\(normalizeFoodSearch\(search\)\)/);
});
test('Restaurantes: prices ignore unavailable products',()=>{
 assert.match(app,/const cheapest=\(p\.items\|\|\[\]\)\.filter\(i=>i\.available!==false&&i\.soldOut!==true\)/);
 assert.match(app,/i\.available!==false&&i\.soldOut!==true&&Number\(i\.price\)<=/);
});

const restaurantCss=readFileSync(new URL('../src/restaurant-profile.css',import.meta.url),'utf8');
test('Restaurantes: responsive shelves, dark theme and keyboard focus',()=>{
 assert.match(homeCss,/\.dv-shelf-food:disabled/);
 assert.match(homeCss,/\.dv-shelf-food:focus-visible/);
 assert.match(homeCss,/@media\(max-width:420px\)/);
 assert.match(homeCss,/\[data-theme="dark"\] \.dv-shelf-food/);
 assert.match(restaurantCss,/\.dv-rp-item-title:focus-visible/);
 assert.match(restaurantCss,/@media\(max-width:360px\)/);
});

const restaurantProfile=readFileSync(new URL('../src/RestaurantProfile.jsx',import.meta.url),'utf8');
test('Restaurantes: profile search handles accents and structured extras',()=>{
 assert.match(restaurantProfile,/const normalizeQuery=value=>/);
 assert.match(restaurantProfile,/normalizeQuery\(query\)/);
 assert.match(restaurantProfile,/item\.extras\.map\(extra=>typeof extra==='string'/);
});

test('Mis pedidos: filter includes intermediate delivery statuses',()=>{
 for(const status of ['Aceptado','Preparando','Listo','Recogido','En camino','En ubicación']){
  assert.ok(app.includes('<option>'+status+'</option>'),'Missing filter '+status);
 }
});
test('Mis pedidos: searches order identifiers and products without accent sensitivity',()=>{
 assert.equal((app.match(/normalizeFoodSearch\(historyQuery\)/g)||[]).length,4);
});

const customerStyles=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('Mis pedidos: small-screen, dark-theme and keyboard safeguards',()=>{
 assert.match(customerStyles,/\.dv32 \.dv-orders-tabs button:focus-visible/);
 assert.match(customerStyles,/\.dv32 \.dv-chat-panel select/);
 assert.match(customerStyles,/\[data-theme="dark"\] \.dv32 \.dv-orders-tabs button.active/);
 assert.match(customerStyles,/@media\(max-width:420px\)/);
 assert.match(customerStyles,/\.dv32 \.dv-history-actions\{display:grid;grid-template-columns:1fr\}/);
});

test('Mis pedidos: empty states respect filters and canceled orders go to history',()=>{
 assert.match(app,/setOrdersTab\(immediate\?'history':'pending'\)/);
 assert.match(app,/setHistoryStatus\('Todos'\)/);
 assert.equal((app.match(/title="Sin pedidos que coincidan"/g)||[]).length,2);
 assert.equal((app.match(/\.includes\(normalizeFoodSearch\(historyQuery\)\)\)\)\.length===0/g)||[]).length,2);
});

test('Mandados: submit button follows phone, address, budget and connectivity validation',()=>{
 assert.match(app,/disabled=\{isOffline\|\|!list\.length/);
 assert.match(app,/guestPhone\.replace\(\/\\D\/g,''\)\.length<8/);
 assert.match(app,/address\.trim\(\)\.length<8/);
 assert.match(app,/!Number\.isFinite\(Number\(budget\)\)/);
});
test('Mandados: list items are trimmed and removable by accessible name',()=>{
 assert.match(app,/name:newItem\.trim\(\),qty:newQty\.trim\(\)/);
 assert.match(app,/aria-label=\{'Quitar '\+i\.name\+' de la lista'\}/);
 assert.match(app,/const id='DM-'\+Date\.now\(\)\.toString\(36\)/);
});

test('Mandados: fields are labeled and phone keyboard is appropriate',()=>{
 for(const field of ['dv-grocery-budget','dv-grocery-substitute','dv-grocery-name','dv-grocery-phone','dv-grocery-address']){
  assert.ok(app.includes('htmlFor="'+field+'"'));
  assert.ok(app.includes('id="'+field+'"'));
 }
 assert.match(app,/id="dv-grocery-phone" type="tel" inputMode="tel"/);
});
test('Mandados: responsive panels and dark theme are scoped',()=>{
 assert.match(customerStyles,/\.dv-groceries-layout\{grid-template-columns:minmax\(0,1\.15fr\)/);
 assert.match(customerStyles,/@media\(max-width:850px\)\{\.dv-groceries-layout/);
 assert.match(customerStyles,/\.dv-groceries-page \.add-grid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(customerStyles,/\[data-theme="dark"\] \.dv-groceries-page \.surface/);
});

test('Favoritos: stale saved entries do not suppress empty-state guidance',()=>{
 assert.match(app,/customerCatalog\.some\(x=>customerWishlist\.includes\(String\(x\.place\.id\)/);
 assert.match(app,/places\.some\(p=>favorites\.some\(id=>String\(id\)===String\(p\.id\)\)\)/);
 assert.match(app,/No hay comidas habituales disponibles en el catálogo actual/);
});
test('Favoritos: removal uses normalized product keys and an accessible label',()=>{
 assert.match(app,/aria-label=\{'Quitar '\+x\.item\.name\+' de comidas favoritas'\}/);
 assert.match(app,/v\.filter\(k=>k!==String\(x\.place\.id\)\+'-'\+String\(x\.item\.id\)\)/);
});

test('Favoritos: cards show available photos and semantic controls',()=>{
 assert.match(app,/className="surface dv-favorite-product-card"/);
 assert.match(app,/className="dv-favorite-product-image"/);
 assert.match(app,/alt=\{'Foto de '\+x\.item\.name\}/);
 assert.match(app,/<article className="surface dv-favorite-product-card"/);
});
test('Favoritos: mobile, keyboard and dark theme styles are scoped',()=>{
 assert.match(customerStyles,/\.dv32 \.dv-favorites-products\{display:grid/);
 assert.match(customerStyles,/\.dv32 \.dv-favorite-product-image\{display:block/);
 assert.match(customerStyles,/\.dv32 \.dv-favorites-page button:focus-visible/);
 assert.match(customerStyles,/\[data-theme="dark"\] \.dv32 \.dv-favorite-product-card/);
});

test('Favoritos: saved IDs are normalized consistently when rendering cards',()=>{
 assert.match(app,/customerCatalog\.filter\(x=>customerWishlist\.includes\(String\(x\.place\.id\)\+'-'\+String\(x\.item\.id\)\)\)/);
 assert.match(app,/places\.filter\(p=>favorites\.some\(id=>String\(id\)===String\(p\.id\)\)\)/);
});

test('Mi cuenta: local profile validates contact fields before saving',()=>{
 assert.match(app,/profile\.name\.trim\(\)\.length<2/);
 assert.match(app,/profile\.phone\.replace\(\/\\D\/g,''\)\.length<8/);
 assert.match(app,/profile\.address\.trim\(\)\.length<8/);
 assert.match(app,/setGuestName\(next\.name\)/);
});
test('Mi cuenta: image uploads validate MIME type and phone uses telephone input',()=>{
 assert.match(app,/!file\.type\.startsWith\('image\/'\)/);
 assert.match(app,/file\.size>1500000/);
 assert.match(app,/type=\{key==='phone'\?'tel':'text'\}/);
});

test('Mi cuenta: photo and saved-address controls have accessible names',()=>{
 assert.match(app,/aria-label="Seleccionar foto de perfil"/);
 assert.match(app,/aria-label=\{"Usar dirección "\+a\}/);
 assert.match(app,/aria-label=\{"Establecer dirección predeterminada "\+a\}/);
});
test('Mi cuenta: narrow screens, dark theme and keyboard focus are supported',()=>{
 assert.match(customerStyles,/\.dv32 \.dv-account-modern \.dv-address-row button\{min-height:44px/);
 assert.match(customerStyles,/@media\(max-width:600px\)/);
 assert.match(customerStyles,/\[data-theme="dark"\] \.dv32 \.dv-account-modern \.dv-profile-card/);
 assert.match(customerStyles,/\.dv32 \.dv-account-modern button:focus-visible/);
});

test('Invitar amigos: sharing URL uses URL API and encodes referral code',()=>{
 assert.match(app,/new URL\(import\.meta\.env\.BASE_URL,window\.location\.origin\)/);
 assert.match(app,/url\.searchParams\.set\('ref',inviteCode\)/);
});
test('Invitar amigos: copy and share give feedback for unsupported browsers and errors',()=>{
 assert.match(app,/Copiar no está disponible en este navegador/);
 assert.match(app,/Compartir no está disponible en este navegador/);
 assert.match(app,/No se pudo copiar el enlace/);
 assert.match(app,/e\?\.name!=='AbortError'/);
});

test('Invitar amigos: page and invitation code have accessible structure',()=>{
 assert.match(app,/page-section dv-invite-page/);
 assert.match(app,/className="dv-invite-code" aria-label=\{"Código de invitación "\+inviteCode\}/);
});
test('Invitar amigos: responsive layout and dark mode keep QR and buttons usable',()=>{
 assert.match(customerStyles,/\.dv32 \.dv-invite-page \.dv-invite-panel\{display:grid/);
 assert.match(customerStyles,/\.dv32 \.dv-invite-page \.dv-invite-qr img\{display:block/);
 assert.match(customerStyles,/\[data-theme="dark"\] \.dv32 \.dv-invite-page \.dv-invite-panel/);
 assert.match(customerStyles,/@media\(max-width:420px\)/);
 assert.match(customerStyles,/\.dv32 \.dv-invite-page button:focus-visible/);
});

const clubSource=readFileSync(new URL('../src/GrowthFeatures.jsx',import.meta.url),'utf8');
test('Dvolada Club: demo points never become negative with malformed coupon data',()=>{
 assert.match(clubSource,/const spentPoints=Array\.isArray\(coupon\)/);
 assert.match(clubSource,/const availablePoints=Math\.max\(0,points-spentPoints\)/);
 assert.match(clubSource,/if\(availablePoints<100\)return/);
});
test('Dvolada Club: rewards persist before success and remain explicitly demo',()=>{
 assert.match(clubSource,/localStorage\.setItem\('dv_demo_coupons',JSON\.stringify\(next\)\)/);
 assert.match(clubSource,/catch\{window\.alert\('No se pudo guardar el cupón de demostración/);
 assert.match(clubSource,/Los cupones no modifican el total del pedido todavía/);
});

const clubStyles=readFileSync(new URL('../src/growth-features.css',import.meta.url),'utf8');
test('Dvolada Club: dashboard and redemption are scoped to Club',()=>{
 assert.match(clubSource,/page-section gx gx-club/);
 assert.match(clubSource,/className="gx-card gx-club-redeem"/);
 assert.match(clubSource,/aria-label="Resumen de puntos Dvolada Club"/);
});
test('Dvolada Club: responsive stats and dark mode styles are present',()=>{
 assert.match(clubStyles,/\.dv32 \.gx-club \.gx-stats\{display:grid/);
 assert.match(clubStyles,/@media\(max-width:420px\)/);
 assert.match(clubStyles,/\[data-theme="dark"\] \.dv32 \.gx-club \.gx-stats article/);
 assert.match(clubStyles,/\.dv32 \.gx-club button:focus-visible/);
});

const groupSource=readFileSync(new URL('../src/OperationsExtras.jsx',import.meta.url),'utf8');
test('Pedidos grupales: validates names and notes and keeps requests local',()=>{
 assert.match(groupSource,/name\.length<3\|\|name\.length>80/);
 assert.match(groupSource,/notes\.length>300/);
 assert.match(groupSource,/id:'GR-'\+id\(\)/);
 assert.match(groupSource,/Las personas todavía no pueden agregar productos desde otros teléfonos/);
});
test('Pedidos grupales: copy failures, empty state and removal are handled',()=>{
 assert.match(groupSource,/navigator\.clipboard\?\.writeText/);
 assert.match(groupSource,/No se pudo copiar el código/);
 assert.match(groupSource,/Aún no creaste grupos en este dispositivo/);
 assert.match(groupSource,/¿Eliminar este grupo de demostración\?/);
});

const groupStyles=readFileSync(new URL('../src/operations-extras.css',import.meta.url),'utf8');
test('Pedidos grupales: group-only layout wrapper is valid JSX',()=>{
 assert.match(groupSource,/if\(type==='group'\)return <div className="ox-group-page">\{wrap\(/);
 assert.match(groupSource,/Aún no creaste grupos en este dispositivo\.<\/p>\)\}<\/div>\);?\}<\/div>;/);
});
test('Pedidos grupales: responsive panels, dark theme and keyboard focus are scoped',()=>{
 assert.match(groupStyles,/\.dv32 \.ox-group-page \.ox-grid\{display:grid/);
 assert.match(groupStyles,/@media\(max-width:760px\)/);
 assert.match(groupStyles,/\[data-theme="dark"\] \.dv32 \.ox-group-page \.ox-panel/);
 assert.match(groupStyles,/\.dv32 \.ox-group-page \.ox-btn:focus-visible/);
});

test('Dvolada Express: validates demo delivery fields and distinct addresses',()=>{
 assert.match(groupSource,/name\.length<2\|\|name\.length>80/);
 assert.match(groupSource,/pickup\.length<5\|\|pickup\.length>180/);
 assert.match(groupSource,/dropoff\.length<5\|\|dropoff\.length>180/);
 assert.match(groupSource,/description\.length>500/);
 assert.match(groupSource,/pickup\.toLocaleLowerCase\('es'\)===dropoff\.toLocaleLowerCase\('es'\)/);
});
test('Dvolada Express: local requests have distinct IDs, empty state and safe removal',()=>{
 assert.match(groupSource,/id:'EX-'\+id\(\),status:'Sin asignar'/);
 assert.match(groupSource,/No hay solicitudes de Express guardadas en este dispositivo/);
 assert.match(groupSource,/¿Eliminar esta solicitud local de demostración\?/);
 assert.match(groupSource,/No se envían a repartidores ni calculan tarifas reales/);
});

test('Dvolada Express: isolated JSX wrapper is present',()=>{
 assert.match(groupSource,/if\(type==='express'\)return <div className="ox-express-page">\{wrap\(/);
 assert.match(groupSource,/No hay solicitudes de Express guardadas en este dispositivo\.<\/p>\)\}<\/div>\)\}<\/div>;/);
});
test('Dvolada Express: mobile layout, dark mode and focus styling',()=>{
 assert.match(groupStyles,/\.dv32 \.ox-express-page \.ox-grid\{display:grid/);
 assert.match(groupStyles,/@media\(max-width:760px\)/);
 assert.match(groupStyles,/\[data-theme="dark"\] \.dv32 \.ox-express-page \.ox-panel/);
 assert.match(groupStyles,/\.dv32 \.ox-express-page \.ox-btn:focus-visible/);
});

test('Más opciones: accessible modal closes on Escape',()=>{
 assert.match(app,/className="dv-more-sheet" role="dialog" aria-modal="true"/);
 assert.match(app,/onKeyDown=\{e=>\{if\(e\.key==='Escape'\)/);
 assert.match(app,/aria-label="Cerrar más opciones"/);
});
test('Más opciones: theme and motion controls remain explicit',()=>{
 assert.match(app,/aria-pressed=\{theme==='light'\}/);
 assert.match(app,/aria-pressed=\{theme==='dark'\}/);
 assert.match(app,/aria-pressed=\{theme==='system'\}/);
 assert.match(app,/checked=\{reduceAnimations\}/);
 assert.match(app,/aria-label="Buscar actualizaciones y recargar Dvolada"/);
});

const moreStyles=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
test('Más opciones: responsive modal stays within viewport',()=>{
 assert.match(moreStyles,/\.dv-more-sheet\{box-sizing:border-box;min-width:0;width:min\(94vw,480px\)/);
 assert.match(moreStyles,/@media\(max-width:480px\)\{\.dv-more-backdrop/);
 assert.match(moreStyles,/max-height:calc\(100dvh - 20px\)/);
});
test('Más opciones: appearance controls have dark and keyboard styling',()=>{
 assert.match(moreStyles,/\.dv-more-sheet \.dv-more-theme-choices\{display:grid/);
 assert.match(moreStyles,/\[data-theme="dark"\] \.dv-more-sheet \.dv-more-appearance/);
 assert.match(moreStyles,/\.dv-more-sheet button:focus-visible/);
 assert.match(moreStyles,/@media\(prefers-reduced-motion:reduce\)\{\.dv-more-sheet/);
});

test('Auditoría cliente: route permissions are applied before writing browser history',()=>{
 const navigate=app.slice(app.indexOf('const navigate=p=>'),app.indexOf('function addItem(',app.indexOf('const navigate=p=>')));
 assert.ok(navigate.indexOf("if(guestMode&&")>=0);
 assert.ok(navigate.indexOf("if(['business','partner-plus','partner-hub'].includes(p)&&!affiliateSession)")>=0);
 assert.ok(navigate.indexOf('window.history.pushState')>navigate.indexOf("if(['partner-plus','partner-hub'].includes(p))"));
});
test('Auditoría cliente: checkout requires a useful delivery address',()=>{
 assert.match(app,/delivery==='delivery'&&address\.trim\(\)\.length<8/);
 assert.match(app,/const catalogProblem=checkCartCatalog\(\)/);
 assert.match(app,/if\(isOffline\)\{notify\('Sin conexión: el pedido no puede confirmarse/);
});

test('Auditoría checkout: scheduled dates must be valid before confirming',()=>{
 assert.match(app,/!Number\.isFinite\(new Date\(scheduleAt\)\.getTime\(\)\)/);
 assert.match(app,/address\.trim\(\)\.length<8/);
});

test('Auditoría carrito: customized products use collision-resistant line IDs',()=>{
 assert.match(app,/id:item\.id\+'-'\+\(typeof crypto!=='undefined'&&typeof crypto\.randomUUID==='function'\?crypto\.randomUUID\(\)/);
 assert.doesNotMatch(app,/id:item\.id\+'-'\+Date\.now\(\),productId:item\.id/);
 assert.match(app,/String\(i\.id\)===String\(item\.id\)&&String\(i\.placeId\)===String\(place\.id\)/);
});

test('Auditoría carrito: catalog validation preserves hyphenated product IDs',()=>{
 assert.match(app,/String\(i\.id\)===String\(line\.productId\?\?line\.id\)/);
 assert.doesNotMatch(app,/line\.productId\?\?String\(line\.id\)\.split\('-'\)\[0\]/);
});
