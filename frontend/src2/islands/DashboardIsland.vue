<script setup lang="ts">
import { computed } from 'vue'
import DashboardPage from '../dashboard/DashboardPage.vue'
import { useSavedDashboard, type ViewerFilters } from '../dashboard/viewer'
import { useHost } from './host'

// Where a dashboard sits on a desk page. Everything the page shows is
// `DashboardPage`'s; this carries what only the host knows — where the reader
// came from, how to name the tab they are on, and that desk draws its page
// controls subtle.
const props = defineProps<{ dashboard: string; filters?: ViewerFilters }>()

const source = useSavedDashboard(props.dashboard)

const host = useHost()

// `onClick` alone renders the crumb as a button, which is what routes desk in
// place. Given an `href` as well, frappe-ui's Breadcrumbs would follow the link
// too and reload the whole page.
const crumbs = computed(() =>
	(host.breadcrumbs || []).map((crumb) => ({
		label: crumb.label,
		onClick: () => host.navigate?.(crumb.route),
	})),
)

// Nothing else names this route in the browser: desk's own page head is hidden,
// and `page.set_title` was what used to do it. Through the host where there is
// one — it keeps an unread-count prefix over the title it remembers, and a
// direct write would be undone the next time that count moved.
function setTitle(title: string) {
	host.set_title ? host.set_title(title) : (document.title = title)
}
</script>

<template>
	<DashboardPage
		:source="source"
		:filters="filters"
		:breadcrumbs="crumbs"
		actionVariant="subtle"
		@title="setTitle"
	/>
</template>
