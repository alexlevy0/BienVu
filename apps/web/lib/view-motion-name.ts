/** A stable, collision-free CSS identifier, including imported provider IDs. */
export function motionName(scope: string, id: string) {
  return `bv-${scope}-${Array.from(id, (c) => c.codePointAt(0)!.toString(16)).join('-')}`;
}
