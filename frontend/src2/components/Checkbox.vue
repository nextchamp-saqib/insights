<template>
	<Switch
		v-bind="$attrs"
		v-model="checked"
		:label="props.label"
		:size="props.size || 'md'"
		:disabled="props.disabled"
	/>
</template>

<script setup lang="ts">
import { Switch } from 'frappe-ui'
import { computed } from 'vue'

// Callers bind Frappe check fields straight to this, which hold 0 and 1.
const model = defineModel<Boolean | Number>()
const checked = computed({
	get: () => Boolean(model.value),
	set: (value: boolean) => (model.value = value),
})

const props = defineProps<{
	label?: string
	size?: 'sm' | 'md'
	disabled?: boolean
}>()
</script>
