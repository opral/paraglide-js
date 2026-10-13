import {defineConfig} from '@playwright/test';
import base from '../web/e2e/playwright.config.ts';
import {resolve} from 'node:path';
export default defineConfig({...base,testDir:resolve(import.meta.dirname,'../web/e2e/specs'),testMatch:'per-locale-probe.spec.ts',workers:1,fullyParallel:false,retries:0,timeout:120000,expect:{timeout:60000},webServer:undefined,reporter:[['json',{outputFile:process.env.FRIGATE_PROBE_REPORT||resolve(import.meta.dirname,'ui-probe-report.json')}]],use:{...base.use,baseURL:`http://127.0.0.1:${process.env.FRIGATE_PROBE_PORT || '4197'}`}});
