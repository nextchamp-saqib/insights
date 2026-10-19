import { translatedTable, __ } from '../translation'

export type WhatsNewSection = {
	title: string
	/** A word in backticks is code: a field, a function or a path. */
	points: string[]
}

const sections = translatedTable(() => ({
	admins: {
		title: __('For admins'),
		points: [
			__(
				'What the upgrade could not carry over is under Needs attention, with a fix where one exists.',
			),
			__('Desk permissions now apply to every site table, for admins too.'),
			__("Colleagues' workbooks and dashboards are under Others."),
			__(
				'ERPNext ships its standard dashboards as workbooks, replacing the template library.',
			),
			__('Query execution logs are kept for 90 days.'),
		],
	},
	everyone: {
		title: __('For everyone'),
		points: [
			__('Dashboards are rebuilt on new charts, and dark mode is here.'),
			__('Click a chart to see its rows or break it down.'),
			__('A new filter picker remembers your last choice.'),
			__(
				'Some numbers change, because Insights 3 computed them wrongly: whole-day date filters, "next N months", period comparisons, pivots (they now keep the largest columns) and `date_diff` in hours or minutes.',
			),
		],
	},
	authors: {
		title: __('If you build workbooks'),
		points: [
			__('Share a workbook, not its charts. Sharing a chart or dashboard gives read access.'),
			__(
				"Charts run with each reader's permissions, unless Run as owner is on. A public dashboard needs it on every chart.",
			),
			__(
				'Scripts and SQL expressions are admin-only and run in a narrower sandbox. `sql()` is gone.',
			),
			__('An alert needs write access to its workbook.'),
		],
	},
	developers: {
		title: __('For developers'),
		points: [
			__('Guest embeds use `insights.api.view.*`.'),
			__(
				'`data_query`, `is_public` and `permission_user` are gone. Use `visibility` and `run_as_owner`.',
			),
			__('17 endpoints accept only POST.'),
			__('A share on a workbook member accepts only a named read share.'),
			__('Apps ship workbooks as `<module>/insights_workbook/<name>/<name>.json`.'),
		],
	},
}))

/** An admin reads their own section first, and the developer notes last. */
export function whatsNewFor(isAdmin: boolean): WhatsNewSection[] {
	const { admins, everyone, authors, developers } = sections()
	return isAdmin ? [admins, everyone, authors, developers] : [everyone, authors]
}
