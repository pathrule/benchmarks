export function fanout(event: unknown) {
  return { event, durable: false };
}
