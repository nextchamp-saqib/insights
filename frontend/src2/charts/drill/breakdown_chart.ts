// A breakdown level as a Chart.
//
// The drill uses the Row chart rather than a bar list of its own. Any change to
// bar density belongs in the Row chart.
//
// Which of the two charts draws the level is the answer's own reading of the
// Dimension. An ordered Dimension came back in that order and reads as a line.
// Anything else came back ranked by the Measure and reads as a Row chart. The
// server sets the flag, because the order the rows arrived in and the shape
// drawn from them have to agree.

import type { ChartConfig } from '../../types/chart.types'
import type { DrillChart, DrillLevelData } from './drill_stack'

/** What a breakdown level draws itself from: the answer, less its rows. */
export type BreakdownAnswer = Pick<DrillLevelData, 'columns' | 'ordered' | 'granularity'>

/** The Chart a breakdown level draws itself as. */
export function breakdownChart(
	dimension: string,
	measure: string,
	answer: BreakdownAnswer,
): DrillChart {
	const type = answer.columns.find((column) => column.name === dimension)?.type || 'String'
	const ordered = Boolean(answer.ordered)

	return {
		chart_type: ordered ? 'Line' : 'Row',
		config: {
			x_axis: {
				dimension: {
					dimension_name: dimension,
					column_name: dimension,
					data_type: type as any,
					// what the buckets on the axis stand for. It prints them, and it is
					// also what a click inside the level reads its own crumb at.
					granularity: answer.granularity || undefined,
				},
			},
			y_axis: {
				series: [
					{
						measure: {
							measure_name: measure,
							column_name: measure,
							data_type: 'Decimal',
							aggregation: 'sum',
						},
					},
				],
				// the ranking is the whole point of a ranked level, so every bar is
				// read. A stretch of time is read as a shape, and a label on every
				// point of it buries the shape.
				show_data_labels: !ordered,
			},
			order_by: [],
			limit: 100,
		} as unknown as ChartConfig,
	}
}
