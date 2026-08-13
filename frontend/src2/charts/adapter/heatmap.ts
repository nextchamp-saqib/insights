import { HeatmapChart } from 'frappe-ui/charts'
import type { HeatmapCellEvent, HeatmapChartProps } from 'frappe-ui/charts'
import type { HeatmapChartConfig } from '../../types/chart.types'
import type { ChartAdapterInput, ChartFiller } from './types'

// The server groups a heatmap by both of its dimensions, so the result is
// already one row per cell. A pair with no rows returns no row, and the grid
// leaves that cell empty rather than coloring it zero.

export function adaptHeatmapChart(input: ChartAdapterInput): ChartFiller | undefined {
	const config = input.config as HeatmapChartConfig
	const x = config.x_column?.dimension_name || config.x_column?.column_name
	const y = config.y_column?.dimension_name || config.y_column?.column_name
	const value = config.value_column?.measure_name
	if (!x || !y || !value) return

	const props: HeatmapChartProps = {
		title: input.title,
		data: input.result.rows,
		x,
		y,
		value,
	}
	if (config.show_values) props.showValues = true
	if (config.palette) props.palette = config.palette
	if (typeof config.min === 'number') props.min = config.min
	if (typeof config.max === 'number') props.max = config.max

	return {
		component: HeatmapChart,
		props,
		drillDown: {
			select: (event: HeatmapCellEvent) => ({ column: value, row: event.row }),
		},
	}
}
