import frappe

from insights.utils import deep_convert_dict_to_dict


def execute():
    if not frappe.db.count("Insights Workbook"):
        return

    workbooks = frappe.get_all("Insights Workbook", pluck="name")

    for workbook in workbooks:
        doc = frappe.get_doc("Insights Workbook", workbook)
        frappe.db.delete("Insights Query v3", {"workbook": doc.name})

        queries = frappe.parse_json(doc.queries)
        query_name_to_doc = {}
        for query in queries:
            new_doc = frappe.new_doc("Insights Query v3")
            new_doc.workbook = doc.name
            new_doc.update(query)
            new_doc.insert()
            query_name_to_doc[query["name"]] = new_doc

        for query in query_name_to_doc.values():
            operations = deep_convert_dict_to_dict(frappe.parse_json(query.operations))
            should_update = False
            for op in operations:
                if op.type != "source" and op.type != "join" and op.type != "union":
                    continue

                if op.table.type != "query":
                    continue

                ref_query = op.table.query_name
                if ref_query in query_name_to_doc:
                    ref_doc = query_name_to_doc[ref_query]
                    op.table.query_name = ref_doc.name
                    should_update = True
                else:
                    print(
                        f"Query {ref_query} not found in workbook {query.name} for '{op.type}' operation"
                    )

            if should_update:
                query.operations = frappe.as_json(operations)
                query.save()

                print(f"Updated operations for query {query.name}")
                print(query.as_dict())
