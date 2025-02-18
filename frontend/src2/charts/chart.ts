import { useDebouncedRefHistory, UseRefHistoryReturn } from '@vueuse/core'
import { computed, reactive, ref, toRefs, unref, watch } from 'vue'
import { areDeeplyEqual, copy, getUniqueId, safeJSONParse, waitUntil, wheneverChanges } from '../helpers'
import { GranularityType } from '../helpers/constants'
import useDocumentResource from '../helpers/resource'
import { createToast } from '../helpers/toasts'
import { column, count, query_table } from '../query/helpers'
import useQuery, { Query } from '../query/query'
import {
	AXIS_CHARTS,
	AxisChartConfig,
	DonutChartConfig,
	NumberChartConfig,
	TableChartConfig,
} from '../types/chart.types'
import { AdhocFilters, Operation } from '../types/query.types'
import { InsightsChartv3 } from '../types/workbook.types'
import { getLinkedQueries } from '../workbook/workbook'
import { handleOldXAxisConfig, handleOldYAxisConfig, setDimensionNames } from './helpers'

const charts = new Map<string, Chart>()

export default function useChart(name: string) {
	const key = String(name)
	const existingChart = charts.get(key)
	if (existingChart) return existingChart

	const chart = makeChart(name)
	charts.set(key, chart)
	return chart
}

