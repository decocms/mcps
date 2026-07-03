import { describe, expect, test } from "bun:test";
import { buildSearchCriteriaParams } from "./search-criteria.ts";

describe("buildSearchCriteriaParams", () => {
  test("always emits at least searchCriteria[pageSize]", () => {
    const params = buildSearchCriteriaParams();
    expect(params.get("searchCriteria[pageSize]")).toBe("20");
  });

  test("each filter becomes its own AND filter group", () => {
    const params = buildSearchCriteriaParams({
      filters: [
        {
          field: "created_at",
          value: "2026-07-03 03:00:00",
          conditionType: "gteq",
        },
        { field: "status", value: "canceled" },
      ],
    });
    expect(
      params.get("searchCriteria[filter_groups][0][filters][0][field]"),
    ).toBe("created_at");
    expect(
      params.get("searchCriteria[filter_groups][0][filters][0][value]"),
    ).toBe("2026-07-03 03:00:00");
    expect(
      params.get(
        "searchCriteria[filter_groups][0][filters][0][condition_type]",
      ),
    ).toBe("gteq");
    expect(
      params.get("searchCriteria[filter_groups][1][filters][0][field]"),
    ).toBe("status");
    expect(
      params.get(
        "searchCriteria[filter_groups][1][filters][0][condition_type]",
      ),
    ).toBe("eq");
  });

  test("sort orders, pagination and fields", () => {
    const params = buildSearchCriteriaParams({
      sortOrders: [{ field: "created_at", direction: "ASC" }],
      pageSize: 500,
      currentPage: 3,
      fields: "total_count,items[status]",
    });
    expect(params.get("searchCriteria[sortOrders][0][field]")).toBe(
      "created_at",
    );
    expect(params.get("searchCriteria[sortOrders][0][direction]")).toBe("ASC");
    expect(params.get("searchCriteria[pageSize]")).toBe("500");
    expect(params.get("searchCriteria[currentPage]")).toBe("3");
    expect(params.get("fields")).toBe("total_count,items[status]");
  });
});
