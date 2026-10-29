export function recallAtK(expected: string[], retrievedIds: string[], k: number): number {
  if (expected.length === 0) throw new Error("recall is undefined without expected evidence");
  const top = new Set(retrievedIds.slice(0, k));
  return expected.filter((id) => top.has(id)).length / expected.length;
}