function makeChart(name: string) {
	const resource = getChartResource(name)

	const chart = reactive({
		...toRefs(resource),

		baseQuery: computed(() => {
			if (!resource.doc.query) return {} as Query
			return useQuery(resource.doc.query)
		}),
		dataQuery: useQuery('new-query-' + getUniqueId()),

		refresh,
		updateGranularity,
		resetConfig,

		getShareLink,

		getDependentQueries,
		getDependentQueryColumns,

		history: {} as UseRefHistoryReturn<any, any>,
	})

	resource.onAfterLoad(() => {
		wheneverChanges(
			() => chart.doc.query,
			() => refresh()
		)
	})

	function resetConfig() {
		chart.doc.config = {} as InsightsChartv3['config']
		chart.doc.config.order_by = []
		chart.doc.config.limit = 100
		chart.dataQuery.reset()
	}

	// when chart type changes from axis to non-axis or vice versa reset the config
	watch(
		() => chart.doc.chart_type,
		(newType: string, oldType: string) => {
			if (newType === oldType) return
			if (!newType || !oldType) return
			if (
				(AXIS_CHARTS.includes(newType) && !AXIS_CHARTS.includes(oldType)) ||
				(!AXIS_CHARTS.includes(newType) && AXIS_CHARTS.includes(oldType))
			) {
				resetConfig()
			}
		}
	)

	type ChartRefreshArgs = {
		force?: boolean
		adhocFilters?: AdhocFilters
	}
	async function refresh(args: ChartRefreshArgs = {}) {
		if (!chart.doc.query) return
		if (!chart.doc.chart_type) return
		if (chart.baseQuery.executing) {
			await waitUntil(() => !chart.baseQuery.executing)
		}

		const prepared = prepareDataQuery()
		if (prepared) {
			if (shouldExecuteQuery(args.force) || args.adhocFilters) {
				return executeQuery(args.adhocFilters)
			}
		}
	}

	function prepareDataQuery() {
		resetDataQuery()
		setChartFilters()
		let prepared = false
		if (AXIS_CHARTS.includes(chart.doc.chart_type)) {
			const _config = unref(chart.doc.config as AxisChartConfig)
			prepared = prepareAxisChartQuery(_config)
		} else if (chart.doc.chart_type === 'Number') {
			const _config = unref(chart.doc.config as NumberChartConfig)
			prepared = prepareNumberChartQuery(_config)
		} else if (chart.doc.chart_type === 'Donut' || chart.doc.chart_type === 'Funnel') {
			const _config = unref(chart.doc.config as DonutChartConfig)
			prepared = prepareDonutChartQuery(_config)
		} else if (chart.doc.chart_type === 'Table') {
			const _config = unref(chart.doc.config as TableChartConfig)
			prepared = prepareTableChartQuery(_config)
		} else {
			console.warn('Unknown chart type: ', chart.doc.chart_type)
		}
		if (prepared) {
			applySortOrder()
			applyLimit()
		}
		return prepared
	}

	function prepareAxisChartQuery(config: AxisChartConfig) {
		if (!config.x_axis.dimension || !config.x_axis.dimension.column_name) {
			console.warn('X-axis is required')
			chart.dataQuery.reset()
			return false
		}
		if (config.x_axis.dimension.column_name === config.split_by?.column_name) {
			createToast({
				message: 'X-axis and Split by cannot be the same',
				variant: 'error',
			})
			chart.dataQuery.reset()
			return false
		}

		let values = config.y_axis?.series.map((s) => s.measure).filter((m) => m.measure_name)
		values = values?.length ? values : [count()]

		if (config.split_by?.column_name) {
			chart.dataQuery.addPivotWider({
				rows: [config.x_axis.dimension],
				columns: [config.split_by],
				values: values,
			})
		} else {
			chart.dataQuery.addSummarize({
				measures: values,
				dimensions: [config.x_axis.dimension],
			})
		}

		return true
	}

	function prepareNumberChartQuery(config: NumberChartConfig) {
		const number_columns = config.number_columns?.filter((c) => c.measure_name)

		if (!number_columns?.length) {
			console.warn('Number column is required')
			chart.dataQuery.reset()
			return false
		}

		chart.dataQuery.addSummarize({
			measures: number_columns,
			dimensions: config.date_column?.column_name ? [config.date_column] : [],
		})

		return true
	}

	function prepareDonutChartQuery(config: DonutChartConfig) {
		if (!config.label_column) {
			console.warn('Label is required')
			chart.dataQuery.reset()
			return false
		}
		if (!config.value_column) {
			console.warn('Value is required')
			chart.dataQuery.reset()
			return false
		}

		const label = config.label_column
		const value = config.value_column
		if (!label?.column_name) {
			console.warn('Label column not found')
			chart.dataQuery.reset()
			return false
		}
		if (!value?.measure_name) {
			console.warn('Value column not found')
			chart.dataQuery.reset()
			return false
		}

		chart.dataQuery.addSummarize({
			measures: [value],
			dimensions: [label],
		})
		chart.dataQuery.addOrderBy({
			column: column(value.measure_name),
			direction: 'desc',
		})

		return true
	}

	function prepareTableChartQuery(config: TableChartConfig) {
		let rows = config.rows.filter((r) => r.column_name)
		let columns = config.columns.filter((c) => c.column_name)
		let values = config.values.filter((v) => v.measure_name)

		if (!rows.length) {
			console.warn('Rows are required')
			chart.dataQuery.reset()
			return false
		}

		if (!columns?.length) {
			chart.dataQuery.addSummarize({
				measures: values || [count()],
				dimensions: rows,
			})
		}
		if (columns?.length) {
			chart.dataQuery.addPivotWider({
				rows: rows,
				columns: columns,
				values: values || [count()],
			})
		}

		return true
	}

	function applySortOrder() {
		if (!chart.doc.config.order_by) return
		chart.doc.config.order_by.forEach((sort) => {
			if (!sort.column.column_name || !sort.direction) return
			chart.dataQuery.addOrderBy({
				column: column(sort.column.column_name),
				direction: sort.direction,
			})
		})
	}

	function applyLimit() {
		if (chart.doc.config.limit) {
			chart.dataQuery.addLimit(chart.doc.config.limit)
		}
	}

	function resetDataQuery() {
		chart.dataQuery.autoExecute = false
		chart.dataQuery.setOperations([])
		chart.dataQuery.setSource({
			table: query_table({
				query_name: chart.doc.query,
			}),
		})
	}

	const lastExecutedQueryOperations = ref<Operation[]>([])
	function shouldExecuteQuery(force = false) {
		if (force) return true
		return (
			JSON.stringify(lastExecutedQueryOperations.value) !==
				JSON.stringify(chart.dataQuery.doc.operations) &&
			!areDeeplyEqual(lastExecutedQueryOperations.value, chart.dataQuery.doc.operations)
		)
	}

	async function executeQuery(adhocFilters?: AdhocFilters) {
		chart.doc.operations = copy(chart.dataQuery.doc.operations)
		return chart.dataQuery.execute(adhocFilters).then(() => {
			lastExecutedQueryOperations.value = copy(chart.dataQuery.doc.operations)
		})
	}

	function updateGranularity(column_name: string, granularity: GranularityType) {
		if ('x_axis' in chart.doc.config) {
			if (chart.doc.config.x_axis?.dimension?.dimension_name === column_name) {
				chart.doc.config.x_axis.dimension.granularity = granularity
			}
		}

		if ('date_column' in chart.doc.config) {
			if (chart.doc.config.date_column?.dimension_name === column_name) {
				chart.doc.config.date_column.granularity = granularity
			}
		}

		if ('rows' in chart.doc.config) {
			chart.doc.config.rows.forEach((row) => {
				if (row.dimension_name === column_name) {
					row.granularity = granularity
				}
			})
		}
	}

	function setChartFilters() {
		if (!chart.doc.config.filters?.filters?.length) return
		chart.dataQuery.addFilterGroup(chart.doc.config.filters)
	}

	function getShareLink() {
		return `${window.location.origin}/insights/shared/chart/${chart.doc.name}`
	}

	function getDependentQueries() {
		return [chart.doc.query, ...getLinkedQueries(chart.doc.query)]
	}

	function getDependentQueryColumns() {
		return getDependentQueries().map((q) => {
			const query = useQuery(q)
			if (!query.result.executedSQL) {
				query.execute()
			}
			return {
				group: query.doc.title,
				items: query.result.columnOptions.map((c) => {
					const sep = '`'
					const value = `${sep}${query.doc.name}${sep}.${sep}${c.value}${sep}`
					return {
						...c,
						value,
					}
				}),
			}
		})
	}

	chart.history = useDebouncedRefHistory(
		// @ts-ignore
		computed({
			get: () => chart.doc,
			set: (value) => Object.assign(chart.doc, value),
		}),
		{
			deep: true,
			max: 100,
			debounce: 500,
		}
	)

	return chart
}

