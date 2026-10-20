<script setup lang="ts">
import { ChartCard, useChartTokens } from 'frappe-ui/charts'
import { computed, onMounted, ref } from 'vue'
import { adaptChart } from '../../charts/adapter'
import { makeChartRead } from '../../charts/chart_view'
import ChartChrome from '../../charts/components/ChartChrome.vue'

// A chart card as a dashboard shows it, with rows that never leave the page.
// It is the real card and the real adapter, so its look follows the app's.
const props = defineProps<{
	title: string
	/** One reading per bar. */
	values?: number[]
	/** The doctype the reader lacks: the card shows Not Permitted. */
	notPermitted?: string
}>()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

const config = {
	x_axis: {
		dimension: { dimension_name: 'month', column_name: 'month', data_type: 'String' },
	},
	y_axis: {
		series: [
			{
				measure: {
					measure_name: 'amount',
					column_name: 'amount',
					data_type: 'Decimal',
					aggregation: 'sum',
				},
			},
		],
	},
} as any

const result = {
	columns: [
		{ name: 'month', type: 'String' },
		{ name: 'amount', type: 'Decimal' },
	],
	rows: (props.values ?? []).map((amount, index) => ({
		month: MONTHS[index % MONTHS.length],
		amount,
	})),
} as any

const root = ref<HTMLElement>()
const { tokens } = useChartTokens(root)

// A picture is still: no bars growing in on every visit.
const filler = computed(() => {
	if (props.notPermitted) return
	const adapted = adaptChart({
		chart_type: 'Bar',
		config,
		result,
		title: props.title,
		tokens: tokens.value,
		readonly: true,
	})
	if (!adapted) return
	return {
		component: adapted.component,
		props: { ...adapted.props, echartOptions: { animation: false } },
	}
})

const refused = props.notPermitted
	? makeChartRead({
			doc: {
				name: `upgrade-picture-${props.title}`,
				title: props.title,
				chart_type: 'Bar',
				can_write: false,
				config,
			},
			fetchData: async () => ({ not_permitted: { doctypes: [props.notPermitted!] } }) as any,
			fetchDrillData: () => Promise.reject(new Error('A picture has no rows behind it')),
	  })
	: undefined

onMounted(() => refused?.load())
</script>

<template>
	<ChartChrome v-if="refused" :chart="refused" readonly class="text-start" />
	<div v-else ref="root" class="h-full w-full text-start">
		<ChartCard class="h-full border-outline-gray-2 [--chart-card-inset:1rem]">
			<component :is="filler.component" v-if="filler" v-bind="filler.props" />
		</ChartCard>
	</div>
</template>
