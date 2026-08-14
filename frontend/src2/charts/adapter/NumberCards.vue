<script setup lang="ts">
import { NumberCard } from 'frappe-ui/charts'
import { computed } from 'vue'
import type { NumberCardClickEvent, NumberCardEntry } from './number'

// The grid a Number Chart's readings sit in. Nothing here decorates — it lays
// the readings out and reports a click.
//
// Every reading is a card of frappe-ui's, drawn with its own surface, which is
// why the filler tells the chrome to draw none: a grid of cards inside a card
// would border each reading twice. The cards fill the cell they are given
// rather than the height they need, so a row of them lines up and the author
// sets that height by resizing the item.
//
// The gap is the one a dashboard puts between two items — 16px, the `p-2` each
// grid cell carries on both sides. Two readings side by side and two charts side
// by side stand the same distance apart.
const props = defineProps<{ cards: NumberCardEntry[] }>()

const emit = defineEmits<{
	// eslint-disable-next-line no-unused-vars
	cardClick: [event: NumberCardClickEvent]
}>()

// `column` is the reading's identity and `references` is Insights' to draw, so
// neither is a card prop and neither is handed to the card.
const readings = computed(() =>
	props.cards.map(({ column, references, ...card }) => ({ column, references, card })),
)

// The `-7` inks are the ones v2 prints its own delta in, so a reference beside
// it reads as the same kind of figure.
const TONE_CLASSES = {
	positive: 'text-ink-green-7',
	negative: 'text-ink-red-7',
	neutral: 'text-ink-gray-6',
}
</script>

<template>
	<div class="h-full w-full @container">
		<div
			class="grid h-full w-full grid-cols-1 gap-4 @xs:grid-cols-2 @xl:grid-cols-3 @3xl:grid-cols-4 @4xl:grid-cols-5"
		>
			<div
				v-for="reading in readings"
				:key="reading.column"
				class="min-w-0 cursor-pointer"
				@dblclick="emit('cardClick', { column: reading.column })"
			>
				<NumberCard v-bind="reading.card" class="h-full">
					<!-- v2's delta row holds one figure, and a KPI carries up to
					     three: what it moved by, and what it is against. The rest
					     print in the caption, which is this row's to fill. -->
					<template v-if="reading.references?.length" #caption="{ caption }">
						<span v-if="caption" class="truncate text-ink-gray-5">{{ caption }}</span>
						<template v-for="(reference, index) in reading.references" :key="index">
							<span class="shrink-0 text-ink-gray-4" aria-hidden="true">·</span>
							<span
								v-if="reference.text"
								class="shrink-0 text-sm-medium tabular-nums"
								:class="TONE_CLASSES[reference.tone]"
							>
								{{ reference.text }}
							</span>
							<span v-if="reference.label" class="truncate text-ink-gray-5">
								{{ reference.label }}
							</span>
						</template>
					</template>
				</NumberCard>
			</div>
		</div>
	</div>
</template>
