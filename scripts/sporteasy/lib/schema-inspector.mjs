function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function emptyObservation() {
  return {
    observedTypes: new Set(),
    observations: 0,
    nullCount: 0,
    presenceCount: 0,
    objectCount: 0,
    fields: new Map(),
    arrayItem: null,
  };
}

function mergeObservation(target, source) {
  for (const type of source.observedTypes) target.observedTypes.add(type);
  target.observations += source.observations;
  target.nullCount += source.nullCount;
  target.presenceCount += source.presenceCount;
  target.objectCount += source.objectCount;

  for (const [field, observation] of source.fields) {
    if (!target.fields.has(field)) target.fields.set(field, emptyObservation());
    mergeObservation(target.fields.get(field), observation);
  }

  if (source.arrayItem) {
    if (!target.arrayItem) target.arrayItem = emptyObservation();
    mergeObservation(target.arrayItem, source.arrayItem);
  }

  return target;
}

function observe(value, path, identifiers, depth = 0) {
  const result = emptyObservation();
  result.observedTypes.add(valueType(value));
  result.observations = 1;
  result.presenceCount = 1;

  if (value === null) {
    result.nullCount = 1;
    return result;
  }

  if (depth >= 20) return result;

  if (Array.isArray(value)) {
    result.arrayItem = emptyObservation();
    for (const item of value) {
      mergeObservation(result.arrayItem, observe(item, `${path}[]`, identifiers, depth + 1));
    }
    return result;
  }

  if (typeof value === "object") {
    result.objectCount = 1;
    for (const [field, fieldValue] of Object.entries(value)) {
      const fieldPath = path ? `${path}.${field}` : field;
      if (field === "id" || field.endsWith("_id")) identifiers.add(fieldPath);
      result.fields.set(field, observe(fieldValue, fieldPath, identifiers, depth + 1));
    }
  }

  return result;
}

function serialize(observation, parentObjectCount = null) {
  const output = {
    observedTypes: [...observation.observedTypes].sort(),
    nullable: observation.nullCount > 0,
    observations: observation.observations,
  };

  if (parentObjectCount !== null) {
    output.optional = observation.presenceCount < parentObjectCount;
  }

  if (observation.fields.size) {
    output.fields = {};
    for (const [field, child] of [...observation.fields].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      output.fields[field] = serialize(child, observation.objectCount);
    }
  }

  if (observation.arrayItem) {
    output.items = observation.arrayItem.observations
      ? serialize(observation.arrayItem)
      : { observedTypes: [], nullable: false, observations: 0 };
  }

  return output;
}

function detectPagination(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { detected: false, fields: [] };
  }

  const knownFields = ["count", "next", "previous", "results", "page", "pages", "total"];
  const fields = knownFields.filter((field) => Object.hasOwn(data, field));
  return {
    detected: fields.includes("results") && fields.length >= 2,
    fields,
  };
}

export function inspectJson(data, { resource, endpoint, capturedAt = new Date().toISOString() }) {
  const identifiers = new Set();
  const observation = observe(data, "$", identifiers);

  return {
    resource,
    endpoint: `GET ${endpoint}`,
    capturedAt,
    rootType: valueType(data),
    pagination: detectPagination(data),
    identifierFields: [...identifiers].sort(),
    structure: serialize(observation),
  };
}
