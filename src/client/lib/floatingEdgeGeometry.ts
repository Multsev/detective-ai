export type EdgeSide = 'left' | 'right' | 'top' | 'bottom';

export interface NodeRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloatingAnchor {
  x: number;
  y: number;
  side: EdgeSide;
}

export interface FloatingConnection {
  source: FloatingAnchor;
  target: FloatingAnchor;
}

const ANCHOR_EDGE_PADDING = 12;

export function getFloatingConnection(source: NodeRectangle, target: NodeRectangle, parallelOffset = 0): FloatingConnection {
  const sourceCenter = rectangleCenter(source);
  const targetCenter = rectangleCenter(target);
  return {
    source: shiftAnchorAlongEdge(intersectRectangle(source, targetCenter), source, parallelOffset),
    target: shiftAnchorAlongEdge(intersectRectangle(target, sourceCenter), target, parallelOffset),
  };
}

export function getSelfLoopPath(rectangle: NodeRectangle, parallelOffset = 0): { path: string; labelX: number; labelY: number } {
  const right = rectangle.x + rectangle.width;
  const centerY = rectangle.y + rectangle.height / 2;
  const halfGap = Math.min(28, Math.max(16, rectangle.height * 0.18));
  const loopReach = 54 + Math.abs(parallelOffset);
  const startY = centerY - halfGap;
  const endY = centerY + halfGap;
  return {
    path: `M ${right} ${startY} C ${right + loopReach} ${startY - halfGap}, ${right + loopReach} ${endY + halfGap}, ${right} ${endY}`,
    labelX: right + loopReach,
    labelY: centerY,
  };
}

export function buildParallelEdgeOffsets(relations: ReadonlyArray<{ id: string; sourceId: string; targetId: string }>, gap = 9): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const relation of relations) {
    const pair = [relation.sourceId, relation.targetId].sort().join('\u0000');
    const group = groups.get(pair) ?? [];
    group.push(relation.id);
    groups.set(pair, group);
  }

  const offsets = new Map<string, number>();
  for (const ids of groups.values()) {
    const center = (ids.length - 1) / 2;
    ids.forEach((id, index) => offsets.set(id, (index - center) * gap));
  }
  return offsets;
}

function rectangleCenter(rectangle: NodeRectangle): { x: number; y: number } {
  return { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 };
}

function intersectRectangle(rectangle: NodeRectangle, toward: { x: number; y: number }): FloatingAnchor {
  const center = rectangleCenter(rectangle);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return { x: rectangle.x + rectangle.width, y: center.y, side: 'right' };

  const horizontalRatio = Math.abs(dx) / Math.max(rectangle.width / 2, 1);
  const verticalRatio = Math.abs(dy) / Math.max(rectangle.height / 2, 1);
  const scale = 1 / Math.max(horizontalRatio, verticalRatio);

  if (horizontalRatio >= verticalRatio) {
    return { x: center.x + dx * scale, y: center.y + dy * scale, side: dx >= 0 ? 'right' : 'left' };
  }
  return { x: center.x + dx * scale, y: center.y + dy * scale, side: dy >= 0 ? 'bottom' : 'top' };
}

function shiftAnchorAlongEdge(anchor: FloatingAnchor, rectangle: NodeRectangle, offset: number): FloatingAnchor {
  if (offset === 0) return anchor;
  if (anchor.side === 'left' || anchor.side === 'right') {
    return { ...anchor, y: clamp(anchor.y + offset, rectangle.y + ANCHOR_EDGE_PADDING, rectangle.y + rectangle.height - ANCHOR_EDGE_PADDING) };
  }
  return { ...anchor, x: clamp(anchor.x + offset, rectangle.x + ANCHOR_EDGE_PADDING, rectangle.x + rectangle.width - ANCHOR_EDGE_PADDING) };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
