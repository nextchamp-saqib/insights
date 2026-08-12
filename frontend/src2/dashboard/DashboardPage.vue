<script setup lang="ts">
import { Breadcrumbs } from 'frappe-ui'
import { computed, watch } from 'vue'
import { __ } from '../translation'
import DashboardActions from './DashboardActions.vue'
import DashboardBody from './DashboardBody.vue'
import type { DashboardSource, ViewerFilters } from './viewer'

// A dashboard as a page of its own: a header band with the trail through it, and
// the dashboard under it. This is what a surface mounts when the dashboard is
// the whole page — the desk island, the public link and the SPA's dashboard
// page. The builder is the one surface that does not, because the workbook it
// sits in already has a navbar.
//
// It carries nothing but the feed it reads from and the navigation context of
// where it sits. Everything a dashboard actually is belongs to `DashboardBody`.
type PageCrumb = {
	label: string
	/** an SPA route. A surface without a router passes `onClick` instead. */
	route?: string
	onClick?: () => void
}

const props = defineProps<{
	source: DashboardSource
	filters?: ViewerFilters
	// ancestors of this page, never the page itself — the last crumb is ours
	breadcrumbs?: PageCrumb[]
	// which chrome this page sits in. See `DashboardActions`.
	actionVariant?: 'subtle' | 'outline'
}>()

// what this page is called, for whoever names the browser tab
const emit = defineEmits<{ title: [title: string] }>()

// A dashboard that is loading and one the reader may not see answer the same
// name, so the header never says whether the content exists.
const pageTitle = computed(() => props.source.title || __('Dashboard'))

// The trail that led here, drawn in this header because a page box is all a
// surface gives us: the shim hands down the ancestors it can vouch for.
const crumbs = computed(() => [...(props.breadcrumbs || []), { label: pageTitle.value }])

watch(pageTitle, (title) => emit('title', title), { immediate: true })
</script>

<template>
	<DashboardBody :source="source" :filters="filters">
		<!-- 48px is desk's `--page-head-height`: this header stands in for the page
		     head desk hides, so it has to be the same band an ordinary desk page
		     draws, not merely a similar one. -->
		<template #header="{ refresh, menuOptions }">
			<div
				class="flex h-12 flex-shrink-0 items-center justify-between gap-2 border-b border-outline-gray-1 px-4"
			>
				<div class="flex min-w-0 items-baseline gap-2">
					<Breadcrumbs :items="crumbs" />

					<span
						v-if="source.duplicate?.running"
						class="flex-shrink-0 text-p-sm text-ink-gray-5"
					>
						{{ __('Duplicating...') }}
					</span>
					<span
						v-else-if="source.duplicate?.failed"
						class="flex-shrink-0 text-p-sm text-ink-red-5"
					>
						{{ __('Could not duplicate this dashboard') }}
					</span>
				</div>
				<!-- Nothing to refresh and nothing to act on until the dashboard
				     is there, and a denied page offers neither. -->
				<div
					v-if="!source.loading && !source.unavailable"
					class="flex flex-shrink-0 items-center gap-1"
				>
					<DashboardActions
						:menuOptions="menuOptions"
						:variant="actionVariant"
						@refresh="refresh"
					/>
				</div>
			</div>
		</template>
	</DashboardBody>
</template>
