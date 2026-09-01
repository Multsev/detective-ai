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
import type { EntityResearchState, EntityType, EvidenceStatus, InvestigationCase, InvestigationRelation, QuestionStatus } from '../../shared/domain';
import { evidenceStyles } from '../../shared/evidenceStyle';
import { getResearchSubjectEntityId } from '../../shared/caseSubject';
import { isEntityVisible } from '../lib/graph';
import { buildEntityProvenanceIndex } from '../lib/entityProvenance';
import { getGraphBounds, isDenseGraph, reconcileFlowNodes, shouldReduceGraphDetail } from '../lib/graphPerformance';
import { shouldAutoFitResearchGraph, type ResearchAutoFitState } from '../lib/researchAutoFit';
import { EntityNode, type EntityFlowNode } from './EntityNode';
import { motionDuration, motionDurations, type MotionLevel } from '../motion/motionPreferences';

const nodeTypes = { entity: EntityNode };

interface BoardProps {
  investigationCase: InvestigationCase;
  selectedEntityIds: ReadonlySet<string>;
  activeEntityId?: string;
  visibleTypes: ReadonlySet<EntityType>;
  visibleEvidenceStatuses: ReadonlySet<EvidenceStatus>;
  visibleQuestionStatuses: ReadonlySet<QuestionStatus>;
  onlySubjectNetwork: boolean;
  onlyWithUnreadChanges: boolean;
  unreadChangeCountByEntity: ReadonlyMap<string, number>;
  search: string;
  researchByEntityId: Readonly<Record<string, EntityResearchState>>;
  entityMotionById: Readonly<Record<string, 'updated' | 'no-change' | 'error'>>;
  removingEntityIds: ReadonlySet<string>;
  autoFitResearch: boolean;
  motionLevel: MotionLevel;
  researching: boolean;
  revealEntityRequest?: { entityId: string; key: number };
  fitGraphRequestKey?: number;
  layoutAnimationKey?: number;
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

export function Board({ investigationCase, selectedEntityIds, activeEntityId, visibleTypes, visibleEvidenceStatuses, visibleQuestionStatuses, onlySubjectNetwork, onlyWithUnreadChanges, unreadChangeCountByEntity, search, researchByEntityId, entityMotionById, removingEntityIds, autoFitResearch, motionLevel, researching, revealEntityRequest, fitGraphRequestKey, layoutAnimationKey, onSelectEntity, onClearSelection, onOpenEntity, onOpenEntityMenu, onOpenPaneMenu, onOpenAddEntity, onMoveEntity, onConnectEntities, onSelectRelation }: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const researchSubjectEntityId = getResearchSubjectEntityId(investigationCase);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [isNavigating, setIsNavigating] = useState(false);
  const [layoutAnimating, setLayoutAnimating] = useState(false);
  const [enteringEntityIds, setEnteringEntityIds] = useState<Set<string>>(() => new Set());
  const [enteringRelationIds, setEnteringRelationIds] = useState<Set<string>>(() => new Set());
  const previousEntityIds = useRef(new Set(investigationCase.entities.map((entity) => entity.id)));
  const previousRelationIds = useRef(new Set(investigationCase.relations.map((relation) => relation.id)));
  const denseGraph = isDenseGraph(investigationCase.entities.length, investigationCase.relations.length);
  const reducedDetail = shouldReduceGraphDetail(investigationCase.entities.length, investigationCase.relations.length, viewportZoom);

  useEffect(() => {
    const current = new Set(investigationCase.entities.map((entity) => entity.id));
    const entering = new Set([...current].filter((id) => !previousEntityIds.current.has(id)));
    previousEntityIds.current = current;
    if (entering.size === 0 || denseGraph || motionLevel === 'off') return undefined;
    setEnteringEntityIds(entering);
    const timer = setTimeout(() => setEnteringEntityIds(new Set()), motionDuration(motionLevel, motionDurations.card) + 80);
    return () => clearTimeout(timer);
  }, [denseGraph, investigationCase.entities, motionLevel]);

  useEffect(() => {
    const current = new Set(investigationCase.relations.map((relation) => relation.id));
    const entering = new Set([...current].filter((id) => !previousRelationIds.current.has(id)));
    previousRelationIds.current = current;
    if (entering.size === 0 || denseGraph || motionLevel === 'off') return undefined;
    setEnteringRelationIds(entering);
    const timer = setTimeout(() => setEnteringRelationIds(new Set()), motionDuration(motionLevel, motionDurations.relation) + 80);
    return () => clearTimeout(timer);
  }, [denseGraph, investigationCase.relations, motionLevel]);

  useEffect(() => {
    if (layoutAnimationKey === undefined || denseGraph || motionLevel === 'off') return undefined;
    setLayoutAnimating(true);
    const timer = setTimeout(() => setLayoutAnimating(false), motionDuration(motionLevel, motionDurations.layout) + 80);
    return () => clearTimeout(timer);
  }, [denseGraph, layoutAnimationKey, motionLevel]);
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
    data: { entity, research: researchByEntityId[entity.id], unreadChangeCount: unreadChangeCountByEntity.get(entity.id) ?? 0, isResearchSubject: entity.id === researchSubjectEntityId, isActiveSelection: entity.id === activeEntityId, provenance: provenanceByEntityId.get(entity.id)!, reducedDetail, entering: enteringEntityIds.has(entity.id), removing: removingEntityIds.has(entity.id), motionState: entityMotionById[entity.id] },
    selected: selectedEntityIds.has(entity.id),
    hidden: !isEntityVisible(entity, visibleTypes, search, visibleQuestionStatuses) || Boolean(subjectNetworkIds && !subjectNetworkIds.has(entity.id)) || (onlyWithUnreadChanges && !unreadChangeCountByEntity.has(entity.id)),
  })), [activeEntityId, enteringEntityIds, entityMotionById, investigationCase.entities, onlyWithUnreadChanges, provenanceByEntityId, reducedDetail, removingEntityIds, researchByEntityId, researchSubjectEntityId, search, selectedEntityIds, subjectNetworkIds, unreadChangeCountByEntity, visibleQuestionStatuses, visibleTypes]);

  const flowEdges = useMemo<Edge[]>(() => investigationCase.relations.map((relation) => {
    const visual = evidenceStyles[relation.status];
    return {
      id: relation.id,
      source: relation.sourceId,
      target: relation.targetId,
      label: reducedDetail ? undefined : `${relation.label} · ${Math.round(relation.confidence * 100)}%`,
      type: 'default',
      animated: !denseGraph && relation.status === 'hypothesis',
      className: `${enteringRelationIds.has(relation.id) ? 'relation-motion-entering ' : ''}${removingEntityIds.has(relation.sourceId) || removingEntityIds.has(relation.targetId) ? 'relation-motion-removing' : ''}`.trim(),
      style: { stroke: visual.color, strokeWidth: visual.width, strokeDasharray: visual.dash },
      labelStyle: { fill: '#25303a', fontWeight: 750, fontSize: 11 },
      labelBgStyle: { fill: '#efe1c7', fillOpacity: 0.95 },
      labelBgPadding: [7, 4] as [number, number],
      labelBgBorderRadius: 4,
      data: { relation },
      hidden: !visibleEvidenceStatuses.has(relation.status) || Boolean(subjectNetworkIds && (!subjectNetworkIds.has(relation.sourceId) || !subjectNetworkIds.has(relation.targetId))) || Boolean(onlyWithUnreadChanges && (!unreadChangeCountByEntity.has(relation.sourceId) || !unreadChangeCountByEntity.has(relation.targetId))),
    };
  }), [denseGraph, enteringRelationIds, investigationCase.relations, onlyWithUnreadChanges, reducedDetail, removingEntityIds, subjectNetworkIds, unreadChangeCountByEntity, visibleEvidenceStatuses]);

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => setNodes((current) => reconcileFlowNodes(current, flowNodes)), [flowNodes, setNodes]);
  useEffect(() => setEdges(flowEdges), [flowEdges, setEdges]);

  const handleNodeClick: NodeMouseHandler<EntityFlowNode> = (event, node) => onSelectEntity(node.id, event.shiftKey || event.ctrlKey || event.metaKey);

  return (
    <div ref={boardRef} className={`board-shell${denseGraph ? ' is-dense-graph' : ''}${isNavigating ? ' is-navigating' : ''}${layoutAnimating ? ' is-layout-animating' : ''}${reducedDetail ? ' is-reduced-detail' : ''}`} onDoubleClick={(event) => { if ((event.target as HTMLElement).classList.contains('react-flow__pane')) onOpenAddEntity(); }}>
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
          motionLevel={motionLevel}
        />
        <RevealEntity request={revealEntityRequest} motionLevel={motionLevel} />
        <FitGraphOnRequest nodes={nodes} boardRef={boardRef} requestKey={fitGraphRequestKey} motionLevel={motionLevel} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1.4} color="rgba(84,55,31,.28)" />
        <GraphControls nodes={nodes} boardRef={boardRef} motionLevel={motionLevel} />
      </ReactFlow>
      {nodes.filter((node) => !node.hidden).length === 0 && (
        <div className="empty-board">На доске нет карточек, подходящих под фильтр.</div>
      )}
    </div>
  );
}

