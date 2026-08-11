<script setup lang="ts">
import { MoreHorizontal, RefreshCcw } from 'lucide-vue-next'
import { __ } from '../translation'
import type { DashboardMenuOption } from './viewer'

// The two controls every dashboard header carries, wherever that header is
// drawn: re-run the cards, and the page's one menu.
//
// The variant is the host's, not ours. Desk draws its own page controls subtle
// and an outline button next to them reads as an intrusion; inside Insights the
// buttons beside these are outline, so a subtle one reads as disabled. Whoever
// mounts the page knows which chrome it sits in and says so.
withDefaults(
	defineProps<{
		menuOptions: DashboardMenuOption[]
		variant?: 'subtle' | 'outline'
		// a dashboard being rearranged has nothing to re-run
		refreshable?: boolean
	}>(),
	{ variant: 'outline', refreshable: true },
)

const emit = defineEmits<{ refresh: [] }>()
</script>

<template>
	<Button v-if="refreshable" :variant="variant" :label="__('Refresh')" @click="emit('refresh')">
		<template #prefix>
			<RefreshCcw class="h-4 w-4 text-ink-gray-6" stroke-width="1.5" />
		</template>
	</Button>
	<Dropdown v-if="menuOptions.length" align="end" :options="menuOptions">
		<Button :variant="variant">
			<template #icon>
				<MoreHorizontal class="h-4 w-4 text-ink-gray-6" stroke-width="1.5" />
			</template>
		</Button>
	</Dropdown>
</template>
