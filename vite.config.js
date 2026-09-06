import {defineConfig} from 'vite';
export default defineConfig({base:'./',optimizeDeps:{entries:['index.html']},build:{target:['chrome89','edge89','safari15'],sourcemap:false,chunkSizeWarningLimit:800}});
