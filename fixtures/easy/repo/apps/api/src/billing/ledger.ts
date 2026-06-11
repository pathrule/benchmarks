export function monthlyLedgerTotal(rows: number[]) {
  return rows.reduce((sum, value) => sum + value, 0);
}
