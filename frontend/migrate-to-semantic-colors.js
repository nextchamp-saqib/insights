#!/usr/bin/env node
/**
 * migrate-to-semantic-colors.js
 *
 * Replaces raw Tailwind color classes in src2/ with semantic tokens from
 * frappe-ui/tailwind/colors.js (surface / ink / outline tokens).
 *
 * The mapping table below is MANUALLY defined — edit it freely.
 * Variants (hover:, dark:, focus:, [&_input]:, etc.) are handled automatically.
 * Opacity-modifiers (/30, /70 …) are intentionally skipped so they can be
 * reviewed and mapped individually.
 *
 * Usage:
 *   node migrate-to-semantic-colors.js              → dry-run, show changes
 *   node migrate-to-semantic-colors.js --write      → apply changes in-place
 *   node migrate-to-semantic-colors.js --write --file workbook/Foo.vue
 *                                                   → apply to one file only
 *
 * Token reference  (light-mode base values from colors.js):
 * ┌──────────────────┬──────────────────────────┬────────────────────────────┐
 * │ surface-*        │ ink-*                    │ outline-*                  │
 * ├──────────────────┼──────────────────────────┼────────────────────────────┤
 * │ bg-surface-gray-1  = gray-50   │ text-ink-gray-1 = gray-200  │ border-outline-gray-1 = gray-200 │
 * │ bg-surface-gray-2  = gray-100  │ text-ink-gray-2 = gray-300  │ border-outline-gray-2 = gray-300 │
 * │ bg-surface-gray-3  = gray-200  │ text-ink-gray-3 = gray-400  │ border-outline-gray-3 = gray-400 │
 * │ bg-surface-gray-4  = gray-300  │ text-ink-gray-4 = gray-500  │ border-outline-gray-4 = gray-500 │
 * │ bg-surface-gray-5  = gray-700  │ text-ink-gray-5 = gray-600  │ border-outline-gray-5 = gray-800 │
 * │ bg-surface-gray-6  = gray-800  │ text-ink-gray-6 = gray-700  │                                  │
 * │ bg-surface-gray-7  = gray-900  │ text-ink-gray-8 = gray-800  │                                  │
 * │ bg-surface-white   = white     │ text-ink-gray-9 = gray-900  │                                  │
 * └──────────────────┴──────────────────────────┴────────────────────────────┘
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = path.join(__dirname, 'src2')

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = !args.includes('--write')
const fileFlag = args.indexOf('--file')
const ONLY_FILE = fileFlag !== -1 ? args[fileFlag + 1] : null

// ─── MAPPING TABLE ────────────────────────────────────────────────────────────
// Keys   = raw Tailwind class (without variants, without opacity modifier)
// Values = semantic replacement class
//
// Add, remove, or change entries here as needed.
// Classes NOT listed are left untouched.
//
// NOTE: classes with opacity modifiers (e.g. bg-gray-50/30) are skipped by
// the replacement logic — add them explicitly here if you want them migrated:
//   'bg-gray-50/30': 'bg-surface-gray-1/30',

const MAPPING = {
	// ── BG → surface ────────────────────────────────────────────────────────────
	// Direct token matches from themedCssVariables (light mode):
	'bg-white': 'bg-surface-white', // white       → surface-white
	'bg-gray-50': 'bg-surface-gray-1', // gray-50     → surface-gray-1
	'bg-gray-100': 'bg-surface-gray-2', // gray-100    → surface-gray-2
	'bg-gray-200': 'bg-surface-gray-3', // gray-200    → surface-gray-3
	'bg-gray-300': 'bg-surface-gray-4', // gray-300    → surface-gray-4
	// bg-gray-400 → no surface token (gap between surface-gray-4=300 and surface-gray-5=700)
	// bg-gray-700 → surface-gray-5 (but gray-700 is also used intentionally as a dark surface in tooltips etc.; map with caution)
	'bg-gray-800': 'bg-surface-gray-6', // gray-800    → surface-gray-6
	'bg-gray-900': 'bg-surface-gray-7', // gray-900    → surface-gray-7

	'bg-blue-50': 'bg-surface-blue-1', // closest: surface-blue-1=blue-100; map cautiously
	'bg-blue-100': 'bg-surface-blue-1', // blue-100    → surface-blue-1
	// bg-blue-200, bg-blue-300, bg-blue-400 → no direct surface token
	// bg-blue-600 → no direct surface token (surface-blue-2 = blue-500, not 600)

	'bg-green-50': 'bg-surface-green-1', // green-50    → surface-green-1
	'bg-green-100': 'bg-surface-green-2', // green-100   → surface-green-2 (not currently in scan but common)
	// bg-green-300 → no direct surface token
	'bg-green-600': 'bg-surface-green-3', // green-600   → surface-green-3

	// bg-orange-50 → no direct token (surface-orange-1 = orange-100)
	// bg-orange-600 → no direct token

	'bg-red-50': 'bg-surface-red-1', // closest: surface-red-1=red-100; map cautiously
	'bg-red-100': 'bg-surface-red-1', // red-100     → surface-red-1
	'bg-red-200': 'bg-surface-red-2', // red-200     → surface-red-2
	'bg-red-300': 'bg-surface-red-3', // red-300     → surface-red-3
	// bg-red-400 → no direct token
	'bg-red-600': 'bg-surface-red-4', // red-600     → surface-red-4
	'bg-red-700': 'bg-surface-red-5', // red-700     → surface-red-5
	'bg-red-800': 'bg-surface-red-6', // red-800     → surface-red-6

	'bg-amber-100': 'bg-surface-amber-1', // amber-100   → surface-amber-1
	'bg-amber-600': 'bg-surface-amber-2', // amber-600   → surface-amber-2

	'bg-cyan-100': 'bg-surface-cyan-1', // cyan-100    → surface-cyan-1
	'bg-orange-100': 'bg-surface-orange-1', // orange-100  → surface-orange-1
	'bg-pink-100': 'bg-surface-pink-1', // pink-100    → surface-pink-1
	'bg-violet-100': 'bg-surface-violet-1', // violet-100  → surface-violet-1

	// ── TEXT → ink ──────────────────────────────────────────────────────────────
	// text-gray-50 / text-gray-100 → no ink token (too light; used on dark backgrounds)
	'text-gray-300': 'text-ink-gray-2', // gray-300    → ink-gray-2
	'text-gray-400': 'text-ink-gray-3', // gray-400    → ink-gray-3
	'text-gray-500': 'text-ink-gray-4', // gray-500    → ink-gray-4
	'text-gray-600': 'text-ink-gray-5', // gray-600    → ink-gray-5
	'text-gray-700': 'text-ink-gray-6', // gray-700    → ink-gray-6
	'text-gray-800': 'text-ink-gray-8', // gray-800    → ink-gray-8
	'text-gray-900': 'text-ink-gray-9', // gray-900    → ink-gray-9
	'text-white': 'text-ink-white', // white       → ink-white

	'text-blue-600': 'text-ink-blue-3', // blue-600    → ink-blue-3
	'text-blue-800': 'text-ink-blue-4', // blue-800    → ink-blue-4
	// text-blue-50, text-blue-900 → no ink token

	'text-green-50': 'text-ink-green-1', // green-50    → ink-green-1
	'text-green-600': 'text-ink-green-2', // green-600   → ink-green-2 (not in scan but common)
	'text-green-800': 'text-ink-green-3', // green-800   → ink-green-3 (not in scan but common)

	'text-red-50': 'text-ink-red-1', // red-50      → ink-red-1
	'text-red-400': 'text-ink-red-2', // red-400     → ink-red-2
	'text-red-500': 'text-ink-red-3', // red-500     → ink-red-3 (not in scan but common)
	'text-red-600': 'text-ink-red-4', // red-600     → ink-red-4
	// text-red-700, text-red-800 → no direct ink token

	'text-amber-100': 'text-ink-amber-1', // amber-100   → ink-amber-1 (not in scan but common)
	'text-amber-500': 'text-ink-amber-2', // amber-500   → ink-amber-2
	'text-amber-600': 'text-ink-amber-3', // amber-600   → ink-amber-3

	'text-cyan-500': 'text-ink-cyan-1', // cyan-500    → ink-cyan-1
	'text-pink-500': 'text-ink-pink-1', // pink-500    → ink-pink-1
	'text-violet-500': 'text-ink-violet-1', // violet-500  → ink-violet-1

	// ── BORDER → outline ────────────────────────────────────────────────────────
	'border-gray-200': 'border-outline-gray-1', // gray-200    → outline-gray-1
	'border-gray-300': 'border-outline-gray-2', // gray-300    → outline-gray-2
	'border-gray-400': 'border-outline-gray-3', // gray-400    → outline-gray-3
	'border-gray-500': 'border-outline-gray-4', // gray-500    → outline-gray-4
	'border-gray-800': 'border-outline-gray-5', // gray-800    → outline-gray-5
	// border-gray-100, border-gray-700 → no direct outline token
	'border-white': 'border-outline-white', // white       → outline-white

	'border-blue-300': 'border-outline-blue-1', // blue-300    → outline-blue-1
	'border-blue-500': 'border-outline-blue-2', // blue-500    → outline-blue-2

	'border-green-300': 'border-outline-green-1', // green-300   → outline-green-1
	'border-green-400': 'border-outline-green-2', // green-400   → outline-green-2

	'border-red-200': 'border-outline-red-1', // red-200     → outline-red-1
	'border-red-300': 'border-outline-red-2', // red-300     → outline-red-2
	'border-red-400': 'border-outline-red-3', // red-400     → outline-red-3
	'border-red-500': 'border-outline-red-4', // red-500     → outline-red-4

	'border-amber-200': 'border-outline-amber-1', // amber-200   → outline-amber-1
	'border-amber-400': 'border-outline-amber-2', // amber-400   → outline-amber-2
	'border-orange-400': 'border-outline-orange-1', // orange-400  → outline-orange-1

	// ── NOT MAPPED (no direct semantic token) ───────────────────────────────────
	// bg-gray-400, bg-gray-700 (ambiguous / intentional dark tone)
	// bg-blue-200, bg-blue-300, bg-blue-400, bg-blue-600
	// bg-green-300
	// bg-orange-50, bg-orange-600
	// bg-red-400
	// text-gray-50, text-gray-100 (used on dark bg — no ink equivalent)
	// text-blue-50, text-blue-400, text-blue-900
	// text-orange-50, text-orange-600, text-orange-800
	// text-red-700, text-red-800
	// text-yellow-50
	// border-gray-100, border-gray-700
	// border-orange-200
	// ring-*, fill-*, stroke-* (outline/ink could apply but surface config doesn't cover ring-*)
}

// ─── Compile patterns ────────────────────────────────────────────────────────
// Build regex for each mapping entry.
// A class token is surrounded by non-identifier chars (excluding `-` to keep
// hyphenated class names intact), and specifically excludes `/` in lookahead
// so opacity-modified variants (e.g. bg-gray-50/30) are NOT matched.
const PATTERNS = Object.entries(MAPPING).map(([from, to]) => {
	// Escape special regex chars (`.` in class names etc.)
	const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return {
		re: new RegExp(`(?<![a-zA-Z0-9_-])${escaped}(?![a-zA-Z0-9_/-])`, 'g'),
		from,
		to,
	}
})

// ─── File walker ──────────────────────────────────────────────────────────────
function* walkFiles(dir, exts = ['.vue', '.ts', '.js', '.css', '.html']) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			yield* walkFiles(full, exts)
		} else if (exts.some((e) => entry.name.endsWith(e))) {
			yield full
		}
	}
}

// ─── Apply mapping to a file ──────────────────────────────────────────────────
function processFile(filePath) {
	let src = fs.readFileSync(filePath, 'utf8')
	const changes = []

	for (const { re, from, to } of PATTERNS) {
		re.lastIndex = 0
		if (re.test(src)) {
			re.lastIndex = 0
			// Count occurrences
			const count = (src.match(re) || []).length
			changes.push({ from, to, count })
			re.lastIndex = 0
			src = src.replace(re, to)
		}
	}

	return { src, changes }
}

// ─── Main ────────────────────────────────────────────────────────────────────
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const RED = '\x1b[31m'

console.log(
	`\n${BOLD}Semantic color migration${RESET}  ${DIM}(${
		DRY_RUN ? 'dry-run — pass --write to apply' : 'WRITING changes'
	})${RESET}\n`,
)

const files = []
if (ONLY_FILE) {
	const abs = path.isAbsolute(ONLY_FILE) ? ONLY_FILE : path.join(SRC_DIR, ONLY_FILE)
	files.push(abs)
} else {
	for (const f of walkFiles(SRC_DIR)) files.push(f)
}

let totalFiles = 0
let totalReplacements = 0

for (const filePath of files) {
	const { src, changes } = processFile(filePath)
	if (changes.length === 0) continue

	totalFiles++
	const relPath = path.relative(SRC_DIR, filePath)
	const replCount = changes.reduce((s, c) => s + c.count, 0)
	totalReplacements += replCount

	console.log(
		`${CYAN}${relPath}${RESET}  ${DIM}(${replCount} replacement${
			replCount !== 1 ? 's' : ''
		})${RESET}`,
	)
	for (const { from, to, count } of changes) {
		console.log(`  ${RED}${from}${RESET}  →  ${GREEN}${to}${RESET}  ${DIM}×${count}${RESET}`)
	}
	console.log()

	if (!DRY_RUN) {
		fs.writeFileSync(filePath, src, 'utf8')
	}
}

if (totalFiles === 0) {
	console.log(`${DIM}No changes needed.${RESET}\n`)
} else {
	const mode = DRY_RUN ? `${YELLOW}[dry-run]${RESET}` : `${GREEN}[written]${RESET}`
	console.log(
		`${BOLD}Summary:${RESET} ${mode}  ${totalFiles} file${
			totalFiles !== 1 ? 's' : ''
		}, ${totalReplacements} replacement${totalReplacements !== 1 ? 's' : ''}\n`,
	)
	if (DRY_RUN) {
		console.log(`${DIM}Run with --write to apply these changes.${RESET}\n`)
	}
}
