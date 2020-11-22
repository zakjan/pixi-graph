import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
import * as Graphology from 'graphology-types';
import * as ResourceLoader from 'resource-loader';
import { BaseNodeAttributes, BaseEdgeAttributes } from './attributes';
import { GraphStyleDefinition, NodeStyle, EdgeStyle, resolveStyleDefinitions } from './style';
import { TextType } from './text';
import { TextureCache } from './textures';
import { createNode, updateNodeStyle, updateNodeVisibility } from './renderers/node';
import { createNodeLabel, updateNodeLabelStyle, updateNodeLabelVisibility } from './renderers/node-label';
import { createEdge, updateEdgeStyle, updateEdgeVisibility } from './renderers/edge';

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

export class PixiGraph<NodeAttributes extends BaseNodeAttributes = BaseNodeAttributes, EdgeAttributes extends BaseEdgeAttributes = BaseEdgeAttributes> {
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
  nodeKeyToNodeGfx = new Map<string, PIXI.Container>();
  nodeKeyToNodeLabelGfx = new Map<string, PIXI.Container>();
  edgeKeyToEdgeGfx = new Map<string, PIXI.Container>();

  // event state
  hoveredNodeKey: string | null = null;
  hoveredNodeIndex: number | null = null;
  clickedNodeKey: string | null = null;
  hoveredEdgeKey: string | null = null;
  hoveredEdgeIndex: number | null = null;

  onDocumentMouseMoveBound = this.onDocumentMouseMove.bind(this);

  constructor(options: GraphOptions<NodeAttributes, EdgeAttributes>) {
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

  private onHoverNode(nodeKey: string) {
    if (this.clickedNodeKey) {
      return;
    }
    if (this.hoveredNodeKey === nodeKey) {
      return;
    }

    this.hoveredNodeKey = nodeKey;

    const nodeGfx = this.nodeKeyToNodeGfx.get(nodeKey)!;
    const nodeLabelGfx = this.nodeKeyToNodeLabelGfx.get(nodeKey)!;

    this.hoveredNodeIndex = this.nodeLayer.getChildIndex(nodeGfx);

    // move to front
    this.nodeLayer.removeChild(nodeGfx);
    this.nodeLabelLayer.removeChild(nodeLabelGfx);
    this.frontNodeLayer.addChild(nodeGfx);
    this.frontNodeLabelLayer.addChild(nodeLabelGfx);

    // update style
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private onUnhoverNode(nodeKey: string) {
    if (this.clickedNodeKey) {
      return;
    }
    if (this.hoveredNodeKey !== nodeKey) {
      return;
    }

    this.hoveredNodeKey = null;

    const nodeGfx = this.nodeKeyToNodeGfx.get(nodeKey)!;
    const nodeLabelGfx = this.nodeKeyToNodeLabelGfx.get(nodeKey)!;

    // move back
    this.frontNodeLayer.removeChild(nodeGfx);
    this.frontNodeLabelLayer.removeChild(nodeLabelGfx);
    this.nodeLayer.addChildAt(nodeGfx, this.hoveredNodeIndex!);
    this.nodeLabelLayer.addChildAt(nodeLabelGfx, this.hoveredNodeIndex!);

    this.hoveredNodeIndex = null;

    // update style
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);
  }

  private onHoverEdge(edgeKey: string) {
    if (this.hoveredEdgeKey === edgeKey) {
      return;
    }

    this.hoveredEdgeKey = edgeKey;

    const edgeGfx = this.edgeKeyToEdgeGfx.get(edgeKey)!;

    this.hoveredEdgeIndex = this.edgeLayer.getChildIndex(edgeGfx);

    // move to front
    this.edgeLayer.removeChild(edgeGfx);
    this.frontEdgeLayer.addChild(edgeGfx);

    // update style
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private onUnhoverEdge(edgeKey: string) {
    if (this.hoveredEdgeKey !== edgeKey) {
      return;
    }

    this.hoveredEdgeKey = null;

    const edgeGfx = this.edgeKeyToEdgeGfx.get(edgeKey)!;

    // move back
    this.frontEdgeLayer.removeChild(edgeGfx);
    this.edgeLayer.addChildAt(edgeGfx, this.hoveredEdgeIndex!);

    this.hoveredEdgeIndex = null;

    // update style
    const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
    const sourceNodeKey = this.graph.source(edgeKey);
    const targetNodeKey = this.graph.target(edgeKey);
    const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
    const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
  }

  private onClickNode(nodeKey: string) {
    this.clickedNodeKey = nodeKey;

    // enable node dragging
    document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
    // disable viewport dragging
    this.viewport.pause = true;
  }

  private onUnclickNode() {
    this.clickedNodeKey = null;

    // disable node dragging
    document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);
    // enable viewport dragging
    this.viewport.pause = false;
  }

  private moveNode(nodeKey: string, point: PIXI.Point) {
    this.graph.setNodeAttribute(nodeKey, 'x', point.x);
    this.graph.setNodeAttribute(nodeKey, 'y', point.y);

    // update style
    const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
    this.updateNodeStyle(nodeKey, nodeAttributes);
    this.graph.forEachEdge(nodeKey, (edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes) => {
      this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeKey, targetNodeKey, sourceNodeAttributes, targetNodeAttributes);
    });
  }

