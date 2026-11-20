/** Product rules for Dvolada Online menu editor (local prototype).
 * Work will replace local writes with authenticated server operations.
 */
export const MENU_CATEGORIES=Object.freeze(['Almuerzos','Desayunos','Baleadas','Hamburguesas','Pizza','Pollo','Bebidas','Postres','Combos','Otros']);
export const MENU_IMAGE_LIMIT=220_000;
export const MAX_MENU_IMAGE_FILE=5*1024*1024;
const validImageMime=new Set(['image/jpeg','image/png','image/webp']);
export function safeCatalogImage(value){
 const s=String(value||'').trim();
 if(!s)return '';
 if(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)&&s.length<=MENU_IMAGE_LIMIT*1.42)return s;
 try{const url=new URL(s);if(url.protocol==='https:'&&!url.username&&!url.password&&url.href.length<=1500)return url.href}catch{}
 return '';
}
export const cleanMenuExtras=(value,limit=8)=>{
 const vals=Array.isArray(value)?value:String(value||'').split(/[,\n]/);
 const seen=new Set(),result=[];
 for(const raw of vals){
  const v=String(raw||'').trim().replace(/\s+/g,' ').slice(0,45);
  if(!v||seen.has(v.toLocaleLowerCase('es')))continue;
  seen.add(v.toLocaleLowerCase('es'));result.push(v);
  if(result.length>=limit)break;
 }
 return result;
};
export const menuProductId=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():('dv-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8));
export function validateMenuDraft(draft,existing=[],editingId=null){
 const errors={};
 const name=String(draft.name||'').trim();
 const priceRaw=String(draft.price??'').trim().replace(',','.');
 const price=Number(priceRaw);
 const category=String(draft.category||'').trim();
 const prep=Number(draft.prepTime);
 const items=Array.isArray(existing)?existing:[];
 if(name.length<3||name.length>80)errors.name='Escribí un nombre entre 3 y 80 caracteres.';
 else if(items.some(i=>String(i.id)!==String(editingId)&&String(i.name||'').trim().toLocaleLowerCase('es')===name.toLocaleLowerCase('es')))errors.name='Ya existe un producto con ese nombre.';
 if(!priceRaw||!Number.isFinite(price)||price<=0||price>10000||Math.abs(Math.round(price*100)-price*100)>1e-6)errors.price='Ingresá un precio válido entre L 0.01 y L 10,000 (máximo 2 decimales).';
 if(!MENU_CATEGORIES.includes(category))errors.category='Elegí una categoría del menú.';
 if(!Number.isInteger(prep)||prep<1||prep>180)errors.prepTime='Tiempo estimado: 1 a 180 minutos.';
 if(String(draft.description||'').length>220)errors.description='Descripción máxima: 220 caracteres.';
 if(String(draft.image||'').trim()&&!safeCatalogImage(draft.image))errors.image='Usá una imagen HTTPS o cargá una foto compatible.';
 if(cleanMenuExtras(draft.extras,9).length>8)errors.extras='Máximo 8 extras. Quitá uno antes de guardar.';
 return errors;
}
export function makeMenuProduct(draft,existing=[],editingId=null){
 const errors=validateMenuDraft(draft,existing,editingId);
 if(Object.keys(errors).length)throw Object.assign(new Error('Revisá los datos del producto.'),{errors});
 const old=(Array.isArray(existing)?existing:[]).find(i=>String(i.id)===String(editingId));
 const available=draft.available!==false;
 return {...(old||{}),id:old?.id??menuProductId(),name:String(draft.name).trim().replace(/\s+/g,' '),price:Number(String(draft.price).replace(',','.')),category:String(draft.category),description:String(draft.description||'').trim(),prepTime:Number(draft.prepTime),image:safeCatalogImage(draft.image),extras:cleanMenuExtras(draft.extras),available,soldOut:!available};
}
export function menuSummary(items=[]){
 const all=Array.isArray(items)?items:[];
 return {total:all.length,active:all.filter(x=>x.available!==false&&x.soldOut!==true).length,soldOut:all.filter(x=>x.available===false||x.soldOut===true).length,missingPhoto:all.filter(x=>!safeCatalogImage(x.image)).length};
}
export function readPhotoAsThumbnail(file){
 if(!file||!validImageMime.has(file.type)||file.size>MAX_MENU_IMAGE_FILE) return Promise.reject(Error('Elegí una foto JPG, PNG o WebP de máximo 5 MB.'));
 if(typeof document==='undefined'||typeof URL==='undefined'||!URL.createObjectURL)return Promise.reject(Error('Este navegador no permite procesar la foto.'));
 return new Promise((resolve,reject)=>{
  const src=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
   URL.revokeObjectURL(src);
   try{
    const scale=Math.min(1,720/Math.max(img.naturalWidth,img.naturalHeight));
    let width=Math.max(1,Math.round(img.naturalWidth*scale)),height=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw Error('Tu navegador no pudo procesar esta imagen.');
    context.drawImage(img,0,0,width,height);
    let data=canvas.toDataURL('image/jpeg',.70);
    if(data.length>MENU_IMAGE_LIMIT*1.42){
      canvas.width=Math.max(1,Math.round(width*.70));canvas.height=Math.max(1,Math.round(height*.70));
      context.drawImage(img,0,0,canvas.width,canvas.height);
      data=canvas.toDataURL('image/jpeg',.55);
    }
    if(!safeCatalogImage(data))throw Error('Foto demasiado grande. Probá otra imagen más sencilla.');
    resolve(data);
   }catch(error){reject(error)}
  };
  img.onerror=()=>{URL.revokeObjectURL(src);reject(Error('No se pudo leer la fotografía.'))};
  img.src=src;
 });
}
