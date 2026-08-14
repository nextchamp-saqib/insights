<script setup lang="ts">
import { computed, ref } from 'vue'
import InlineFormControlLabel from '../../components/InlineFormControlLabel.vue'
import { FIELDTYPES } from '../../helpers/constants'
import { __ } from '../../translation'
import type { NumberComparison, NumberTarget } from '../../types/chart.types'
import type { ColumnOption, ExpressionMeasure, Measure } from '../../types/query.types'
import NewMeasureSelectorDialog from './NewMeasureSelectorDialog.vue'

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

const EXPRESSION_OPTION = '__expression__'
const expressionOption = { label: __('Custom expression…'), value: EXPRESSION_OPTION }

function isExpressionMeasure(measure?: Measure): measure is ExpressionMeasure {
	return !!measure && !('column_name' in measure)
}

// A measure of this config isn't only ever a column — it can be an expression
// (e.g. `sale_price.sum() * 0.55`). A select that only lists columns lies about
// that measure by showing it blank, so an expression measure gets its own
// option, named after itself, appended to the list.
function measureSelectOptions(measure?: Measure) {
	const options = [...numberColumns.value]
	if (isExpressionMeasure(measure)) {
		options.push({ label: measure.measure_name, value: measure.measure_name })
	}
	options.push(expressionOption)
	return options
}

function measureSelectValue(measure?: Measure) {
	if (!measure) return undefined
	return isExpressionMeasure(measure) ? measure.measure_name : measure.column_name
}

const targetMeasureOptions = computed(() => measureSelectOptions(target.value?.measure))
const comparisonMeasureOptions = computed(() => measureSelectOptions(comparison.value?.measure))

// Which picker the expression dialog is authoring for, so `@select` writes to
// the right slot.
const expressionDialogFor = ref<'target' | 'comparison' | null>(null)
const showExpressionDialog = computed({
	get: () => expressionDialogFor.value !== null,
	set: (value) => {
		if (!value) expressionDialogFor.value = null
	},
})
const expressionDialogMeasure = computed<ExpressionMeasure | undefined>(() => {
	const measure =
		expressionDialogFor.value === 'target'
			? target.value?.measure
			: expressionDialogFor.value === 'comparison'
			  ? comparison.value?.measure
			  : undefined
	return isExpressionMeasure(measure) ? measure : undefined
})

function selectExpression(measure: ExpressionMeasure) {
	if (expressionDialogFor.value === 'target') {
		target.value = { ...target.value, measure }
	} else if (expressionDialogFor.value === 'comparison' && comparison.value) {
		comparison.value.measure = measure
	}
	expressionDialogFor.value = null
}

function setTargetMeasure(value: string) {
	if (value === EXPRESSION_OPTION) {
		expressionDialogFor.value = 'target'
		return
	}
	target.value = { measure: measureOf(value) }
}

function setComparisonMeasure(value: string) {
	if (value === EXPRESSION_OPTION) {
		expressionDialogFor.value = 'comparison'
		return
	}
	if (comparison.value) comparison.value.measure = measureOf(value)
}

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
				:options="targetMeasureOptions"
				:modelValue="measureSelectValue(target?.measure)"
				@update:modelValue="setTargetMeasure($event)"
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
				:options="comparisonMeasureOptions"
				:modelValue="measureSelectValue(comparison.measure)"
				@update:modelValue="setComparisonMeasure($event)"
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

	<NewMeasureSelectorDialog
		v-if="showExpressionDialog"
		:model-value="showExpressionDialog"
		@update:model-value="showExpressionDialog = $event"
		:column-options="props.columnOptions"
		:measure="expressionDialogMeasure"
		@select="selectExpression"
	/>
</template>
