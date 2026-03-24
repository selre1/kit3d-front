declare module "three-legacy" {
  export * from "three";
}

declare module "three-legacy/examples/jsm/controls/OrbitControls.js" {
  export class OrbitControls {
    constructor(object: unknown, domElement?: HTMLElement);
    enabled: boolean;
    autoRotate: boolean;
    enableDamping: boolean;
    dampingFactor: number;
    rotateSpeed: number;
    zoomSpeed: number;
    panSpeed: number;
    screenSpacePanning: boolean;
    minDistance: number;
    maxDistance: number;
    target: {
      x: number;
      y: number;
      z: number;
      copy(value: { x: number; y: number; z: number }): unknown;
      set(x: number, y: number, z: number): unknown;
    };
    update(): void;
    dispose(): void;
    addEventListener(type: string, listener: (...args: unknown[]) => void): void;
    removeEventListener(type: string, listener: (...args: unknown[]) => void): void;
  }
}
