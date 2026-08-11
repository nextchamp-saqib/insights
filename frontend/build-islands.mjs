// Builds Insights' islands: a second target beside the SPA's `yarn build`, same
// source tree, different output contract. The preset registers the
// `<name>.island.js` keys that hooks.py's `ui_islands` points at.

import { buildIslands } from '@framework/ui/vite/island'

await buildIslands({
	app: 'insights',
	root: import.meta.dirname,
	entries: {
		insights_chart: 'src2/islands/chart.ts',
		insights_dashboard: 'src2/islands/dashboard.ts',
	},
	// No content list: the preset scans the modules each island is built from, so
	// a helper holding class literals cannot be left out of the scan by accident.
	// The SPA's plugin. Without it the Number grid's `@xl:` columns compile to nothing.
	tailwindPlugins: ['@tailwindcss/container-queries'],
	// 18 kB of typography the runtime sheet already carries — the shadow root
	// adopts both, runtime first, so text items render off that copy.
	blocklist: ['prose', 'prose-v3'],
	// Pinned from the measured dashboard build plus slack, so it bites when an
	// entry picks up a graph it has no business in. Raised from 152 kB when the
	// island took on the whole page's chrome: export-as-image is offered on every
	// surface now, and its renderer is 15 kB the island did not carry before.
	//
	// Raised again from 168 kB when the sheet started being scanned from the
	// modules each island is built from. `filter_icons.ts` is one of them, and it
	// spells out 112 lucide names so a filter can wear any of them — 188 kB of
	// masked SVG, against 19 kB for the rest of the dashboard island's CSS. The
	// icons were simply not drawing before, which is what the budget was
	// measured against. The palette is the number to argue with, not this.
	budget: 360 * 1024,
	// The budget catches a recoupled entry late and by weight; these name the
	// recouplings. Each drags something a viewer cannot do: routed pages, the
	// builder aggregate, or a role-gated resource load. Checked after vite erases
	// types, so `import type` from any of them still passes.
	forbiddenImports: [
		/\/router(\.ts)?$/,
		/\/workbook\/workbook(\.ts)?$/,
		/\/charts\/chart(\.ts)?$/,
		/\/query\/query(\.ts)?$/,
		/\/dashboard\/dashboard(\.ts)?$/,
		// The runtime publishes no socket, so an island that reached for one
		// would either bundle 40 kB of it or ask the page's import map for a
		// specifier it does not have. Desk owns the connection on that page.
		/^socket\.io-client$/,
	],
	production: process.argv.includes('--production'),
	watch: process.argv.includes('--watch'),
})
