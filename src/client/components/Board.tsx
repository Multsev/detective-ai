import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  getViewportForBounds,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Edge,
  type Connection,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { EntityResearchState, EntityType, EvidenceStatus, InvestigationCase, InvestigationRelation } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';
import { getResearchSubjectEntityId } from '../../shared/caseSubject';
import { isEntityVisible } from '../lib/graph';
import { buildEntityProvenanceIndex } from '../lib/entityProvenance';
import { getGraphBounds, isDenseGraph, reconcileFlowNodes, shouldReduceGraphDetail } from '../lib/graphPerformance';
import { shouldAutoFitResearchGraph, type ResearchAutoFitState } from '../lib/researchAutoFit';
import { EntityNode, type EntityFlowNode } from './EntityNode';

const nodeTypes = { entity: EntityNode };

interface BoardProps {
  investigationCase: InvestigationCase;
  selectedEntityIds: ReadonlySet<string>;
  activeEntityId?: string;
  visibleTypes: ReadonlySet<EntityType>;
  visibleEvidenceStatuses: ReadonlySet<EvidenceStatus>;
  onlySubjectNetwork: boolean;
  search: string;
  researchByEntityId: Readonly<Record<string, EntityResearchState>>;
  autoFitResearch: boolean;
  researching: boolean;
  revealEntityRequest?: { entityId: string; key: number };
  fitGraphRequestKey?: number;
  onSelectEntity: (entityId: string, additive: boolean) => void;
  onClearSelection: () => void;
  onOpenEntity: (entityId: string) => void;
  onOpenEntityMenu: (entityId: string, position: { x: number; y: number }) => void;
  onOpenPaneMenu: (position: { x: number; y: number }) => void;
  onOpenAddEntity: () => void;
  onMoveEntity: (entityId: string, position: { x: number; y: number }) => void;
  onConnectEntities: (sourceId: string, targetId: string) => void;
  onSelectRelation: (relation: InvestigationRelation) => void;
}

export function Board({ investigationCase, selectedEntityIds, activeEntityId, visibleTypes, visibleEvidenceStatuses, onlySubjectNetwork, search, researchByEntityId, autoFitResearch, researching, revealEntityRequest, fitGraphRequestKey, onSelectEntity, onClearSelection, onOpenEntity, onOpenEntityMenu, onOpenPaneMenu, onOpenAddEntity, onMoveEntity, onConnectEntities, onSelectRelation }: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const researchSubjectEntityId = getResearchSubjectEntityId(investigationCase);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [isNavigating, setIsNavigating] = useState(false);
  const denseGraph = isDenseGraph(investigationCase.entities.length, investigationCase.relations.length);
  const reducedDetail = shouldReduceGraphDetail(investigationCase.entities.length, investigationCase.relations.length, viewportZoom);
  const provenanceByEntityId = useMemo(() => buildEntityProvenanceIndex(investigationCase), [investigationCase.entities, investigationCase.relations, investigationCase.sources]);
  const subjectNetworkIds = useMemo(() => {
    if (!onlySubjectNetwork) return undefined;
    const ids = new Set([researchSubjectEntityId]);
    for (const relation of investigationCase.relations) {
      if (relation.sourceId === researchSubjectEntityId) ids.add(relation.targetId);
      if (relation.targetId === researchSubjectEntityId) ids.add(relation.sourceId);
    }
    return ids;
  }, [investigationCase.relations, onlySubjectNetwork, researchSubjectEntityId]);
  const flowNodes = useMemo<EntityFlowNode[]>(() => investigationCase.entities.map((entity) => ({
    id: entity.id,
    type: 'entity',
    position: entity.position,
    data: { entity, research: researchByEntityId[entity.id], isResearchSubject: entity.id === researchSubjectEntityId, isActiveSelection: entity.id === activeEntityId, provenance: provenanceByEntityId.get(entity.id)!, reducedDetail },
    selected: selectedEntityIds.has(entity.id),
    hidden: !isEntityVisible(entity, visibleTypes, search) || Boolean(subjectNetworkIds && !subjectNetworkIds.has(entity.id)),
  })), [activeEntityId, investigationCase.entities, provenanceByEntityId, reducedDetail, researchByEntityId, researchSubjectEntityId, search, selectedEntityIds, subjectNetworkIds, visibleTypes]);

  const flowEdges = useMemo<Edge[]>(() => investigationCase.relations.map((relation) => {
    const visual = evidenceStyles[relation.status];
    return {
      id: relation.id,
      source: relation.sourceId,
      target: relation.targetId,
      label: reducedDetail ? undefined : `${relation.label} · ${Math.round(relation.confidence * 100)}%`,
      type: 'default',
      animated: !denseGraph && relation.status === 'hypothesis',
      style: { stroke: visual.color, strokeWidth: visual.width, strokeDasharray: visual.dash },
      labelStyle: { fill: '#25303a', fontWeight: 750, fontSize: 11 },
      labelBgStyle: { fill: '#efe1c7', fillOpacity: 0.95 },
      labelBgPadding: [7, 4] as [number, number],
      labelBgBorderRadius: 4,
      data: { relation },
      hidden: !visibleEvidenceStatuses.has(relation.status) || Boolean(subjectNetworkIds && (!subjectNetworkIds.has(relation.sourceId) || !subjectNetworkIds.has(relation.targetId))),
    };
  }), [denseGraph, investigationCase.relations, reducedDetail, subjectNetworkIds, visibleEvidenceStatuses]);

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => setNodes((current) => reconcileFlowNodes(current, flowNodes)), [flowNodes, setNodes]);
  useEffect(() => setEdges(flowEdges), [flowEdges, setEdges]);

  const handleNodeClick: NodeMouseHandler<EntityFlowNode> = (event, node) => onSelectEntity(node.id, event.shiftKey || event.ctrlKey || event.metaKey);

  return (
    <div ref={boardRef} className={`board-shell${denseGraph ? ' is-dense-graph' : ''}${isNavigating ? ' is-navigating' : ''}${reducedDetail ? ' is-reduced-detail' : ''}`} onDoubleClick={(event) => { if ((event.target as HTMLElement).classList.contains('react-flow__pane')) onOpenAddEntity(); }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onMoveStart={() => setIsNavigating(true)}
        onMoveEnd={(_event, viewport) => {
          setViewportZoom(viewport.zoom);
          setIsNavigating(false);
        }}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={(_event, node) => onOpenEntity(node.id)}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onOpenEntityMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
        onPaneClick={onClearSelection}
        onPaneContextMenu={(event) => { event.preventDefault(); onOpenPaneMenu({ x: event.clientX, y: event.clientY }); }}
        onNodeDragStop={(_event, node) => onMoveEntity(node.id, node.position)}
        onConnect={(connection: Connection) => {
          if (connection.source && connection.target) onConnectEntities(connection.source, connection.target);
        }}
        nodesConnectable={!researching}
        connectionLineStyle={{ stroke: '#8a5f31', strokeWidth: 2 }}
        onEdgeClick={(_event, edge) => {
          const relation = investigationCase.relations.find((item) => item.id === edge.id);
          if (relation) onSelectRelation(relation);
        }}
        fitView
        onlyRenderVisibleElements
        minZoom={0.15}
        maxZoom={1.7}
        proOptions={{ hideAttribution: true }}
      >
        <ResearchAutoFit
          nodes={nodes}
          boardRef={boardRef}
          enabled={autoFitResearch}
          entityCount={investigationCase.entities.length}
          relationCount={investigationCase.relations.length}
          researching={researching}
        />
        <RevealEntity request={revealEntityRequest} />
        <FitGraphOnRequest nodes={nodes} boardRef={boardRef} requestKey={fitGraphRequestKey} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.4} color="rgba(84,55,31,.28)" />
        <GraphControls nodes={nodes} boardRef={boardRef} />
      </ReactFlow>
      {nodes.filter((node) => !node.hidden).length === 0 && (
        <div className="empty-board">На доске нет карточек, подходящих под фильтр.</div>
      )}
    </div>
  );
}

