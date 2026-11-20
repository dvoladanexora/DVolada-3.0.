import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const flags=readFileSync(new URL('../src/release-flags.js',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/ShareInstallHub.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/share-install-hub.css',import.meta.url),'utf8');
const sounds=readFileSync(new URL('../src/SoundPreferences.jsx',import.meta.url),'utf8');
test('Invitar amigos es público, Club sigue oculto',()=>{
 const more=app.slice(app.indexOf('className="dv-more-grid"'),app.indexOf('className="dv-more-appearance"',app.indexOf('className="dv-more-grid"')));
 assert.ok(!flags.includes("'invite',    // Programa"));
 assert.ok(flags.includes("'rewards'"));
 assert.ok(more.includes("['invite','Invitar amigos',Share2]"));
 assert.ok(more.includes("['install','Instalar Dvolada',Download]"));
 assert.ok(more.includes("['sound-settings','Sonidos y avisos',Volume2]"));
 assert.ok(app.includes("page==='invite'&&<React.Suspense fallback={featureLoading}><ShareInstallHub"));
 assert.ok(app.includes("page==='install'&&<React.Suspense fallback={featureLoading}><ShareInstallHub"));
});
test('QR y enlaces usan ruta base sin inventar incentivos',()=>{
 assert.ok(hub.includes('new URL(base'));
 assert.ok(hub.includes('getDvoladaInvitationText'));
 assert.ok(hub.includes("https://wa.me/?text="));
 assert.ok(hub.includes('encodeURIComponent(inviteText)'));
 assert.ok(hub.includes('api.qrserver.com/v1/create-qr-code'));
 assert.ok(hub.includes('navigator.clipboard.writeText(url)'));
 assert.ok(hub.includes('navigator.share'));
 assert.ok(!hub.includes('100 puntos'));
});
test('Web NFC escribe solo en etiqueta compatible y no promete conexión teléfono a teléfono',()=>{
 assert.ok(hub.includes("typeof window.NDEFReader==='function'"));
 assert.ok(hub.includes("recordType:'url'"));
 assert.ok(hub.includes('No transfiere el enlace directamente de teléfono a teléfono'));
 assert.ok(hub.includes('AirDrop'));
 assert.ok(hub.includes('Quick Share'));
});
test('Guía de instalación incluye iOS, Android y evento nativo PWA',()=>{
 assert.ok(hub.includes('Agregar a pantalla de inicio'));
 assert.ok(hub.includes('Instalar app'));
 assert.ok(hub.includes('Agregar a pantalla principal'));
 assert.ok(app.includes("window.addEventListener('beforeinstallprompt'"));
 assert.ok(app.includes('installEvent.prompt()'));
 assert.ok(css.includes('@media(max-width:750px)'));
});
test('Al entrar existe botón explícito para escuchar bip-bip, sin permiso forzado',()=>{
 assert.ok(app.includes('<SoundOnboarding onEnable='));
 assert.ok(app.includes("localStorage.getItem('dv_sound_onboard_seen')"));
 assert.ok(app.includes("localStorage.setItem('dv_local_profile'"));
 assert.ok(app.includes('orderChirp(true)'));
 assert.ok(app.includes('function orderChirp(force=false)'));
 assert.ok(sounds.includes('Activar y probar'));
 assert.ok(sounds.includes('Probar el bip-bip'));
 assert.ok(sounds.includes("onRequestPermission()"));
 assert.ok(sounds.includes('Las notificaciones push con la app cerrada'));
 assert.ok(!sounds.includes('setInterval('));
});
test('Ventana de sonidos se cierra y admite teclado',()=>{
 assert.ok(sounds.includes('role="dialog" aria-modal="true"'));
 assert.ok(sounds.includes("e.key==='Escape'"));
 assert.ok(sounds.includes("e.key==='Tab'"));
 assert.ok(sounds.includes('onSoundChange(e.target.checked)'));
});
