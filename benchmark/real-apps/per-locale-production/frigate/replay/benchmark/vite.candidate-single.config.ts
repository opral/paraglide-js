import {resolve} from 'node:path';
import {defineConfig,mergeConfig} from 'vite';
import nativeConfig from '../web/vite.config.ts';
import {paraglideVitePlugin} from '/root/repos-iii/paraglide-locale-namespaces-main/dist/index.js';
const root=resolve(import.meta.dirname,'../web');
export default mergeConfig(nativeConfig,defineConfig({root,base:'/',build:{target:'es2022',outDir:'candidate-single-dist',emptyOutDir:true},resolve:{alias:[{find:'@/utils/i18n',replacement:resolve(root,'../benchmark/candidate-single-i18n.ts')}]},plugins:[paraglideVitePlugin({project:resolve(root,'../benchmark/paraglide-project.inlang'),outdir:resolve(root,'src/paraglide'),outputStructure:'message-modules',strategy:['localStorage','preferredLanguage','baseLocale'],localStorageKey:'frigate-ui-language',emitTsDeclarations:false,experimentalPerLocaleBuild:true})]}));
