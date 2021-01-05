import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
import * as Graphology from 'graphology-types';
import * as ResourceLoader from 'resource-loader';
import { EventEmitter } from 'events';
import { GraphStyleDefinition, NodeStyle, EdgeStyle, resolveStyleDefinitions } from './utils/style';
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

export class PixiGraph<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> extends EventEmitter {
  container: HTMLElement;
  graph: Graphology.AbstractGraph<NodeAttributes, EdgeAttributes>;
  style: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  hoverStyle: GraphStyleDefinition<NodeAttributes, EdgeAttributes>;
  resources?: ResourceLoader.IAddOptions[];

  app: PIXI.Application;
  textureCache: TextureCache;
  viewport: Viewport;
  resizeObserver: ResizeObserver;
  edgeLayer: PIXI.Container;
  frontEdgeLayer: PIXI.Container;
  nodeLayer: PIXI.Container;
  nodeLabelLayer: PIXI.Container;
  frontNodeLayer: PIXI.Container;
  frontNodeLabelLayer: PIXI.Container;
  nodeKeyToNodeObject = new Map<string, PixiNode>();
  edgeKeyToEdgeObject = new Map<string, PixiEdge>();

  mousedownNodeKey: string | null = null;
  mousedownEdgeKey: string | null = null;

  onDocumentMouseMoveBound = this.onDocumentMouseMove.bind(this);
  onDocumentMouseUpBound = this.onDocumentMouseUp.bind(this);

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

    // normalize node positions
    const nodesAttributes = this.graph.nodes().map(nodeKey => this.graph.getNodeAttributes(nodeKey));
    const nodesX = nodesAttributes.map(nodeAttributes => nodeAttributes.x);
    const nodesY = nodesAttributes.map(nodeAttributes => nodeAttributes.y);
    const minNodeX = Math.min(...nodesX);
    const maxNodeX = Math.max(...nodesX);
    const minNodeY = Math.min(...nodesY);
    const maxNodeY = Math.max(...nodesY);
    const graphWidth = Math.abs(maxNodeX - minNodeX);
    const graphHeight = Math.abs(maxNodeY - minNodeY);
    const worldWidth = Math.max(this.container.clientWidth * 2, graphWidth * 1.1);
    const worldHeight = Math.max(this.container.clientHeight * 2, graphHeight * 1.1);
    // const worldWidth = this.container.clientWidth;
    // const worldHeight = this.container.clientHeight;
    // console.log(this.container.clientWidth, this.container.clientHeight, graphWidth, graphHeight, worldWidth, worldHeight);
    this.graph.forEachNode((nodeKey, nodeAttributes) => {
      this.graph.setNodeAttribute(nodeKey, 'x', nodeAttributes.x - minNodeX - graphWidth / 2 + worldWidth / 2);
      this.graph.setNodeAttribute(nodeKey, 'y', nodeAttributes.y - minNodeY - graphHeight / 2 + worldHeight / 2);
    });

    // create PIXI application
    this.app = new PIXI.Application({
      resizeTo: this.container,
      resolution: window.devicePixelRatio,
      transparent: true,
      antialias: true,
      autoDensity: true,
    });
    this.container.appendChild(this.app.view);

    this.app.view.addEventListener('wheel', event => { event.preventDefault() });

    this.textureCache = new TextureCache(this.app);