function FitGraphOnRequest({ nodes, boardRef, requestKey, motionLevel }: { nodes: EntityFlowNode[]; boardRef: RefObject<HTMLDivElement | null>; requestKey?: number; motionLevel: MotionLevel }) {
  const fitEntireGraph = useFitEntireGraph(nodes, boardRef);

  useEffect(() => {
    if (requestKey === undefined) return undefined;
    const animationFrame = requestAnimationFrame(() => {
      void fitEntireGraph(motionDuration(motionLevel, 420));
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [fitEntireGraph, motionLevel, requestKey]);

  return null;
}

function RevealEntity({ request, motionLevel }: { request?: { entityId: string; key: number }; motionLevel: MotionLevel }) {
  const { fitView, getNode } = useReactFlow<EntityFlowNode>();
  const nodesInitialized = useNodesInitialized();

  useEffect(() => {
    if (!request || !nodesInitialized) return undefined;
    const animationFrame = requestAnimationFrame(() => {
      const node = getNode(request.entityId);
      if (node) void fitView({ nodes: [node], padding: 0.8, duration: motionDuration(motionLevel, 320), maxZoom: 1.05 });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [fitView, getNode, motionLevel, nodesInitialized, request]);

  return null;
}

function ResearchAutoFit({ nodes, boardRef, enabled, entityCount, relationCount, researching, motionLevel }: {
  nodes: EntityFlowNode[];
  boardRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  entityCount: number;
  relationCount: number;
  researching: boolean;
  motionLevel: MotionLevel;
}) {
  const fitEntireGraph = useFitEntireGraph(nodes, boardRef);
  const previous = useRef<ResearchAutoFitState>({ entityCount, relationCount, researching });

  useEffect(() => {
    const current = { entityCount, relationCount, researching };
    const shouldFit = shouldAutoFitResearchGraph(enabled, previous.current, current);
    previous.current = current;
    if (!shouldFit) return undefined;

    const animationFrame = requestAnimationFrame(() => {
      void fitEntireGraph(motionDuration(motionLevel, motionDurations.camera));
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [enabled, entityCount, fitEntireGraph, motionLevel, relationCount, researching]);

  return null;
}

function GraphControls({ nodes, boardRef, motionLevel }: { nodes: EntityFlowNode[]; boardRef: RefObject<HTMLDivElement | null>; motionLevel: MotionLevel }) {
  const fitEntireGraph = useFitEntireGraph(nodes, boardRef);
  return <Controls showInteractive={false} onFitView={() => void fitEntireGraph(motionDuration(motionLevel, 280))} />;
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
