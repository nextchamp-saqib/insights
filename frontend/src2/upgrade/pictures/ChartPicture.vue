<script setup lang="ts">
import { onMounted } from 'vue'
import ChartChrome from '../../charts/components/ChartChrome.vue'
import { makeChartRead } from '../../charts/chart_view'

// A chart card as a dashboard shows it, with rows that never leave the page.
// It is the real card, so its look follows the app's.
const props = defineProps<{
	title: string
	/** One reading per bar. */
	values?: number[]
	/** The doctype the reader lacks: the card shows Not Permitted. */
	notPermitted?: string
}>()

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

const read = makeChartRead({
	doc: {
		name: `upgrade-picture-${props.title}`,
		title: props.title,
		chart_type: 'Bar',
		can_write: false,
		config: {
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
		} as any,
	},
	fetchData: async () =>
		props.notPermitted
			? { not_permitted: { doctypes: [props.notPermitted] } }
			: ({
					columns: [
						{ name: 'month', type: 'String' },
						{ name: 'amount', type: 'Decimal' },
					],
					rows: (props.values ?? []).map((amount, index) => ({
						month: MONTHS[index % MONTHS.length],
						amount,
					})),
			  } as any),
	fetchDrillData: () => Promise.reject(new Error('A picture has no rows behind it')),
})

onMounted(() => read.load())
</script>

<template>
	<ChartChrome :chart="read" readonly class="text-start" />
</template>
