// The ambient context desk injects into every island: what the page knows or
// can do that the island's shadow root cannot reach for itself.
//
// Desk captures it when the island mounts, which is what "where the reader came
// from" means. The island unmounts whenever the reader leaves the page, so a new
// visit brings a new trail.

import { inject } from 'vue'

// The mount contract provides under the same global symbol.
const DESK_KEY = Symbol.for('frappe:island-desk')

export type DeskCrumb = {
	label: string
	/** a desk route, in whatever form desk's own navigate() takes */
	route: string
}

export type IslandDesk = {
	/** ancestors of this page, never the page itself */
	breadcrumbs?: DeskCrumb[]
	/** route desk to one of its own pages */
	navigate?: (route: string) => void
	/** name the browser tab, for an island that is the whole page */
	set_title?: (title: string) => void
	locale?: string
	timezone?: string | null
	user?: string | null
	theme?: string
}

// An empty context is a working context: every field is optional, so an island
// still mounts where nothing is injected (a test, or a page that predates the
// field it wants).
export function useDesk(): IslandDesk {
	return inject<IslandDesk>(DESK_KEY, {})
}
