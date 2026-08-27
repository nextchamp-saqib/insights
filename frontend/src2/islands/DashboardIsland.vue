<script setup lang="ts">
import { useDesk } from '@framework/ui/island'
import { computed } from 'vue'
import DashboardPage from '../dashboard/DashboardPage.vue'
import { useSavedDashboard, type ViewerFilters } from '../dashboard/viewer'

// Where a dashboard sits on a desk page. `DashboardPage` shows everything. This
// carries what only desk knows: where the reader came from, how to name the tab
// they are on, and that desk draws its page controls subtle.
const props = defineProps<{ dashboard: string; filters?: ViewerFilters }>()

const source = useSavedDashboard(() => props.dashboard)

const desk = useDesk()

// `onClick` alone renders the crumb as a button, which routes desk in place.
// Given an `href` as well, frappe-ui's Breadcrumbs would follow the link too and
// reload the whole page.
const crumbs = computed(() =>
	(desk.breadcrumbs || []).map((crumb) => ({
		label: crumb.label,
		onClick: () => desk.navigate?.(crumb.route),
	})),
)

// Nothing else names this route in the browser. Desk hides its own page head,
// and `page.set_title` used to do it. Go through desk where it offers the call:
// desk keeps an unread-count prefix over the title it remembers, and a direct
// write would be undone the next time that count moved.
function setTitle(title: string) {
	desk.set_title ? desk.set_title(title) : (document.title = title)
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
