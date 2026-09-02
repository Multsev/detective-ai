type MenuBoundary = Pick<Node, 'contains'>;

export function isOutsideMenu(
  target: Node,
  triggerArea: MenuBoundary | null,
  floatingArea: MenuBoundary | null,
): boolean {
  return !triggerArea?.contains(target) && !floatingArea?.contains(target);
}
