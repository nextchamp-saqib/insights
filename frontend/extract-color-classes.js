#!/usr/bin/env node
/**
 * extract-color-classes.js
 *
 * Extracts all Tailwind color utility classes used in frontend/src2.
 *
 * Captures:
 *   - bg-*, text-*, border-*, ring-*, ring-offset-*, outline-*
 *   - shadow-*, fill-*, stroke-*, accent-*, caret-*, decoration-*
 *   - from-*, via-*, to-* (gradients)
 *   - placeholder-* (legacy Tailwind v2 + v3 modifier)
 *   - divide-*, selection-*
 *   - Frappe/Insights design tokens: bg-surface-*, text-ink-*, etc.
 *   - Arbitrary values: bg-[#hex], text-[rgb(...)], etc.
 *   - All variant chains: hover:, dark:, focus:, [&_input]:, etc.
 *
 * Usage:
 *   node extract-color-classes.js              → grouped output to stdout
 *   node extract-color-classes.js --json       → raw JSON
 *   node extract-color-classes.js --by-file    → show which files each class appears in
 *   node extract-color-classes.js --csv        → CSV output
 *   node extract-color-classes.js --flat       → plain sorted list, one per line
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC_DIR = path.join(__dirname, 'src2')

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const JSON_MODE = args.includes('--json')
const BY_FILE = args.includes('--by-file')
const CSV_MODE = args.includes('--csv')
const FLAT_MODE = args.includes('--flat')

// ─── Color palette names ──────────────────────────────────────────────────────
const COLOR_NAMES = [
	// Tailwind default palette
	'slate',
	'gray',
	'grey',
	'zinc',
	'neutral',
	'stone',
	'red',
	'orange',
	'amber',
	'yellow',
	'lime',
	'green',
	'emerald',
	'teal',
	'cyan',
	'sky',
	'blue',
	'indigo',
	'violet',
	'purple',
	'fuchsia',
	'pink',
	'rose',
	// Special keywords
	'white',
	'black',
	'transparent',
	'current',
	'inherit',
	// Frappe UI / Insights design tokens
	'surface',
	'ink',
	'subtle',
	'moderate',
]

// Tailwind shade numbers (includes extended palette)
const SHADES = [
	'50',
	'100',
	'150',
	'200',
	'250',
	'300',
	'350',
	'400',
	'450',
	'500',
	'550',
	'600',
	'650',
	'700',
	'750',
	'800',
	'850',
	'900',
	'950',
	// Frappe token shades: surface-white, surface-gray-1 … surface-gray-7, ink-gray-1 … ink-gray-8
	'1',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
]

// ─── Utility prefixes (longest first to avoid prefix mis-matching) ────────────
const PREFIXES = [
	'ring-offset',
	'ring',
	'bg',
	'text',
	'border',
	'outline',
	'shadow',
	'fill',
	'stroke',
	'from',
	'via',
	'to',
	'divide',
	'accent',
	'caret',
	'decoration',
	'placeholder',
	'selection',
]

// ─── Build regex ──────────────────────────────────────────────────────────────
const escapedPrefixes = PREFIXES.slice()
	.sort((a, b) => b.length - a.length) // longest first
	.map((p) => p.replace(/-/g, '\\-'))
	.join('|')

const colorPart = COLOR_NAMES.join('|')
const shadePart = SHADES.join('|')

// Matches a full color class (with optional variant chain prefix):
//   [variant:]* <prefix> - <color> [-<shade>] [/<opacity>]
//   OR  <prefix> - [arbitrary-value] [/<opacity>]
//
// Preceded by a word-boundary-like character so we don't grab mid-word.
const CLASS_REGEX = new RegExp(
	// Must be at a token boundary
	`(?:^|[\\s"'\`({:,])` +
		`(` +
		// optional variants: hover:, dark:focus:, [&_input]:, group-hover:, etc.
		`(?:(?:[\\w\\[\\]&_.#*:()>+~^$|/-]+):)*` +
		`(?:` +
		// Standard named color: prefix-color[-shade][/opacity]
		// Also covers compound tokens: bg-surface-gray-1, text-ink-gray-8
		`(?:${escapedPrefixes})-(?:${colorPart})(?:-(?:${shadePart}|(?:${colorPart})-(?:${shadePart})|(?:${colorPart})))?(?:\\/[\\w.]+)?` +
		`|` +
		// Arbitrary color value: bg-[#hex], text-[rgb(...)], bg-[color:var(--x)], etc.
		// Must look like a color (hex, color function, named CSS color, or CSS var)
		`(?:${escapedPrefixes})-\\[(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|lch|lab|color|hwb)\\([^\\]]+\\)|color:[^\\]]+|var\\(--[^\\]]+\\)|(?:${colorPart}))\\](?:\\/[\\w.]+)?` +
		`)` +
		`)`,
	'g',
)

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

// ─── Deduplication helpers ────────────────────────────────────────────────────

/**
 * Normalise a class for deduplication purposes.
 * - Lowercases hex values inside brackets so bg-[#8AC593] === bg-[#8ac593]
 */
