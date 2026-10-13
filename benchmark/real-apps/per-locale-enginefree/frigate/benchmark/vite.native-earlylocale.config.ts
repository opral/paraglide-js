import {resolve} from 'node:path';
import {defineConfig,mergeConfig} from 'vite';
import nativeConfig from '../web/vite.config.ts';
const root=resolve(import.meta.dirname,'../web');
export default mergeConfig(nativeConfig,defineConfig({root,base:'/',resolve:{alias:[{find:'@/utils/i18n',replacement:resolve(root,'../benchmark/native-earlylocale-i18n.ts')}]},build:{target:'es2022',outDir:'native-earlylocale-dist',emptyOutDir:true}}));
