import { BaseCollectionEntity } from "@decocms/bindings/collections";

export const OPENROUTER_PROVIDER = "openrouter" as const;
type ExtendedCollectionEntity = BaseCollectionEntity & {
  [key: string]: unknown;
};

export function applyWhereFilter(
  items: ExtendedCollectionEntity[],
  where: Record<string, unknown>,
): ExtendedCollectionEntity[] {
  const whereAny = where as {
    operator?: string;
    conditions?: Record<string, unknown>[];
    field?: string[];
    value?: unknown;
  };

  if (whereAny.operator === "and" && whereAny.conditions) {
    let filtered = items;
    for (const condition of whereAny.conditions) {
      filtered = applyWhereFilter(filtered, condition);
    }
    return filtered;
  }

  if (whereAny.operator === "or" && whereAny.conditions) {
    const results = new Set<ExtendedCollectionEntity>();
    for (const condition of whereAny.conditions) {
      applyWhereFilter(items, condition).forEach((m) => {
        results.add(m);
      });
    }
    return Array.from(results);
  }

  if (whereAny.field && whereAny.operator && whereAny.value !== undefined) {
    const field = whereAny.field[0];
    return items.filter((item: ExtendedCollectionEntity) => {
      if (field === "id" || field === "title") {
        const modelValue = field === "id" ? item.id : item.name;
        if (whereAny.operator === "eq") {
          return modelValue === whereAny.value;
        }
        if (whereAny.operator === "like" || whereAny.operator === "contains") {
          return String(modelValue)
            .toLowerCase()
            .includes(String(whereAny.value).toLowerCase());
        }
        if (whereAny.operator === "in" && Array.isArray(whereAny.value)) {
          return whereAny.value.includes(modelValue);
        }
      }
      if (field === "provider") {
        // All models are from OpenRouter
        if (whereAny.operator === "eq") {
          return OPENROUTER_PROVIDER === whereAny.value;
        }
        if (whereAny.operator === "in" && Array.isArray(whereAny.value)) {
          return whereAny.value.includes(OPENROUTER_PROVIDER);
        }
      }
      return true;
    });
  }

  return items;
}

export function applyOrderBy(
  models: ExtendedCollectionEntity[],
  orderBy: Array<{ field: string[]; direction?: string }>,
): ExtendedCollectionEntity[] {
  const sorted = [...models];
  for (const order of orderBy.reverse()) {
    const field = order.field[0];
    const direction = order.direction === "desc" ? -1 : 1;

    sorted.sort((a, b) => {
      let aVal: string;
      let bVal: string;

      if (field === "id") {
        aVal = a.id;
        bVal = b.id;
      } else if (field === "title") {
        aVal = a.name as string;
        bVal = b.name as string;
      } else {
        return 0;
      }

      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });
  }
  return sorted;
}
