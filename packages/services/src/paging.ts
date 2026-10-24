import type { Paged } from "@edge/contracts";
import type { Model, PipelineStage } from "@edge/db";

/** Rows exported to CSV at most; lists themselves are paged. */
export const EXPORT_CAP = 50_000;

export interface PageInput {
  page?: unknown;
  pageSize?: unknown;
}

/** Page and size from a query, clamped (`max` lets exports ask for more than a screen). */
export function pageOf(q: PageInput, { def = 50, max = 100 } = {}) {
  const page = Math.max(1, Math.floor(Number(q.page ?? 1)) || 1);
  const pageSize = Math.min(max, Math.max(1, Math.floor(Number(q.pageSize ?? def)) || def));
  return { page, pageSize };
}

/**
 * One page of an aggregation: `match` stages, then `sort` (with an _id tiebreak so equal values never repeat or
 * vanish between pages), then skip/limit and the per-row `rowStages` (lookups) on the page only. A page past the
 * end returns the last page.
 */
export async function facetPage<T>(
  model: Model<never> | Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  match: PipelineStage[],
  sort: Record<string, 1 | -1>,
  q: PageInput,
  rowStages: PipelineStage.FacetPipelineStage[] = [],
  opts?: { def?: number; max?: number },
): Promise<Paged<T>> {
  const { pageSize } = pageOf(q, opts);
  let { page } = pageOf(q, opts);
  const fullSort = { ...sort, _id: sort._id ?? (Object.values(sort)[0] === 1 ? 1 : -1) } as Record<string, 1 | -1>;
  const run = (p: number) =>
    model.aggregate<{ rows: T[]; total: { n: number }[] }>([
      ...match,
      { $sort: fullSort },
      { $facet: { rows: [{ $skip: (p - 1) * pageSize }, { $limit: pageSize }, ...rowStages], total: [{ $count: "n" }] } },
    ]);
  let [out] = await run(page);
  const total = out?.total[0]?.n ?? 0;
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (page > last) {
    page = last;
    [out] = await run(page);
  }
  return { rows: out?.rows ?? [], total, page, pageSize };
}

/** One page of a plain query (find + count), with the same _id tiebreak and last-page clamp as `facetPage`. */
export async function findPage<T>(
  model: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  filter: Record<string, unknown>,
  sort: Record<string, 1 | -1>,
  q: PageInput,
  opts?: { def?: number; max?: number },
): Promise<Paged<T>> {
  const { pageSize } = pageOf(q, opts);
  const total = await model.countDocuments(filter);
  const page = Math.min(pageOf(q, opts).page, Math.max(1, Math.ceil(total / pageSize)));
  const fullSort = { ...sort, _id: sort._id ?? (Object.values(sort)[0] === 1 ? 1 : -1) };
  const rows = (await model
    .find(filter)
    .sort(fullSort)
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()) as T[];
  return { rows, total, page, pageSize };
}
