import type { NumberCardProps, NumberCardSparkline } from 'frappe-ui/charts'
import { getShortNumber, toNumber } from '../../helpers'
import { granularityOptions } from '../../helpers/constants'
import { __ } from '../../translation'
import type {
	NumberChartConfig,
	NumberColumnOptions,
	NumberReference,
	NumberReferenceShow,
} from '../../types/chart.types'
import type { Dimension, Measure, QueryResultRow } from '../../types/query.types'
import NumberCards from './NumberCards.vue'
import type { ChartAdapterInput, ChartFiller } from './types'

// A Number Chart carries several Measures and v2's card is one reading, so the
// filler is a grid Insights lays out with one card behind each value. Two more
// things v2 will not do for a caller land here as arithmetic: the gap against
// each reference, and the scaling a Measure formatted as a percent asks for.

/** One reference, measured against the reading. */
export type NumberCardMeasurement = {
	/**
	 * The gap. A `change` and an `attainment` are percentages, a `delta` is in the
	 * value's own units. Null when there is nothing to measure against.
	 */
	figure: number | null
	/** The unit the figure is printed in: `%`, or the value's own suffix. */
	suffix?: string
	/** Printed before the figure, for a `delta` in the value's own units. */
	prefix?: string
	/** What the figure is measured against, e.g. `vs last month`. */
	label?: string
	/**
	 * A movement is good news or bad and prints green or red. A level — how much
	 * of a target the reading reached — is neither, and prints unsigned in gray.
	 */
	movement: boolean
}

/** A reference worded for the card, since only the first one v2 prints itself. */
export type NumberCardReference = {
	/** The figure as printed: `12.4%`, `₹1.2L`. Empty when there is none. */
	text: string
	/** What it is measured against, e.g. `of target`. */
	label?: string
	tone: 'positive' | 'negative' | 'neutral'
}

/** One reading of the grid: a card, and the result column it was read off. */
export type NumberCardEntry = NumberCardProps & {
	/** Name of the result column behind the reading. Its identity in the grid. */
	column: string
	/**
	 * Every reference after the first. The first is the card's own delta row, so
	 * these are the ones Insights prints beside it.
	 */
	references?: NumberCardReference[]
}

export type NumberCardClickEvent = { column: string }

export function adaptNumberChart(input: ChartAdapterInput): ChartFiller | undefined {
	const config = input.config as NumberChartConfig
	const measures = (config.number_columns || []).filter((measure) => measure.measure_name)
	if (!measures.length) return

	const rows = input.result.rows
	// Every reading is the newest one, so the newest row is the row behind the
	// whole grid — a `previous` reference reads the one before it.
	const current = rows[rows.length - 1]
	if (!current) return

	const cards = measures.map((measure, index) => readingOf(config, rows, measure, index))

	return {
		component: NumberCards,
		props: { cards },
		// every reading is a card in its own right, so the chrome draws none
		// around the grid they sit in
		card: false,
		drillDown: {
			cardClick: (event: NumberCardClickEvent) => ({
				column: event.column,
				row: current,
			}),
		},
	}
}

function readingOf(
	config: NumberChartConfig,
	rows: QueryResultRow[],
	measure: Measure,
	index: number,
): NumberCardEntry {
	const column = measure.measure_name
	const readings = rows.map((row) => toNumber(row[column]))
	const latest = readings[readings.length - 1] ?? null

	// A Measure formatted as a percent holds the fraction, so Insights scales it
	// and states the unit. What a number means is the caller's; v2 prints it.
	const percent = measure.format === 'percent'
	const scale = (reading: number | null) =>
		reading !== null && percent ? reading * 100 : reading

	// Set per value, falling back to what the Chart set for all of them. `color`
	// is per value alone: it is the ink of one reading, and a Chart that colored
	// every reading the same has said nothing.
	const options = config.number_column_options?.[index] || {}
	const prefix = options.prefix ?? config.prefix
	const suffix = options.suffix ?? config.suffix
	const precision = options.decimal ?? config.decimal
	const compact = options.shorten_numbers ?? config.shorten_numbers
	const negativeIsBetter = options.negative_is_better ?? config.negative_is_better

	const card: NumberCardEntry = {
		column,
		title: column,
		value: scale(latest),
	}
	if (options.color) card.color = options.color
	if (prefix) card.prefix = prefix
	const unit = percent ? `%${suffix || ''}` : suffix
	if (unit) card.suffix = unit
	if (precision !== undefined) card.precision = precision
	if (compact) card.compact = true

	const measurements = referencesOf(config, options)
		.map((reference) => measured(reference, config, rows, readings, scale, unit, prefix))
		.filter((measurement): measurement is NumberCardMeasurement => measurement !== undefined)

	// v2's card holds one delta row and draws an arrow beside whatever is in it,
	// so the row takes the first movement. Reaching 75 percent of a target is a
	// level, not a rise, and an up arrow beside it would read a miss as good
	// news — so every level, and every movement after the first, prints beside
	// the row instead, where Insights draws it without an arrow.
	const leading = measurements.findIndex((measurement) => measurement.movement)
	const primary = leading === -1 ? undefined : measurements[leading]
	const rest = measurements.filter((_, index) => index !== leading)
	if (primary) {
		card.delta = primary.figure
		if (primary.suffix) card.deltaSuffix = primary.suffix
		if (primary.label) card.deltaCaption = primary.label
		if (negativeIsBetter) card.negativeIsBetter = true
	}
	if (rest.length) card.references = rest.map((it) => worded(it, negativeIsBetter))

	if (config.sparkline && config.date_column?.column_name) {
		const sparkline: NumberCardSparkline = { data: readings }
		if (config.sparkline_color) sparkline.color = config.sparkline_color
		card.sparkline = sparkline
	}

	return card
}

