import { reactive, toRefs } from 'vue'
import useChart from '../charts/chart'
import { getUniqueId, safeJSONParse, store } from '../helpers'
import useDocumentResource from '../helpers/resource'
import { isFilterValid } from '../query/components/filter_utils'
import { column } from '../query/helpers'
import useQuery from '../query/query'
import { FilterArgs, FilterOperator, FilterRule, FilterValue } from '../types/query.types'
import {
	InsightsDashboardv3,
	WorkbookChart,
	WorkbookDashboardFilter,
	WorkbookDashboardItem
} from '../types/workbook.types'

const dashboards = new Map<string, Dashboard>()

export default function useDashboard(name: string) {
	const key = String(name)
	const existingDashboard = dashboards.get(key)
	if (existingDashboard) return existingDashboard

	const dashboard = makeDashboard(name)
	dashboards.set(key, dashboard)
	return dashboard
}

type FilterState = {
	operator: FilterOperator
	value: FilterValue
}

function makeDashboard(name: string) {
	const resource = getDashboardResource(name)

	const dashboard = reactive({
		...toRefs(resource),

		editing: false,
		editingItemIndex: null as number | null,
		filters: {} as Record<string, FilterArgs[]>,
		filterStates: {} as Record<string, FilterState>,

		isEditingItem(item: WorkbookDashboardItem) {
			return dashboard.editing && dashboard.editingItemIndex === dashboard.doc.items.indexOf(item)
		},

		addChart(charts: WorkbookChart[]) {
			const maxY = dashboard.getMaxY()
			charts.forEach((chart) => {
				if (
					!dashboard.doc.items.some((item) => item.type === 'chart' && item.chart === chart.name)
				) {
					dashboard.doc.items.push({
						type: 'chart',
						chart: chart.name,
						layout: {
							i: getUniqueId(),
							x: 0,
							y: maxY,
							w: chart.chart_type === 'Number' ? 20 : 10,
							h: chart.chart_type === 'Number' ? 3 : 8,
						},
					})
				}
			})
		},

		addText() {
			const maxY = dashboard.getMaxY()
			dashboard.doc.items.push({
				type: 'text',
				text: 'Enter text here',
				layout: {
					i: getUniqueId(),
					x: 0,
					y: maxY,
					w: 10,
					h: 1,
				},
			})
			dashboard.editingItemIndex = dashboard.doc.items.length - 1
		},

		addFilter() {
			const maxY = dashboard.getMaxY()
			dashboard.doc.items.push({
				type: 'filter',
				filter_name: 'Filter',
				filter_type: 'String',
				links: {},
				layout: {
					i: getUniqueId(),
					x: 0,
					y: maxY,
					w: 4,
					h: 1,
				},
			})
			dashboard.editingItemIndex = dashboard.doc.items.length - 1
		},

		removeItem(index: number) {
			dashboard.doc.items.splice(index, 1)
		},

		refresh() {
			dashboard.doc.items
				.filter((item) => item.type === 'chart')
				.forEach((item) => dashboard.refreshChart(item.chart))
		},

		refreshChart(chart_name: string) {
			const chart = useChart(chart_name)
			if (!chart.doc.query) return

			const filtersApplied = dashboard.doc.items.filter(
				(item) => item.type === 'filter' && 'links' in item && item.links[chart_name]
			)

			if (!filtersApplied.length) {
				chart.refresh(undefined, true)
				return
			}

			const filtersByQuery = new Map<string, FilterRule[]>()

			filtersApplied.forEach((item) => {
				const filterItem = item as WorkbookDashboardFilter
				const linkedColumn = dashboard.getColumnFromFilterLink(filterItem.links[chart_name])
				if (!linkedColumn) return

				const query = useQuery(linkedColumn.query)
				if (!query) return

				const filterState = dashboard.filterStates[filterItem.filter_name] || {}

				const filter = {
					column: column(linkedColumn.column),
					operator: filterState.operator,
					value: filterState.value,
				}

				if (isFilterValid(filter, filterItem.filter_type)) {
					const filters = filtersByQuery.get(linkedColumn.query) || []
					filters.push(filter)
					filtersByQuery.set(linkedColumn.query, filters)
				}
			})

			filtersByQuery.forEach((filters, query_name) => {
				const query = useQuery(query_name)!
				query.dashboardFilters = {
					logical_operator: 'And',
					filters,
				}
			})

			chart.refresh(undefined, true)
		},

		updateFilterState(filter_name: string, operator?: FilterOperator, value?: FilterValue) {
			const filter = dashboard.doc.items.find(
				(item) => item.type === 'filter' && item.filter_name === filter_name
			)
			if (!filter) return

			if (!operator) {
				delete dashboard.filterStates[filter_name]
			} else {
				dashboard.filterStates[filter_name] = {
					operator,
					value,
				}
			}

			dashboard.applyFilter(filter_name)
		},

		applyFilter(filter_name: string) {
			const item = dashboard.doc.items.find(
				(item) => item.type === 'filter' && item.filter_name === filter_name
			)
			if (!item) return

			const filterItem = item as WorkbookDashboardFilter
			const filteredCharts = Object.keys(filterItem.links)
			filteredCharts.forEach((chart_name) => dashboard.refreshChart(chart_name))
		},

		getColumnFromFilterLink(linkedColumn: string) {
			const sep = '`'
			// `query`.`column`
			const pattern = new RegExp(`^${sep}([^${sep}]+)${sep}\\.${sep}([^${sep}]+)${sep}$`)
			const match = linkedColumn.match(pattern)
			if (!match) return

			return {
				query: match[1],
				column: match[2],
			}
		},

		getShareLink() {
			return (
				dashboard.doc.share_link ||
				`${window.location.origin}/insights/shared/dashboard/${dashboard.doc.name}`
			)
		},

		getMaxY() {
			return Math.max(...dashboard.doc.items.map((item) => item.layout.y + item.layout.h), 0)
		},
	})

	const defaultFilters = dashboard.doc.items.reduce((acc, item) => {
		if (item.type != 'filter') return acc

		const filterItem = item as WorkbookDashboardFilter
		if (filterItem.default_operator && filterItem.default_value) {
			acc[filterItem.filter_name] = {
				operator: filterItem.default_operator,
				value: filterItem.default_value,
			}
		}
		return acc
	}, {} as typeof dashboard.filterStates)

	Object.assign(dashboard.filterStates, defaultFilters)

	const key = `insights:dashboard-filter-states-${name}`
	dashboard.filterStates = store(key, () => dashboard.filterStates)

	return dashboard
}

export type Dashboard = ReturnType<typeof makeDashboard>

function getDashboardResource(name: string) {
	const doctype = 'Insights Dashboard v3'
	const dashboard = useDocumentResource<InsightsDashboardv3>(doctype, name, {
		initialDoc: {
			doctype,
			name,
			owner: '',
			title: '',
			workbook: '',
			items: [],
		},
		enableAutoSave: true,
		disableLocalStorage: true,
		transform(doc: any) {
			doc.items = safeJSONParse(doc.items) || []
			return doc
		},
	})
	return dashboard
}

export function newDashboard() {
	return getDashboardResource('new-dashboard-' + Date.now())
}
