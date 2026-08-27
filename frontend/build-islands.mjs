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
	// An island carries its own Vue, frappe-ui and echarts, so the floor is high:
	// pinned just over the measured dashboard build, 1441 kB of JS plus the app's
	// 336 kB stylesheet. Two thirds of that sheet is masked SVG — `filter_icons.ts`
	// spells out 112 lucide names so a filter can wear any of them. The palette is
	// the number to argue with, not this.
	budget: 1900 * 1024,
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
		// Desk holds the page's socket. An island that opened its own would
		// bundle a second 40 kB client and a second connection with it.
		/^socket\.io-client$/,
	],
	production: process.argv.includes('--production'),
	watch: process.argv.includes('--watch'),
})
