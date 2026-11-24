/**
 * Small JSON-schema subset validator for tool arguments (pure).
 * Supports: type (object/array/string/integer/number/boolean), properties,
 * required, items, enum, maxLength, maxItems, minimum, maximum, additionalProperties:false.
 * Returns a list of human-readable problems (empty = valid).
 */
const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v);

export function validateArgs(schema, value, at = "arguments") {
  const errors = [];
  check(schema, value, at, errors);
  return errors.slice(0, 10);
}

function check(schema, value, at, errors) {
  if (!schema) return;
  const t = typeOf(value);
  const want = schema.type;
  if (want) {
    const ok = want === t || (want === "number" && t === "integer");
    if (!ok) {
      errors.push(`${at} must be ${want === "integer" ? "a whole number" : `of type ${want}`}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at} must be one of: ${schema.enum.join(", ")}`);
  if (t === "string" && schema.maxLength && value.length > schema.maxLength) errors.push(`${at} is longer than ${schema.maxLength} characters`);
  if ((t === "number" || t === "integer") && schema.minimum != null && value < schema.minimum) errors.push(`${at} must be ≥ ${schema.minimum}`);
  if ((t === "number" || t === "integer") && schema.maximum != null && value > schema.maximum) errors.push(`${at} must be ≤ ${schema.maximum}`);
  if (t === "array") {
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${at} has more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => check(schema.items, v, `${at}[${i}]`, errors));
  }
  if (t === "object") {
    for (const k of schema.required || []) if (value[k] === undefined) errors.push(`${at}.${k} is required`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) check(props[k], v, `${at}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}.${k} is not allowed`);
    }
  }
}
