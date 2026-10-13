import {createBuilder} from 'vite';
const builder=await createBuilder({configFile:'./vite.config.ts'});
await builder.buildApp();
