<script setup lang="ts">
import { __ } from '../translation'
import ContentEditable from '../components/ContentEditable.vue'
import { WorkbookChart } from '../types/workbook.types'
import { useDashboardAuthoring } from './authoring'
import DashboardActions from './DashboardActions.vue'
import DashboardBody from './DashboardBody.vue'
import DashboardEditActions from './DashboardEditActions.vue'

// A dashboard inside the workbook that owns it. It shows what every other
// surface shows, so all it adds is the one thing only the workbook knows: which
// charts this dashboard may draw from.
//
// It is the one surface that draws its own header instead of mounting
// `DashboardPage`. The workbook's navbar is already above it, so a second band
// with a rule under it reads as two navbars stacked, and the rule has no left
// edge to meet. What belongs here is the dashboard's own title, sitting in the
// dashboard rather than over it.
const props = defineProps<{
	dashboard_name: string
	charts: WorkbookChart[]
}>()

const source = useDashboardAuthoring(props.dashboard_name, props.charts)
</script>

<template>
	<DashboardBody :source="source">
		<template #header="{ refresh, menuOptions }">
			<!-- 24px, not the scroller's 16px: a cell carries an 8px gutter of its
			     own, so a card's edge sits that much further in. The title and the
			     actions line up with the cards, not with the box around them. -->
			<div class="flex flex-shrink-0 items-center justify-between gap-2 px-6 pt-3">
				<ContentEditable
					class="cursor-text rounded-1 text-lg-semibold !text-ink-gray-7 focus:ring-2 focus:ring-outline-gray-6 focus:ring-offset-4"
					:modelValue="source.title"
					@returned="source.authoring!.rename($event)"
					@blur="source.authoring!.rename($event)"
					:placeholder="__('Untitled Dashboard')"
				/>

				<div v-if="!source.loading" class="flex flex-shrink-0 items-center gap-1">
					<DashboardEditActions />
					<DashboardActions
						:menuOptions="menuOptions"
						:refreshable="!source.authoring!.editing"
						@refresh="refresh"
					/>
				</div>
			</div>
		</template>
	</DashboardBody>
</template>
