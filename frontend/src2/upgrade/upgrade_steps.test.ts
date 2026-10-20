import { describe, expect, it } from 'vitest'
import type { UpgradeItem } from './upgrade'
import { detailsOf, sentenceOf, wizardSteps, type Part } from './upgrade_steps'

const BOB = 'bob@fixture.test'
const ALICE = 'alice@fixture.test'
const DAVE = 'dave@fixture.test'

const people = {
	[BOB]: { full_name: 'Bob Fixture', first_name: 'Bob' },
	[ALICE]: { full_name: 'Alice Fixture', first_name: 'Alice' },
	[DAVE]: { full_name: 'Dave Fixture', first_name: 'Dave' },
}

function item(name: string, code: string, data: Record<string, any> = {}, extra = {}): UpgradeItem {
	return {
		name,
		code,
		message: `${code} message`,
		reference_doctype: null,
		reference_name: null,
		user: null,
		action: null,
		data,
		people,
		workbook: null,
		form_url: null,
		can_fix: false,
		...extra,
	}
}

const text = (parts: Part[] | undefined) => (parts ?? []).map((part) => part.text).join('')
const names = (parts: Part[] | undefined) =>
	(parts ?? []).filter((part) => part.em).map((part) => part.text)

describe('the wizard steps', () => {
	// @feature upgrade.wizard
	it('leave out a step with nothing in it, and put each group of items in one step', () => {
		const items = [
			item('a', 'P17', { user: BOB, doctypes: ['Sales Invoice'] }),
			item('b', 'P3', { workbook: 'Sales', users: [BOB] }),
			item('c', 'P7', { workbook: 'Sales', users: [], shared: [], removed: [] }),
			item('d', 'W2', { workbook: 'Sales Performance', standard: 'Selling', app: 'ERPNext' }),
		]
		expect(wizardSteps(items, { sharing: true }).map((step) => step.id)).toEqual([
			'welcome',
			'sharing',
			'access',
			'workbooks',
		])
		expect(wizardSteps([], { sharing: false }).map((step) => step.id)).toEqual(['welcome'])
		expect(detailsOf(items).map((group) => group.title)).toEqual([
			'Copies of Insights 3 templates',
		])
	})

	// @feature upgrade.wizard
	it('show an admin one row for the two items that tell both people of one change', () => {
		const data = { chart: 'Bob published, script rows', publisher: BOB, owner: ALICE }
		const reference = { reference_doctype: 'Insights Chart v3', reference_name: 'kvubr6gkub' }
		const steps = wizardSteps(
			[
				item('to-alice', 'P11', data, { ...reference, user: ALICE }),
				item('to-bob', 'P11', data, { ...reference, user: BOB }),
			],
			{ sharing: true },
		)
		const notes = steps.find((step) => step.id === 'notes')!
		expect('rows' in notes && notes.rows.map((row) => row.names)).toEqual([
			['to-alice', 'to-bob'],
		])
	})
})

