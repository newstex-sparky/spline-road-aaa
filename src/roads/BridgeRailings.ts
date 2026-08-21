import * as THREE from 'three';

export const BRIDGE_RAILING_START_BLEND = 0.018;
const BAY_SPACING_M = 2.25;
export const BRIDGE_RAILING_EDGE_INSET = 0.18;
const POST_HEIGHT_M = 1.18;
const POST_ANCHOR_DEPTH_M = 0.16;
const POST_WIDTH_M = 0.18;
const CAP_WIDTH_M = 0.24;
const CAP_HEIGHT_M = 0.09;
const RAIL_HEIGHTS_M = [0.43, 0.94] as const;
const RAIL_OVERLAP_M = 0.06;
const LOCAL_RAIL_AXIS = new THREE.Vector3(0, 0, 1);

// --- Heavy timber construction detail -------------------------------------
// Chamfered cross-sections read as sawn timber instead of razor-sharp boxes.
// CylinderGeometry(..., 8, ...) yields an octagonal prism; the octagon is
// inscribed in a unit circle, so flat-to-flat is cos(22.5) of the nominal
// size. The scale correction keeps every outer dimension identical to the
// original box while adding 45-degree chamfers on the corners.
const OCTAGON_FLAT_TO_FLAT = Math.cos(Math.PI / 8);
const OCTAGON_SCALE = 1 / OCTAGON_FLAT_TO_FLAT;
/** Cross-section of the flat-top handrail prism (XY, unit square). */
const RAIL_SECTION: ReadonlyArray<readonly [number, number]> = [
  [-0.5, 0.5], [0.5, 0.5], [0.5, 0.12], [0.33, -0.5], [-0.33, -0.5], [-0.5, 0.12],
];
/** Lapped joint block straddling each post where a rail passes through. */
const JOINT_BLOCK_WIDTH = 0.26;
const JOINT_BLOCK_HEIGHT = 0.19;
const JOINT_BLOCK_DEPTH = 0.34;
/** Anchor block at each post foot, darkening the post/deck bearing. */
const FOOT_BLOCK_WIDTH = 0.3;
const FOOT_BLOCK_HEIGHT = 0.14;
const FOOT_BLOCK_DEPTH = 0.3;
/** Diagonal brace under the lower rail, one per bay, alternating pitch. */
const BRACE_THICKNESS = 0.05;
const BRACE_WIDTH = 0.07;
const BRACE_TOP_RAIL_Y = 0.4;
const BRACE_FOOT_Y = 0.16;
/** Shade factor for joinery blocks so joints read as shadowed timber. */
const DARK_JOINERY_FACTOR = 0.52;

let sharedJoineryMaterial: THREE.MeshStandardMaterial | null = null;

/**
 * Returns a shared, slightly darker clone of the bridge timber material used
 * for joint blocks, post feet, and bearing seats. The clone is created once
 * per page and references the same texture objects as the base material, so
 * in-place texture hydration keeps it in sync with the final textures.
 */
export function getBridgeJoineryMaterial(base: THREE.Material): THREE.Material {
  if (!(base instanceof THREE.MeshStandardMaterial)) return base;
  if (!sharedJoineryMaterial) {
    sharedJoineryMaterial = base.clone();
    sharedJoineryMaterial.name = 'Bridge timber joinery (dark)';
    sharedJoineryMaterial.color.multiplyScalar(DARK_JOINERY_FACTOR);
    sharedJoineryMaterial.roughness = 0.98;
  }
  return sharedJoineryMaterial;
}

export type BridgeRailingSection = {
  center: THREE.Vector3;
  leftDeck: THREE.Vector3;
  rightDeck: THREE.Vector3;
  bridgeBlend: number;
};

type RailingRun = {
  points: THREE.Vector3[];
};

export type BridgeRailingOptions = {
  /** Open the railing where the start of this edge enters a shared junction. */
  trimStart?: number;
  /** Open the railing where the end of this edge enters a shared junction. */
  trimEnd?: number;
};

/**
 * Builds sturdy timber guard rails from short surface-following bays. Posts
 * remain upright while each rail pitches and turns between neighboring deck
 * samples, matching the terrain-deformed construction used by burgage fences.
 * Posts, caps, and rails use chamfered cross-sections; every post carries a
 * dark lapped joint block at each rail and a dark foot block at its base, and
 * each bay gets an alternating diagonal brace under the lower rail so the
 * bridge reads as real heavy timber construction at close range.
 */
export function buildBridgeRailings(
  sections: readonly BridgeRailingSection[],
  material: THREE.Material,
  options: BridgeRailingOptions = {},
): THREE.Group | null {
  const runs = collectRailingRuns(sections, options);
  return buildTimberRailings(runs.map((run) => run.points), material);
}

