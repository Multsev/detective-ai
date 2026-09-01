import type { InvestigationCase, InvestigationEntity } from '../../shared/domain';

const HORIZONTAL_GAP = 330;
const VERTICAL_GAP = 190;
const COMPONENT_GAP = 170;
const ORIGIN_X = 80;
const ORIGIN_Y = 80;
const CARD_WIDTH = 205;
const CARD_HEIGHT = 145;
const TARGET_ASPECT_RATIO = 1.35;
const RADIAL_RING_GAP = 300;
const RADIAL_CARD_GAP = 54;

interface TreeNode {
  entityId: string;
  depth: number;
  children: TreeNode[];
}

interface ComponentLayout {
  positions: Map<string, InvestigationEntity['position']>;
  width: number;
  height: number;
}

/** Uses a radial focus layout when a card is selected and a packed tree layout otherwise. */
export function arrangeInvestigationGraph(
  investigationCase: InvestigationCase,
  selectedEntityId?: string,
): InvestigationCase {
  if (investigationCase.entities.length === 0) return investigationCase;

  const entitiesById = new Map(investigationCase.entities.map((entity) => [entity.id, entity]));
  const adjacency = new Map(investigationCase.entities.map((entity) => [entity.id, new Set<string>()]));

  for (const relation of investigationCase.relations) {
    if (!entitiesById.has(relation.sourceId) || !entitiesById.has(relation.targetId)) continue;
    adjacency.get(relation.sourceId)?.add(relation.targetId);
    adjacency.get(relation.targetId)?.add(relation.sourceId);
  }

  const compareEntityIds = (leftId: string, rightId: string) => {
    const left = entitiesById.get(leftId);
    const right = entitiesById.get(rightId);
    return (left?.title ?? leftId).localeCompare(right?.title ?? rightId, 'ru') || leftId.localeCompare(rightId);
  };
  const compareRoots = (leftId: string, rightId: string) =>
    (adjacency.get(rightId)?.size ?? 0) - (adjacency.get(leftId)?.size ?? 0) || compareEntityIds(leftId, rightId);

  if (selectedEntityId && entitiesById.has(selectedEntityId)) {
    return applySelectedRadialLayout(investigationCase, selectedEntityId, adjacency, entitiesById, compareEntityIds);
  }

  const unvisited = new Set(entitiesById.keys());

  const components: ComponentLayout[] = [];

  while (unvisited.size > 0) {
    const rootId = [...unvisited].sort(compareRoots)[0];
    const root = buildSpanningTree(rootId, adjacency, unvisited, compareEntityIds);
    components.push(layoutComponent(root));
  }

  const positioned = packComponents(components);

  return {
    ...investigationCase,
    entities: investigationCase.entities.map((entity) => ({
      ...entity,
      position: positioned.get(entity.id) ?? entity.position,
    })),
  };
}

function applySelectedRadialLayout(
  investigationCase: InvestigationCase,
  selectedEntityId: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  entitiesById: ReadonlyMap<string, InvestigationEntity>,
  compareEntityIds: (leftId: string, rightId: string) => number,
): InvestigationCase {
  const unvisited = new Set(entitiesById.keys());
  const radialTree = buildSpanningTree(selectedEntityId, adjacency, unvisited, compareEntityIds);
  const radial = layoutRadialComponent(radialTree);
  const disconnectedComponents: ComponentLayout[] = [];

  while (unvisited.size > 0) {
    const rootId = [...unvisited].sort((leftId, rightId) =>
      (adjacency.get(rightId)?.size ?? 0) - (adjacency.get(leftId)?.size ?? 0) || compareEntityIds(leftId, rightId))[0];
    disconnectedComponents.push(layoutComponent(buildSpanningTree(rootId, adjacency, unvisited, compareEntityIds)));
  }

  const positions = new Map<string, InvestigationEntity['position']>();
  for (const [entityId, position] of radial.positions) {
    positions.set(entityId, { x: ORIGIN_X + position.x, y: ORIGIN_Y + position.y });
  }
  const disconnected = packComponents(disconnectedComponents);
  for (const [entityId, position] of disconnected) {
    positions.set(entityId, { x: position.x + radial.width + COMPONENT_GAP, y: position.y });
  }

  return {
    ...investigationCase,
    entities: investigationCase.entities.map((entity) => ({
      ...entity,
      position: positions.get(entity.id) ?? entity.position,
    })),
  };
}