  private onDocumentMouseMove(event: MouseEvent) {
    if (!this.clickedNodeKey) {
      return;
    }

    const eventPosition = new PIXI.Point(event.clientX, event.clientY);
    const worldPosition = this.viewport.toWorld(eventPosition);
    this.moveNode(this.clickedNodeKey, worldPosition);
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
    // nodeGfx
    const nodeGfx = new PIXI.Container();
    nodeGfx.name = nodeKey;
    nodeGfx.interactive = true;
    nodeGfx.buttonMode = true;
    nodeGfx.on('mouseover', (event: PIXI.InteractionEvent) => this.onHoverNode(event.currentTarget.name));
    nodeGfx.on('mouseout', (event: PIXI.InteractionEvent) => this.onUnhoverNode(event.currentTarget.name));
    nodeGfx.on('mousedown', (event: PIXI.InteractionEvent) => this.onClickNode(event.currentTarget.name));
    nodeGfx.on('mouseup', () => this.onUnclickNode());
    nodeGfx.on('mouseupoutside', () => this.onUnclickNode());
    this.nodeLayer.addChild(nodeGfx);
    this.nodeKeyToNodeGfx.set(nodeKey, nodeGfx);
    createNode(nodeGfx);

    // nodeLabelGfx
    const nodeLabelGfx = new PIXI.Container();
    nodeLabelGfx.name = nodeKey;
    nodeLabelGfx.interactive = true;
    nodeLabelGfx.buttonMode = true;
    nodeLabelGfx.on('mouseover', (event: PIXI.InteractionEvent) => this.onHoverNode(event.currentTarget.name));
    nodeLabelGfx.on('mouseout', (event: PIXI.InteractionEvent) => this.onUnhoverNode(event.currentTarget.name));
    nodeLabelGfx.on('mousedown', (event: PIXI.InteractionEvent) => this.onClickNode(event.currentTarget.name));
    nodeLabelGfx.on('mouseup', () => this.onUnclickNode());
    nodeLabelGfx.on('mouseupoutside', () => this.onUnclickNode());
    this.nodeLabelLayer.addChild(nodeLabelGfx);
    this.nodeKeyToNodeLabelGfx.set(nodeKey, nodeLabelGfx);
    createNodeLabel(nodeLabelGfx);
  }

  private createEdge(edgeKey: string) {
    // edgeGfx
    const edgeGfx = new PIXI.Container();
    edgeGfx.name = edgeKey;
    edgeGfx.interactive = true;
    edgeGfx.buttonMode = true;
    edgeGfx.on('mouseover', (event: PIXI.InteractionEvent) => this.onHoverEdge(event.currentTarget.name));
    edgeGfx.on('mouseout', (event: PIXI.InteractionEvent) => this.onUnhoverEdge(event.currentTarget.name));
    this.edgeLayer.addChild(edgeGfx);
    this.edgeKeyToEdgeGfx.set(edgeKey, edgeGfx);
    createEdge(edgeGfx);
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
    const hover = this.hoveredNodeKey === nodeKey;
    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, hover ? this.hoverStyle.node : undefined];
    const nodeStyle = resolveStyleDefinitions<NodeStyle, NodeAttributes>(nodeStyleDefinitions, nodeAttributes);

    // nodeGfx
    const nodeGfx = this.nodeKeyToNodeGfx.get(nodeKey)!;
    nodeGfx.x = nodeAttributes.x;
    nodeGfx.y = nodeAttributes.y;
    updateNodeStyle(nodeGfx, nodeStyle, this.textureCache);

    // nodeLabelGfx
    const nodeLabelGfx = this.nodeKeyToNodeLabelGfx.get(nodeKey)!;
    nodeLabelGfx.x = nodeAttributes.x;
    nodeLabelGfx.y = nodeAttributes.y;
    updateNodeLabelStyle(nodeLabelGfx, nodeStyle, this.textureCache);
  }

  private updateEdgeStyle(edgeKey: string, edgeAttributes: EdgeAttributes, sourceNodeKey: string, targetNodeKey: string, sourceNodeAttributes: NodeAttributes, targetNodeAttributes: NodeAttributes) {
    const hover = this.hoveredEdgeKey === edgeKey;
    const edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, hover ? this.hoverStyle.edge : undefined];
    const edgeStyle = resolveStyleDefinitions<EdgeStyle, EdgeAttributes>(edgeStyleDefinitions, edgeAttributes);

    // edgeGfx
    const edgeGfx = this.edgeKeyToEdgeGfx.get(edgeKey)!;
    edgeGfx.x = Math.min(sourceNodeAttributes.x, targetNodeAttributes.x);
    edgeGfx.y = Math.min(sourceNodeAttributes.y, targetNodeAttributes.y);
    edgeGfx.width = Math.abs(targetNodeAttributes.x - sourceNodeAttributes.x);
    edgeGfx.height = Math.abs(targetNodeAttributes.y - sourceNodeAttributes.y);
    const sourceNodeGfx = this.nodeKeyToNodeGfx.get(sourceNodeKey)!;
    const targetNodeGfx = this.nodeKeyToNodeGfx.get(targetNodeKey)!;
    updateEdgeStyle(edgeGfx, edgeStyle, sourceNodeGfx, targetNodeGfx, this.textureCache);
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
      const nodeGfx = this.nodeKeyToNodeGfx.get(nodeKey)!;
      updateNodeVisibility(nodeGfx, zoomStep);

      const nodeLabelGfx = this.nodeKeyToNodeLabelGfx.get(nodeKey)!;
      updateNodeLabelVisibility(nodeLabelGfx, zoomStep);
    });

    this.graph.forEachEdge(edgeKey => {
      const edgeGfx = this.edgeKeyToEdgeGfx.get(edgeKey)!;
      updateEdgeVisibility(edgeGfx, zoomStep);
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