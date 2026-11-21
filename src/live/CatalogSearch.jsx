import React, {useEffect, useState} from 'react';

export default function CatalogSearch({api, offline, term, onChange, openRestaurant, money}) {
  const [results, setResults] = useState(null);
  const query = term.trim();
  useEffect(() => {
    if (offline || !api || query.length < 2) return;
    const connection = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await api.searchProducts(query, connection.signal);
        if (!connection.signal.aborted) setResults({query, products: data.products});
      } catch {
        if (!connection.signal.aborted) setResults({query, error: true});
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      connection.abort();
    };
  }, [api, offline, query]);
  const result = results?.query === query ? results : null;
  return <div className="dvl-catalog-search">
    <label>Buscar restaurante o producto<input type="search" value={term} maxLength={60}
      placeholder="¿Qué se te antoja?" onChange={event => onChange(event.target.value)}/></label>
    {query.length >= 2 && api && !offline && <section aria-label="Resultados de productos">
      <h3>Productos</h3>
      {!result && <p role="status">Buscando productos…</p>}
      {result?.error && <p role="status">No se pudieron cargar los productos. Probá cambiar la búsqueda.</p>}
      {result?.products?.length === 0 && <p>No encontramos productos con ese nombre.</p>}
      {result?.products?.length > 0 && <ul className="dvl-search-results">
        {result.products.map(product => <li key={product.id} className="dvl-row">
          <div><strong>{product.name}</strong><small>{product.restaurant_name} · {money(product.price_minor)}</small></div>
          <button type="button" className="dvl-action secondary" disabled={product.online_state !== 'open'}
            onClick={() => openRestaurant(product.restaurant_id)}>Ver menú</button>
        </li>)}
      </ul>}
    </section>}
  </div>;
}
