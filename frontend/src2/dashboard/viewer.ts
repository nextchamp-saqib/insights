// A dashboard as a viewer reads it: `insights.api.viewer`, plus the one write a
// reader can make (duplicate, below).
//
// Every read surface asks the server by name and lets it decide what runs — the
// desk island, the public page and the SPA's dashboard page alike. The query
// behind a chart never comes back.
//
// This is also where the shape a dashboard page draws itself from lives, because
// reading is the shape and writing is an addition to it. The other feed that
// fills it is `authoring.ts`, which reads the document the builder is editing
// instead. Above the fetch the page is the same either way.

import { call } from 'frappe-ui'
import { markRaw, reactive, toValue, watch, type Component, type MaybeRefOrGetter } from 'vue'
import type { FilterType } from '../helpers/constants'
import { navigate } from '../helpers/navigation'
import { isFilterApplied } from '../query/components/filter_utils'
import type { FilterOperator, FilterValue } from '../types/query.types'
import type {
	BreakpointKey,
	Layout,
	WorkbookDashboardItemLayout,
} from '../types/workbook.types'
import { readFilters, writeFilters } from './filter_storage'
import StaticGridLayout from './StaticGridLayout.vue'
import ViewerItem from './ViewerItem.vue'

export type ViewerDashboardItem = WorkbookDashboardItemLayout & {
	type: 'chart' | 'text' | 'filter'
	chart?: string
	text?: string
	filter_name?: string
	filter_type?: FilterType
	// the icon its author picked for it, by lucide name
	icon?: string
	default_operator?: FilterOperator
	default_value?: FilterValue
	// the cards this filter changes. Which column it lands on stays server-side;
	// the names are what the page needs to refetch the right cards and what lets
	// an empty card say a filter caused it
	charts?: string[]
}

export type ViewerDashboard = {
	name: string
	slug: string
	title: string
	items: ViewerDashboardItem[]
	vertical_compact_layout: boolean
	modified: string
	// what this reader may do with it. The surface offers an action only where the
	// server granted it, so nothing dangles an affordance the server would refuse
	can_edit: boolean
	can_duplicate: boolean
	// where editing happens — the builder is workbook-scoped. Null for anyone who
	// cannot edit
	workbook: string | null
}

// dashboard filter state, keyed by filter name. Which query a filter lands on is
// the server's business — the links that say so never reach a viewer.
export type ViewerFilters = Record<string, { operator: FilterOperator; value: FilterValue }>

export type ViewerFilterState = ViewerFilters[string]

/**
 * The state one filter's own defaults describe, or nothing where they describe
 * none. `isFilterApplied` is what decides — an author who defaulted a filter to
 * `is set` set a default, and there is no value to go with it.
 */
export function defaultFilterState(item: ViewerDashboardItem): ViewerFilterState | undefined {
	const operator = item.default_operator
	const value = item.default_value
	if (!isFilterApplied(item.filter_type!, operator, value)) return
	return { operator: operator!, value: value! }
}

/** The state a dashboard's own filter defaults describe. */
export function defaultFilters(items: ViewerDashboardItem[]): ViewerFilters {
	const defaults: ViewerFilters = {}
	items.forEach((item) => {
		if (item.type !== 'filter') return
		const state = defaultFilterState(item)
		if (state) defaults[item.filter_name!] = state
	})
	return defaults
}

/**
 * One grid cell, as the page hands it over.
 *
 * Every feed answers with a component of this shape. The page passes the same
 * props to either and lets it use what it can.
 */
export type DashboardCellProps = {
	item: ViewerDashboardItem
	index: number
	// the page this cell sits on. It carries the chart's audience, and it is what
	// lets the server route filter state to the query behind the card
	dashboard: string
	filters?: ViewerFilters
	priority?: number
	refreshToken?: number
}

export type DashboardMenuOption = {
	label: string
	icon: any
	onClick: () => void
}

/**
 * Writing, for whoever holds it. Absent on every read surface.
 *
 * The edit chrome is not here. The builder draws its own header and reaches
 * `DashboardEditActions` by import.
 */
export type DashboardAuthoring = {
	// true while the reader is moving things about
	editing: boolean
	// what this capability adds to the page's one menu
	menuOptions: DashboardMenuOption[]
	rename: (title: string) => void
	/** The breakpoint being arranged. What the grid is drawn and dragged at. */
	arranging: BreakpointKey
	moveItems: (key: BreakpointKey, layouts: Layout[]) => void
	// a chart dragged in from the workbook's sidebar
	dragOver: (event: DragEvent) => void
	drop: (event: DragEvent) => void
}

/**
 * Everything a dashboard page draws itself from.
 *
 * Each capability is present only where the server granted it. A surface draws
 * what the feed carries and never asks which surface it is.
 */
