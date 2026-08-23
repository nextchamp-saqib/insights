import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import fs from 'fs'
import frappeui from 'frappe-ui/vite'
import path from 'path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

// Pre-bundled below to avoid a dev-only duplicate prosemirror-state instance
// (TipTap "keyed plugin" error). Keep in sync with frappe-ui's @tiptap/* deps.
const tiptapDeps = [
	'@tiptap/core',
	'@tiptap/vue-3',
	'@tiptap/starter-kit',
	'@tiptap/suggestion',
	'@tiptap/markdown',
	'@tiptap/extensions',
	'@tiptap/extension-blockquote',
	'@tiptap/extension-bold',
	'@tiptap/extension-bubble-menu',
	'@tiptap/extension-code',
	'@tiptap/extension-code-block',
	'@tiptap/extension-code-block-lowlight',
	'@tiptap/extension-color',
	'@tiptap/extension-document',
	'@tiptap/extension-hard-break',
	'@tiptap/extension-heading',
	'@tiptap/extension-highlight',
	'@tiptap/extension-horizontal-rule',
	'@tiptap/extension-image',
	'@tiptap/extension-italic',
	'@tiptap/extension-link',
	'@tiptap/extension-list',
	'@tiptap/extension-mention',
	'@tiptap/extension-node-range',
	'@tiptap/extension-paragraph',
	'@tiptap/extension-placeholder',
	'@tiptap/extension-strike',
	'@tiptap/extension-table',
	'@tiptap/extension-task-item',
	'@tiptap/extension-task-list',
	'@tiptap/extension-text',
	'@tiptap/extension-text-align',
	'@tiptap/extension-text-style',
	'@tiptap/extension-typography',
	'@tiptap/extension-underline',
	// @tiptap/pm exposes only subpaths
	'@tiptap/pm/state',
	'@tiptap/pm/view',
	'@tiptap/pm/model',
	'@tiptap/pm/tables',
]

export default defineConfig({
	plugins: [
		frappeui({
			frappeProxy: true,
			lucideIcons: true,
			jinjaBootData: true,
			buildConfig: false,
		}),
		vue(),
		vueJsx(),
	],
	server: {
		allowedHosts: true,
		// A linked frappe-ui sits outside the workspace, and the dev server refuses
		// to serve a file it does not cover — the Inter faces `frappe-ui/style.css`
		// asks for come back 403, so every page renders in the system font while
		// its CSS looks fine. Covering the real directory the package resolves to
		// keeps this true of whatever is linked, and no-ops when nothing is.
		fs: {
			allow: [
				searchForWorkspaceRoot(process.cwd()),
				fs.realpathSync(path.resolve(__dirname, 'node_modules/frappe-ui')),
			],
		},
	},
	esbuild: { loader: 'ts' },
	resolve: {
		alias: {
			// https://github.com/vitejs/vite/discussions/16730#discussioncomment-13048825
			vue: 'vue/dist/vue.esm-bundler.js',
			'tailwind.config.js': path.resolve(__dirname, 'tailwind.config.js'),
		},
		// A linked frappe-ui brings its own copy of these, and echarts keeps its
		// renderers, series and registered geographies in module state — so a
		// second instance means `registerMap` here and `init` in there disagree
		// about which maps exist. No-op while frappe-ui comes from the registry.
		dedupe: ['echarts', 'zrender', 'vue', '@vueuse/core'],
	},
	build: {
		outDir: `../insights/public/frontend`,
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			input: {
				main: path.resolve(__dirname, 'index.html'),
			},
			output: {
				manualChunks: {
					'frappe-ui': ['frappe-ui'],
				},
			},
		},
	},
	optimizeDeps: {
		esbuildOptions: {
			loader: {
				'.ts': 'ts',
				'.tsx': 'tsx',
			},
		},
		include: [
			'feather-icons',
			'tailwind.config.js',
			'highlight.js/lib/core',
			'echarts/core',
			...tiptapDeps,
		],
		exclude: ['frappe-ui'],
	},
	define: {
		// enable hydration mismatch details in production build
		__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true',
	},
})
