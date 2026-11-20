/** PIN de seis dígitos exclusivamente para la DEMOSTRACIÓN LOCAL.
 * Las entregas reales deben generar y validar el PIN en un servidor,
 * sin revelar el PIN al repartidor ni almacenarlo en localStorage.
 * Uso de crypto.getRandomValues con muestreo sin sesgo de módulo.
 */
const RANGE=900_000;
const LIMIT=2**32-(2**32%RANGE);
export function generateDemoPin(fill=bytes=>globalThis.crypto?.getRandomValues?.(bytes)){
 if(typeof fill!=='function')throw Error('Aleatoriedad segura no disponible.');
 const data=new Uint32Array(1);
 for(let tries=0;tries<64;tries++){
  const result=fill(data);
  if(result!==data)throw Error('Aleatoriedad segura no disponible.');
  if(data[0]<LIMIT)return String(100_000+(data[0]%RANGE));
 }
 throw Error('No se pudo generar un PIN seguro.');
}
