import { useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { EntityResearchState, EntityType, InvestigationCase, InvestigationRelation } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';
import { isEntityVisible } from '../lib/graph';
import { shouldAutoFitResearchGraph, type ResearchAutoFitState } from '../lib/researchAutoFit';
import { EntityNode, type EntityFlowNode } from './EntityNode';

const nodeTypes = { entity: EntityNode };

interface BoardProps {
  investigationCase: InvestigationCase;
  selectedEntityId?: string;
  visibleTypes: ReadonlySet<EntityType>;
  search: string;
  researchByEntityId: Readonly<Record<string, EntityResearchState>>;
  autoFitResearch: boolean;
  researching: boolean;
  revealEntityRequest?: { entityId: string; key: number };
  fitGraphRequestKey?: number;
  onSelectEntity: (entityId?: string) => void;
  onOpenEntityMenu: (entityId: string, position: { x: number; y: number }) => void;
  onMoveEntity: (entityId: string, position: { x: number; y: number }) => void;
  onSelectRelation: (relation: InvestigationRelation) => void;
}

export function Board({ investigationCase, selectedEntityId, visibleTypes, search, researchByEntityId, autoFitResearch, researching, revealEntityRequest, fitGraphRequestKey, onSelectEntity, onOpenEntityMenu, onMoveEntity, onSelectRelation }: BoardProps) {
  const flowNodes = useMemo<EntityFlowNode[]>(() => investigationCase.entities.map((entity) => ({
    id: entity.id,
    type: 'entity',
    position: entity.position,
    data: { entity, research: researchByEntityId[entity.id] },
    selected: entity.id === selectedEntityId,
    hidden: !isEntityVisible(entity, visibleTypes, search),
  })), [investigationCase.entities, researchByEntityId, search, selectedEntityId, visibleTypes]);

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

  const handleNodeClick: NodeMouseHandler<EntityFlowNode> = (_event, node) => onSelectEntity(node.id === selectedEntityId ? undefined : node.id);

  return (
    <div className="board-shell">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onSelectEntity(node.id);
          onOpenEntityMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
        onPaneClick={() => onSelectEntity(undefined)}
        onNodeDragStop={(_event, node) => onMoveEntity(node.id, node.position)}
        onEdgeClick={(_event, edge) => {
          const relation = investigationCase.relations.find((item) => item.id === edge.id);
          if (relation) onSelectRelation(relation);
        }}
        fitView
        minZoom={0.15}
        maxZoom={1.7}
        proOptions={{ hideAttribution: true }}
      >
        <ResearchAutoFit
          enabled={autoFitResearch}
          entityCount={investigationCase.entities.length}
          relationCount={investigationCase.relations.length}
          researching={researching}
        />
        <RevealEntity request={revealEntityRequest} />
        <FitGraphOnRequest requestKey={fitGraphRequestKey} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.4} color="rgba(84,55,31,.28)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {nodes.filter((node) => !node.hidden).length === 0 && (
        <div className="empty-board">На доске нет карточек, подходящих под фильтр.</div>
      )}
    </div>
  );
}

function FitGraphOnRequest({ requestKey }: { requestKey?: number }) {
  const { fitView } = useReactFlow<EntityFlowNode>();
  const nodesInitialized = useNodesInitialized();

  useEffect(() => {
    if (requestKey === undefined || !nodesInitialized) return undefined;
    const animationFrame = requestAnimationFrame(() => {
      void fitView({ padding: 0.16, duration: 420, includeHiddenNodes: false });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [fitView, nodesInitialized, requestKey]);

  return null;
}

function RevealEntity({ request }: { request?: { entityId: string; key: number } }) {
  const { fitView, getNode } = useReactFlow<EntityFlowNode>();
  const nodesInitialized = useNodesInitialized();

  useEffect(() => {
    if (!request || !nodesInitialized) return undefined;
    const animationFrame = requestAnimationFrame(() => {
      const node = getNode(request.entityId);
      if (node) void fitView({ nodes: [node], padding: 0.8, duration: 320, maxZoom: 1.05 });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [fitView, getNode, nodesInitialized, request]);

  return null;
}

function ResearchAutoFit({ enabled, entityCount, relationCount, researching }: {
  enabled: boolean;
  entityCount: number;
  relationCount: number;
  researching: boolean;
}) {
  const { fitView } = useReactFlow<EntityFlowNode>();
  const previous = useRef<ResearchAutoFitState>({ entityCount, relationCount, researching });

  useEffect(() => {
    const current = { entityCount, relationCount, researching };
    const shouldFit = shouldAutoFitResearchGraph(enabled, previous.current, current);
    previous.current = current;
    if (!shouldFit) return undefined;

    const animationFrame = requestAnimationFrame(() => {
      void fitView({ padding: 0.16, duration: 360, includeHiddenNodes: false });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [enabled, entityCount, fitView, relationCount, researching]);

  return null;
}
