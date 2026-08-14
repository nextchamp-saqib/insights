<script setup lang="ts">
import { Breadcrumbs, Button, Dialog, Dropdown } from 'frappe-ui'
import { ChartCard, ChartContainer } from 'frappe-ui/charts'
import { AlertTriangle, ChevronDown, ChevronLeft, X } from 'lucide-vue-next'
import { computed } from 'vue'
import { __ } from '../../translation'
import DrillBreakdown from './DrillBreakdown.vue'
import DrillRecords from './DrillRecords.vue'
import type { DrillLevelData, DrillStack } from './drill_stack'
import type { ChartSegmentClick } from './segment_click'

// One card for the whole drill, with a back-stack inside it.
//
// Every crumb pops to the level it reads. Nothing is fetched twice: the stack
// holds each level's answer for as long as the dialog is open, so back and crumb
// clicks are instant.
//
// Nothing here is a destination. There is no route, nothing is persisted, and
// closing loses the stack — this is an inspection.
//
// It is a `bare` Dialog: what makes this a modal is the overlay, Esc,
// click-outside and the focus trap, and `bare` keeps all of them. What it drops
// is the header block and its padding — a 24px band between a title and the
// body, where a chart card puts six. What the drill wants above the plot is not
// a dialog title anyway. Crumbs, a grain and the way out are a toolbar.
//
// So the whole surface is one card: a toolbar, a plot, and a line under it. The
// only chrome drawn here is that toolbar. The states around the plot and the
// label naming its measure come from the chart, the way they do on a dashboard.
const props = defineProps<{
	stack: DrillStack
	title: string
	answer?: DrillLevelData
	/** the grains this level could be asked for. Empty unless it is a date. */
	grains?: readonly { label: string; value: string }[]
	loading?: boolean
	failed?: boolean
}>()

const emit = defineEmits<{
	segmentClick: [click: ChartSegmentClick]
	// eslint-disable-next-line no-unused-vars
	popTo: [depth: number]
	// eslint-disable-next-line no-unused-vars
	regrain: [granularity: string]
	/** after the dialog has gone, so the stack it held goes with it */
	closed: []
}>()

const open = defineModel<boolean>({ default: false })

/** Whether there is a level to draw. Anything else is one of the three states. */
const ready = computed(() => !props.loading && !props.failed && Boolean(props.answer))

// A drill that will not load says so in one line. The container's own wording is
// about a chart failing to render, which is not what happened here.
const failure = computed(() =>
	!props.loading && (props.failed || !props.answer) ? __('This drill is not available') : null,
)

const action = computed(() => props.stack.current?.level.action)
const breakdown = computed(() => {
	const current = action.value
	return current && 'breakdown' in current ? current : undefined
})

// The crumbs, with the page's own name at the head of them, so a reader three
// levels down still knows which card they came from. The last crumb is where
// they are, and frappe-ui draws it as the plain one.
const crumbs = computed(() => [
	{ label: props.title, onClick: () => emit('popTo', 0) },
	...props.stack.crumbs.map((crumb) => ({
		label: crumb.label,
		onClick: () => emit('popTo', crumb.depth),
	})),
])

// A Dimension with an order of its own is read in that order, at a grain. The
// server picks one from the span it is looking at. This says which, and lets the
// reader ask for another. Nothing to choose on a ranked breakdown or on records.
const ordered = computed(() => Boolean(breakdown.value && props.answer?.ordered))
const grain = computed(
	() => props.grains?.find((option) => option.value === props.answer?.granularity),
)

const grainOptions = computed(() =>
	(props.grains || []).map((option) => ({
		label: option.label,
		selected: option.value === grain.value?.value,
		onClick: () => emit('regrain', option.value),
	})),
)

/**
 * What the reader is seeing, out of what there is. Real paging is not built —
 * the honest thing until someone hits the bound is to say where it is. Which
 * few came back is the level's own reading: a ranked breakdown is cut to the
 * biggest slices, and an ordered one to the most recent stretch — so one says
 * "top" and the other says "latest".
 */
