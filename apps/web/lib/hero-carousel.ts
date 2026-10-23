export type HeroCardPosition = -1 | 0 | 1;
/** Three stable identities rotate through the front, right and left positions. */
export function heroCardPosition(index: number, selected: number): HeroCardPosition {
  const relative = (((index - selected) % 3) + 3) % 3;
  return relative === 2 ? -1 : (relative as 0 | 1);
}
