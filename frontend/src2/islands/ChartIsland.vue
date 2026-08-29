<script setup lang="ts">
import ChartBody from '../charts/components/ChartBody.vue'
import ViewerChart from '../charts/ViewerChart.vue'
import type { ViewerFilters } from '../dashboard/viewer'

// The chart body is all this island is. Desk frames it itself — border, title,
// menu, loading and error — and the host's frame wins, so the island fills
// ViewerChart's slot with the body alone and draws no card of its own. What it
// keeps is what a reader would call the chart: the picture, and the states that
// belong to the data behind it.
//
// It prints no title either. Desk heads the widget with the name its own
// document carries, which is not always the Insights chart's title, and one
// label is the point.
defineProps<{ chart: string; dashboard?: string; filters?: ViewerFilters }>()
</script>

<template>
	<ViewerChart
		:chart="chart"
		:dashboard="dashboard"
		:filters="filters"
		v-slot="{ chart: viewer, onSegmentClick }"
	>
		<!-- no `filtered`: desk owns the filters it sends, so an empty chart here
		     has no reset to offer -->
		<ChartBody :chart="viewer" readonly @segment-click="onSegmentClick" />
	</ViewerChart>
</template>

<style>
/* The chart fills the element the host gives it, and a percentage height needs
   every ancestor to have one. The mount shell's own containers — the shadow host
   and the theme container Vue mounts into — sit between us and that element and
   are auto-height, which collapses the chart to its title. Both are inside this
   shadow root, so the island's own sheet is what can size them. */
:host,
.frappe-island-root {
	height: 100%;
}
</style>