const bound = computed(() => {
	if (!props.answer) return ''
	const shown = props.answer.rows.length
	const total = props.answer.total_row_count
	const unit = breakdown.value ? (ordered.value ? __('periods') : __('groups')) : __('rows')
	if (!total || total <= shown) return `${shown.toLocaleString()} ${unit}`
	if (ordered.value) {
		return __('latest {0} of {1} {2}', shown.toLocaleString(), total.toLocaleString(), unit)
	}
	if (breakdown.value) {
		return __('top {0} of {1} {2}', shown.toLocaleString(), total.toLocaleString(), unit)
	}
	return __('{0} of {1} {2}', shown.toLocaleString(), total.toLocaleString(), unit)
})
</script>

<template>
	<Dialog v-model:open="open" size="5xl" bare @after-leave="emit('closed')">
		<template #default="{ close }">
			<!-- `px-4 py-3` is a chart card's own padding, and the one measurement
			     the records grid's bleed is written against.

			     The height does not follow what is drawn: a box that resized as the
			     reader descended would move the plot out from under the pointer. It
			     is tall enough for a ranking at the server's bound, and still short
			     enough for a laptop. -->
			<div class="flex h-[clamp(24rem,60vh,40rem)] w-full flex-col gap-2 px-4 py-3">
				<!-- Where the reader is, what they are reading it at, and the ways
				     out. A card's header row, not a dialog's title. -->
				<div class="flex min-w-0 flex-shrink-0 items-center gap-2">
					<!-- Back one level, or out of the card when that level was the
					     first. It only opens on a level, so there is always one. -->
					<Button variant="ghost" @click="emit('popTo', stack.depth - 1)">
						<template #icon>
							<ChevronLeft class="h-4 w-4 text-ink-gray-6" stroke-width="1.5" />
						</template>
					</Button>
					<Breadcrumbs class="min-w-0" :items="crumbs" />
					<!-- the grain the level is being read at, beside the crumb that
					     names it: part of where the reader is, not an action on it -->
					<Dropdown v-if="ordered && grainOptions.length" :options="grainOptions">
						<Button
							variant="ghost"
							class="flex-shrink-0"
							:label="grain?.label || __('Grain')"
						>
							<template #suffix>
								<ChevronDown class="h-4 w-4 text-ink-gray-5" stroke-width="1.5" />
							</template>
						</Button>
					</Dropdown>
					<!-- what a surface may do with the level it is reading. Empty on a
					     reading surface, which has nothing to offer beyond the stack. -->
					<div class="ml-auto flex flex-shrink-0 items-center gap-2 pl-2">
						<slot name="actions" />
						<!-- `bare` draws no close button of its own, which is the point:
						     the way out belongs in this row with the other actions. -->
						<Button variant="ghost" :label="__('Close')" @click="close">
							<template #icon>
								<X class="h-4 w-4 text-ink-gray-6" stroke-width="1.5" />
							</template>
						</Button>
					</div>
				</div>

				<div class="min-h-0 flex-1">
					<template v-if="ready">
						<DrillBreakdown
							v-if="breakdown"
							:answer="props.answer!"
							:dimension="breakdown.breakdown"
							@segment-click="emit('segmentClick', $event)"
						/>
						<DrillRecords v-else :answer="props.answer!" />
					</template>

					<!-- Every state but the answer, from the same component a card
					     draws them with. The placeholder holds the shape of the plot
					     rather than turning a spinner in an empty box. -->
					<ChartCard v-else class="h-full" :card="false">
						<ChartContainer :loading="props.loading" :error="failure" :empty="true">
							<template #error>
								<AlertTriangle class="h-6 w-6 text-ink-gray-4" stroke-width="1" />
								<p class="text-p-base text-ink-gray-5">{{ failure }}</p>
							</template>
						</ChartContainer>
					</ChartCard>
				</div>

				<p v-if="ready" class="flex-shrink-0 text-p-sm text-ink-gray-5">{{ bound }}</p>
			</div>
		</template>
	</Dialog>
</template>
