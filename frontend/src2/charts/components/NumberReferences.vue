<script setup lang="ts">
import { Plus, XIcon } from 'lucide-vue-next'
import InlineFormControlLabel from '../../components/InlineFormControlLabel.vue'
import { FIELDTYPES } from '../../helpers/constants'
import { __ } from '../../translation'
import type { NumberReference } from '../../types/chart.types'
import type { ColumnOption } from '../../types/query.types'
import { computed } from 'vue'

// What a card says the reading is against: a target, an earlier period, or both.
// One editor for all of them — a reference is a reference, and the only thing
// that changes with the source is which field holds the number.

const props = defineProps<{ columnOptions: ColumnOption[] }>()
const references = defineModel<NumberReference[]>({ required: true })

const sourceOptions = [
	{ label: __('Previous period'), value: 'previous' },
	{ label: __('A fixed number'), value: 'constant' },
	{ label: __('A column'), value: 'measure' },
]

const showOptions = [
	{ label: __('% change'), value: 'change' },
	{ label: __('% of reference'), value: 'attainment' },
	{ label: __('Difference'), value: 'delta' },
]

// A target is a number, so only a numeric column can hold one.
const numberColumns = computed(() =>
	props.columnOptions
		.filter((column) => FIELDTYPES.NUMBER.includes(column.data_type))
		.map((column) => ({ label: column.label, value: column.value })),
)

/** What the reference prints when it does not say, mirrored from the adapter. */
function defaultShow(reference: NumberReference) {
	return reference.source === 'previous' ? 'change' : 'attainment'
}

function add() {
	// A previous-period comparison is what most cards want and the only source
	// that needs nothing else named, so a new reference starts as one.
	references.value = [...references.value, { source: 'previous' }]
}

function remove(index: number) {
	references.value = references.value.filter((_, at) => at !== index)
}

function setSource(index: number, source: NumberReference['source']) {
	// The old source's field named the old source's number, so it goes with it.
	references.value[index] = { source, label: references.value[index].label }
}

/**
 * A column names a measure, and a target column is one the query already holds
 * a number in, so it is summed the way every other measure of it is.
 */
function setColumn(index: number, column: string) {
	const option = props.columnOptions.find((it) => it.value === column)
	references.value[index].measure = column
		? {
				column_name: column,
				data_type: (option?.data_type as any) || 'Decimal',
				aggregation: 'sum',
				measure_name: `sum_of_${column}`,
		  }
		: undefined
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<div
			v-for="(reference, index) in references"
			:key="index"
			class="flex flex-col gap-2 rounded-4 bg-surface-gray-1 p-2"
		>
			<div class="flex items-center justify-between">
				<span class="text-xs text-ink-gray-5">{{ __('Compared to') }}</span>
				<Button variant="ghost" class="!h-5 !w-5" @click="remove(index)">
					<template #icon>
						<XIcon class="h-3.5 w-3.5 text-ink-gray-6" stroke-width="1.5" />
					</template>
				</Button>
			</div>

			<div>
				<FormControl
					type="select"
					:options="sourceOptions"
					:modelValue="reference.source"
					@update:modelValue="setSource(index, $event)"
				/>
			</div>

			<InlineFormControlLabel v-if="reference.source === 'constant'" label="Number">
				<FormControl
					type="number"
					autocomplete="off"
					:modelValue="reference.value"
					@update:modelValue="
						reference.value = $event === '' ? undefined : Number($event)
					"
				/>
			</InlineFormControlLabel>

			<InlineFormControlLabel v-if="reference.source === 'measure'" label="Column">
				<div>
					<FormControl
						type="select"
						:options="numberColumns"
						:modelValue="(reference.measure as any)?.column_name"
						@update:modelValue="setColumn(index, $event)"
					/>
				</div>
			</InlineFormControlLabel>

			<InlineFormControlLabel label="Show">
				<div>
					<FormControl
						type="select"
						:options="showOptions"
						:modelValue="reference.show || defaultShow(reference)"
						@update:modelValue="reference.show = $event"
					/>
				</div>
			</InlineFormControlLabel>

			<InlineFormControlLabel label="Label">
				<FormControl
					autocomplete="off"
					placeholder="vs last month"
					:modelValue="reference.label"
					@update:modelValue="reference.label = $event || undefined"
				/>
			</InlineFormControlLabel>
		</div>

		<Button variant="outline" :label="__('Add comparison')" @click="add">
			<template #prefix>
				<Plus class="h-4 w-4 text-ink-gray-6" stroke-width="1.5" />
			</template>
		</Button>
	</div>
</template>
