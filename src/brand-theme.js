/** Paleta oficial única de Dvolada. No depende de ajustes locales de Samsung/Android. */
export const DVOLADA_ACCENT='#f26732';
export const DVOLADA_THEMES=Object.freeze(['light','dark','system']);
export function normalizeDvoladaTheme(value){
 return DVOLADA_THEMES.includes(value)?value:'light';
}
export function resolveDvoladaTheme(value,systemDark=false){
 const normalized=normalizeDvoladaTheme(value);
 return normalized==='system'?(systemDark?'dark':'light'):normalized;
}
export function applyDvoladaTheme(doc,preference,systemDark=false){
 const resolved=resolveDvoladaTheme(preference,systemDark);
 const root=doc.documentElement;
 root.dataset.theme=resolved;
 root.style.setProperty('--accent',DVOLADA_ACCENT);
 root.style.colorScheme=resolved;
 const meta=doc.querySelector('meta[name="theme-color"]');
 if(meta)meta.setAttribute('content',resolved==='dark'?'#161b25':'#f26732');
 return resolved;
}
