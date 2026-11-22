const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const empty = () => ({ restaurantId: '', items: [], pendingKey: null });
const validOption = option => uuid.test(option?.id) && typeof option.name==='string' &&
  option.name.length<=100 && Number.isSafeInteger(option.price_minor) && option.price_minor>=0;
const cartLine = ({productId,name,priceMinor,quantity,options}) =>
  ({productId,name,priceMinor,quantity,...(options?.length?{options:options.map(({id,name,price_minor})=>({id,name,price_minor}))}:{})});
const storageKey = account => 'dvolada:cart:v1:' + account;

export function readCart(account, storage) {
  try {
    const data = JSON.parse((storage ?? window.sessionStorage).getItem(storageKey(account)));
    if (!uuid.test(data?.restaurantId) || !Array.isArray(data.items) ||
        !data.items.length || data.items.length > 20) return empty();
    if(data.items.some(item=>item.options&&(!Array.isArray(item.options)||item.options.length>8||!item.options.every(validOption))))return empty();
    const items = data.items.map(cartLine);
    if (new Set(items.map(item => item.productId)).size !== items.length ||
        items.some(item => !uuid.test(item.productId) || typeof item.name !== 'string' ||
          item.name.length > 160 || !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0 ||
          !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 25)) return empty();
    return { restaurantId: data.restaurantId, items, pendingKey: uuid.test(data.pendingKey) ? data.pendingKey : null, ...(data.coupon&&/^[A-Z0-9-]{4,24}$/.test(data.coupon.code)&&Number.isSafeInteger(data.coupon.discountMinor)&&data.coupon.discountMinor>0?{coupon:{code:data.coupon.code,discountMinor:data.coupon.discountMinor}}:{}) };
  } catch {
    return empty();
  }
}

export function writeCart(account, { restaurantId, items, pendingKey, coupon }, storage) {
  try {
    const target = storage ?? window.sessionStorage;
    if (!items.length) target.removeItem(storageKey(account));
    else target.setItem(storageKey(account), JSON.stringify({
      restaurantId, pendingKey, coupon:coupon?{code:coupon.code,discountMinor:coupon.discountMinor}:undefined,
      items: items.map(cartLine),
    }));
    return true;
  } catch {
    return false;
  }
}

export function updateQuantity(items, product, delta) {
  const current = items.find(item => item.productId === product.productId);
  if (!current) return delta > 0 && items.length < 20 ? [...items, { ...product, quantity: 1 }] : items;
  return items.map(item => item === current ? {
    ...product, quantity: Math.min(25, item.quantity + delta),
  } : item).filter(item => item.quantity > 0);
}
