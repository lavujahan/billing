const AUTO_PICK = 0.7;
const AUTO_GAP = 0.15;

// Pick a match only when it is good and clearly ahead of the next one; otherwise the user chooses.
export function confidentPick<T extends { score: number }>(candidates: T[]): T | null {
  const [top, second] = candidates;
  if (!top || top.score < AUTO_PICK) return null;
  return !second || top.score - second.score >= AUTO_GAP ? top : null;
}

export function mergeByBestScore<T extends { id: string | null; score: number }>(lists: T[][], limit = 4): T[] {
  const byId = new Map<string, T>();
  for (const list of lists)
    for (const item of list) {
      const key = item.id ?? "";
      if ((byId.get(key)?.score ?? -1) < item.score) byId.set(key, item);
    }
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
