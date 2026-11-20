/** Validaciones de entrada de la API preliminar de restaurante.
 * No sustituyen autenticación, controles de negocio ni transacciones SQL.
 */
const problem=(message,code)=>Object.assign(Error(message),{code});

/** Rechaza null/arrays antes de leer propiedades del PATCH. */
export function validStatusPatch(body){
 return Boolean(body&&typeof body==='object'&&!Array.isArray(body)
  &&Number.isSafeInteger(body.expectedVersion)&&body.expectedVersion>=1
  &&typeof body.status==='string'&&body.status.length>0&&body.status.length<=40);
}

/** Máximo de bytes reales, no de caracteres Unicode; sin parser de JSON en streaming. */
export async function readJsonBody(req,limitBytes=4096){
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