function FitGraphOnRequest({ nodes, boardRef, requestKey }: { nodes: EntityFlowNode[]; boardRef: RefObject<HTMLDivElement | null>; requestKey?: number }) {
  const fitEntireGraph = useFitEntireGraph(nodes, boardRef);

  useEffect(() => {
    if (requestKey === undefined) return undefined;
    const animationFrame = requestAnimationFrame(() => {
      void fitEntireGraph(420);
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [fitEntireGraph, requestKey]);

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

function ResearchAutoFit({ nodes, boardRef, enabled, entityCount, relationCount, researching }: {
  nodes: EntityFlowNode[];
  boardRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  entityCount: number;
  relationCount: number;
  researching: boolean;
}) {
  const fitEntireGraph = useFitEntireGraph(nodes, boardRef);
  const previous = useRef<ResearchAutoFitState>({ entityCount, relationCount, researching });

  useEffect(() => {
    const current = { entityCount, relationCount, researching };
    const shouldFit = shouldAutoFitResearchGraph(enabled, previous.current, current);
    previous.current = current;
    if (!shouldFit) return undefined;

    const animationFrame = requestAnimationFrame(() => {
      void fitEntireGraph(360);
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [enabled, entityCount, fitEntireGraph, relationCount, researching]);

  return null;
}

function GraphControls({ nodes, boardRef }: { nodes: EntityFlowNode[]; boardRef: RefObject<HTMLDivElement | null> }) {
  const fitEntireGraph = useFitEntireGraph(nodes, boardRef);
  return <Controls showInteractive={false} onFitView={() => void fitEntireGraph(280)} />;
}

function useFitEntireGraph(nodes: EntityFlowNode[], boardRef: RefObject<HTMLDivElement | null>) {
  const { setViewport } = useReactFlow<EntityFlowNode>();
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  return useCallback((duration: number) => {
    const bounds = getGraphBounds(nodesRef.current);
    const board = boardRef.current;
    if (!board || bounds.width === 0 || bounds.height === 0) return Promise.resolve(false);
    const viewport = getViewportForBounds(bounds, board.clientWidth, board.clientHeight, 0.15, 1.7, 0.16);
    return setViewport(viewport, { duration });
  }, [boardRef, setViewport]);
}
