<script setup lang="ts">
import { computed } from 'vue'
import { GRID_COLUMNS } from './grid_placement'
import type { DashboardCell } from './dashboards'

// The top of a dashboard's layout, each card drawn as a wireframe of what it
// shows, for a dashboard that has no preview image.
const props = defineProps<{ cells: DashboardCell[] }>()

const COLUMN = 10
const ROW = 4.2
const GAP = 1.2
const PAD = 3
const WIDTH = GRID_COLUMNS * COLUMN + PAD * 2
// as tall as wide, so the sketch always fills the card's width and the card crops its foot
const HEIGHT = WIDTH
// the first screen of a dashboard: its filters, numbers and first row of charts
const ROWS = 20

type Shape =
	| { type: 'rect'; x: number; y: number; width: number; height: number; rx: number; ink: Ink }
	| { type: 'polyline'; points: string; ink: Ink }
	| { type: 'ring'; cx: number; cy: number; r: number; dash?: string; ink: Ink }
type Ink = 'light' | 'dark'

const BAR_HEIGHTS = [0.45, 0.7, 0.55, 0.9, 0.65, 0.8, 0.5, 0.75, 0.6, 0.85]
const ROW_WIDTHS = [0.95, 0.8, 0.66, 0.55, 0.45, 0.36, 0.28]
const LINE_YS = [0.7, 0.55, 0.62, 0.4, 0.48, 0.3, 0.38, 0.2]

function line(x: number, y: number, width: number, height: number, ink: Ink = 'light'): Shape {
	return { type: 'rect', x, y, width, height, rx: Math.min(height / 2, 1), ink }
}

function glyph(kind: string, x: number, y: number, w: number, h: number): Shape[] {
	const ix = x + w * 0.12
	const iw = w * 0.76
	const iy = y + h * 0.18
	const ih = h * 0.64
	switch (kind) {
		case 'filter':
			return [line(x + 2, y + h / 2 - 0.9, Math.min(w * 0.45, 14), 1.8)]
		case 'text':
			return [line(x + 2, y + h / 2 - 0.8, w * 0.5, 1.6)]
		case 'Number':
			return [
				line(x + 2.2, y + h * 0.28, w * 0.45, 1.6),
				line(x + 2.2, y + h * 0.55, w * 0.6, 3.4, 'dark'),
			]
		case 'Bar': {
			const n = Math.max(4, Math.min(10, Math.round(w / 4)))
			const slot = iw / n
			return Array.from({ length: n }, (_, i) => {
				const height = ih * BAR_HEIGHTS[i % BAR_HEIGHTS.length]
				return line(ix + i * slot + slot * 0.2, iy + ih - height, slot * 0.6, height)
			})
		}
		case 'Row': {
			const n = Math.max(3, Math.min(ROW_WIDTHS.length, Math.round(h / 4)))
			return Array.from({ length: n }, (_, i) =>
				line(ix, iy + (i * ih) / n, iw * ROW_WIDTHS[i], (ih / n) * 0.55),
			)
		}
		case 'Line':
			return [
				{
					type: 'polyline',
					points: LINE_YS.map(
						(v, i) => `${ix + (i * iw) / (LINE_YS.length - 1)},${iy + ih * v}`,
					).join(' '),
					ink: 'dark',
				},
			]
		case 'Table': {
			const n = Math.max(3, Math.min(8, Math.round(h / 3.2)))
			const shapes = [line(ix, iy, iw, 1.6, 'dark')]
			for (let i = 1; i < n; i++) {
				const yy = iy + (i * ih) / n
				shapes.push(line(ix, yy, iw * 0.3, 1.3))
				shapes.push(line(ix + iw * 0.38, yy, iw * 0.22, 1.3))
				shapes.push(line(ix + iw * 0.68, yy, iw * 0.22, 1.3))
			}
			return shapes
		}
		case 'Funnel': {
			const n = 4
			return Array.from({ length: n }, (_, i) => {
				const width = iw * ROW_WIDTHS[i * 2]
				return line(x + (w - width) / 2, iy + (i * ih) / n, width, (ih / n) * 0.7)
			})
		}
		case 'Donut': {
			const r = Math.min(w, h) * 0.3
			const cx = x + w / 2
			const cy = y + h / 2
			return [
				{ type: 'ring', cx, cy, r, ink: 'light' },
				{ type: 'ring', cx, cy, r, dash: `${2 * Math.PI * r * 0.35} 999`, ink: 'dark' },
			]
		}
		default:
			return [line(ix, iy, iw, ih)]
	}
}

const cards = computed(() =>
	props.cells
		.filter((cell) => cell.y < ROWS)
		.map((cell) => {
			const x = PAD + cell.x * COLUMN + GAP / 2
			const y = PAD + cell.y * ROW + GAP / 2
			const w = cell.w * COLUMN - GAP
			const h = cell.h * ROW - GAP
			return {
				x,
				y,
				w,
				h,
				filter: cell.kind === 'filter',
				shapes: glyph(cell.kind, x, y, w, h),
			}
		}),
)

const INK = { light: 'fill-ink-gray-3', dark: 'fill-ink-gray-4' }
const STROKE = { light: 'stroke-ink-gray-3', dark: 'stroke-ink-gray-4' }
</script>

<template>
	<svg
		class="h-full w-full bg-surface-gray-1"
		:viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
		preserveAspectRatio="xMidYMin slice"
		aria-hidden="true"
	>
		<g v-for="(card, index) in cards" :key="index">
			<rect
				:x="card.x"
				:y="card.y"
				:width="card.w"
				:height="card.h"
				rx="2"
				:class="card.filter ? 'fill-surface-gray-2' : 'fill-surface-base stroke-ink-gray-1'"
				:stroke-width="card.filter ? 0 : 0.5"
			/>
			<template v-for="(shape, i) in card.shapes" :key="i">
				<rect
					v-if="shape.type === 'rect'"
					:x="shape.x"
					:y="shape.y"
					:width="shape.width"
					:height="shape.height"
					:rx="shape.rx"
					:class="INK[shape.ink]"
				/>
				<polyline
					v-else-if="shape.type === 'polyline'"
					:points="shape.points"
					fill="none"
					stroke-width="1"
					stroke-linejoin="round"
					stroke-linecap="round"
					:class="STROKE[shape.ink]"
				/>
				<circle
					v-else
					:cx="shape.cx"
					:cy="shape.cy"
					:r="shape.r"
					fill="none"
					:stroke-width="shape.r * 0.45"
					:stroke-dasharray="shape.dash"
					:transform="shape.dash ? `rotate(-90 ${shape.cx} ${shape.cy})` : undefined"
					:class="STROKE[shape.ink]"
				/>
			</template>
		</g>
	</svg>
</template>
