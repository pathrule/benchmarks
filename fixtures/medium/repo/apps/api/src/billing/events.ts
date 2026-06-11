export async function acceptBillingEvent(eventId: string) {
  return { eventId, accepted: true };
}
