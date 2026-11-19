import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSponsorInquiry,sponsorEmailLink,sponsorWhatsappLink} from '../src/sponsor-inquiry.js';
const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const slot=readFileSync(new URL('../src/HomeSponsorSlot.jsx',import.meta.url),'utf8');
const modal=readFileSync(new URL('../src/SponsorInquiryModal.jsx',import.meta.url),'utf8');
const flags=readFileSync(new URL('../src/release-flags.js',import.meta.url),'utf8');
const home=app.slice(app.indexOf("{page==='home'&&<>"),app.indexOf("{page==='favorites'&&"));
test('bienvenida cliente y selector restaurantes-repartidores',()=>{
 for(const v of ["setWelcomePortal('login')","setWelcomePortal('join')","welcomePortal==='login'?'courier-login':'courier'","welcomePortal==='login'?'partner-login':'affiliate'","Continuar como invitado"])assert.ok(app.includes(v),v);
});
test('feed de comidas en tres tandas sin duplicar resultados de búsqueda',()=>{
 for(const v of ["homeFoodCatalog.slice(0,headerSearch.trim()?60:3)","homeFoodCatalog.slice(3,6)","homeFoodCatalog.slice(6)","Ver comida","Ver restaurantes"])assert.ok(home.includes(v),v);
 assert.ok(home.includes("!headerSearch.trim()&&homeFoodCatalog.length>3"));
});
test('espacios publicitarios rotativos y formulario comercial',()=>{
 assert.equal((home.match(/<HomeSponsorSlot variant=/g)||[]).length,2);
 assert.ok(app.includes('<SponsorInquiryModal onClose={()=>setSponsorContactOpen(false)}/>'));
 for(const s of ['5000','prefers-reduced-motion','visibilitychange','Pausar rotación de anuncios','onTouchEnd'])assert.ok(slot.includes(s),s);
 assert.ok(modal.includes('role="dialog" aria-modal="true"'));
});
test('consultas comerciales validadas y con enlace seguro',()=>{
 const lead={name:'María',business:'Comedor Demo',phone:'9999-9999',consent:true};
 assert.deepEqual(validateSponsorInquiry(lead),{name:true,business:true,phone:true,consent:true});
 assert.equal(validateSponsorInquiry({...lead,consent:false}).consent,false);
 assert.ok(sponsorEmailLink(lead,'dvoladanexora@gmail.com')?.startsWith('mailto:'));
 assert.equal(sponsorWhatsappLink(lead,'numero sin configurar'),null);
});
test('menús públicos no exponen secciones experimentales',()=>{
 const n=app.slice(app.indexOf('const nav='),app.indexOf(';useEffect(',app.indexOf('const nav=')));
 const mobile=app.slice(app.indexOf('<nav className="mobile-nav dv-compact-nav">'),app.indexOf('</nav>',app.indexOf('<nav className="mobile-nav dv-compact-nav">')));
 const more=app.slice(app.indexOf('className="dv-more-grid"'),app.indexOf('className="dv-more-appearance"',app.indexOf('className="dv-more-grid"')));
 for(const bad of ["'groceries'","'express'","'rewards'","'delivery-panel'","'courier-login'"])for(const area of [n,mobile,more])assert.ok(!area.includes(bad),bad);
 assert.ok(flags.includes('import.meta.env.DEV'));
 assert.ok(app.includes("if(isPubliclyHidden(p))p='home'"));
 assert.ok(app.includes("page==='admin'&&INTERNAL_PREVIEW_ENABLED"));
});
