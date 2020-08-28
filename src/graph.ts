import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { Cull } from '@pixi-essentials/cull';
import * as Graphology from 'graphology-types';
import * as ResourceLoader from 'resource-loader';
import { BaseNodeAttributes, BaseEdgeAttributes } from './attributes';
import { colorToPixi } from './color';
import { GraphStyle, GraphStyleDefinition, resolveStyleDefinitions } from './style';
import { TextType, textToPixi } from './text';
import { TextureCache } from './textures';

const WHITE = 0xffffff;

const DELIMETER = '::';
const NODE_CIRCLE = 'NODE_CIRCLE';
const NODE_CIRCLE_BORDER = 'NODE_CIRCLE_BORDER';
const NODE_ICON = 'NODE_ICON';
const NODE_LABEL_BACKGROUND = 'NODE_LABEL_BACKGROUND';
const NODE_LABEL_TEXT = 'NODE_LABEL_TEXT';
const EDGE_LINE = 'EDGE_LINE';

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
  renderRequestId: number | null = null;

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
      autoStart: false // disable automatic rendering by ticker, render manually instead, only when needed
    });
    this.container.appendChild(this.app.view);

    this.app.view.addEventListener('wheel', event => { event.preventDefault() });
    // this.app.renderer.on('postrender', () => { console.log('render'); });

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

    this.resizeObserver = new ResizeObserver(() => {
      if (this.nodeKeyToNodeLabelGfx.size > 0) {
        this.app.resize();
        this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);
        this.updateGraphVisibility();
        this.requestRender();
      }
    });
    this.resizeObserver.observe(this.container);

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

    // preload resources
    if (this.resources) {
      this.app.loader.add(this.resources);
    }
    this.app.loader.load(() => {
      this.render();
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

  private render() {
    // initial draw
    this.createGraph();
    this.updateGraphStyle();
    this.requestRender();
    this.resetViewport();

    this.viewport.on('frame-end', () => {
      if (this.viewport.dirty) {
        this.updateGraphVisibility();
        this.requestRender();
        this.viewport.dirty = false;
      }
    });
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
    this.requestRender();
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
    this.requestRender();
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
    const sourceNodeAttributes = this.graph.getNodeAttributes(this.graph.source(edgeKey));
    const targetNodeAttributes = this.graph.getNodeAttributes(this.graph.target(edgeKey));
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeAttributes, targetNodeAttributes);
    this.requestRender();
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
    const sourceNodeAttributes = this.graph.getNodeAttributes(this.graph.source(edgeKey));
    const targetNodeAttributes = this.graph.getNodeAttributes(this.graph.target(edgeKey));
    this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeAttributes, targetNodeAttributes);
    this.requestRender();
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
    this.graph.forEachEdge(nodeKey, (edgeKey, edgeAttributes, _sourceNodeKey, _targetNodeKey, sourceNodeAttributes, targetNodeAttributes) => {
      this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeAttributes, targetNodeAttributes);
    });
    this.requestRender();
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

    // nodeGfx -> nodeCircle
    const nodeCircle = new PIXI.Sprite();
    nodeCircle.name = NODE_CIRCLE;
    nodeCircle.anchor.set(0.5);
    nodeGfx.addChild(nodeCircle);

    // nodeGfx -> nodeCircleBorder
    const nodeCircleBorder = new PIXI.Sprite();
    nodeCircleBorder.name = NODE_CIRCLE_BORDER;
    nodeCircleBorder.anchor.set(0.5);
    nodeGfx.addChild(nodeCircleBorder);

    // nodeGfx -> nodeIcon
    const nodeIcon = new PIXI.Sprite();
    nodeIcon.name = NODE_ICON;
    nodeIcon.anchor.set(0.5);
    nodeGfx.addChild(nodeIcon);

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

    // nodeLabelGfx -> nodeLabelBackground
    const nodeLabelBackground = new PIXI.Sprite(PIXI.Texture.WHITE);
    nodeLabelBackground.name = NODE_LABEL_BACKGROUND;
    nodeLabelBackground.anchor.set(0.5);
    nodeLabelGfx.addChild(nodeLabelBackground);

    // nodeLabelGfx -> nodeLabelText
    const nodeLabelText = new PIXI.Sprite();
    nodeLabelText.name = NODE_LABEL_TEXT;
    nodeLabelText.anchor.set(0.5);
    nodeLabelGfx.addChild(nodeLabelText);
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

    // edgeGfx -> edgeLine
    const edgeLine = new PIXI.Sprite(PIXI.Texture.WHITE);
    edgeLine.name = EDGE_LINE;
    edgeLine.anchor.set(0.5, 0);
    edgeGfx.addChild(edgeLine);
  }

  private updateGraphStyle() {
    this.graph.forEachNode((nodeKey, nodeAttributes) => {
      this.updateNodeStyle(nodeKey, nodeAttributes);
    });

    this.graph.forEachEdge((edgeKey, edgeAttributes, _sourceNodeKey, _targetNodeKey, sourceNodeAttributes, targetNodeAttributes) => {
      this.updateEdgeStyle(edgeKey, edgeAttributes, sourceNodeAttributes, targetNodeAttributes);
    });
  }

  private updateNodeStyle(nodeKey: string, nodeAttributes: NodeAttributes) {
    const hover = this.hoveredNodeKey === nodeKey;
    const nodeStyleDefinitions = [DEFAULT_STYLE.node, this.style.node, hover ? this.hoverStyle.node : undefined];
    const nodeStyle = resolveStyleDefinitions<GraphStyle['node'], NodeAttributes>(nodeStyleDefinitions, nodeAttributes);
    const nodeOuterSize = nodeStyle.size + nodeStyle.border.width;

    // nodeGfx
    const nodeGfx = this.nodeKeyToNodeGfx.get(nodeKey)!;
    nodeGfx.x = nodeAttributes.x;
    nodeGfx.y = nodeAttributes.y;
    nodeGfx.hitArea = new PIXI.Circle(0, 0, nodeOuterSize);

    // nodeGfx -> nodeCircle
    const nodeCircle = nodeGfx.getChildByName(NODE_CIRCLE) as PIXI.Sprite;
    const nodeCircleTextureKey = [NODE_CIRCLE, nodeStyle.size].join(DELIMETER);
    const nodeCircleTexture = this.textureCache.get(nodeCircleTextureKey, () => {
      const graphics = new PIXI.Graphics();
      graphics.beginFill(WHITE);
      graphics.drawCircle(nodeStyle.size, nodeStyle.size, nodeStyle.size);
      return graphics;
    });
    nodeCircle.texture = nodeCircleTexture;
    [nodeCircle.tint, nodeCircle.alpha] = colorToPixi(nodeStyle.color);

    // nodeGfx -> nodeCircleBorder
    const nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER) as PIXI.Sprite;
    const nodeCircleBorderTextureKey = [NODE_CIRCLE_BORDER, nodeStyle.size, nodeStyle.border.width].join(DELIMETER);
    const nodeCircleBorderTexture = this.textureCache.get(nodeCircleBorderTextureKey, () => {
      const graphics = new PIXI.Graphics();
      graphics.lineStyle(nodeStyle.border.width, WHITE);
      graphics.drawCircle(nodeOuterSize, nodeOuterSize, nodeStyle.size);
      return graphics;
    });
    nodeCircleBorder.texture = nodeCircleBorderTexture;
    [nodeCircleBorder.tint, nodeCircleBorder.alpha] = colorToPixi(nodeStyle.border.color);

    // nodeGfx -> nodeIcon
    const nodeIcon = nodeGfx.getChildByName(NODE_ICON) as PIXI.Sprite;
    const nodeIconTextureKey = [NODE_ICON, nodeStyle.icon.fontFamily, nodeStyle.icon.fontSize, nodeStyle.icon.content].join(DELIMETER);
    const nodeIconTexture = this.textureCache.get(nodeIconTextureKey, () => {
      const text = textToPixi(nodeStyle.icon.type, nodeStyle.icon.content, {
        fontFamily: nodeStyle.icon.fontFamily,
        fontSize: nodeStyle.icon.fontSize
      });
      return text;
    });
    nodeIcon.texture = nodeIconTexture;
    [nodeIcon.tint, nodeIcon.alpha] = colorToPixi(nodeStyle.icon.color);
    nodeGfx.addChild(nodeIcon);

    // nodeLabelGfx
    const nodeLabelGfx = this.nodeKeyToNodeLabelGfx.get(nodeKey)!;
    nodeLabelGfx.x = nodeAttributes.x;
    nodeLabelGfx.y = nodeAttributes.y;

    // nodeLabelGfx -> nodeLabelText
    const nodeLabelText = nodeLabelGfx.getChildByName(NODE_LABEL_TEXT) as PIXI.Sprite;
    const nodeLabelTextTextureKey = [NODE_LABEL_TEXT, nodeStyle.label.fontFamily, nodeStyle.label.fontSize, nodeStyle.label.content].join(DELIMETER);
    const nodeLabelTextTexture = this.textureCache.get(nodeLabelTextTextureKey, () => {
      const text = textToPixi(nodeStyle.label.type, nodeStyle.label.content, {
        fontFamily: nodeStyle.label.fontFamily,
        fontSize: nodeStyle.label.fontSize
      });
      return text;
    });
    nodeLabelText.texture = nodeLabelTextTexture;
    nodeLabelText.y = nodeOuterSize + (nodeLabelTextTexture.height + nodeStyle.label.padding * 2) / 2;
    [nodeLabelText.tint, nodeLabelText.alpha] = colorToPixi(nodeStyle.label.color);

    // nodeLabelGfx -> nodeLabelBackground
    const nodeLabelBackground = nodeLabelGfx.getChildByName(NODE_LABEL_BACKGROUND) as PIXI.Sprite;
    nodeLabelBackground.y = nodeOuterSize + (nodeLabelTextTexture.height + nodeStyle.label.padding * 2) / 2;
    nodeLabelBackground.width = nodeLabelTextTexture.width + nodeStyle.label.padding * 2;
    nodeLabelBackground.height = nodeLabelTextTexture.height + nodeStyle.label.padding * 2;
    [nodeLabelBackground.tint, nodeLabelBackground.alpha] = colorToPixi(nodeStyle.label.backgroundColor);
  }

  private updateEdgeStyle(edgeKey: string, edgeAttributes: EdgeAttributes, sourceNodeAttributes: NodeAttributes, targetNodeAttributes: NodeAttributes) {
    const hover = this.hoveredEdgeKey === edgeKey;
    const edgeStyleDefinitions = [DEFAULT_STYLE.edge, this.style.edge, hover ? this.hoverStyle.edge : undefined];
    const edgeStyle = resolveStyleDefinitions<GraphStyle['edge'], EdgeAttributes>(edgeStyleDefinitions, edgeAttributes);
    const edgeRotation = -Math.atan2(targetNodeAttributes.x - sourceNodeAttributes.x, targetNodeAttributes.y - sourceNodeAttributes.y);
    const edgeLength = Math.hypot(targetNodeAttributes.x - sourceNodeAttributes.x, targetNodeAttributes.y - sourceNodeAttributes.y);

    // edgeGfx
    const edgeGfx = this.edgeKeyToEdgeGfx.get(edgeKey)!;
    edgeGfx.x = sourceNodeAttributes.x;
    edgeGfx.y = sourceNodeAttributes.y;
    edgeGfx.rotation = edgeRotation;

    // edgeGfx -> edgeLine
    const edgeLine = edgeGfx.getChildByName(EDGE_LINE) as PIXI.Sprite;
    edgeLine.width = edgeStyle.width;
    edgeLine.height = edgeLength;
    [edgeLine.tint, edgeLine.alpha] = colorToPixi(edgeStyle.color);
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
      const nodeCircleBorder = nodeGfx.getChildByName(NODE_CIRCLE_BORDER) as PIXI.Sprite;
      const nodeIcon = nodeGfx.getChildByName(NODE_ICON) as PIXI.Sprite;
      const nodeLabelGfx = this.nodeKeyToNodeLabelGfx.get(nodeKey)!;
      const nodeLabelBackground = nodeLabelGfx.getChildByName(NODE_LABEL_BACKGROUND) as PIXI.Sprite;
      const nodeLabelText = nodeLabelGfx.getChildByName(NODE_LABEL_TEXT) as PIXI.BitmapText;

      nodeCircleBorder.visible = nodeCircleBorder.visible && zoomStep >= 1;
      nodeIcon.visible = nodeIcon.visible && zoomStep >= 2;
      nodeLabelBackground.visible = nodeLabelBackground.visible && zoomStep >= 3;
      nodeLabelText.visible = nodeLabelText.visible && zoomStep >= 3;
    });

    this.graph.forEachEdge(edgeKey => {
      const edgeGfx = this.edgeKeyToEdgeGfx.get(edgeKey)!;
      const edgeLine = edgeGfx.getChildByName(EDGE_LINE) as PIXI.Sprite;

      edgeLine.visible = edgeLine.visible && zoomStep >= 1;
    });
  }

  private requestRender() {
    if (this.renderRequestId) {
      return;
    }

    this.renderRequestId = window.requestAnimationFrame(() => {
      this.app.render();
      this.renderRequestId = null;
    });
  }

  destroy() {
    if (this.renderRequestId) {
      window.cancelAnimationFrame(this.renderRequestId);
      this.renderRequestId = null;
    }

    this.resizeObserver.disconnect();
    this.resizeObserver = undefined!;

    this.textureCache.destroy();
    this.textureCache = undefined!;

    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
    this.app = undefined!;
  }
}