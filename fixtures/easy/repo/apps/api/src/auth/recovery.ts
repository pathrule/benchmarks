export function revokeFamily(id: string) {
  return { id, revoked: true };
}