export type DashboardSource = {
	loading: boolean
	// a dashboard that is missing and one this reader may not have answer the same
	unavailable: boolean
	name: string
	title: string
	// every cell, in the order the grid lays them out — a filter is one of them,
	// in the position its author gave it
	items: ViewerDashboardItem[]
	// where the filters start on this surface
	filters: ViewerFilters
	// remembering where a reader left them. Absent where the document's own
	// defaults are the answer
	saveFilters?: (filters: ViewerFilters) => void
	verticalCompact: boolean
	cell: Component
	// the grid the cells are laid out in. A reader gets one that only draws, so
	// the drag-and-resize engine never reaches a surface that cannot use it
	grid: Component
	// reaching the builder from here. Absent for a reader who cannot edit — and
	// for the builder, which is already there
	openBuilder?: () => void
	// shipped content is read-only, so a copy is the only way to change it
	duplicate?: {
		run: () => void
		running: boolean
		failed: boolean
	}
	authoring?: DashboardAuthoring
}

/** The same feed, from the one surface that always holds the writing half. */
export type AuthoredDashboardSource = DashboardSource & { authoring: DashboardAuthoring }

/**
 * The read feed: a saved dashboard, named to the server.
 *
 * The name is read reactively, because a surface can outlive the dashboard it
 * was mounted for. The desk island keeps one Vue app across a route change and
 * hands down the next reference as a prop, and the SPA's dashboard route reuses
 * its component when only the parameter moves. Both would otherwise sit on the
 * first dashboard they fetched.
 */
export function useSavedDashboard(dashboard: MaybeRefOrGetter<string>): DashboardSource {
	const source = reactive<DashboardSource>({
		loading: true,
		unavailable: false,
		name: '',
		title: '',
		items: [],
		filters: {},
		verticalCompact: true,
		cell: markRaw(ViewerItem),
		grid: markRaw(StaticGridLayout),
	})

	// What the page is waiting for. A reply for anything else is a reply to a
	// dashboard the reader has already left, and writing it would draw the wrong
	// one — two fetches can land out of order.
	let awaited: string

	function load(name: string) {
		awaited = name
		source.loading = true
		source.unavailable = false
		source.name = ''
		source.title = ''
		source.items = []
		source.filters = {}
		// Every capability closes over the dashboard it was built for, so the next
		// one starts without them rather than with the last one's.
		source.saveFilters = undefined
		source.openBuilder = undefined
		source.duplicate = undefined

		// A dashboard that is missing and one the viewer may not read answer the
		// same, so there is one page state for both.
		fetchDashboard(name)
			.then((doc) => {
				if (awaited !== name) return
				source.name = doc.name
				source.title = doc.title
				source.items = doc.items
				source.verticalCompact = doc.vertical_compact_layout
				// a reader comes back to the filters they left, over the defaults the
				// author set. Nothing on the server holds per-user view state
				source.filters = { ...defaultFilters(doc.items), ...readFilters(doc.name) }
				source.saveFilters = (filters) => writeFilters(doc.name, filters)
				if (doc.can_edit && doc.workbook) {
					const workbook = doc.workbook
					source.openBuilder = () =>
						navigate(`/workbook/${workbook}/dashboard/${doc.name}`)
				}
				if (doc.can_duplicate) {
					source.duplicate = duplicateCapability(doc.name)
				}
			})
			.catch(() => {
				if (awaited !== name) return
				source.unavailable = true
			})
			.finally(() => {
				if (awaited !== name) return
				source.loading = false
			})
	}

	watch(() => toValue(dashboard), load, { immediate: true })

	return source
}

/**
 * The copy is the caller's own document in a workbook of their own, so it lands
 * in the builder rather than here. Copying a closure is a handful of inserts,
 * but it is a round trip either way: the page says so while it runs, and says so
 * if it failed — the menu is closed by then and there is nowhere else for the
 * answer to go.
 */
function duplicateCapability(dashboard: string) {
	const capability = reactive({
		running: false,
		failed: false,
		run: async () => {
			if (capability.running) return
			capability.running = true
			capability.failed = false
			try {
				const copy = await duplicateDashboard(dashboard)
				navigate(`/workbook/${copy.workbook}/dashboard/${copy.dashboard}`)
			} catch (error) {
				capability.failed = true
			} finally {
				capability.running = false
			}
		},
	})
	return capability
}

export function fetchDashboard(dashboard: string): Promise<ViewerDashboard> {
	return call('insights.api.viewer.get_dashboard', { dashboard })
}

/**
 * The values a filter offers. The column behind it is the server's to know.
 *
 * `filters` is the other filters' current state — the same shape a card's own
 * `filters` prop holds. The server routes it and leaves this filter out of its
 * own list, so the offer narrows to what the rest of the grid currently holds.
 */
export function fetchFilterValues(
	dashboard: string,
	filter_name: string,
	search_term?: string,
	filters?: ViewerFilters,
): Promise<string[]> {
	return call('insights.api.viewer.get_filter_values', {
		dashboard,
		filter_name,
		search_term,
		filters,
	})
}

/** Where a duplicate landed: the workbook it made, and the dashboard inside it. */
export type DuplicatedDashboard = { workbook: string; dashboard: string }

/**
 * Copy a dashboard's closure into a workbook of the caller's own.
 *
 * Shipped content is read-only on a site, so this is the only way to change it.
 * The server decides who may: an authoring seat, and read on the dashboard.
 */
export function duplicateDashboard(dashboard: string): Promise<DuplicatedDashboard> {
	return call('insights.api.standard_content.duplicate_dashboard', { dashboard })
}
