import { reactive, ref, toRefs } from 'vue'
// @ts-ignore
import { useTelemetry } from '@framework/ui/telemetry/index.ts'
import useChart from '../charts/chart'
import useChartPreview from '../charts/chart_preview'
import { getUniqueId, safeJSONParse, showErrorToast, waitUntil, wheneverChanges } from '../helpers'
import { resolveHref } from '../helpers/navigation'
import useDocumentResource from '../helpers/resource'
import session from '../session'
import { FilterOperator, FilterValue } from '../types/query.types'
import {
	BreakpointKey,
	InsightsDashboardv3,
	WorkbookChart,
	WorkbookDashboardFilter,
	WorkbookDashboardItem,
} from '../types/workbook.types'
import { BASE_BREAKPOINT, GRID_COLUMNS, layoutRank } from './grid_placement'
import { defaultFilters, type ViewerDashboardItem, type ViewerFilters } from './viewer'

/**
 * A filter link, `` `query`.`column` ``, split back into its two halves.
 *
 * The only client-side reader of the format, and only the filter editor needs
 * it: it previews values for a link the document has not saved, and the server
 * will not serve those — nothing has made that column a filter yet. Every other
 * surface names the filter and lets the server find the column behind it.
 */
export function parseFilterLink(link: string) {
	const match = link?.match(/^`([^`]+)`\.`([^`]+)`$/)
	return match ? { query: match[1], column: match[2] } : null
}

const dashboards = new Map<string, Dashboard>()

export default function useDashboard(name: string) {
	const key = String(name)
	const existingDashboard = dashboards.get(key)
	if (existingDashboard) return existingDashboard

	const dashboard = makeDashboard(name)
	dashboards.set(key, dashboard)
	return dashboard
}

