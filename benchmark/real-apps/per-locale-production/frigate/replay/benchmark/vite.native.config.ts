import {resolve} from 'node:path';
import {defineConfig,mergeConfig} from 'vite';
import nativeConfig from '../web/vite.config.ts';
const root=resolve(import.meta.dirname,'../web');
export default mergeConfig(nativeConfig,defineConfig({root,base:'/',build:{target:'es2022',outDir:'native-dist',emptyOutDir:true}}));
