import staticAdapter from '@sveltejs/adapter-static';
import vercelAdapter from '@sveltejs/adapter-vercel';
const native = process.env.NATIVE_BUILD === '1';
export default { kit: {
  adapter: native ? staticAdapter({ fallback: 'index.html', strict: false }) : vercelAdapter({ runtime: 'nodejs22.x', maxDuration: 60 }),
  prerender: { entries: ['/', '/hud'] }
} };
