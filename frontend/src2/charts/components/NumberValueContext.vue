<script setup lang="ts">
import { computed } from 'vue'
import InlineFormControlLabel from '../../components/InlineFormControlLabel.vue'
import { FIELDTYPES } from '../../helpers/constants'
import { __ } from '../../translation'
import type { NumberComparison, NumberTarget } from '../../types/chart.types'
import type { ColumnOption } from '../../types/query.types'

// What a reading is read against: the target it aims at, and the one number it
// is compared with. Two blocks because a card reads them in two places — the
// target on the value line, the comparison in the delta row — and a reader who
// wants a second comparison wants a second card.

const props = defineProps<{ columnOptions: ColumnOption[] }>()
const target = defineModel<NumberTarget | undefined>('target')
const comparison = defineModel<NumberComparison | undefined>('comparison')

const targetSourceOptions = [
	{ label: __('None'), value: 'none' },
	{ label: __('A fixed number'), value: 'constant' },
	{ label: __('A column'), value: 'measure' },
]

const comparisonSourceOptions = [
	{ label: __('None'), value: 'none' },
	{ label: __('Previous period'), value: 'previous' },
	{ label: __('A fixed number'), value: 'constant' },
	{ label: __('A column'), value: 'measure' },
]

const showOptions = [
	{ label: __('% change'), value: 'change' },
	{ label: __('Difference'), value: 'delta' },
]

// A target is a number, so only a numeric column can hold one.
const numberColumns = computed(() =>
	props.columnOptions
		.filter((column) => FIELDTYPES.NUMBER.includes(column.data_type))
		.map((column) => ({ label: column.label, value: column.value })),
)

const targetSource = computed(() => {
	if (!target.value) return 'none'
	return target.value.measure ? 'measure' : 'constant'
})

function setTargetSource(source: string) {
	// The old source's field named the old source's number, so it goes with it.
	target.value = source === 'none' ? undefined : {}
}

function setComparisonSource(source: string) {
	comparison.value =
		source === 'none'
			? undefined
			: {
					source: source as NumberComparison['source'],
					show: comparison.value?.show || 'change',
					...(comparison.value?.label ? { label: comparison.value.label } : {}),
			  }
}

/**
 * A column names a measure, and a target column is one the query already holds
 * a number in, so it is summed the way every other measure of it is.
 */
function measureOf(column: string) {
	if (!column) return undefined
	const option = props.columnOptions.find((it) => it.value === column)
	return {
		column_name: column,
		data_type: (option?.data_type as any) || 'Decimal',
		aggregation: 'sum' as const,
		measure_name: `sum_of_${column}`,
	}
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
			<FormControl
				type="select"
				:options="numberColumns"
				:modelValue="(target?.measure as any)?.column_name"
				@update:modelValue="target = { measure: measureOf($event) }"
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
			<FormControl
				type="select"
				:options="numberColumns"
				:modelValue="(comparison.measure as any)?.column_name"
				@update:modelValue="comparison.measure = measureOf($event)"
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