describe('an item sentence', () => {
	// @feature upgrade.item-sentences
	it('names the people it is about, and says "you" only to that person', () => {
		const access = item('a', 'P17', { user: BOB, doctypes: ['Sales Invoice'] })
		const toDave = sentenceOf(access, DAVE)
		expect(text(toDave.text)).toBe('Bob can’t see charts on Sales Invoices any more.')
		expect(names(toDave.text)).toEqual(['Bob', 'Sales Invoices'])
		expect(text(toDave.todo)).toBe('Give Bob a desk role that can read them.')

		const toBob = sentenceOf(access, BOB)
		expect(text(toBob.text)).toBe('You can’t see charts on Sales Invoices any more.')
		expect(text(toBob.todo)).toBe('Give yourself a desk role that can read them.')
	})

	// @feature upgrade.item-sentences
	it('names both sides of a moved chart', () => {
		const moved = item('a', 'P11', { chart: 'Script rows', publisher: BOB, owner: ALICE })
		expect(text(sentenceOf(moved, DAVE).text)).toBe(
			'“Script rows” now belongs to Bob, who published it, instead of Alice. Its readers see the same rows as before.',
		)
		expect(names(sentenceOf(moved, ALICE).text)).toEqual(['“Script rows”', 'Bob', 'you'])
	})

	// @feature upgrade.item-sentences
	it('lists three doctypes and counts the rest', () => {
		const many = item('a', 'P17', {
			user: DAVE,
			doctypes: ['Company', 'Customer', 'Item', 'Purchase Invoice', 'Quotation'],
		})
		expect(text(sentenceOf(many, DAVE).text)).toBe(
			'You can’t see charts on Companies, Customers, Items and 2 more any more.',
		)
	})

	// @feature upgrade.item-sentences
	it('tells a doctype someone can no longer read from one desk now narrows', () => {
		const both = item('a', 'P17', {
			user: BOB,
			doctypes: ['Customer'],
			narrowed: ['Sales Invoice'],
		})
		expect(text(sentenceOf(both, DAVE).text)).toBe(
			'Bob can’t see charts on Customers any more, and sees only the rows desk gives them of Sales Invoices.',
		)
		expect(text(sentenceOf(both, BOB).text)).toBe(
			'You can’t see charts on Customers any more, and see only the rows desk gives you of Sales Invoices.',
		)

		const narrowed = item('b', 'P17', { user: BOB, doctypes: [], narrowed: ['Sales Invoice'] })
		expect(text(sentenceOf(narrowed, DAVE).text)).toBe(
			'Bob now sees only the rows desk gives them of Sales Invoices.',
		)
		expect(text(sentenceOf(narrowed, BOB).text)).toBe(
			'You now see only the rows desk gives you of Sales Invoices.',
		)
		expect(sentenceOf(narrowed, DAVE).todo).toBeUndefined()
	})

	// @feature upgrade.item-sentences
	it('joins the titles of the documents a team let someone edit', () => {
		const edited = item('a', 'P4', {
			workbook: 'Sales',
			users: [BOB],
			teams: ['Sales team'],
			items: ['Revenue', 'Margin', 'Orders'],
		})
		expect(names(sentenceOf(edited, DAVE).text)).toEqual(
			expect.arrayContaining(['“Revenue”', '“Margin”', '“Orders”']),
		)
		expect(text(sentenceOf(edited, DAVE).text)).toContain('“Revenue”, “Margin” and “Orders”')
	})

	// @feature upgrade.item-sentences
	it('reads a team rule as words when it is a plain comparison', () => {
		const team = item('a', 'P17', {
			team: 'Sales team',
			members: [ALICE, BOB],
			restrictions: [
				{
					doctype: 'Sales Invoice',
					condition: "company == 'Kaveri Traders'",
					field: 'company',
					value: 'Kaveri Traders',
				},
			],
		})
		expect(text(sentenceOf(team, DAVE).text)).toBe(
			'The Sales team limited Alice and Bob to Sales Invoices where company is Kaveri Traders. That rule no longer applies.',
		)
	})

	// @feature upgrade.item-sentences
	it('falls back to the stored message for an item written before it had data', () => {
		const old = item('a', 'P17', {})
		expect(text(sentenceOf(old, DAVE).text)).toBe('P17 message')
	})

	// @feature upgrade.item-sentences
	it('opens a desk form in a new tab, and a workbook at its share dialog', () => {
		const access = item(
			'a',
			'P17',
			{ user: BOB, doctypes: ['Customer'] },
			{ form_url: '/desk/user/bob' },
		)
		expect(sentenceOf(access, DAVE).action).toEqual({
			kind: 'form',
			label: 'Open Bob’s roles',
			url: '/desk/user/bob',
		})
		const shared = item('b', 'P3', { workbook: 'Sales', users: [BOB] }, { workbook: '25' })
		expect(sentenceOf(shared, DAVE).action).toEqual({
			kind: 'route',
			label: 'Open workbook sharing',
			route: { name: 'Workbook', params: { workbook_name: '25' }, query: { share: '1' } },
		})
	})
})
