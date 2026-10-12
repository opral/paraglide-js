import {createBuilder, version} from './node_modules/vite/dist/node/index.js';
console.log(JSON.stringify({node:process.version,vite:version}));
const builder=await createBuilder({configFile:'./vite.per-locale.config.mjs'});
await builder.buildApp();
