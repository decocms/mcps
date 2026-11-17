import { describe, expect, it } from "bun:test";
import { toAudiencePayload } from "./admin.ts";

const fromGet = {
  id: 7,
  name: "Mobile",
  section_id: 1,
  condition_days: "session",
  disjunctive_conditions: {
    disjunctive_conditions: [
      {
        id: 10,
        condition_type: "DeviceType",
        sub_type: null,
        conditions: [{ id: 20, select_method: "equals", parameter: 0 }],
      },
    ],
  },
};

describe("toAudiencePayload", () => {
  it("sends a plain tree with ids on update", () => {
    const { audience } = toAudiencePayload(fromGet) as any;
    expect(audience.id).toBe(7);
    expect(audience.disjunctive_conditions.disjunctive_conditions[0]).toEqual(
      fromGet.disjunctive_conditions.disjunctive_conditions[0],
    );
  });

  it("sends nested attributes without ids on create", () => {
    const { id: _, ...copy } = fromGet;
    const { audience } = toAudiencePayload(copy) as any;
    expect(audience.id).toBeUndefined();
    expect(audience.disjunctive_conditions).toEqual({
      disjunctive_conditions_attributes: [
        {
          condition_type: "DeviceType",
          sub_type: null,
          conditions_attributes: [{ select_method: "equals", parameter: 0 }],
        },
      ],
    });
  });
});
