export function percentile(value, population, direction = "higher") {
  if (!Number.isFinite(value)) return null;
  const values = (population ?? []).filter(Number.isFinite).sort((left, right) => left - right);
  if (!values.length) return null;
  if (values.length === 1) return 0.5;
  const lower = values.filter((candidate) => candidate < value).length;
  const equal = values.filter((candidate) => candidate === value).length;
  const ascending = (lower + Math.max(0, equal - 1) / 2) / (values.length - 1);
  return direction === "lower" ? 1 - ascending : ascending;
}