/**
 * What the value is measured against.
 *
 * A value that names its own references answers for itself, including when it
 * names none — an author who removed the last one meant to. Only a value that
 * has never been asked falls back to the `comparison` flag an older release
 * wrote, which said the same thing as one `previous` reference.
 */
function referencesOf(
	config: NumberChartConfig,
	options: NumberColumnOptions,
): NumberReference[] {
	if (options.references) return options.references
	return config.comparison ? [{ source: 'previous' }] : []
}

/** How a reference prints when it does not say. A target is a level; a period is a move. */
function showOf(reference: NumberReference): NumberReferenceShow {
	return reference.show ?? (reference.source === 'previous' ? 'change' : 'attainment')
}

function measured(
	reference: NumberReference,
	config: NumberChartConfig,
	rows: QueryResultRow[],
	readings: (number | null)[],
	scale: (reading: number | null) => number | null,
	unit: string | undefined,
	prefix: string | undefined,
): NumberCardMeasurement | undefined {
	const against = referenceValue(reference, rows, readings)
	if (against === undefined) return

	const show = showOf(reference)
	const current = readings[readings.length - 1] ?? null
	const label = reference.label || defaultLabel(reference, show, config.date_column)

	if (show === 'delta') {
		// A gap in the value's own units carries the value's own units, so the
		// percent Measure's scaling applies to it too.
		const figure = current === null || against === null ? null : scale(current - against)
		return { figure, suffix: unit, prefix, label, movement: true }
	}

	const figure =
		show === 'attainment' ? attainment(current, against) : percentChange(current, against)
	return { figure, suffix: '%', label, movement: show !== 'attainment' }
}

/**
 * A measurement as the card prints it. v2 does this for the delta row it owns;
 * this is the same wording for the references beside it, so the two read alike:
 * unsigned, shortened, and colored only when the figure is a movement.
 */
function worded(
	measurement: NumberCardMeasurement,
	negativeIsBetter?: boolean,
): NumberCardReference {
	const { figure, movement } = measurement
	const reference: NumberCardReference = { text: '', tone: 'neutral' }
	if (measurement.label) reference.label = measurement.label
	if (figure === null || isNaN(figure)) return reference

	// The arrow beside v2's own delta carries the sign, and these carry no arrow,
	// so a movement keeps the sign it would otherwise lose.
	const sign = movement && figure !== 0 ? (figure > 0 ? '+' : '−') : ''
	reference.text = `${sign}${measurement.prefix || ''}${getShortNumber(Math.abs(figure), 1)}${
		measurement.suffix || ''
	}`

	if (movement && figure !== 0) {
		const better = negativeIsBetter ? figure < 0 : figure > 0
		reference.tone = better ? 'positive' : 'negative'
	}
	return reference
}

/**
 * The number the reading is held against, or `undefined` when the reference
 * names nothing to hold it against and there is nothing to print.
 */
function referenceValue(
	reference: NumberReference,
	rows: QueryResultRow[],
	readings: (number | null)[],
): number | null | undefined {
	if (reference.source === 'constant') {
		return typeof reference.value === 'number' ? reference.value : undefined
	}
	if (reference.source === 'measure') {
		const column = reference.measure?.measure_name
		if (!column) return undefined
		// Read off the same row the reading came from: a target is the target for
		// the period on the card, not for the whole series.
		return toNumber(rows[rows.length - 1]?.[column])
	}
	// The reading before last. A card with one reading still says what it would
	// have compared against, it just has no figure to print in front of it.
	return readings[readings.length - 2] ?? null
}

/**
 * The change from the reference to the reading, as a share of it. Signed the way
 * the data moved: v2 flips the colors for a metric where down is better, so
 * flipping the number here too would flip it back.
 *
 * Nothing to compare with — a missing reference, or one of zero — leaves the
 * figure empty. A change from nothing has no percentage.
 */
function percentChange(current: number | null, against: number | null): number | null {
	if (current === null || against === null || against === 0) return null
	return ((current - against) / Math.abs(against)) * 100
}

/** How much of the reference the reading reached. A target of zero is no target. */
function attainment(current: number | null, against: number | null): number | null {
	if (current === null || against === null || against === 0) return null
	return (current / against) * 100
}

/** What the figure is measured against, when the author did not word it. */
function defaultLabel(
	reference: NumberReference,
	show: NumberReferenceShow,
	dimension?: Dimension,
): string | undefined {
	if (reference.source === 'previous') return previousLabel(dimension)
	return show === 'attainment' ? __('of target') : __('vs target')
}

/** The period the date column groups by, which is what `previous` steps back one of. */
function previousLabel(dimension?: Dimension): string | undefined {
	const grain = granularityOptions.find((option) => option.value === dimension?.granularity)
	return grain && __('vs previous {0}', grain.label.toLowerCase())
}
