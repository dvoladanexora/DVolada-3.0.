const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const empty = () => ({ restaurantId: '', items: [], pendingKey: null });
const storageKey = account => 'dvolada:cart:v1:' + account;

export function readCart(account, storage) {
  try {
    const data = JSON.parse((storage ?? window.sessionStorage).getItem(storageKey(account)));
    if (!uuid.test(data?.restaurantId) || !Array.isArray(data.items) ||
        !data.items.length || data.items.length > 20) return empty();
    const items = data.items.map(({ productId, name, priceMinor, quantity }) =>
      ({ productId, name, priceMinor, quantity }));
    if (new Set(items.map(item => item.productId)).size !== items.length ||
        items.some(item => !uuid.test(item.productId) || typeof item.name !== 'string' ||
          item.name.length > 160 || !Number.isSafeInteger(item.priceMinor) || item.priceMinor < 0 ||
          !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 25)) return empty();
    return { restaurantId: data.restaurantId, items, pendingKey: uuid.test(data.pendingKey) ? data.pendingKey : null };
  } catch {
    return empty();
  }
}

export function writeCart(account, { restaurantId, items, pendingKey }, storage) {
  try {
    const target = storage ?? window.sessionStorage;
    if (!items.length) target.removeItem(storageKey(account));
    else target.setItem(storageKey(account), JSON.stringify({
      restaurantId, pendingKey,
      items: items.map(({ productId, name, priceMinor, quantity }) => ({ productId, name, priceMinor, quantity })),
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
