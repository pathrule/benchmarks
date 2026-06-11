export function childLogger(scope: string) {
  return { scope, info: console.log };
}
