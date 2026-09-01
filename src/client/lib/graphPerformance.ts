import type { Node } from '@xyflow/react';

export const DENSE_GRAPH_NODE_THRESHOLD = 30;
export const DENSE_GRAPH_EDGE_THRESHOLD = 45;
export const REDUCED_DETAIL_ZOOM_THRESHOLD = 0.58;

export function isDenseGraph(entityCount: number, relationCount: number): boolean {
  return entityCount >= DENSE_GRAPH_NODE_THRESHOLD || relationCount >= DENSE_GRAPH_EDGE_THRESHOLD;
}

export function shouldReduceGraphDetail(entityCount: number, relationCount: number, zoom: number): boolean {
  return isDenseGraph(entityCount, relationCount) && zoom < REDUCED_DETAIL_ZOOM_THRESHOLD;
}

export function reconcileFlowNodes<T extends Node>(current: T[], incoming: T[]): T[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  return incoming.map((next) => {
    const previous = currentById.get(next.id);
    if (!previous) return next;
    const unchanged = previous.type === next.type
      && previous.position.x === next.position.x
      && previous.position.y === next.position.y
      && previous.selected === next.selected
      && previous.hidden === next.hidden
      && shallowEqual(previous.data, next.data);
    return unchanged ? previous : { ...previous, ...next };
  });
}

export function getGraphBounds(nodes: Node[]): { x: number; y: number; width: number; height: number } {
  const visibleNodes = nodes.filter((node) => !node.hidden);
  if (visibleNodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...visibleNodes.map((node) => node.position.x));
  const minY = Math.min(...visibleNodes.map((node) => node.position.y));
  const maxX = Math.max(...visibleNodes.map((node) => node.position.x + (node.measured?.width ?? node.width ?? 205)));
  const maxY = Math.max(...visibleNodes.map((node) => node.position.y + (node.measured?.height ?? node.height ?? 190)));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function shallowEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length && keys.every((key) => leftRecord[key] === rightRecord[key]);
}