function makeDashboard(name: string) {
	const { capture } = useTelemetry()
	const dashboard = getDashboardResource(name)

	const editing = ref(false)
	const editingItemIndex = ref<number>()

	// Which breakpoint's layout the author is arranging. A dashboard is opened at
	// its widest, because that is the layout every item has and the one the others
	// are derived from.
	const arranging = ref<BreakpointKey>(BASE_BREAKPOINT.key)

	function isEditingItem(item: WorkbookDashboardItem) {
		return editing.value && editingItemIndex.value === dashboard.doc.items.indexOf(item)
	}

	const filterStates = ref<ViewerFilters>({})

	function addChart(charts: WorkbookChart[]) {
		const maxY = getMaxY()
		charts.forEach((chart) => {
			if (
				!dashboard.doc.items.some(
					(item) => item.type === 'chart' && item.chart === chart.name,
				)
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
		capture('dashboard_chart_added')
	}

	function getMaxY() {
		return Math.max(...dashboard.doc.items.map((item) => item.layout.y + item.layout.h), 0)
	}

	function addText() {
		const maxY = getMaxY()
		dashboard.doc.items.push({
			type: 'text',
			text: '',
			layout: {
				i: getUniqueId(),
				x: 0,
				y: maxY,
				w: 10,
				h: 2,
			},
		})
		editingItemIndex.value = dashboard.doc.items.length - 1
	}

	const filter_w = 4
	const filter_h = 1

	function addFilter() {
		const newFilter: WorkbookDashboardItem = {
			type: 'filter',
			filter_name: '',
			filter_type: 'String',
			links: {},
			layout: {
				i: getUniqueId(),
				x: 0,
				y: 0,
				w: filter_w,
				h: filter_h,
			},
		}
		dashboard.doc.items.push(newFilter)
		positionNewFilter(newFilter)
		editingItemIndex.value = dashboard.doc.items.length - 1
	}

	function positionNewFilter(newFilter: WorkbookDashboardItem) {
		const items = dashboard.doc.items
		const existingFilters = items.filter((item) => item.type === 'filter' && item !== newFilter)

		if (existingFilters.length === 0) {
			newFilter.layout.x = 0
			newFilter.layout.y = 0
			return
		}

		const topRowY = Math.min(...existingFilters.map((item) => item.layout.y))
		const topRowFilters = existingFilters.filter((item) => item.layout.y === topRowY)
		const rightmostX = Math.max(
			...topRowFilters.map((item) => item.layout.x + (item.layout.w || filter_w)),
			0,
		)

		if (rightmostX + newFilter.layout.w <= GRID_COLUMNS) {
			newFilter.layout.x = rightmostX
			newFilter.layout.y = topRowY
		} else {
			newFilter.layout.x = 0
			newFilter.layout.y = 0

			existingFilters.forEach((item) => {
				item.layout.y += filter_h
			})

			const otherItems = items.filter((item) => item.type !== 'filter')
			if (otherItems.length > 0) {
				const minOtherY = Math.min(...otherItems.map((item) => item.layout.y))
				if (minOtherY <= filter_h) {
					otherItems.forEach((item) => {
						item.layout.y = Math.max(0, item.layout.y + filter_h)
					})
				}
			}
		}
	}

	function removeItem(index: number) {
		dashboard.doc.items.splice(index, 1)
	}

	// The card sends what the grid holds, not what it worked out from it: which
	// query a filter lands on is read off the links server-side, the one place it
	// is read for a reader too. The items travel because the builder is editing
	// ones the document has not saved.
	function filterContextFor(chart_name: string) {
		return {
			chart: chart_name,
			items: dashboard.doc.items,
			filters: filterStates.value,
		}
	}

	function refreshChart(chart_name: string, force = false) {
		const preview = useChartPreview(useChart(chart_name))
		preview.filterContext = filterContextFor(chart_name)
		preview.executionPriority = getLayoutRank(chart_name)
		preview.load(force)
	}

	function getLayoutRank(chart_name: string) {
		const item = dashboard.doc.items.find(
			(item) => item.type === 'chart' && item.chart === chart_name,
		)
		return item ? layoutRank(item.layout) : undefined
	}

	function updateFilterState(
		filter_name: string,
		operator?: FilterOperator,
		value?: FilterValue,
	) {
		const filter = dashboard.doc.items.find(
			(item) => item.type === 'filter' && item.filter_name === filter_name,
		)
		if (!filter) return

		if (!operator) {
			delete filterStates.value[filter_name]
		} else {
			filterStates.value[filter_name] = {
				operator,
				value,
			}
		}

		applyFilter(filter_name)
	}

	function applyFilter(filter_name: string) {
		const item = dashboard.doc.items.find(
			(item) => item.type === 'filter' && item.filter_name === filter_name,
		)
		if (!item) return

		const filterItem = item as WorkbookDashboardFilter
		const filteredCharts = Object.keys(filterItem.links).filter(
			(chart_name) => filterItem.links[chart_name],
		)
		filteredCharts.forEach((chart_name) => refreshChart(chart_name))
	}

	// The filter names itself and the server finds the column behind it. What the
	// rest of the grid holds goes along unrouted, so the list narrows to what the
	// other filters leave — the server leaves this filter out of its own list.
	function getDistinctColumnValues(
		filter_name: string,
		search_term?: string,
		chart_name?: string,
	) {
		return dashboard.call('get_distinct_column_values', {
			filter_name,
			search_term,
			filter_context: chart_name ? filterContextFor(chart_name) : undefined,
		})
	}

	function getShareLink() {
		const href = resolveHref({
			name: 'SharedDashboard',
			params: { dashboard_name: dashboard.doc.name },
		})
		return dashboard.doc.share_link || `${window.location.origin}${href}`
	}

	function updateAccess(data: {
		is_shared_with_organization: boolean
		people_with_access: string[]
	}) {
		return dashboard
			.call('update_access', { data })
			.catch(showErrorToast)
			.then(() => dashboard.load())
	}

	// The builder seeds the document's own defaults and remembers nothing between
	// visits. An author sets a default to look at it. Remembering belongs to the
	// reader, and `filter_storage` keeps it.
	//
	// `authoring.ts` seeds the page's own `filters` from the same call, and that is
	// not enough. The cards a builder draws read this store and ignore the prop.
	waitUntil(() => dashboard.isloaded).then(() => {
		Object.assign(
			filterStates.value,
			defaultFilters(dashboard.doc.items as ViewerDashboardItem[]),
		)
	})

	return reactive({
		...toRefs(dashboard),

		editing,
		editingItemIndex,
		isEditingItem,
		arranging,

		filterStates,

		addChart,
		addText,
		addFilter,
		removeItem,

		refreshChart,

		updateFilterState,
		applyFilter,

		getDistinctColumnValues,
		updateAccess,

		getShareLink,
	})
}

export type Dashboard = ReturnType<typeof makeDashboard>

const INITIAL_DOC: InsightsDashboardv3 = {
	doctype: 'Insights Dashboard v3',
	name: '',
	owner: '',
	title: '',
	workbook: '',
	items: [],
	visibility: 'Private',
	visible_to_roles: [],
	is_shared_with_organization: false,
	people_with_access: [],
	read_only: false,
	vertical_compact: true,
	has_workbook_access: false,
}

function getDashboardResource(name: string) {
	const doctype = 'Insights Dashboard v3'
	const dashboard = useDocumentResource<InsightsDashboardv3>(doctype, name, {
		initialDoc: { ...INITIAL_DOC, name },
		enableAutoSave: true,
		disableLocalStorage: true,
		transform(doc: any) {
			doc.items = safeJSONParse(doc.items) || []
			// grid-layout-plus owns `moved` and writes it into every layout when
			// the grid mounts, which leaves a freshly opened dashboard dirty.
			// Set it on load instead.
			doc.items.forEach((item: any) => {
				if (item.layout && item.layout.moved === undefined) {
					item.layout.moved = false
				}
			})
			return doc
		},
	})
	if (session.isLoggedIn) {
		dashboard.onAfterLoad(() => dashboard.call('track_view').catch(() => {}))
	}
	wheneverChanges(
		() => dashboard.doc.read_only,
		() => {
			if (dashboard.doc.read_only) {
				dashboard.autoSave = false
			}
		},
	)
	return dashboard
}

export function newDashboard() {
	return getDashboardResource('new-dashboard-' + getUniqueId())
}