function normaliseClass(cls) {
	return cls.replace(/\[#([0-9a-fA-F]+)\]/g, (_, hex) => `[#${hex.toLowerCase()}]`)
}

// ─── Extract from a single file ───────────────────────────────────────────────
function extractFromFile(filePath) {
	const src = fs.readFileSync(filePath, 'utf8')
	const found = new Map() // normalised → original (first seen)
	let m
	CLASS_REGEX.lastIndex = 0
	while ((m = CLASS_REGEX.exec(src)) !== null) {
		const raw = m[1].trim()
		const key = normaliseClass(raw)
		if (!found.has(key)) found.set(key, raw)
	}
	return [...found.values()]
}

// ─── Collect all classes ──────────────────────────────────────────────────────
// Map: normalised-class → { canonical, files: Set<relPath> }
const classMap = new Map()

let fileCount = 0
for (const filePath of walkFiles(SRC_DIR)) {
	fileCount++
	const relPath = path.relative(SRC_DIR, filePath)
	for (const cls of extractFromFile(filePath)) {
		const key = normaliseClass(cls)
		if (!classMap.has(key)) {
			classMap.set(key, { canonical: cls, files: new Set() })
		}
		classMap.get(key).files.add(relPath)
	}
}

// ─── Sorting & grouping helpers ───────────────────────────────────────────────

/** Strip variant chain from a class: "hover:bg-gray-100" → "bg-gray-100" */
function baseClass(cls) {
	return cls.replace(/^(?:[\w[\]&_.#*:()\->+~^$|/-]+:)+/, '')
}

const SORTED_PREFIXES = PREFIXES.slice().sort((a, b) => b.length - a.length)

function getPrefix(cls) {
	const base = baseClass(cls)
	for (const p of SORTED_PREFIXES) {
		if (base.startsWith(p + '-')) return p
	}
	return 'other'
}

function getColor(cls) {
	const base = baseClass(cls)
	if (base.includes('-[')) return 'arbitrary'
	for (const p of SORTED_PREFIXES) {
		if (base.startsWith(p + '-')) {
			const rest = base.slice(p.length + 1).replace(/\/.*$/, '')
			for (const c of COLOR_NAMES) {
				if (rest === c || rest.startsWith(c + '-')) return c
			}
		}
	}
	return 'other'
}

// ─── Sort ─────────────────────────────────────────────────────────────────────
const allClasses = [...classMap.values()].map((v) => v.canonical)

allClasses.sort((a, b) => {
	const pa = getPrefix(a),
		pb = getPrefix(b)
	const pi = PREFIXES.indexOf(pa),
		pj = PREFIXES.indexOf(pb)
	if (pi !== pj) return (pi === -1 ? 999 : pi) - (pj === -1 ? 999 : pj)
	const ca = getColor(a),
		cb = getColor(b)
	if (ca !== cb) return ca.localeCompare(cb)
	return a.localeCompare(b)
})

// ─── Output ───────────────────────────────────────────────────────────────────

if (JSON_MODE) {
	const out = {}
	for (const cls of allClasses) {
		const key = normaliseClass(cls)
		const entry = classMap.get(key)
		out[cls] = {
			count: entry.files.size,
			files: [...entry.files].sort(),
		}
	}
	process.stdout.write(JSON.stringify(out, null, 2) + '\n')
} else if (CSV_MODE) {
	process.stdout.write('class,prefix,color,file_count,files\n')
	for (const cls of allClasses) {
		const key = normaliseClass(cls)
		const files = [...classMap.get(key).files].sort()
		process.stdout.write(
			`"${cls}","${getPrefix(cls)}","${getColor(cls)}",${files.length},"${files.join(
				'; ',
			)}"\n`,
		)
	}
} else if (FLAT_MODE) {
	process.stdout.write(allClasses.join('\n') + '\n')
} else {
	// ── Grouped human-readable output ──────────────────────────────────────────
	const grouped = {}
	for (const cls of allClasses) {
		const key = `${getPrefix(cls)} / ${getColor(cls)}`
		if (!grouped[key]) grouped[key] = []
		grouped[key].push(cls)
	}

	const RESET = '\x1b[0m'
	const BOLD = '\x1b[1m'
	const DIM = '\x1b[2m'
	const CYAN = '\x1b[36m'
	const YELLOW = '\x1b[33m'
	const GREEN = '\x1b[32m'

	console.log(`\n${BOLD}Color classes found in src2/${RESET}`)
	console.log(
		`${DIM}Scanned ${fileCount} files · Total unique classes: ${allClasses.length}${RESET}\n`,
	)

	for (const [group, classes] of Object.entries(grouped)) {
		console.log(`${CYAN}${BOLD}── ${group} ──${RESET}`)
		for (const cls of classes) {
			const key = normaliseClass(cls)
			const entry = classMap.get(key)
			const n = entry.files.size
			const fileList = BY_FILE ? ` ${DIM}(${[...entry.files].sort().join(', ')})${RESET}` : ''
			const badge = `${YELLOW}[${n} file${n !== 1 ? 's' : ''}]${RESET}`
			console.log(`  ${GREEN}${cls}${RESET}  ${badge}${fileList}`)
		}
		console.log()
	}

	// ── Summary table ──────────────────────────────────────────────────────────
	console.log(`${BOLD}Summary by prefix:${RESET}`)
	const byPrefix = {}
	for (const cls of allClasses) {
		const p = getPrefix(cls)
		byPrefix[p] = (byPrefix[p] || 0) + 1
	}
	const prefixOrder = [...PREFIXES, 'other']
	for (const p of prefixOrder) {
		if (!byPrefix[p]) continue
		const n = byPrefix[p]
		console.log(`  ${p.padEnd(16)}  ${n} class${n !== 1 ? 'es' : ''}`)
	}
	console.log()
}
