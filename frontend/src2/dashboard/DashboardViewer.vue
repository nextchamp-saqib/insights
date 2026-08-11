<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { downloadImage } from '../helpers'
import { __ } from '../translation'
import type {
	DashboardMenuOption,
	DashboardSource,
	ViewerDashboardItem,
	ViewerFilters,
	ViewerFilterState,
} from './viewer'

// A dashboard's content: the filters a reader moves, the grid of cards, and
// every state the page can be in before there is a grid to draw. This is the
// whole of what a dashboard *is*, on every surface that shows one — the desk
// island, the public link, the SPA's own page and the builder.
//
// It draws no header of its own. What sits above the grid is the one thing that
// genuinely differs between surfaces: a desk page needs the band desk hides, and
// the builder already has the workbook's navbar over it. So the band is a slot,
// and the two things a header needs — a refresh and the page's menu — are handed
// to it. `DashboardPage` fills it with a page header; the builder fills it with
// a title row that blends into the dashboard.
//
// Everything else that changes between surfaces arrives on the feed, as a
// capability that is either there or not. Nothing here asks which surface it is,
// and an ungranted capability draws nothing at all — no disabled button, no
// action that answers with a refusal.
//
// The layout arrives in one request and is drawn straight away; every card then
// fetches on its own, so one slow or failing card never holds up the rest.
//
// A surface hands this a bounded box and it fills it: the header band stays, one
// scrolling body under it. That is what lets the grid scroll without the page
// around it scrolling too.
const props = defineProps<{
	// where the page's content comes from: `useSavedDashboard` on a read surface,
	// `useDashboardAuthoring` in the builder
	source: DashboardSource
	// where the reader starts. What they last chose on this dashboard wins over it
	filters?: ViewerFilters
}>()

const GRID_COLS = 20

const filters = ref<ViewerFilters>({})
const refreshToken = ref(0)

// what the surface mounted us with is the starting point; where the feed says
// the filters start wins over it — a reader's last choice on a read surface, the
// document's own defaults in the builder.
watch(
	() => props.source.name,
	(name) => {
		if (!name) return
		filters.value = { ...(props.filters || {}), ...props.source.filters }
	},
	{ immediate: true },
)

watch(filters, (value) => props.source.saveFilters?.(value), { deep: true })

// Which cards a filter reaches is the server's answer, carried on the item. A
// card is handed only the filters that land on it, so moving one filter refetches
// its cards and leaves the rest of the page alone.
const filtersByChart = computed(() => {
	const byChart: Record<string, ViewerFilters> = {}
	props.source.items.forEach((item) => {
		if (item.type !== 'filter') return
		const state = filters.value[item.filter_name!]
		if (!state) return
		item.charts?.forEach((chart) => {
			byChart[chart] = { ...byChart[chart], [item.filter_name!]: state }
		})
	})
	return byChart
})

// A card gets the filters that land on it. A filter cell gets the page's state
// and finds itself in it by name — the page owns it, so a reset from anywhere on
// the page reaches every control.
function cellFilters(item: ViewerDashboardItem) {
	return item.type === 'filter' ? filters.value : filtersByChart.value[item.chart!]
}

// where a filter cell says it has been moved to
function setFilter(item: ViewerDashboardItem, state?: ViewerFilterState) {
	const moved = { ...filters.value }
	if (state) moved[item.filter_name!] = state
	else delete moved[item.filter_name!]
	filters.value = moved
}

// Cards reach the execution queue in whatever order they mount, so rank them by
// grid position instead: top row first, left to right within a row.
function layoutRank(item: ViewerDashboardItem) {
	return item.layout.y * GRID_COLS + item.layout.x
}

// Every action is offered on the strength of what the feed carries, never of
// which surface this is. The header draws them; which of them exist is settled
// here, because the export is this component's own.
const menuOptions = computed(() => {
	const duplicate = props.source.duplicate
	return [
		{
			label: __('Export as PNG'),
			icon: 'lucide-download',
			onClick: exportImage,
		},
		props.source.openBuilder
			? {
					label: __('Edit in Insights'),
					icon: 'lucide-external-link',
					onClick: props.source.openBuilder,
			  }
			: null,
		// shipped content is read-only, so a copy is the only way to change it
		duplicate
			? {
					label: duplicate.running ? __('Duplicating...') : __('Duplicate to edit'),
					icon: 'lucide-copy',
					onClick: duplicate.run,
			  }
			: null,
		...(props.source.authoring?.menuOptions || []),
	].filter(Boolean) as DashboardMenuOption[]
})

const grid = ref<HTMLElement>()

// the grid, not the page: the header band belongs to the reader's session, not
// to the picture they want to keep
function exportImage() {
	if (!grid.value) return
	return downloadImage(grid.value, `${props.source.title}.png`)
}
</script>

<template>
	<div class="flex h-full w-full flex-col overflow-hidden">
		<!-- The header sits outside the scrolling body rather than sticking to the
		     top of it, so the grid scrolls under it and the page around it does not
		     move. It is drawn in every state, including the ones below — a reader
		     who may not see this dashboard still gets a way back. -->
		<slot name="header" :refresh="() => refreshToken++" :menuOptions="menuOptions" />

		<div
			v-if="source.unavailable"
			class="flex w-full flex-1 items-center justify-center p-4 text-p-base text-ink-gray-5"
		>
			{{ __('This dashboard is not available') }}
		</div>

		<div v-else-if="source.loading" class="flex-1 p-4">
			<div class="h-8 w-64 animate-pulse rounded-4 bg-surface-gray-2" />
		</div>

		<!-- The one scroller on the page. The padding belongs here and not on
		     the grid: vue-grid-layout reads its own `offsetWidth` to size a
		     column, which is the padding box, and then lays the columns out
		     inside the padding — so the rightmost card ended 16px past the
		     page. An empty dashboard keeps the scroller, because it is also
		     where a chart is dropped onto the grid. -->
		<div
			v-else
			ref="grid"
			class="flex-1 overflow-y-auto p-4"
			@dragover="source.authoring?.dragOver($event)"
			@drop="source.authoring?.drop($event)"
		>
			<div
				v-if="!source.items.length"
				class="flex h-full w-full items-center justify-center text-p-base text-ink-gray-5"
			>
				{{ __('This dashboard is empty') }}
			</div>

			<component
				:is="source.grid"
				v-else
				class="h-fit w-full"
				:class="source.authoring?.editing ? 'mb-[20rem] !select-none' : ''"
				:cols="GRID_COLS"
				:disabled="!source.authoring?.editing"
				:verticalCompact="source.verticalCompact"
				:modelValue="source.items.map((item) => item.layout)"
				@update:modelValue="(layouts) => layouts && source.authoring?.moveItems(layouts)"
			>
				<template #item="{ index }">
					<component
						:is="source.cell"
						:item="source.items[index]"
						:index="index"
						:dashboard="source.name"
						:filters="cellFilters(source.items[index])"
						:priority="layoutRank(source.items[index])"
						:refresh-token="refreshToken"
						@filter="setFilter(source.items[index], $event)"
						@reset-filters="filters = {}"
					/>
				</template>
			</component>
		</div>
	</div>
</template>
