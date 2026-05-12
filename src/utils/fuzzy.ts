export function fuzzyScore(query: string, target: string): number {
  if (!query) return 1
  if (!target) return 0

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  if (t === q) return 1
  if (t.startsWith(q)) return 0.9
  if (t.includes(q)) return 0.7

  let qi = 0
  let matches = 0
  let consecutive = 0
  let maxConsecutive = 0

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matches++
      consecutive++
      maxConsecutive = Math.max(maxConsecutive, consecutive)
      qi++
    } else {
      consecutive = 0
    }
  }

  if (qi < q.length) return 0

  const matchRatio = matches / t.length
  const seqBonus = maxConsecutive / q.length
  return matchRatio * 0.6 + seqBonus * 0.4
}

export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  threshold = 0.3,
): T[] {
  if (!query.trim()) return items

  return items
    .map(item => ({ item, score: fuzzyScore(query, getText(item)) }))
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}
