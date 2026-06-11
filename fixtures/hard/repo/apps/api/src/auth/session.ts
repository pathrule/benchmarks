export function rotateSession(familyId: string) {
  return { familyId, rotatedAt: Date.now() };
}
