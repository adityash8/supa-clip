import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir:'tests/browser', timeout:30000, fullyParallel:false, workers:1,
 use:{ baseURL:'http://127.0.0.1:1420', headless:true, viewport:{width:1280,height:850}, screenshot:'only-on-failure', trace:'off' },
 webServer:{ command:'npm run dev -- --host 127.0.0.1', url:'http://127.0.0.1:1420', reuseExistingServer:false },
 reporter:'list' });