/** Builds the same timber railing style along arbitrary open polylines. */
export function buildTimberRailings(
  paths: readonly (readonly THREE.Vector3[])[],
  material: THREE.Material,
  name = 'Bridge railings',
): THREE.Group | null {
  const runs = paths
    .map((path) => ({ points: resamplePolyline(path, BAY_SPACING_M) }))
    .filter((run) => run.points.length >= 2);
  if (runs.length === 0) return null;

  const postCount = runs.reduce((total, run) => total + run.points.length, 0);
  const railCount = runs.reduce(
    (total, run) => total + Math.max(0, run.points.length - 1) * RAIL_HEIGHTS_M.length,
    0,
  );
  const braceCount = runs.reduce(
    (total, run) => total + Math.max(0, run.points.length - 1),
    0,
  );
  const jointCount = postCount * (RAIL_HEIGHTS_M.length + 1);
  if (postCount === 0 || railCount === 0) return null;

  const group = new THREE.Group();
  group.name = name;
  group.userData.fpCollisionAllowStep = false;

  const postGeometry = buildOctagonPrismGeometry('y');
  const railGeometry = buildHandrailPrismGeometry();
  const braceGeometry = buildOctagonPrismGeometry('z');
  const joineryMaterial = getBridgeJoineryMaterial(material);

  const posts = new THREE.InstancedMesh(postGeometry, material, postCount);
  posts.name = 'Bridge railing posts';
  posts.castShadow = true;
  posts.receiveShadow = true;

  const rails = new THREE.InstancedMesh(railGeometry, material, railCount);
  rails.name = 'Bridge railing rails';
  rails.castShadow = true;
  rails.receiveShadow = true;

  const caps = new THREE.InstancedMesh(postGeometry, material, postCount);
  caps.name = 'Bridge railing post caps';
  caps.userData.fpNoCollision = true;
  caps.castShadow = true;
  caps.receiveShadow = true;

  const joints = new THREE.InstancedMesh(
    postGeometry,
    joineryMaterial,
    jointCount,
  );
  joints.name = 'Bridge railing joint blocks';
  joints.userData.fpNoCollision = true;
  joints.castShadow = true;
  joints.receiveShadow = true;

  const braces = new THREE.InstancedMesh(braceGeometry, material, braceCount);
  braces.name = 'Bridge railing diagonal braces';
  braces.userData.fpNoCollision = true;
  braces.castShadow = true;
  braces.receiveShadow = true;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const railStart = new THREE.Vector3();
  const railEnd = new THREE.Vector3();
  const railDirection = new THREE.Vector3();
  const braceTop = new THREE.Vector3();
  const braceFoot = new THREE.Vector3();
  const braceDirection = new THREE.Vector3();
  let postIndex = 0;
  let railIndex = 0;
  let jointIndex = 0;
  let braceIndex = 0;

  for (const run of runs) {
    for (const point of run.points) {
      quaternion.identity();
      position.set(
        point.x,
        point.y + (POST_HEIGHT_M - POST_ANCHOR_DEPTH_M) * 0.5,
        point.z,
      );
      scale.set(
        POST_WIDTH_M * OCTAGON_SCALE,
        POST_HEIGHT_M + POST_ANCHOR_DEPTH_M,
        POST_WIDTH_M * OCTAGON_SCALE,
      );
      matrix.compose(position, quaternion, scale);
      posts.setMatrixAt(postIndex, matrix);

      position.y = point.y + POST_HEIGHT_M + CAP_HEIGHT_M * 0.25;
      scale.set(CAP_WIDTH_M * OCTAGON_SCALE, CAP_HEIGHT_M, CAP_WIDTH_M * OCTAGON_SCALE);
      matrix.compose(position, quaternion, scale);
      caps.setMatrixAt(postIndex, matrix);

      // Lapped joint block at each rail height plus a foot block at the deck.
      for (const railHeight of RAIL_HEIGHTS_M) {
        position.set(point.x, point.y + railHeight, point.z);
        scale.set(
          JOINT_BLOCK_WIDTH * OCTAGON_SCALE,
          JOINT_BLOCK_HEIGHT,
          JOINT_BLOCK_DEPTH * OCTAGON_SCALE,
        );
        matrix.compose(position, quaternion, scale);
        joints.setMatrixAt(jointIndex, matrix);
        jointIndex += 1;
      }
      position.set(point.x, point.y + FOOT_BLOCK_HEIGHT * 0.5, point.z);
      scale.set(
        FOOT_BLOCK_WIDTH * OCTAGON_SCALE,
        FOOT_BLOCK_HEIGHT,
        FOOT_BLOCK_DEPTH * OCTAGON_SCALE,
      );
      matrix.compose(position, quaternion, scale);
      joints.setMatrixAt(jointIndex, matrix);
      jointIndex += 1;

      postIndex += 1;
    }

    for (let bayIndex = 0; bayIndex < run.points.length - 1; bayIndex++) {
      const start = run.points[bayIndex];
      const end = run.points[bayIndex + 1];
      for (let heightIndex = 0; heightIndex < RAIL_HEIGHTS_M.length; heightIndex++) {
        const railHeight = RAIL_HEIGHTS_M[heightIndex];
        railStart.set(start.x, start.y + railHeight, start.z);
        railEnd.set(end.x, end.y + railHeight, end.z);
        railDirection.subVectors(railEnd, railStart);
        const railLength = railDirection.length();
        if (railLength <= 1e-6) continue;

        quaternion.setFromUnitVectors(
          LOCAL_RAIL_AXIS,
          railDirection.multiplyScalar(1 / railLength),
        );
        position.copy(railStart).add(railEnd).multiplyScalar(0.5);
        const isHandrail = heightIndex === RAIL_HEIGHTS_M.length - 1;
        scale.set(
          isHandrail ? 0.16 : 0.12,
          isHandrail ? 0.14 : 0.12,
          railLength + RAIL_OVERLAP_M,
        );
        matrix.compose(position, quaternion, scale);
        rails.setMatrixAt(railIndex, matrix);
        railIndex += 1;
      }

      // One diagonal brace per bay, alternating its lean between posts so the
      // rail reads as braced heavy timber. Both ends tuck into the joint/foot
      // blocks, which hides the lap seams.
      const braceTopPost = bayIndex % 2 === 0 ? start : end;
      const braceFootPost = bayIndex % 2 === 0 ? end : start;
      braceTop.set(
        braceTopPost.x,
        braceTopPost.y + BRACE_TOP_RAIL_Y,
        braceTopPost.z,
      );
      braceFoot.set(
        braceFootPost.x,
        braceFootPost.y + BRACE_FOOT_Y,
        braceFootPost.z,
      );
      braceDirection.subVectors(braceFoot, braceTop);
      const braceLength = braceDirection.length();
      if (braceLength > 1e-6) {
        quaternion.setFromUnitVectors(
          LOCAL_RAIL_AXIS,
          braceDirection.multiplyScalar(1 / braceLength),
        );
        position.copy(braceTop).add(braceFoot).multiplyScalar(0.5);
        scale.set(BRACE_THICKNESS, BRACE_WIDTH, braceLength);
        matrix.compose(position, quaternion, scale);
        braces.setMatrixAt(braceIndex, matrix);
        braceIndex += 1;
      }
    }
  }

  posts.count = postIndex;
  rails.count = railIndex;
  caps.count = postIndex;
  joints.count = jointIndex;
  braces.count = braceIndex;
  posts.instanceMatrix.needsUpdate = true;
  rails.instanceMatrix.needsUpdate = true;
  caps.instanceMatrix.needsUpdate = true;
  joints.instanceMatrix.needsUpdate = true;
  braces.instanceMatrix.needsUpdate = true;
  group.add(posts, rails, caps, joints, braces);
  return group;
}

