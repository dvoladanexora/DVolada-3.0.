import { defineConfig } from 'vite';
const live=process.env.VITE_DVOLADA_LIVE_MODE==='true';
export default defineConfig({
 base:live?'/':'/DVolada-3.0./',
 plugins:live?[{
  name:'dvolada-live-manifest',
  transformIndexHtml:html=>html
   .replace('/DVolada-3.0./manifest.webmanifest','/manifest-live.webmanifest')
   .replaceAll('/DVolada-3.0./icon-clean-192.png','/icon-clean-192.png')
 }]:[]
});
