import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
import * as Graphology from 'graphology-types';
import * as ResourceLoader from 'resource-loader';
import { TypedEmitter } from 'tiny-typed-emitter';
import { GraphStyleDefinition, resolveStyleDefinitions } from './utils/style';
import { TextType } from './utils/text';
import { BaseNodeAttributes, BaseEdgeAttributes } from './attributes';
import { TextureCache } from './texture-cache';
import { PixiNode } from './node';
import { PixiEdge } from './edge';

const DEFAULT_STYLE: GraphStyleDefinition = {
  node: {
    size: 15,
    color: '#000000',
    border: {
      width: 2,
      color: '#ffffff',
    },
    icon: {
      type: TextType.TEXT,
      fontFamily: 'Arial',
      fontSize: 20,
      color: '#ffffff',
      content: '',
    },
    label: {
      type: TextType.TEXT,
      fontFamily: 'Arial',
      fontSize: 12,
      content: '',
      color: '#333333',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: 4,
    },
  },
  edge: {
    width: 1,
    color: '#cccccc',
  },
};

export interface GraphOptions<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
  container: HTMLElement;
  graph: Graphology.AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  resources?: ResourceLoader.IAddOptions[];
}

interface PixiGraphEvents {
  nodeClick: (event: MouseEvent, nodeKey: string) => void;
  nodeMousemove: (event: MouseEvent, nodeKey: string) => void;
  nodeMouseover: (event: MouseEvent, nodeKey: string) => void;
  nodeMouseout: (event: MouseEvent, nodeKey: string) => void;
  nodeMousedown: (event: MouseEvent, nodeKey: string) => void;
  nodeMouseup: (event: MouseEvent, nodeKey: string) => void;
  edgeClick: (event: MouseEvent, edgeKey: string) => void;
  edgeMousemove: (event: MouseEvent, edgeKey: string) => void;
  edgeMouseover: (event: MouseEvent, edgeKey: string) => void;
  edgeMouseout: (event: MouseEvent, edgeKey: string) => void;
  edgeMousedown: (event: MouseEvent, edgeKey: string) => void;
  edgeMouseup: (event: MouseEvent, edgeKey: string) => void;
}

export class PixiGraph<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> extends TypedEmitter<PixiGraphEvents> {
  container: HTMLElement;
  graph: Graphology.AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  resources?: ResourceLoader.IAddOptions[];

  private app: PIXI.Application;
  private textureCache: TextureCache;
  private viewport: Viewport;
  private resizeObserver: ResizeObserver;
  private edgeLayer: PIXI.Container;
  private frontEdgeLayer: PIXI.Container;
  private nodeLayer: PIXI.Container;
  private nodeLabelLayer: PIXI.Container;
  private frontNodeLayer: PIXI.Container;
  private frontNodeLabelLayer: PIXI.Container;
  private nodeKeyToNodeObject = new Map<string, PixiNode>();
  private edgeKeyToEdgeObject = new Map<string, PixiEdge>();

  private mousedownNodeKey: string | null = null;
  private mousedownEdgeKey: string | null = null;

  private onGraphNodeAddedBound = this.onGraphNodeAdded.bind(this);
  private onGraphEdgeAddedBound = this.onGraphEdgeAdded.bind(this);
  private onGraphNodeDroppedBound = this.onGraphNodeDropped.bind(this);
  private onGraphEdgeDroppedBound = this.onGraphEdgeDropped.bind(this);
  private onGraphClearedBound = this.onGraphCleared.bind(this);
  private onGraphEdgesClearedBound = this.onGraphEdgesCleared.bind(this);
  private onGraphNodeAttributesUpdatedBound = this.onGraphNodeAttributesUpdated.bind(this);
  private onGraphEdgeAttributesUpdatedBound = this.onGraphEdgeAttributesUpdated.bind(this);
  private onGraphEachNodeAttributesUpdatedBound = this.onGraphEachNodeAttributesUpdated.bind(this);
  private onGraphEachEdgeAttributesUpdatedBound = this.onGraphEachEdgeAttributesUpdated.bind(this);
  private onDocumentMouseMoveBound = this.onDocumentMouseMove.bind(this);
  private onDocumentMouseUpBound = this.onDocumentMouseUp.bind(this);

