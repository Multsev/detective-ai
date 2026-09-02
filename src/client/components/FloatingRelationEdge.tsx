import { BaseEdge, getBezierPath, getStraightPath, Position, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import type { InvestigationRelation } from '../../shared/domain';
import { getFloatingConnection, getSelfLoopPath, type EdgeSide, type NodeRectangle } from '../lib/floatingEdgeGeometry';
import type { EntityFlowNode } from './EntityNode';

type FloatingRelationData = Record<string, unknown> & {
  relation: InvestigationRelation;
  denseGraph: boolean;
  parallelOffset: number;
};

export type FloatingRelationFlowEdge = Edge<FloatingRelationData, 'floatingRelation'>;

const positionBySide: Record<EdgeSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

export function FloatingRelationEdge({ id, source, target, label, labelStyle, labelBgStyle, labelBgPadding, labelBgBorderRadius, style, markerStart, markerEnd, interactionWidth, data }: EdgeProps<FloatingRelationFlowEdge>) {
  const sourceNode = useInternalNode<EntityFlowNode>(source);
  const targetNode = useInternalNode<EntityFlowNode>(target);
  if (!sourceNode || !targetNode) return null;

  const sourceRectangle = getNodeRectangle(sourceNode);
  const targetRectangle = getNodeRectangle(targetNode);
  const parallelOffset = data?.parallelOffset ?? 0;
  let path: string;
  let labelX: number;
  let labelY: number;

  if (source === target) {
    ({ path, labelX, labelY } = getSelfLoopPath(sourceRectangle, parallelOffset));
  } else {
    const connection = getFloatingConnection(sourceRectangle, targetRectangle, parallelOffset);
    const pathBuilder = data?.denseGraph ? getStraightPath : getBezierPath;
    [path, labelX, labelY] = pathBuilder({
      sourceX: connection.source.x,
      sourceY: connection.source.y,
      sourcePosition: positionBySide[connection.source.side],
      targetX: connection.target.x,
      targetY: connection.target.y,
      targetPosition: positionBySide[connection.target.side],
    });
  }

  return <BaseEdge
    id={id}
    path={path}
    label={label}
    labelX={labelX}
    labelY={labelY}
    labelStyle={labelStyle}
    labelBgStyle={labelBgStyle}
    labelBgPadding={labelBgPadding}
    labelBgBorderRadius={labelBgBorderRadius}
    style={style}
    markerStart={markerStart}
    markerEnd={markerEnd}
    interactionWidth={interactionWidth}
  />;
}

function getNodeRectangle(node: InternalNode<EntityFlowNode>): NodeRectangle {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? node.width ?? 205,
    height: node.measured.height ?? node.height ?? 145,
  };
}
