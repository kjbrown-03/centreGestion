export function formatFcfa(value: number) {
  return `${Math.round(Number(value || 0)).toLocaleString("en-US")} FCFA`;
}
