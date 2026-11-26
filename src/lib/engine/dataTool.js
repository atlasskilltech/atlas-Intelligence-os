/**
 * Large tool results (pure helpers, no I/O).
 *
 * The model can only take a few thousand characters per tool result. Instead of
 * cutting the JSON text mid-way (which loses rows, hides fields and leaves
 * broken JSON), `compactPayload` moves big arrays out of the result into
 * "datasets" that are stored with the run, and leaves the model a valid JSON
 * stub: total rows, field names and a short preview. The model then reads the
 * full data with the built-in `query_data` tool (`queryDataset`): filter,
 * select fields, de-duplicate, group, sort, page, and exclude rows that match
 * another dataset (e.g. "all faculty" minus "faculty with a class").
 */

export const DATA_TOOL_NAME = "query_data";
export const PREVIEW_ROWS = 10;
export const MAX_DATASET_ROWS = 50_000;
export const MAX_QUERY_LIMIT = 500;
export const DEFAULT_QUERY_LIMIT = 100;
const MAX_STRING = 400;
const OPS = ["eq", "ne", "contains", "notContains", "startsWith", "in", "notIn", "gt", "gte", "lt", "lte", "empty", "notEmpty"];

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

const size = (v) => JSON.stringify(v ?? null).length;
const isPlainObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

/** Arrays inside `value` (not inside other arrays), with their path and JSON size. */
function findArrays(value, path = [], out = [], depth = 0) {
  if (Array.isArray(value)) {
    if (value.length >= 2) out.push({ path, bytes: size(value) });
    return out;
  }
  if (!isPlainObject(value) || depth > 6) return out;
  for (const [k, v] of Object.entries(value)) findArrays(v, [...path, k], out, depth + 1);
  return out;
}

const getAt = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setAt(obj, path, val) {
  if (!path.length) return val;
  getAt(obj, path.slice(0, -1))[path.at(-1)] = val;
  return obj;
}

/** Field names of rows: top-level keys plus one level of nested object keys ("teacher.email"). */
export function fieldsOf(rows) {
  const fields = new Set();
  for (const row of rows.slice(0, 300)) {
    if (!isPlainObject(row)) {
      fields.add("value");
      continue;
    }
    for (const [k, v] of Object.entries(row)) {
      if (isPlainObject(v)) for (const k2 of Object.keys(v)) fields.add(`${k}.${k2}`);
      else fields.add(k);
    }
    if (fields.size >= 80) break;
  }
  return [...fields];
}

