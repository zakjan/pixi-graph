import { Attributes } from 'graphology-types';

export type BaseAttributes = Attributes;
export type BaseNodeAttributes = BaseAttributes & { x: number, y: number };
export type BaseEdgeAttributes = BaseAttributes;