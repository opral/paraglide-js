import {createBuilder} from '../web/node_modules/vite/dist/node/index.js';
process.chdir(new URL("../web",import.meta.url).pathname);
const builder=await createBuilder({configFile:new URL('./vite.candidate.config.ts',import.meta.url).pathname});
await builder.buildApp();