/**
 * Octagonal prism of unit size: chamfered on all four corners in the plane
 * perpendicular to the given axis, matching heavy sawn timber sections.
 * Posts/caps/joints run along Y; braces run along Z.
 */
function buildOctagonPrismGeometry(axis: 'y' | 'z'): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  if (axis === 'z') geometry.rotateX(Math.PI / 2);
  return geometry;
}

/**
 * Handrail profile extruded along Z: full-width flat top, chamfered underside
 * corners, and a narrow flat bottom — the classic sawn guard-rail section.
 * Unit footprint so instances scale it to their exact rail dimensions.
 */
function buildHandrailPrismGeometry(): THREE.BufferGeometry {
  const section = RAIL_SECTION;
  const positions: number[] = [];
  const half = 0.5;

  for (let index = 0; index < section.length; index++) {
    const next = (index + 1) % section.length;
    const ax = section[index][0];
    const ay = section[index][1];
    const bx = section[next][0];
    const by = section[next][1];
    positions.push(
      ax, ay, -half,
      bx, by, -half,
      bx, by, half,
      ax, ay, -half,
      bx, by, half,
      ax, ay, half,
    );
  }

  for (const end of [-1, 1]) {
    const reversed = end < 0;
    for (let index = 0; index < section.length - 2; index++) {
      const i1 = reversed ? section.length - 1 - index : index + 1;
      const i2 = reversed ? section.length - 2 - index : index + 2;
      positions.push(
        section[0][0], section[0][1], end * half,
        section[i1][0], section[i1][1], end * half,
        section[i2][0], section[i2][1], end * half,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function collectRailingRuns(
  sections: readonly BridgeRailingSection[],
  options: BridgeRailingOptions,
): RailingRun[] {
  const runs: RailingRun[] = [];
  let index = 0;

  while (index < sections.length) {
    if (sections[index].bridgeBlend <= BRIDGE_RAILING_START_BLEND) {
      index += 1;
      continue;
    }

    const activeStart = index;
    while (
      index < sections.length
      && sections[index].bridgeBlend > BRIDGE_RAILING_START_BLEND
    ) {
      index += 1;
    }
    const activeEnd = index - 1;
    const start = Math.max(0, activeStart - 1);
    const end = Math.min(sections.length - 1, activeEnd + 1);
    if (end <= start) continue;

    const activeSections = sections.slice(start, end + 1);
    for (const side of ['leftDeck', 'rightDeck'] as const) {
      const sidePath = activeSections.map((section) => (
        insetDeckEdge(section[side], section.center)
      ));
      const trimmedPath = trimPolyline(
        sidePath,
        // Each active run deliberately includes one neighboring transition
        // sample. When that sample is the edge endpoint, the railing reaches
        // the shared junction even if the endpoint's own bridge blend is 0.
        // Trim by the actual path extent rather than the active blend extent
        // so a bank/water boundary at a junction cannot fence off an arm.
        start === 0 ? options.trimStart ?? 0 : 0,
        end === sections.length - 1 ? options.trimEnd ?? 0 : 0,
      );
      const points = trimmedPath.length >= 2 ? trimmedPath : [];
      if (points.length >= 2) runs.push({ points });
    }
  }

  return runs;
}

function insetDeckEdge(
  deckEdge: THREE.Vector3,
  center: THREE.Vector3,
): THREE.Vector3 {
  const dx = center.x - deckEdge.x;
  const dz = center.z - deckEdge.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 1e-6) return deckEdge.clone();
  const inset = Math.min(BRIDGE_RAILING_EDGE_INSET, distance * 0.35);
  return new THREE.Vector3(
    deckEdge.x + dx / distance * inset,
    deckEdge.y,
    deckEdge.z + dz / distance * inset,
  );
}

function trimPolyline(
  path: readonly THREE.Vector3[],
  trimStart: number,
  trimEnd: number,
): THREE.Vector3[] {
  if (path.length < 2) return [];
  if (trimStart <= 0 && trimEnd <= 0) return path.map((point) => point.clone());

  const distances = cumulativeDistances(path);
  const totalLength = distances[distances.length - 1];
  const startDistance = Math.max(0, trimStart);
  const endDistance = Math.min(totalLength, totalLength - Math.max(0, trimEnd));
  if (endDistance - startDistance <= 1e-4) return [];

  const result = [samplePolylineAtDistance(path, distances, startDistance)];
  for (let index = 1; index < path.length - 1; index++) {
    if (distances[index] > startDistance && distances[index] < endDistance) {
      result.push(path[index].clone());
    }
  }
  result.push(samplePolylineAtDistance(path, distances, endDistance));
  return result;
}

function resamplePolyline(
  path: readonly THREE.Vector3[],
  targetSpacing: number,
): THREE.Vector3[] {
  if (path.length < 2) return [];

  const distances = cumulativeDistances(path);
  const totalLength = distances[distances.length - 1];
  if (totalLength <= 1e-6) return [];

  const bayCount = Math.max(1, Math.ceil(totalLength / targetSpacing));
  const result: THREE.Vector3[] = [];
  let segmentIndex = 0;
  for (let bayIndex = 0; bayIndex <= bayCount; bayIndex++) {
    const distance = totalLength * bayIndex / bayCount;
    while (
      segmentIndex < path.length - 2
      && distances[segmentIndex + 1] < distance
    ) {
      segmentIndex += 1;
    }
    const startDistance = distances[segmentIndex];
    const endDistance = distances[segmentIndex + 1];
    const t = endDistance <= startDistance
      ? 0
      : (distance - startDistance) / (endDistance - startDistance);
    result.push(path[segmentIndex].clone().lerp(path[segmentIndex + 1], t));
  }
  return result;
}

function cumulativeDistances(path: readonly THREE.Vector3[]): number[] {
  const distances = [0];
  for (let index = 1; index < path.length; index++) {
    distances.push(distances[index - 1] + path[index].distanceTo(path[index - 1]));
  }
  return distances;
}

function samplePolylineAtDistance(
  path: readonly THREE.Vector3[],
  distances: readonly number[],
  distance: number,
): THREE.Vector3 {
  let segmentIndex = 0;
  while (
    segmentIndex < path.length - 2
    && distances[segmentIndex + 1] < distance
  ) {
    segmentIndex += 1;
  }
  const startDistance = distances[segmentIndex];
  const endDistance = distances[segmentIndex + 1];
  const t = endDistance <= startDistance
    ? 0
    : (distance - startDistance) / (endDistance - startDistance);
  return path[segmentIndex].clone().lerp(path[segmentIndex + 1], t);
}
