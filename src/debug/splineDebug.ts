import * as THREE from 'three';
import type { FixedMap } from '../terrain/FixedMap.ts';
import type { RiverField } from '../rivers/RiverField.ts';
import type { RoadNetwork } from '../roads/RoadNetwork.ts';
import type { ResidenceSystem } from '../residences/ResidenceSystem.ts';
import type { ResidenceTool } from '../residences/ResidenceTool.ts';
import type { RoadRenderer } from '../roads/RoadRenderer.ts';
import type { CameraController } from '../camera/CameraController.ts';

/**
 * Read-only debug/automation bridge exposed as `window.__splineDebug`.
 * Used by the capture harness (scripts/driveScene.mjs) to place content on
 * real road geometry and to frame deterministic beauty shots. It never
 * mutates game state.
 */
export type SplineDebugBridge = {
  version: 1;
  edges: () => Array<{
    id: string;
    startNodeId: string;
    endNodeId: string;
    width: number;
    path: Array<[number, number, number]>;
    length: number;
  }>;
  nodes: () => Array<{ id: string; x: number; y: number; z: number; junctionType: string }>;
  isWet: (x: number, z: number) => boolean;
  terrainHeight: (x: number, z: number) => number;
  project: (x: number, z: number) => { x: number; y: number; z: number } | null;
  frame: (x: number, z: number, yawDeg?: number, pitchDeg?: number, distance?: number) => void;
  residenceDraft: () => ReturnType<ResidenceTool['getDraft']>;
  stats: () => {
    roads: number;
    bridges: number;
    residences: number;
    frontages: number;
    fps: number;
    zoomPercent: number;
  };
};

export function installSplineDebug(options: {
  map: FixedMap;
  network: RoadNetwork;
  riverField: RiverField;
  residenceSystem: ResidenceSystem;
  residenceTool: ResidenceTool;
  roadRenderer: RoadRenderer;
  cameraController: CameraController;
  camera: THREE.PerspectiveCamera;
  getFps: () => number;
  getZoomPercent: () => number;
}): SplineDebugBridge {
  const {
    map,
    network,
    riverField,
    residenceSystem,
    residenceTool,
    roadRenderer,
    cameraController,
    camera,
    getFps,
    getZoomPercent,
  } = options;

  const bridge: SplineDebugBridge = {
    version: 1,
    edges: () => [...network.edges.values()].map((edge) => ({
      id: edge.id,
      startNodeId: edge.startNodeId,
      endNodeId: edge.endNodeId,
      width: edge.width,
      path: (edge.sampledPath.length >= 2 ? edge.sampledPath : edge.controlPoints)
        .map((point) => [point.x, point.y, point.z] as [number, number, number]),
      length: edge.length,
    })),
    nodes: () => [...network.nodes.values()].map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      z: node.position.z,
      junctionType: node.junctionType,
    })),
    isWet: (x, z) => riverField.isRenderedWetAt(x, z),
    terrainHeight: (x, z) => map.getHeightAt(x, z),
    project: (x, z) => {
      const point = new THREE.Vector3(x, map.getHeightAt(x, z), z);
      point.project(camera);
      if (point.z < -1 || point.z > 1) return null;
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      return {
        x: (point.x * 0.5 + 0.5) * width,
        y: (-point.y * 0.5 + 0.5) * height,
        z: point.z,
      };
    },
    residenceDraft: () => residenceTool.getDraft(),
    frame: (x, z, yawDeg = -38, pitchDeg = 14, distance = 70) => {
      cameraController.applyShowcaseView(x, z, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg), distance);
    },
    stats: () => {
      const bridges = [...network.edges.values()]
        .reduce((total, edge) => total + (edge.materialData?.bridgeSpans?.length ?? 0), 0);
      return {
        roads: network.edges.size,
        bridges,
        residences: residenceSystem.getResidenceCount(),
        frontages: residenceSystem.getZoneCount(),
        fps: getFps(),
        zoomPercent: getZoomPercent(),
      };
    },
  };

  (window as unknown as { __splineDebug: SplineDebugBridge }).__splineDebug = bridge;
  return bridge;
}
