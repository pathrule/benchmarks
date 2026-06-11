export async function dispatch(receiptId: string) {
  return { receiptId, handedOff: true };
}