function layoutRadialComponent(root: TreeNode): ComponentLayout {
  const levels: TreeNode[][] = [];
  const queue = [root];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    (levels[current.depth] ??= []).push(current);
    queue.push(...current.children);
  }

  const radii: number[] = [0];
  for (let depth = 1; depth < levels.length; depth += 1) {
    const minimumForCardSpacing = levels[depth].length * (CARD_WIDTH + RADIAL_CARD_GAP) / (2 * Math.PI);
    radii.push(Math.max(depth * RADIAL_RING_GAP, minimumForCardSpacing, radii[depth - 1] + RADIAL_RING_GAP));
  }
  const maximumRadius = Math.max(0, ...radii);
  const centerX = maximumRadius + CARD_WIDTH / 2;
  const centerY = maximumRadius + CARD_HEIGHT / 2;
  const positions = new Map<string, InvestigationEntity['position']>();
  positions.set(root.entityId, { x: centerX - CARD_WIDTH / 2, y: centerY - CARD_HEIGHT / 2 });

  levels.slice(1).forEach((level, levelIndex) => {
    const radius = radii[levelIndex + 1];
    level.forEach((node, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / level.length;
      positions.set(node.entityId, {
        x: centerX + Math.cos(angle) * radius - CARD_WIDTH / 2,
        y: centerY + Math.sin(angle) * radius - CARD_HEIGHT / 2,
      });
    });
  });

  return {
    positions,
    width: maximumRadius * 2 + CARD_WIDTH,
    height: maximumRadius * 2 + CARD_HEIGHT,
  };
}

function layoutComponent(root: TreeNode): ComponentLayout {
  const levels: TreeNode[][] = [];
  const queue = [root];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    (levels[current.depth] ??= []).push(current);
    queue.push(...current.children);
  }

  const widestLevel = Math.max(...levels.map((level) => level.length));
  const height = Math.max(CARD_HEIGHT, (widestLevel - 1) * VERTICAL_GAP + CARD_HEIGHT);
  const positions = new Map<string, InvestigationEntity['position']>();
  levels.forEach((level, depth) => {
    const levelHeight = (level.length - 1) * VERTICAL_GAP + CARD_HEIGHT;
    const levelTop = (height - levelHeight) / 2;
    level.forEach((node, index) => {
      positions.set(node.entityId, { x: depth * HORIZONTAL_GAP, y: levelTop + index * VERTICAL_GAP });
    });
  });

  return { positions, width: (levels.length - 1) * HORIZONTAL_GAP + CARD_WIDTH, height };
}

function packComponents(components: ComponentLayout[]): Map<string, InvestigationEntity['position']> {
  const positioned = new Map<string, InvestigationEntity['position']>();
  const totalArea = components.reduce((area, component) => area + (component.width + COMPONENT_GAP) * (component.height + COMPONENT_GAP), 0);
  const targetColumnHeight = Math.max(
    ...components.map((component) => component.height),
    Math.sqrt(totalArea / TARGET_ASPECT_RATIO),
  );
  let columnLeft = ORIGIN_X;
  let columnTop = ORIGIN_Y;
  let columnWidth = 0;

  for (const component of components) {
    if (columnTop > ORIGIN_Y && columnTop + component.height > ORIGIN_Y + targetColumnHeight) {
      columnLeft += columnWidth + COMPONENT_GAP;
      columnTop = ORIGIN_Y;
      columnWidth = 0;
    }
    for (const [entityId, position] of component.positions) {
      positioned.set(entityId, { x: columnLeft + position.x, y: columnTop + position.y });
    }
    columnTop += component.height + COMPONENT_GAP;
    columnWidth = Math.max(columnWidth, component.width);
  }

  return positioned;
}

function buildSpanningTree(
  rootId: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  unvisited: Set<string>,
  compareEntityIds: (leftId: string, rightId: string) => number,
): TreeNode {
  const root: TreeNode = { entityId: rootId, depth: 0, children: [] };
  const queue = [root];
  unvisited.delete(rootId);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const neighbors = [...(adjacency.get(current.entityId) ?? [])].sort(compareEntityIds);
    for (const neighborId of neighbors) {
      if (!unvisited.has(neighborId)) continue;
      unvisited.delete(neighborId);
      const child: TreeNode = { entityId: neighborId, depth: current.depth + 1, children: [] };
      current.children.push(child);
      queue.push(child);
    }
  }

  return root;
}
