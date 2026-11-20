/** Validaciones de entrada de la API preliminar de restaurante.
 * No sustituyen autenticación, controles de negocio ni transacciones SQL.
 */
const problem=(message,code)=>Object.assign(Error(message),{code});

/** Rechaza null/arrays antes de leer propiedades del PATCH. */
const patchKeys=new Set(['expectedVersion','status']);
/** Contrato cerrado para evitar que el cliente intente incluir precio,
 * dueño, restaurante, PIN o permisos en una transición de estado.
 * El rechazo no sustituye la comprobación del rol y de la orden en SQL.
 */
export function validStatusPatch(body){
 return Boolean(body&&typeof body==='object'&&!Array.isArray(body)
  &&Object.keys(body).length===2
  &&Object.keys(body).every(key=>patchKeys.has(key))
  &&Object.hasOwn(body,'expectedVersion')&&Object.hasOwn(body,'status')
  &&Number.isSafeInteger(body.expectedVersion)&&body.expectedVersion>=1
  &&typeof body.status==='string'
  &&['Aceptado','Rechazado','Preparando','Listo','Cancelado'].includes(body.status));
}

/** Máximo de bytes reales, no de caracteres Unicode; sin parser de JSON en streaming. */
export async function readJsonBody(req,limitBytes=4096){
 // Cortar la solicitud ANTES de leerla si declara un tamaño excesivo.
 // Para Transfer-Encoding: chunked se mantiene también el límite real.
 const declared=req.headers?.['content-length'];
 if(declared!==undefined){
  if(typeof declared!=='string'||!/^(0|[1-9]\d*)$/.test(declared)
   ||!Number.isSafeInteger(Number(declared))||Number(declared)>limitBytes)
   throw problem('Request too large',413);
 }
 const chunks=[];let bytes=0;
 for await(const chunk of req){
  const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
  bytes+=data.length;
  if(bytes>limitBytes)throw problem('Request too large',413);
  chunks.push(data);
 }
 let body;
 try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
 catch{throw problem('Invalid JSON',400)}
 if(!body||typeof body!=='object'||Array.isArray(body))throw problem('Expected JSON object',400);
 return body;
}
