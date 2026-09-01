import { useEffect, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { EntityType, InvestigationCase, InvestigationRelation } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';
import { EntityNode, type EntityFlowNode } from './EntityNode';

const nodeTypes = { entity: EntityNode };

interface BoardProps {
  investigationCase: InvestigationCase;
  selectedEntityId?: string;
  filter: EntityType | 'all';
  search: string;
  onSelectEntity: (entityId?: string) => void;
  onMoveEntity: (entityId: string, position: { x: number; y: number }) => void;
  onSelectRelation: (relation: InvestigationRelation) => void;
}

export function Board({ investigationCase, selectedEntityId, filter, search, onSelectEntity, onMoveEntity, onSelectRelation }: BoardProps) {
  const flowNodes = useMemo<EntityFlowNode[]>(() => investigationCase.entities.map((entity) => ({
    id: entity.id,
    type: 'entity',
    position: entity.position,
    data: { entity },
    selected: entity.id === selectedEntityId,
    hidden: (filter !== 'all' && entity.type !== filter)
      || (Boolean(search) && !`${entity.title} ${entity.subtitle} ${entity.summary}`.toLowerCase().includes(search.toLowerCase())),
  })), [filter, investigationCase.entities, search, selectedEntityId]);

  const flowEdges = useMemo<Edge[]>(() => investigationCase.relations.map((relation) => {
    const visual = evidenceStyles[relation.status];
    return {
      id: relation.id,
      source: relation.sourceId,
      target: relation.targetId,
      label: `${relation.label} · ${Math.round(relation.confidence * 100)}%`,
      type: 'default',
      animated: relation.status === 'hypothesis',
      style: { stroke: visual.color, strokeWidth: visual.width, strokeDasharray: visual.dash },
      labelStyle: { fill: '#25303a', fontWeight: 750, fontSize: 11 },
      labelBgStyle: { fill: '#efe1c7', fillOpacity: 0.95 },
      labelBgPadding: [7, 4] as [number, number],
      labelBgBorderRadius: 4,
      data: { relation },
    };
  }), [investigationCase.relations]);

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => setNodes(flowNodes), [flowNodes, setNodes]);
  useEffect(() => setEdges(flowEdges), [flowEdges, setEdges]);

  const handleNodeClick: NodeMouseHandler<EntityFlowNode> = (_event, node) => onSelectEntity(node.id);

  return (
    <div className="board-shell">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onSelectEntity(undefined)}
        onNodeDragStop={(_event, node) => onMoveEntity(node.id, node.position)}
        onEdgeClick={(_event, edge) => {
          const relation = investigationCase.relations.find((item) => item.id === edge.id);
          if (relation) onSelectRelation(relation);
        }}
        fitView
        minZoom={0.35}
        maxZoom={1.7}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.4} color="rgba(84,55,31,.28)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {nodes.filter((node) => !node.hidden).length === 0 && (
        <div className="empty-board">На доске нет карточек, подходящих под фильтр.</div>
      )}
    </div>
  );
}
