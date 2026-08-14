<script setup lang="ts">
import { computed } from 'vue'
import InlineFormControlLabel from '../../components/InlineFormControlLabel.vue'
import { __ } from '../../translation'
import type { NumberComparison, NumberTarget } from '../../types/chart.types'
import type { ColumnOption, Measure } from '../../types/query.types'
import MeasurePicker from './MeasurePicker.vue'

// What a reading is read against: the target it aims at, and the one number it
// is compared with. Two blocks because a card reads them in two places — the
// target on the value line, the comparison in the delta row — and a reader who
// wants a second comparison wants a second card.

defineProps<{ columnOptions: ColumnOption[] }>()
const emit = defineEmits({ 'dialog-open': () => true })
const target = defineModel<NumberTarget | undefined>('target')
const comparison = defineModel<NumberComparison | undefined>('comparison')

const targetSourceOptions = [
	{ label: __('None'), value: 'none' },
	{ label: __('Number'), value: 'constant' },
	{ label: __('Measure'), value: 'measure' },
]

const comparisonSourceOptions = [
	{ label: __('None'), value: 'none' },
	{ label: __('Previous'), value: 'previous' },
	{ label: __('Number'), value: 'constant' },
	{ label: __('Measure'), value: 'measure' },
]

const showOptions = [
	{ label: __('% change'), value: 'change' },
	{ label: __('Difference'), value: 'delta' },
]

const targetSource = computed(() => {
	if (!target.value) return 'none'
	return target.value.measure ? 'measure' : 'constant'
})

function setTargetSource(source: string) {
	// The old source's field named the old source's number, so it goes with it.
	if (source === 'none') target.value = undefined
	else if (source === 'measure') target.value = { measure: blankMeasure() }
	else target.value = {}
}

function setComparisonSource(source: string) {
	comparison.value =
		source === 'none'
			? undefined
			: {
					source: source as NumberComparison['source'],
					show: comparison.value?.show || 'change',
					...(source === 'measure' ? { measure: blankMeasure() } : {}),
					...(comparison.value?.label ? { label: comparison.value.label } : {}),
			  }
}

// The picker reads and writes the stored measure itself, so the aggregation it
// sets in place lands on the config.
const targetMeasure = computed<Measure>({
	get: () => target.value?.measure as Measure,
	set: (measure) => (target.value = { ...target.value, measure }),
})

const comparisonMeasure = computed<Measure>({
	get: () => comparison.value?.measure as Measure,
	set: (measure) => comparison.value && (comparison.value.measure = measure),
})

/**
 * A blank measure, for the author to state the fold in. The base query is at
 * base grain and the chart folds it, so a column picked without a function
 * would have to be summed by default — and a sum of a period-grain target, one
 * monthly budget repeated over the month's rows, counts it once per row.
 */
function blankMeasure(): Measure {
	return { column_name: '', data_type: 'Decimal', measure_name: '', aggregation: '' }
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<InlineFormControlLabel label="Target">
			<FormControl
				type="select"
				:options="targetSourceOptions"
				:modelValue="targetSource"
				@update:modelValue="setTargetSource($event)"
			/>
		</InlineFormControlLabel>

		<div v-if="targetSource === 'constant'" class="pl-[30%]">
			<FormControl
				type="number"
				autocomplete="off"
				:modelValue="target?.value"
				@update:modelValue="target = { value: $event === '' ? undefined : Number($event) }"
			/>
		</div>

		<div v-if="targetSource === 'measure'" class="pl-[30%]">
			<MeasurePicker
				v-model="targetMeasure"
				:column-options="columnOptions"
				@remove="target = undefined"
				@dialog-open="emit('dialog-open')"
			/>
		</div>

		<InlineFormControlLabel label="Compare with">
			<FormControl
				type="select"
				:options="comparisonSourceOptions"
				:modelValue="comparison?.source || 'none'"
				@update:modelValue="setComparisonSource($event)"
			/>
		</InlineFormControlLabel>

		<div v-if="comparison?.source === 'constant'" class="pl-[30%]">
			<FormControl
				type="number"
				autocomplete="off"
				:modelValue="comparison.value"
				@update:modelValue="comparison.value = $event === '' ? undefined : Number($event)"
			/>
		</div>

		<div v-if="comparison?.source === 'measure'" class="pl-[30%]">
			<MeasurePicker
				v-model="comparisonMeasure"
				:column-options="columnOptions"
				@remove="comparison = undefined"
				@dialog-open="emit('dialog-open')"
			/>
		</div>

		<template v-if="comparison">
			<div class="pl-[30%]">
				<FormControl
					type="select"
					:options="showOptions"
					:modelValue="comparison.show || 'change'"
					@update:modelValue="comparison.show = $event"
				/>
			</div>

			<div class="pl-[30%]">
				<FormControl
					autocomplete="off"
					placeholder="vs last month"
					:modelValue="comparison.label"
					@update:modelValue="comparison.label = $event || undefined"
				/>
			</div>
		</template>
	</div>
</template>