export type Chart = ReturnType<typeof makeChart>

function getChartResource(name: string) {
	const doctype = 'Insights Chart v3'
	const chart = useDocumentResource<InsightsChartv3>(doctype, name, {
		initialDoc: {
			doctype,
			name,
			owner: '',
			title: '',
			workbook: '',
			query: '',
			chart_type: '',
			is_public: false,
			config: {} as InsightsChartv3['config'],
			operations: [],
		},
		enableAutoSave: true,
		disableLocalStorage: true,
		transform(doc: any) {
			doc.config = safeJSONParse(doc.config) || {}
			doc.operations = safeJSONParse(doc.operations) || []

			doc.config.filters = doc.config.filters?.filters?.length
				? doc.config.filters
				: {
						filters: [],
						logical_operator: 'And',
				  }
			doc.config.order_by = doc.config.order_by || []
			doc.config.limit = doc.config.limit || 100

			if ('x_axis' in doc.config && doc.config.x_axis) {
				// @ts-ignore
				doc.config.x_axis = handleOldXAxisConfig(doc.config.x_axis)
			}
			if ('y_axis' in doc.config && Array.isArray(doc.config.y_axis)) {
				// @ts-ignore
				doc.config.y_axis = handleOldYAxisConfig(doc.config.y_axis)
			}
			if (doc.chart_type === 'Funnel') {
				// @ts-ignore
				doc.config.label_position = doc.config.label_position || 'left'
			}

			doc.config = setDimensionNames(doc.config)

			return doc
		},
	})
	return chart
}

export function newChart() {
	return getChartResource('new-chart-' + getUniqueId())
}