function clipStrings(value, max = MAX_STRING) {
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}… [cut]` : value;
  if (Array.isArray(value)) return value.map((v) => clipStrings(v, max));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clipStrings(v, max)]));
  return value;
}

/**
 * Makes `payload` fit in `maxChars` of JSON.
 * `newId()` names each extracted dataset. Returns
 *   { text, datasets: [{ id, path, rows, totalRows, fields }], clipped }
 * where `text` is always valid JSON unless even the last resort (`clipped`) was needed.
 */
export function compactPayload(payload, { maxChars, newId, extract = true }) {
  const text = JSON.stringify(payload ?? null);
  if (text.length <= maxChars) return { text, datasets: [], clipped: false };

  let work = structuredClone(payload);
  const datasets = [];
  const stubs = [];

  if (extract) {
    for (const { path } of findArrays(work).sort((a, b) => b.bytes - a.bytes)) {
      if (size(work) <= maxChars) break;
      const all = getAt(work, path);
      const id = newId();
      const rows = all.slice(0, MAX_DATASET_ROWS);
      const stub = {
        dataset: id,
        totalRows: all.length,
        fields: fieldsOf(rows),
        preview: clipStrings(rows.slice(0, PREVIEW_ROWS)),
        note: `Only ${Math.min(PREVIEW_ROWS, all.length)} of ${all.length} rows are shown. The full list is stored: call ${DATA_TOOL_NAME} with dataset "${id}" to filter, select fields, group, de-duplicate or page through ALL rows.${all.length > MAX_DATASET_ROWS ? ` (Stored the first ${MAX_DATASET_ROWS}.)` : ""}`,
      };
      datasets.push({ id, path: path.join("."), rows, totalRows: all.length, fields: stub.fields });
      stubs.push(stub);
      work = setAt(work, path, stub);
    }
    // Still too big: shrink the previews.
    while (size(work) > maxChars && stubs.some((s) => s.preview.length > 0)) {
      for (const s of stubs) s.preview = s.preview.slice(0, Math.floor(s.preview.length / 2));
    }
  }

  if (size(work) > maxChars) work = clipStrings(work);
  if (size(work) > maxChars) work = clipStrings(work, 80);
  const out = JSON.stringify(work);
  if (out.length <= maxChars) return { text: out, datasets, clipped: false };
  return { text: `${out.slice(0, maxChars)}… [truncated ${out.length - maxChars} characters]`, datasets, clipped: true };
}

// ---------------------------------------------------------------------------
// Querying
// ---------------------------------------------------------------------------

export function getField(row, field) {
  if (!isPlainObject(row)) return field === "value" ? row : undefined;
  if (Object.prototype.hasOwnProperty.call(row, field)) return row[field];
  return String(field)
    .split(".")
    .reduce((o, k) => (o == null || typeof o !== "object" ? undefined : o[k]), row);
}

const norm = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v)).trim().toLowerCase();
const isEmpty = (v) => v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const numeric = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

function compare(a, b) {
  const na = numeric(a);
  const nb = numeric(b);
  if (na != null && nb != null) return na - nb;
  return norm(a).localeCompare(norm(b));
}

function matches(row, cond) {
  const v = getField(row, cond.field);
  const list = Array.isArray(cond.value) ? cond.value : [cond.value];
  switch (cond.op) {
    case "eq":
      return compare(v, cond.value) === 0 && !isEmpty(v) === !isEmpty(cond.value);
    case "ne":
      return !(compare(v, cond.value) === 0 && !isEmpty(v) === !isEmpty(cond.value));
    case "contains":
      return norm(v).includes(norm(cond.value));
    case "notContains":
      return !norm(v).includes(norm(cond.value));
    case "startsWith":
      return norm(v).startsWith(norm(cond.value));
    case "in":
      return list.some((x) => norm(x) === norm(v));
    case "notIn":
      return !list.some((x) => norm(x) === norm(v));
    case "gt":
      return !isEmpty(v) && compare(v, cond.value) > 0;
    case "gte":
      return !isEmpty(v) && compare(v, cond.value) >= 0;
    case "lt":
      return !isEmpty(v) && compare(v, cond.value) < 0;
    case "lte":
      return !isEmpty(v) && compare(v, cond.value) <= 0;
    case "empty":
      return isEmpty(v);
    case "notEmpty":
      return !isEmpty(v);
    default:
      return false;
  }
}

const filter = (rows, where = []) => rows.filter((r) => where.every((c) => matches(r, c)));

function project(row, select) {
  if (!select?.length) return row;
  return Object.fromEntries(select.map((f) => [f, getField(row, f) ?? null]));
}

/**
 * Runs one query. `load(id)` returns another dataset's rows (for excludeMatching).
 * Throws Error with a plain message for the model.
 */
export function queryDataset(rows, q, { load = () => null, fields = null } = {}) {
  const known = fields || fieldsOf(rows);
  const unknown = [
    ...(q.where || []).map((c) => c.field),
    ...(q.select || []),
    q.groupBy,
    q.sort,
    q.excludeMatching?.field,
  ].filter((f) => f && !known.includes(f) && !rows.slice(0, 300).some((r) => getField(r, f) !== undefined));
  if (unknown.length) throw new Error(`Unknown field(s): ${[...new Set(unknown)].join(", ")}. Fields in this dataset: ${known.join(", ")}.`);
  for (const c of q.where || []) if (!OPS.includes(c.op)) throw new Error(`Unknown operator "${c.op}". Use one of: ${OPS.join(", ")}.`);

  let out = filter(rows, q.where);

  if (q.excludeMatching) {
    const ex = q.excludeMatching;
    const other = load(ex.dataset);
    if (!other) throw new Error(`Unknown dataset "${ex.dataset}" in excludeMatching.`);
    const otherField = ex.otherField || ex.field;
    const taken = new Set(filter(other, ex.where).map((r) => norm(getField(r, otherField))).filter(Boolean));
    out = out.filter((r) => !taken.has(norm(getField(r, ex.field))));
  }

  if (q.sort) {
    const dir = q.order === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => dir * compare(getField(a, q.sort), getField(b, q.sort)));
  } else if (q.groupBy) {
    out = [...out].sort((a, b) => compare(getField(a, q.groupBy), getField(b, q.groupBy)));
  }

  let projected = out.map((r) => (q.groupBy && q.select?.length && !q.select.includes(q.groupBy) ? { [q.groupBy]: getField(r, q.groupBy) ?? null, ...project(r, q.select) } : project(r, q.select)));
  if (q.distinct) {
    const seen = new Set();
    projected = projected.filter((r) => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const total = projected.length;
  const result = { totalMatched: total };
  if (q.groupBy) {
    const counts = {};
    for (const r of projected) {
      const k = String(getField(r, q.groupBy) ?? "(none)");
      counts[k] = (counts[k] || 0) + 1;
    }
    result.groupCounts = counts;
  }
  if (q.countOnly) return result;

  const offset = Math.max(0, q.offset || 0);
  const limit = Math.min(MAX_QUERY_LIMIT, Math.max(1, q.limit || DEFAULT_QUERY_LIMIT));
  const page = projected.slice(offset, offset + limit).map((r) => clipStrings(r));
  result.offset = offset;
  result.returned = page.length;
  result.nextOffset = offset + page.length < total ? offset + page.length : null;

  if (q.groupBy) {
    const groups = new Map();
    for (const r of page) {
      const k = String(getField(r, q.groupBy) ?? "(none)");
      if (!groups.has(k)) groups.set(k, []);
      const { [q.groupBy]: _drop, ...rest } = isPlainObject(r) ? r : { value: r };
      groups.get(k).push(q.select?.length && !q.select.includes(q.groupBy) ? rest : r);
    }
    result.groups = [...groups].map(([key, items]) => ({ key, count: result.groupCounts[key] ?? 0, rows: items }));
  } else {
    result.rows = page;
  }
  return result;
}

/** Runs a query and shrinks the page until the JSON fits in `maxChars`. */
export function queryWithin(rows, q, opts, maxChars) {
  let limit = Math.min(MAX_QUERY_LIMIT, Math.max(1, q.limit || DEFAULT_QUERY_LIMIT));
  for (;;) {
    const res = queryDataset(rows, { ...q, limit }, opts);
    if (q.countOnly || size(res) <= maxChars) return res;
    if (limit === 1) return { ...res, rows: undefined, groups: undefined, note: "A single row is too large; use select to pick fewer fields." };
    limit = Math.max(1, Math.floor(limit / 2));
  }
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export function dataToolDefinition(datasets = []) {
  const list = datasets
    .slice(-20)
    .map((d) => `"${d.id}" — ${d.label} · ${d.totalRows} rows · fields: ${d.fields.slice(0, 40).join(", ")}`)
    .join("\n");
  return {
    name: DATA_TOOL_NAME,
    description:
      "Read the FULL rows of a large tool result that was stored as a dataset (the result showed only a preview). " +
      "Filter with `where` (all conditions must match), pick fields with `select`, remove duplicates with `distinct`, " +
      "group with `groupBy` (returns groups plus groupCounts for all matches), sort, and page with limit/offset (follow nextOffset until it is null). " +
      "`excludeMatching` drops rows whose `field` value appears in another dataset (optionally filtered), e.g. all faculty minus faculty who have a class. " +
      "`countOnly` returns just counts. Strings compare case-insensitively; times like \"09:00\" and dates like \"2026-11-26\" compare in order. " +
      "This reads stored data only: no approval, not an action.\n" +
      `Datasets in this run:\n${list || "(none yet)"}`,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["dataset"],
      properties: {
        dataset: { type: "string", maxLength: 20, description: "Dataset id, e.g. ds_1." },
        where: {
          type: "array",
          maxItems: 15,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "op"],
            properties: {
              field: { type: "string", maxLength: 80 },
              op: { type: "string", enum: OPS },
              value: { description: "Value to compare; an array for in / notIn." },
            },
          },
        },
        select: { type: "array", maxItems: 30, items: { type: "string", maxLength: 80 } },
        distinct: { type: "boolean" },
        groupBy: { type: "string", maxLength: 80 },
        sort: { type: "string", maxLength: 80 },
        order: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "integer", minimum: 1, maximum: MAX_QUERY_LIMIT },
        offset: { type: "integer", minimum: 0 },
        countOnly: { type: "boolean" },
        excludeMatching: {
          type: "object",
          additionalProperties: false,
          required: ["dataset", "field"],
          properties: {
            dataset: { type: "string", maxLength: 20, description: "The other dataset id." },
            field: { type: "string", maxLength: 80, description: "Field in THIS dataset, e.g. email." },
            otherField: { type: "string", maxLength: 80, description: "Matching field in the other dataset (defaults to `field`)." },
            where: { type: "array", maxItems: 15, items: { type: "object", required: ["field", "op"], properties: { field: { type: "string" }, op: { type: "string", enum: OPS }, value: {} } } },
          },
        },
      },
    },
  };
}
