/**
 * Small deterministic hash. Mock values are derived from it so a given node keeps the same
 * numbers between renders and reloads — figures that shuffle on every open look broken.
 */
export function stableHash(value: string): number {
  let result = 0
  for (let index = 0; index < value.length; index++) {
    result = (result * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(result)
}