  constructor(options: GraphOptions<NodeAttributes, EdgeAttributes>) {
    super();

    this.container = options.container;
    this.graph = options.graph;
    this.style = options.style;
    this.hoverStyle = options.hoverStyle;
    this.resources = options.resources;

    if (!(this.container instanceof HTMLElement)) {
      throw new Error('container should be a HTMLElement');
    }

    // create PIXI application
    this.app = new PIXI.Application({
      resizeTo: this.container,
      resolution: window.devicePixelRatio,
      transparent: true,
      antialias: true,
      autoDensity: true,
    });
    this.container.appendChild(this.app.view);

    this.app.renderer.plugins.interaction.moveWhenInside = true;
    this.app.view.addEventListener('wheel', event => { event.preventDefault() });

    this.textureCache = new TextureCache(this.app);

    // create PIXI viewport
    this.viewport = new Viewport({
      screenWidth: this.container.clientWidth,
      screenHeight: this.container.clientHeight,
      interaction: this.app.renderer.plugins.interaction
    })
      .drag()
      .pinch()
      .wheel()
      .decelerate()
      .clampZoom({ maxScale: 1 });
    this.app.stage.addChild(this.viewport);

    // create layers
    this.edgeLayer = new PIXI.Container();
    this.frontEdgeLayer = new PIXI.Container();
    this.nodeLayer = new PIXI.Container();
    this.nodeLabelLayer = new PIXI.Container();
    this.frontNodeLayer = new PIXI.Container();
    this.frontNodeLabelLayer = new PIXI.Container();
    this.viewport.addChild(this.edgeLayer);
    this.viewport.addChild(this.frontEdgeLayer);
    this.viewport.addChild(this.nodeLayer);
    this.viewport.addChild(this.nodeLabelLayer);
    this.viewport.addChild(this.frontNodeLayer);
    this.viewport.addChild(this.frontNodeLabelLayer);

    this.resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      this.viewport.resize(this.container.clientWidth, this.container.clientHeight);
      this.updateGraphVisibility();
    });

    // preload resources
    if (this.resources) {
      this.app.loader.add(this.resources);
    }
    this.app.loader.load(() => {
      this.viewport.on('frame-end', () => {
        if (this.viewport.dirty) {
          this.updateGraphVisibility();
          this.viewport.dirty = false;
        }
      });

      this.resizeObserver.observe(this.container);

      // listen to graph changes
      this.graph.on('nodeAdded', this.onGraphNodeAddedBound);
      this.graph.on('edgeAdded', this.onGraphEdgeAddedBound);
      this.graph.on('nodeDropped', this.onGraphNodeDroppedBound);
      this.graph.on('edgeDropped', this.onGraphEdgeDroppedBound);
      this.graph.on('cleared', this.onGraphClearedBound);
      this.graph.on('edgesCleared', this.onGraphEdgesClearedBound);
      this.graph.on('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
      this.graph.on('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
      this.graph.on('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
      this.graph.on('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);

      // initial draw
      this.createGraph();
      this.resetView();
    });
  }

  destroy() {
    this.graph.off('nodeAdded', this.onGraphNodeAddedBound);
    this.graph.off('edgeAdded', this.onGraphEdgeAddedBound);
    this.graph.off('nodeDropped', this.onGraphNodeDroppedBound);
    this.graph.off('edgeDropped', this.onGraphEdgeDroppedBound);
    this.graph.off('cleared', this.onGraphClearedBound);
    this.graph.off('edgesCleared', this.onGraphEdgesClearedBound);
    this.graph.off('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);
    this.graph.off('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
    this.graph.off('eachNodeAttributesUpdated', this.onGraphEachNodeAttributesUpdatedBound);
    this.graph.off('eachEdgeAttributesUpdated', this.onGraphEachEdgeAttributesUpdatedBound);

    this.resizeObserver.disconnect();
    this.resizeObserver = undefined!;

    this.textureCache.destroy();
    this.textureCache = undefined!;

    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
    this.app = undefined!;
  }

  private get zoomStep() {
    return Math.min(this.viewport.worldWidth, this.viewport.worldHeight) / 10;
  }

  zoomIn() {
    this.viewport.zoom(-this.zoomStep, true);
  }

  zoomOut() {
    this.viewport.zoom(this.zoomStep, true);
  }

  resetView() {
    const nodesX = this.graph.nodes().map(nodeKey => this.graph.getNodeAttribute(nodeKey, 'x'));
    const nodesY = this.graph.nodes().map(nodeKey => this.graph.getNodeAttribute(nodeKey, 'y'));
    const minX = Math.min(...nodesX);
    const maxX = Math.max(...nodesX);
    const minY = Math.min(...nodesY);
    const maxY = Math.max(...nodesY);
    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    const center = new PIXI.Point(minX + width / 2, minY + height / 2);

    const padding = 100;
    const totalWidth = width + padding * 2;
    const totalHeight = height + padding * 2;
    
    this.viewport.center = center;
    this.viewport.fit(true, totalWidth, totalHeight);
  }

  private onGraphNodeAdded(data: { key: string, attributes: NodeAttributes }) {
    const nodeKey = data.key;
    const nodeAttributes = data.attributes;
    this.createNode(nodeKey, nodeAttributes);
  }

  private onGraphEdgeAdded(data: { key: string, attributes: EdgeAttributes, source: string, target: string }) {
    const edgeKey = data.key;
    const edgeAttributes = data.attributes;
    const sourceNodeKey = data.source;
    const targetNodeKey = data.target;
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.createEdge(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private onGraphNodeDropped(data: { key: string }) {
    const nodeKey = data.key;
    this.dropNode(nodeKey);
  }

  private onGraphEdgeDropped(data: { key: string }) {
    const edgeKey = data.key;
    this.dropEdge(edgeKey);
  }

  private onGraphCleared() {
    Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
    Array.from(this.nodeKeyToNodeObject.keys()).forEach(this.dropNode.bind(this));
  }

  private onGraphEdgesCleared() {
    Array.from(this.edgeKeyToEdgeObject.keys()).forEach(this.dropEdge.bind(this));
  }

  private onGraphNodeAttributesUpdated(data: { key: string }) {
    const nodeKey = data.key;
    this.updateNodeStyleByKey(nodeKey);
    // TODO: normalize position?
  }

  private onGraphEdgeAttributesUpdated(data: { key: string }) {
    const edgeKey = data.key;
    this.updateEdgeStyleByKey(edgeKey);
  }

  private onGraphEachNodeAttributesUpdated() {
    this.graph.forEachNode(this.updateNodeStyle.bind(this));
  }

  private onGraphEachEdgeAttributesUpdated() {
    this.graph.forEachEdge(this.updateEdgeStyle.bind(this));
  }

  private hoverNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (node.hovered) {
      return;
    }

    // update style
    node.hovered = true;
    this.updateNodeStyleByKey(nodeKey);

    // move to front
    const nodeIndex = this.nodeLayer.getChildIndex(node.nodeGfx);
    this.nodeLayer.removeChildAt(nodeIndex);
    this.nodeLabelLayer.removeChildAt(nodeIndex);
    this.frontNodeLayer.removeChildAt(nodeIndex);
    this.frontNodeLabelLayer.removeChildAt(nodeIndex);
    this.nodeLayer.addChild(node.nodePlaceholderGfx);
    this.nodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
    this.frontNodeLayer.addChild(node.nodeGfx);
    this.frontNodeLabelLayer.addChild(node.nodeLabelGfx);
  }

  private unhoverNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (!node.hovered) {
      return;
    }

    // update style
    node.hovered = false;
    this.updateNodeStyleByKey(nodeKey);

    // move to front
    const nodeIndex = this.frontNodeLayer.getChildIndex(node.nodeGfx);
    this.nodeLayer.removeChildAt(nodeIndex);
    this.nodeLabelLayer.removeChildAt(nodeIndex);
    this.frontNodeLayer.removeChildAt(nodeIndex);
    this.frontNodeLabelLayer.removeChildAt(nodeIndex);
    this.nodeLayer.addChild(node.nodeGfx);
    this.nodeLabelLayer.addChild(node.nodeLabelGfx);
    this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
    this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
  }

  private hoverEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (edge.hovered) {
      return;
    }

    // update style
    edge.hovered = true;
    this.updateEdgeStyleByKey(edgeKey);

    // move to front
    const edgeIndex = this.edgeLayer.getChildIndex(edge.edgeGfx);
    this.edgeLayer.removeChildAt(edgeIndex);
    this.frontEdgeLayer.removeChildAt(edgeIndex);
    this.edgeLayer.addChild(edge.edgePlaceholderGfx);
    this.frontEdgeLayer.addChild(edge.edgeGfx);
  }

  private unhoverEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    if (!edge.hovered) {
      return;
    }

    // update style
    edge.hovered = false;
    this.updateEdgeStyleByKey(edgeKey);

    // move back
    const edgeIndex = this.frontEdgeLayer.getChildIndex(edge.edgeGfx);
    this.edgeLayer.removeChildAt(edgeIndex);
    this.frontEdgeLayer.removeChildAt(edgeIndex);
    this.edgeLayer.addChild(edge.edgeGfx);
    this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
  }

  private moveNode(nodeKey: string, point: PIXI.IPointData) {
    this.graph.setNodeAttribute(nodeKey, 'x', point.x);
    this.graph.setNodeAttribute(nodeKey, 'y', point.y);

    // update style
    this.updateNodeStyleByKey(nodeKey);
    this.graph.edges(nodeKey).forEach(this.updateEdgeStyleByKey.bind(this));
  }

  private enableNodeDragging() {
    this.viewport.pause = true; // disable viewport dragging

    document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
    document.addEventListener('mouseup', this.onDocumentMouseUpBound, { once: true });
  }

  private onDocumentMouseMove(event: MouseEvent) {
    const eventPosition = new PIXI.Point(event.offsetX, event.offsetY);
    const worldPosition = this.viewport.toWorld(eventPosition);

    if (this.mousedownNodeKey) {
      this.moveNode(this.mousedownNodeKey, worldPosition);
    }
  }

  private onDocumentMouseUp() {
    this.viewport.pause = false; // enable viewport dragging

    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);

    this.mousedownNodeKey = null;
    this.mousedownEdgeKey = null;
  }

  private createGraph() {
    this.graph.forEachNode(this.createNode.bind(this));
    this.graph.forEachEdge(this.createEdge.bind(this));
  }

  private createNode(nodeKey: string, nodeAttributes: NodeAttributes) {
    const node = new PixiNode();
    node.on('mousemove', (event: MouseEvent) => {
      this.emit('nodeMousemove', event, nodeKey);
    });
    node.on('mouseover', (event: MouseEvent) => {
      if (!this.mousedownNodeKey) {
        this.hoverNode(nodeKey);
      }
      this.emit('nodeMouseover', event, nodeKey);
    });
    node.on('mouseout', (event: MouseEvent) => {
      if (!this.mousedownNodeKey) {
        this.unhoverNode(nodeKey);
      }
      this.emit('nodeMouseout', event, nodeKey);
    });
    node.on('mousedown', (event: MouseEvent) => {
      this.mousedownNodeKey = nodeKey;
      this.enableNodeDragging();
      this.emit('nodeMousedown', event, nodeKey);
    });
    node.on('mouseup', (event: MouseEvent) => {
      this.emit('nodeMouseup', event, nodeKey);
      // why native click event doesn't work?
      if (this.mousedownNodeKey === nodeKey) {
        this.emit('nodeClick', event, nodeKey);
      }
    });
    this.nodeLayer.addChild(node.nodeGfx);
    this.nodeLabelLayer.addChild(node.nodeLabelGfx);
    this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
    this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
    this.nodeKeyToNodeObject.set(nodeKey, node);

    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private createEdge(edgeKey: string, edgeAttributes: EdgeAttributes, sourceNodeKey: string, targetNodeKey: string, sourceNodeAttributes: NodeAttributes, targetNodeAttributes: NodeAttributes) {
    const edge = new PixiEdge();
    edge.on('mousemove', (event: MouseEvent) => {
      this.emit('edgeMousemove', event, edgeKey);
    });
    edge.on('mouseover', (event: MouseEvent) => {
      this.hoverEdge(edgeKey);
      this.emit('edgeMouseover', event, edgeKey);
    });
    edge.on('mouseout', (event: MouseEvent) => {
      this.unhoverEdge(edgeKey);
      this.emit('edgeMouseout', event, edgeKey);
    });
    edge.on('mousedown', (event: MouseEvent) => {
      this.mousedownEdgeKey = edgeKey;
      this.emit('edgeMousedown', event, edgeKey);
    });
    edge.on('mouseup', (event: MouseEvent) => {
      this.emit('edgeMouseup', event, edgeKey);
      // why native click event doesn't work?
      if (this.mousedownEdgeKey === edgeKey) {
        this.emit('edgeClick', event, edgeKey);
      }
    });
    this.edgeLayer.addChild(edge.edgeGfx);
    this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
    this.edgeKeyToEdgeObject.set(edgeKey, edge);

    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private dropNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    
    this.nodeLayer.removeChild(node.nodeGfx);
    this.nodeLabelLayer.removeChild(node.nodeLabelGfx);
    this.frontNodeLayer.removeChild(node.nodePlaceholderGfx);
    this.frontNodeLabelLayer.removeChild(node.nodeLabelPlaceholderGfx);
    this.nodeKeyToNodeObject.delete(nodeKey);
  }

  private dropEdge(edgeKey: string) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    
    this.edgeLayer.removeChild(edge.edgeGfx);
    this.frontEdgeLayer.removeChild(edge.edgePlaceholderGfx);
    this.edgeKeyToEdgeObject.delete(edgeKey);
  }

  private updateNodeStyleByKey(nodeKey: string) {
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private updateNodeStyle(nodeKey: string, nodeAttributes: NodeAttributes) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    
    const nodePosition = { x: nodeAttributes.x, y: nodeAttributes.y };
    node.updatePosition(nodePosition);

    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, node.hovered ? this.hoverStyle.node : undefined];
    const nodeStyle = resolveStyleDefinitions(nodeStyleDefinitions, nodeAttributes);
    node.updateStyle(nodeStyle, this.textureCache);
  }

  private updateEdgeStyleByKey(edgeKey: string) {
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private updateEdgeStyle(edgeKey: string, edgeAttributes: EdgeAttributes, _sourceNodeKey: string, _targetNodeKey: string, sourceNodeAttributes: NodeAttributes, targetNodeAttributes: NodeAttributes) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    // const sourceNode = this.nodeKeyToNodeObject.get(sourceNodeKey)!;
    // const targetNode = this.nodeKeyToNodeObject.get(targetNodeKey)!;

    const sourceNodePosition = { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y };
    const targetNodePosition = { x: targetNodeAttributes.x, y: targetNodeAttributes.y };
    edge.updatePosition(sourceNodePosition, targetNodePosition);

    const edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, edge.hovered ? this.hoverStyle.edge : undefined];
    const edgeStyle = resolveStyleDefinitions(edgeStyleDefinitions, edgeAttributes);
    edge.updateStyle(edgeStyle, this.textureCache);
  }

  private updateGraphVisibility() {
    // culling
    const cull = new Cull();
    cull.addAll((this.viewport.children as PIXI.Container[]).map(layer => layer.children).flat());
    cull.cull(this.app.renderer.screen);
    // console.log(
    //   Array.from((cull as any)._targetList as Set<PIXI.DisplayObject>).filter(x => x.visible === true).length,
    //   Array.from((cull as any)._targetList as Set<PIXI.DisplayObject>).filter(x => x.visible === false).length
    // );

    // levels of detail
    const zoom = this.viewport.scale.x;
    const zoomSteps = [0.1, 0.2, 0.4, Infinity];
    const zoomStep = zoomSteps.findIndex(zoomStep => zoom <= zoomStep);

    this.graph.forEachNode(nodeKey => {
      const node = this.nodeKeyToNodeObject.get(nodeKey)!;
      node.updateVisibility(zoomStep);
    });

    this.graph.forEachEdge(edgeKey => {
      const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
      edge.updateVisibility(zoomStep);
    });
  }
}