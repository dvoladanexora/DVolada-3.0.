import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const chat=readFileSync(new URL('../src/DraggableChatFab.jsx',import.meta.url),'utf8');
const slideSource=readFileSync(new URL('../src/SlideConfirm.jsx',import.meta.url),'utf8');
const discoverySource=readFileSync(new URL('../src/DiscoveryEnhancements.jsx',import.meta.url),'utf8');
const receiptSource=readFileSync(new URL('../src/receipt-image.js',import.meta.url),'utf8');
const delightSource=readFileSync(new URL('../src/DelightMotion.jsx',import.meta.url),'utf8');
const pwaSource=readFileSync(new URL('../src/PwaUpdatePrompt.jsx',import.meta.url),'utf8');

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
test('Mandados: list items are bounded, trimmed and removable by accessible name',()=>{
 assert.match(app,/\[list,setList\]=useState\(\[\]\)/);
 assert.match(app,/name:newItem\.trim\(\)\.slice\(0,100\),qty:newQty\.trim\(\)\.slice\(0,60\)/);
 assert.match(app,/list\.length>=50/);
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

test('Auditoría carrito: malformed prices show warnings instead of silently passing',()=>{
 const warnings=app.slice(app.indexOf('const cartIssues='),app.indexOf('const count=cart.reduce',app.indexOf('const cartIssues=')));
 assert.match(warnings,/!Number\.isFinite\(currentPrice\)/);
 assert.match(warnings,/!Number\.isFinite\(Number\(line\.price\)\)/);
 assert.match(warnings,/precio actualizado o inválido/);
});

test('Auditoría persistencia: cart, orders and customer collections recover from malformed storage',()=>{
 assert.ok(app.includes("const asArray=(value,fallback=[])=>Array.isArray(value)?value:fallback"));
 assert.ok(app.includes("const cleanItemList=value=>asArray(value).filter(item=>item&&typeof item==='object')"));
 assert.ok(app.includes("[cart,setCart]=useState(()=>cleanCartList(stored('dv_cart',[])))"));
 assert.ok(app.includes("const cleanOrderList=value=>cleanItemList(value).filter(order=>hasStableId(order.id)).map(order=>({...order,items:cleanItemList(order.items)}))"));
 assert.ok(app.includes("[savedCart,setSavedCart]=useState(()=>cleanCartList(stored('dv_saved_cart',[])))"));
 assert.ok(app.includes("[savedAddresses,setSavedAddresses]=useState(()=>asArray(stored('dv_addresses',[])).filter(v=>typeof v==='string'))"));
});


test('Auditoría checkout: rejected slide confirmation unlocks and can be retried',()=>{
 assert.ok(slideSource.includes("const result=onConfirm?.()"));
 assert.ok(slideSource.includes("if(result===false){locked.current=false;setDone(false);setProgress(0);setDragging(false);return}"));
 assert.ok(slideSource.includes("{done?'¡Listo!':label}"));
 assert.ok(slideSource.includes("amount?'Total estimado: '+amount"));
 const placeOrder=app.slice(app.indexOf('function placeOrder()'),app.indexOf('function sendMandado()'));
 assert.ok(placeOrder.includes('return false'));
 assert.ok(placeOrder.includes('return true'));
 assert.ok(app.includes("disabled={isOffline||!cart.length||cartIssues.length>0"));
});

test('Auditoría checkout: immediate orders respect restaurant closed or paused state',()=>{
 const placeOrder=app.slice(app.indexOf('function placeOrder()'),app.indexOf('function sendMandado()'));
 assert.ok(placeOrder.includes("if(scheduleMode==='now'&&cart.length)"));
 assert.ok(placeOrder.includes("live.tone==='closed'||live.tone==='paused'"));
 assert.ok(placeOrder.includes("no está disponible en este momento"));
});

test('Auditoría volver a pedir: keeps full product IDs and merges with the current cart',()=>{
 const repeat=app.slice(app.indexOf('function repeatOrder(o)'),app.indexOf('function toggleFavoriteOrder'));
 assert.ok(repeat.includes("const baseId=String(item.productId??item.id)"));
 assert.ok(!repeat.includes("split('-')[0]"));
 assert.ok(repeat.includes("setCart(prev=>"));
 assert.ok(repeat.includes("Math.min(99"));
 assert.ok(!repeat.includes("setCart(reorderPreview.available)"));
});

test('Auditoría enlaces compartidos: restaurant and product deep links open the intended content',()=>{
 const deep=app.slice(app.indexOf("useEffect(()=>{const params=new URLSearchParams(window.location.search)"),app.indexOf("const enter=p=>"));
 assert.ok(deep.includes("itemId=params.get('dv_item')"));
 assert.ok(deep.indexOf("navigate('restaurants')")<deep.indexOf("setSelected(place.id)"));
 assert.ok(deep.includes("setFoodChoice({item,place})"));
});

test('Auditoría navegación: browser back closes active customer overlays before leaving the page',()=>{
 const back=app.slice(app.indexOf('useEffect(()=>{const onBack='),app.indexOf('const notify='));
 for(const state of ['setFoodChoice(null)','setHelpOpen(false)','setSupportOrder(null)','setReorderPreview(null)','setCancelOrder(null)','setOrderToRate(null)','setLocationOpen(false)','setChatOpen(false)','setCartDrawer(false)','setCheckout(false)'])assert.ok(back.includes(state),state);
});

test('Auditoría restaurantes: information dialog is reachable and keyboard visible',()=>{
 assert.ok(restaurantProfile.includes("onClick={()=>setInfoOpen(true)}"));
 assert.ok(restaurantProfile.includes("aria-label={'Ver información de '+place.name}"));
 assert.ok(restaurantCss.includes('.dv-rp-info-button:focus-visible'));
 assert.ok(restaurantProfile.includes("const menu=Array.isArray(place.items)?place.items.filter"));
});

test('Auditoría Flash y Club: promotions expire and refresh while the view stays open',()=>{
 assert.ok(clubSource.includes("useEffect(()=>{const refresh=()=>{setNow(Date.now());setPromos(asArray(store('dv_flash_promos',[])))}"));
 assert.ok(clubSource.includes('setInterval(refresh,30000)'));
 assert.ok(clubSource.includes("window.addEventListener('dv-flash-updated',refresh)"));
});

test('Auditoría Group/Express and discovery: local storage failures or wrong shapes do not crash the client flow',()=>{
 assert.ok(groupSource.includes("if(Array.isArray(initial))return Array.isArray(value)?value:initial"));
 assert.ok(groupSource.includes("try{localStorage.setItem(key+name,JSON.stringify(val))}catch"));
 assert.ok(discoverySource.includes('seen=Array.isArray(raw)?raw:[]'));
 assert.ok(discoverySource.includes("try{localStorage.setItem('dv_seen_tips',JSON.stringify(next))}catch{}"));
});

test('Auditoría inicio y recibos: restricted storage and older Canvas APIs have fallbacks',()=>{
 assert.ok(delightSource.includes("try{return !sessionStorage.getItem('dv_intro_seen')}catch{return true}"));
 assert.ok(delightSource.includes("try{sessionStorage.setItem('dv_intro_seen','1')}catch{}"));
 assert.ok(receiptSource.includes("if(typeof c.roundRect==='function')c.roundRect"));
 assert.ok(receiptSource.includes('c.arcTo('));
 assert.ok(receiptSource.includes('document.body.appendChild(a);a.click();a.remove()'));
});

test('Auditoría perfil: deleting the selected address also clears stale active/default references',()=>{
 const addressFns=app.slice(app.indexOf('function saveAddress()'),app.indexOf('function orderChirp()'));
 assert.ok(addressFns.includes("if(address===value)setAddress('')"));
 assert.ok(addressFns.includes("setProfile(p=>p.address===value?{...p,address:''}:p)"));
});

test('Auditoría roles: the customer navigation stays customer-only and help remains directly accessible',()=>{
 const nav=app.slice(app.indexOf('const nav='),app.indexOf(';return <><IntroMotion',app.indexOf('const nav=')));
 assert.ok(!nav.includes("'delivery-panel','Panel repartidor'"));
 const more=app.slice(app.indexOf('className="dv-more-sheet"'),app.indexOf('className="dv-more-appearance"',app.indexOf('className="dv-more-sheet"')));
 assert.ok(more.includes("['help','Centro de ayuda',MessageCircle]"));
 assert.ok(!more.includes("['courier-login','Panel repartidor'"));
 assert.ok(app.includes("onClick={()=>enter('courier-login')}"));
});

test('Auditoría marca y PWA: Dvolada spelling stays consistent in customer-facing update UI',()=>{
 assert.equal((app.match(/D Volada/gi)||[]).length,0);
 assert.equal((pwaSource.match(/D Volada/gi)||[]).length,0);
 assert.ok(pwaSource.includes('nueva actualización de Dvolada'));
});


test('Auditoría invitado: welcome guest access activates restrictions before entering the client',()=>{
 assert.ok(app.includes("onClick={()=>{setGuestMode(true);enter('home')}}>Continuar como invitado"));
 const navigate=app.slice(app.indexOf('const navigate=p=>'),app.indexOf('function addItem(',app.indexOf('const navigate=p=>')));
 assert.ok(navigate.includes("'delivery-panel'"));
 assert.ok(navigate.includes("if(guestMode&&"));
});

test('Auditoría historial: frequent products are scoped by restaurant and spending counts completed orders only',()=>{
 assert.ok(app.includes("const dvOrderCompleted=o=>Boolean(o)&&(o.status==='Entregado'||(o.delivery==='pickup'&&o.status==='Recogido'))"));
 assert.ok(app.includes("const completedFoodOrders=orders.filter(o=>o.kind==='food'&&dvOrderCompleted(o))"));
 assert.ok(app.includes("const key=String(row.placeId)+'|'+String(row.item.productId??row.item.id)"));
 assert.ok(app.includes("frequentItems[String(x.place.id)+'|'+String(x.item.id)]"));
 assert.ok(app.includes("const monthOrders=completedFoodOrders.filter"));
 assert.ok(app.includes('Solo cuenta pedidos completados guardados en este navegador.'));
});

test('Auditoría notificaciones: local storage failures do not break notification clicks',()=>{
 const notices=app.slice(app.indexOf('className="dv-bell-wrap"'),app.indexOf('className="dv-cart-header-toggle"'));
 assert.ok(notices.includes("try{localStorage.setItem('dv_read_notifications',JSON.stringify(next))}catch{}"));
});


test('Auditoría arranque: invite code and animation preferences tolerate blocked localStorage',()=>{
 assert.ok(app.includes("[inviteCode]=useState(()=>{try{let c=localStorage.getItem('dv_invite_code')"));
 assert.ok(app.includes("catch{return 'DV'+Math.random().toString(36).slice(2,8).toUpperCase()}"));
 assert.ok(app.includes("try{localStorage.setItem('dv_reduce_animations',JSON.stringify(reduceAnimations))}catch{}"));
});


test('Inicio: customer can switch between food and restaurants with product previews',()=>{
 assert.ok(app.includes("saved==='restaurants'||saved==='food'?saved:'food'"));
 assert.ok(app.includes('aria-label="Cómo querés explorar Dvolada"'));
 assert.ok(app.includes("> Ver comida</button>"));
 assert.ok(app.includes("> Ver restaurantes</button>"));
 assert.ok(app.includes("homeCatalogView==='restaurants'&&<section"));
 assert.ok(app.includes("<RestaurantGrid places={homeRestaurantCatalog}"));
 assert.ok(app.includes("withMenuPreview"));
 assert.ok(app.includes("localStorage.setItem('dv_home_catalog_view',JSON.stringify(homeCatalogView))"));
});

test('Inicio: search results are not duplicated by the continuation feed',()=>{
 assert.ok(app.includes("homeCatalogView==='food'&&!headerSearch.trim()&&<section"));
 assert.equal((app.match(/No hay comidas disponibles en esta categoría\.<\/p>/g)||[]).length,0);
});

test('Carrito: drawer groups restaurants and uses the same multi-order fees as checkout',()=>{
 const drawer=app.slice(app.indexOf('{cartDrawer&&'),app.indexOf("{page==='orders'",app.indexOf('{cartDrawer&&')));
 assert.ok(drawer.includes('cartGroups.map(group=>'));
 assert.ok(drawer.includes("key={String(i.placeId)+'-'+String(i.id)}"));
 assert.ok(drawer.includes('cartGroups.length*serviceFee'));
 assert.ok(drawer.includes('cartGroups.length*deliveryFee'));
 assert.ok(drawer.includes('{money(checkoutTotal)}'));
 const checkout=app.slice(app.indexOf('className="dv-checkout-breakdown"'),app.indexOf('<SlideConfirm',app.indexOf('className="dv-checkout-breakdown"')));
 assert.ok(checkout.includes('serviceFee*cartGroups.length'));
 assert.ok(checkout.includes('deliveryFee*cartGroups.length'));
});

test('Cliente: desktop has an explicit refresh action and mobile More reuses it',()=>{
 assert.ok(app.includes('async function refreshDvolada()'));
 assert.ok(app.includes('className="iconbtn dv-desktop-refresh"'));
 assert.equal((app.match(/onClick=\{refreshDvolada\}/g)||[]).length,2);
 assert.ok(customerStyles.includes('.dv32 .dv-desktop-refresh'));
 assert.ok(customerStyles.includes('@media(max-width:760px){.dv32 .dv-desktop-refresh{display:none!important}}'));
});

test('Cliente: Escape closes interactive overlays without leaving the current page',()=>{
 const escape=app.slice(app.indexOf("useEffect(()=>{const onEscape="),app.indexOf('const notify=',app.indexOf("useEffect(()=>{const onEscape=")));
 for(const action of ['setFoodChoice(null)','setHelpOpen(false)','setSupportOrder(null)','setChatOpen(false)','setFlashOpen(false)','setCartDrawer(false)','setCheckout(false)','setNotificationsOpen(false)','setFilterOpen(false)'])assert.ok(escape.includes(action),action);
 assert.ok(escape.includes("window.addEventListener('keydown',onEscape)"));
});

test('Cliente: structured extras and stale products cannot break add-to-cart',()=>{
 const add=app.slice(app.indexOf('function addItem('),app.indexOf('function editCartInstruction'));
 assert.ok(add.includes("const unitPrice=Number(item.price)"));
 assert.ok(add.includes("return false"));
 assert.ok(add.includes("places.find(p=>String(p.id)===String(originalPlace.id))"));
 assert.ok(add.includes("if(!addItem(custom,place,qty))return"));
 assert.ok(app.includes("foodChoice.item.extras.map(x=>typeof x==='string'?x:String(x?.name||x?.label||''))"));
});

test('Pedidos: pickup collection is completion for history, ratings and metrics',()=>{
 assert.ok(app.includes("const dvOrderFinished=o=>dvOrderCompleted(o)||o?.status==='Cancelado'"));
 assert.ok(app.includes("orders.filter(o=>dvOrderFinished(o)&&"));
 assert.ok(app.includes("orders.filter(o=>!dvOrderFinished(o)&&"));
 assert.ok(app.includes("if(!orderToRate||!dvOrderCompleted(orderToRate))"));
 assert.ok(app.includes("{dvOrderCompleted(o)&&!o.rated&&<button"));
});

test('Cliente: live automatic theme follows OS changes and hourly mode refreshes',()=>{
 const theme=app.slice(app.indexOf("useEffect(()=>{document.documentElement.style.setProperty('--accent'"),app.indexOf('const orderAlerts='));
 assert.ok(theme.includes("media.addEventListener('change',onChange)"));
 assert.ok(theme.includes("media.addListener?.(onChange)"));
 assert.ok(theme.includes("theme==='hour'?setInterval(apply,60000):null"));
});

test('Cliente: review, checkout and mandado text fields are bounded',()=>{
 assert.ok(app.includes('<textarea maxLength={800} value={reviewText}'));
 assert.ok(app.includes('<textarea maxLength={1000} value={issueDetails}'));
 assert.ok(app.includes('<textarea maxLength={500} value={notes}'));
 assert.ok(app.includes('id="dv-grocery-address" maxLength={200}'));
 assert.ok(app.includes("comment:reviewText.trim().slice(0,800)"));
});

test('Restaurantes: selected IDs from storage/server are normalized before opening a profile',()=>{
 assert.ok(app.includes("const activePlace=places.find(p=>String(p.id)===String(selected))"));
});

test('Inicio: repeat suggestions only use completed orders and frequent sorting is restaurant-safe',()=>{
 assert.ok(app.includes("completedFoodOrders.length>0&&<div className=\"dv-home-repeat\""));
 assert.ok(app.includes("completedFoodOrders.slice().reverse().slice(0,3)"));
 assert.ok(app.includes("frequentItems[String(b.place.id)+'|'+String(b.item.id)]"));
});

test('Pedido activo: repeat is not offered while an existing food order is still in progress',()=>{
 const active=app.slice(app.indexOf("orders.filter(o=>!dvOrderFinished(o)&&"),app.indexOf('{supportOrder&&'));
 assert.ok(!active.includes('>Repetir pedido</button>'));
 assert.ok(active.includes('Copiar PIN'));
 assert.ok(active.includes("navigator.clipboard.writeText(String(o.pin)).then"));
});


test('Cliente: unexpected render failures show a recovery screen instead of a blank app',()=>{
 assert.ok(app.includes('class DvoladaErrorBoundary extends React.Component'));
 assert.ok(app.includes("key?.startsWith('dv_')"));
 assert.ok(app.includes('<DvoladaErrorBoundary><App/><PwaUpdatePrompt/></DvoladaErrorBoundary>'));
 assert.ok(customerStyles.includes('.dv-fatal-recovery'));
});

test('Cliente: malformed profile fields are normalized before rendering forms',()=>{
 assert.ok(app.includes("const cleanProfile=value=>"));
 assert.ok(app.includes("name:typeof p.name==='string'?p.name:''"));
 assert.ok(app.includes("[profile,setProfile]=useState(()=>cleanProfile(stored('dv_local_profile'"));
});

test('Ayuda: customer help modal exposes dialog semantics',()=>{
 assert.ok(app.includes('role="dialog" aria-modal="true" aria-labelledby="dv-help-title"'));
 assert.ok(app.includes('<h2 id="dv-help-title">Centro de ayuda del cliente</h2>'));
});

test('Restaurantes: ratings are isolated by stable restaurant ID with legacy-name fallback',()=>{
 assert.ok(app.includes('placeId:orderToRate.placeId??null'));
 assert.ok(app.includes("r.placeId!=null?String(r.placeId)===String(p.id):r.placeName===p.name"));
 assert.ok(restaurantProfile.includes("r?.placeId!=null?String(r.placeId)===String(place.id):r?.placeName===place.name"));
});

test('Restaurantes: missing catalog images have visual fallbacks',()=>{
 assert.ok(app.includes('dv-restaurant-image-placeholder'));
 assert.ok(restaurantProfile.includes('dv-rp-cover-placeholder'));
 assert.ok(customerStyles.includes('.dv-restaurant-image-placeholder'));
 assert.ok(restaurantCss.includes('.dv-rp-cover-placeholder'));
});

test('Cliente: recent searches save completed queries instead of every keystroke',()=>{
 assert.ok(app.includes("const rememberSearch=value=>"));
 const header=app.slice(app.indexOf('<input maxLength={120} value={headerSearch}'),app.indexOf('placeholder="Buscar comida o restaurante"')+50);
 assert.ok(header.includes("e.key==='Enter'"));
 assert.ok(header.includes('rememberSearch(e.currentTarget.value)'));
 assert.ok(!header.includes('setRecentSearches('));
});

test('Persistencia: Club, Flash, Group and Express discard malformed rows',()=>{
 assert.ok(clubSource.includes("const asObjects=v=>asArray(v).filter(item=>item&&typeof item==='object')"));
 assert.ok(clubSource.includes("useState(()=>asObjects(store('dv_flash_promos',[])))"));
 assert.ok(groupSource.includes("value.filter(item=>item&&typeof item==='object')"));
});

test('Marca: Flash also uses the single-word Dvolada spelling',()=>{
 assert.equal((clubSource.match(/D Volada/gi)||[]).length,0);
});


test('Restaurantes: hours support paused, string descriptions and overnight ranges safely',()=>{
 assert.ok(app.includes("const dvTimeMinutes=v=>"));
 assert.ok(app.includes("const dvInsideHours=(minutes,open,close)=>"));
 assert.ok(app.includes("return b>a?minutes>=a&&minutes<b:minutes>=a||minutes<b"));
 assert.ok(app.includes("if(!p.hours||typeof p.hours==='string')return null"));
 assert.ok(app.includes("typeof p?.hours==='string'?p.hours"));
 assert.ok(app.includes("live.tone==='closed'||live.tone==='paused'"));
 assert.ok(app.includes("p.hours&&typeof p.hours==='object'"));
 assert.ok(app.includes("if(inside!==true)"));
});

test('Restaurantes: catalog cards expose visible availability states',()=>{
 assert.ok(app.includes("const restaurantState=dvRestaurantToday(p)"));
 assert.ok(app.includes("className={'dv-card-availability '+restaurantState.tone}"));
 assert.ok(homeCss.includes('.dv-card-availability.open'));
 assert.ok(homeCss.includes('.dv-card-availability.closed'));
 assert.ok(homeCss.includes('.dv-card-availability.paused'));
 assert.ok(homeCss.includes('.dv-card-availability.unknown'));
});


test('Persistencia: malformed cart, order and catalog rows with missing IDs are discarded',()=>{
 assert.ok(app.includes("const hasStableId=value=>typeof value==='string'||typeof value==='number'"));
 assert.ok(app.includes("const cleanCartList=value=>cleanItemList(value).filter(item=>hasStableId(item.id)&&hasStableId(item.placeId))"));
 assert.ok(app.includes("const cleanOrderList=value=>cleanItemList(value).filter(order=>hasStableId(order.id))"));
 assert.ok(app.includes("filter(p=>p&&typeof p==='object'&&hasStableId(p.id))"));
 assert.ok(app.includes("cleanItemList(p.items).filter(i=>hasStableId(i.id))"));
 assert.ok(app.includes("const count=cart.reduce((s,i)=>s+Math.max(0,Number(i.qty)||0),0)"));
});


test('Cabecera: clicking the search icon can close the open search instead of reopening it',()=>{
 assert.ok(app.includes("!e.target.closest('.dv-search-toggle')"));
 assert.ok(!app.includes("!e.target.closest('.dv-header-search-toggle')"));
});

test('Carrito: opening the drawer locks background scrolling like the other overlays',()=>{
 const lock=app.slice(app.indexOf("const isOpen=Boolean(foodChoice"),app.indexOf("const activeFlashPromos")>0?app.indexOf("const activeFlashPromos"):app.indexOf("const notify="));
 assert.ok(app.includes("exitPrompt||cartDrawer"));
 assert.ok(app.includes("exitPrompt,cartDrawer]"));
});
