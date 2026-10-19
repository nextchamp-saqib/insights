<script setup lang="ts">
import { ListFilter, Type } from 'lucide-vue-next'
import ChartIcon from '../charts/components/ChartIcon.vue'
import { ChartType } from '../types/chart.types'
import { GRID_COLUMNS } from './grid_placement'
import type { DashboardCell } from './dashboards'

// A dashboard's cards where they sit, drawn without their data, for a
// dashboard that has no preview image.
defineProps<{ cells: DashboardCell[] }>()
</script>

<template>
	<div
		class="grid h-full w-full content-start gap-1 overflow-hidden bg-surface-gray-1 p-2"
		:style="{
			gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
			gridAutoRows: '5px',
		}"
	>
		<div
			v-for="(cell, index) in cells"
			:key="index"
			class="flex items-center justify-center rounded-sm"
			:class="cell.kind === 'filter' ? 'bg-surface-gray-2' : 'bg-surface-base shadow-sm'"
			:style="{
				gridColumn: `${cell.x + 1} / span ${cell.w}`,
				gridRow: `${cell.y + 1} / span ${cell.h}`,
			}"
		>
			<ListFilter v-if="cell.kind === 'filter'" class="size-3 text-ink-gray-4" />
			<Type v-else-if="cell.kind === 'text'" class="size-3 text-ink-gray-4" />
			<ChartIcon
				v-else
				class="!size-3.5 !text-ink-gray-4"
				:chartType="cell.kind as ChartType"
			/>
		</div>
	</div>
</template>