    // create PIXI viewport
    this.viewport = new Viewport({
      screenWidth: this.container.clientWidth,
      screenHeight: this.container.clientHeight,
      worldWidth: worldWidth,
      worldHeight: worldHeight,
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
      this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);
      this.updateGraphVisibility();
    });

    // preload resources
    if (this.resources) {
      this.app.loader.add(this.resources);
    }
    this.app.loader.load(() => {
      // initial draw
      this.createGraph();
      this.updateGraphStyle();
      this.resetViewport();

      this.viewport.on('frame-end', () => {
        if (this.viewport.dirty) {
          this.updateGraphVisibility();
          this.viewport.dirty = false;
        }
      });

      this.resizeObserver.observe(this.container);
    });
  }

  zoomIn() {
    this.viewport.zoom(-this.viewport.worldWidth / 10, true);
  }

  zoomOut() {
    this.viewport.zoom(this.viewport.worldWidth / 10, true);
  }

  resetViewport() {
    this.viewport.center = new PIXI.Point(this.viewport.worldWidth / 2, this.viewport.worldHeight / 2);
    this.viewport.fitWorld(true);
  }

  private hoverNode(nodeKey: string) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    if (node.hovered) {
      return;
    }

    // update style
    node.hovered = true;
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);

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
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);

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
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);

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
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);

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
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);
    this.graph.forEachEdge(nodeKey, (edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes) => {
      if (sourceNodeKey === nodeKey || targetNodeKey === nodeKey) {
        this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
      }
    });
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
    this.graph.forEachNode(nodeKey => {
      this.createNode(nodeKey);
    });

    this.graph.forEachEdge(edgeKey => {
      this.createEdge(edgeKey);
    });
  }

  private createNode(nodeKey: string) {
    const node = new PixiNode();
    node.on('mouseover', () => {
      if (!this.mousedownNodeKey) {
        this.hoverNode(nodeKey);
      }
      this.emit('nodeMouseover', nodeKey);
    });
    node.on('mouseout', () => {
      if (!this.mousedownNodeKey) {
        this.unhoverNode(nodeKey);
      }
      this.emit('nodeMouseout', nodeKey);
    });
    node.on('mousedown', () => {
      this.mousedownNodeKey = nodeKey;
      this.enableNodeDragging();
      this.emit('nodeMousedown', nodeKey);
    });
    node.on('mouseup', () => {
      this.emit('nodeMouseup', nodeKey);
      // why native click event doesn't work?
      if (this.mousedownNodeKey === nodeKey) {
        this.emit('nodeClick', nodeKey);
      }
    });
    this.nodeLayer.addChild(node.nodeGfx);
    this.nodeLabelLayer.addChild(node.nodeLabelGfx);
    this.frontNodeLayer.addChild(node.nodePlaceholderGfx);
    this.frontNodeLabelLayer.addChild(node.nodeLabelPlaceholderGfx);
    this.nodeKeyToNodeObject.set(nodeKey, node);
  }

  private createEdge(edgeKey: string) {
    const edge = new PixiEdge();
    edge.on('mouseover', () => {
      this.hoverEdge(edgeKey);
      this.emit('edgeMouseover', edgeKey);
    });
    edge.on('mouseout', () => {
      this.unhoverEdge(edgeKey);
      this.emit('edgeMouseout', edgeKey);
    });
    edge.on('mousedown', () => {
      this.mousedownEdgeKey = edgeKey;
      this.emit('edgeMousedown', edgeKey);
    });
    edge.on('mouseup', () => {
      this.emit('edgeMouseup', edgeKey);
      // why native click event doesn't work?
      if (this.mousedownEdgeKey === edgeKey) {
        this.emit('edgeClick', edgeKey);
      }
    });
    this.edgeLayer.addChild(edge.edgeGfx);
    this.frontEdgeLayer.addChild(edge.edgePlaceholderGfx);
    this.edgeKeyToEdgeObject.set(edgeKey, edge);
  }

  private updateGraphStyle() {
    this.graph.forEachNode((nodeKey, nodeAttributes) => {
      this.updateNodeStyle(nodeKey, nodeAttributes);
    });

    this.graph.forEachEdge((edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes) => {
      this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
    });
  }

  private updateNodeStyle(nodeKey: string, nodeAttributes: NodeAttributes) {
    const node = this.nodeKeyToNodeObject.get(nodeKey)!;
    
    const nodePosition = { x: nodeAttributes.x, y: nodeAttributes.y };
    node.updatePosition(nodePosition);

    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, node.hovered ? this.hoverStyle.node : undefined];
    const nodeStyle = resolveStyleDefinitions<NodeStyle, NodeAttributes>(nodeStyleDefinitions, nodeAttributes);
    node.updateStyle(nodeStyle, this.textureCache);
  }

  private updateEdgeStyle(edgeKey: string, edgeAttributes: EdgeAttributes, _sourceNodeKey: string, _targetNodeKey: string, sourceNodeAttributes: NodeAttributes, targetNodeAttributes: NodeAttributes) {
    const edge = this.edgeKeyToEdgeObject.get(edgeKey)!;
    // const sourceNode = this.nodeKeyToNodeObject.get(sourceNodeKey)!;
    // const targetNode = this.nodeKeyToNodeObject.get(targetNodeKey)!;

    const sourceNodePosition = { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y };
    const targetNodePosition = { x: targetNodeAttributes.x, y: targetNodeAttributes.y };
    edge.updatePosition(sourceNodePosition, targetNodePosition);

    const edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, edge.hovered ? this.hoverStyle.edge : undefined];
    const edgeStyle = resolveStyleDefinitions<EdgeStyle, EdgeAttributes>(edgeStyleDefinitions, edgeAttributes);
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

  destroy() {
    this.resizeObserver.disconnect();
    this.resizeObserver = undefined!;

    this.textureCache.destroy();
    this.textureCache = undefined!;

    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
    this.app = undefined!;
  }
}