import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteConfig from './svelte.config.js';
export default ts.config(
 ...ts.configs.recommended, ...svelte.configs['flat/recommended'],
 { ignores: ['.svelte-kit/**','build/**','.vercel/**'] },
 { rules: { '@typescript-eslint/no-explicit-any':'off' } },
 { files:['**/*.svelte'], languageOptions:{ parserOptions:{ parser:ts.parser, svelteConfig } } }
);
