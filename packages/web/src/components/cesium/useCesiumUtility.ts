import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  Ellipsoid,
  Rectangle,
} from "cesium";
import type { Cesium3DTileset, Viewer } from "cesium";

export function unionAllTilesetsBoundingSphereCompute(
  tilesets: Cesium3DTileset[]
): BoundingSphere | null {
  if (!Array.isArray(tilesets) || tilesets.length === 0) return null;

  const spheres: BoundingSphere[] = [];

  for (const ts of tilesets) {
    const bv = (ts as { root?: { boundingVolume?: unknown } })?.root?.boundingVolume;
    if (!bv) continue;

    let sphere: BoundingSphere | undefined;
    try {
      const maybeSphere = (bv as { boundingSphere?: BoundingSphere }).boundingSphere;
      sphere = maybeSphere ?? BoundingSphere.fromBoundingSpheres(bv as any);
    } catch {
      sphere = undefined;
    }

    if (sphere && sphere.radius > 0) {
      spheres.push(sphere);
    }
  }

  if (spheres.length === 0) return null;

  let union = spheres[0];
  for (let i = 1; i < spheres.length; i += 1) {
    union = BoundingSphere.union(union, spheres[i], new BoundingSphere());
  }

  return union;
}

export function boundingSphereToRectangle(
  boundingSphere: BoundingSphere | null,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
): Rectangle | undefined {
  if (!boundingSphere) return undefined;

  const center = boundingSphere.center;
  const radius = boundingSphere.radius;

  const directions = [
    new Cartesian3(2, 0, 0),
    new Cartesian3(-2, 0, 0),
    new Cartesian3(0, 2, 0),
    new Cartesian3(0, -2, 0),
    new Cartesian3(0, 0, 2),
    new Cartesian3(0, 0, -2),
  ];

  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const dir of directions) {
    const offset = Cartesian3.multiplyByScalar(dir, radius, new Cartesian3());
    const pos = Cartesian3.add(center, offset, new Cartesian3());
    const carto = Cartographic.fromCartesian(pos, ellipsoid);
    if (!carto) continue;

    west = Math.min(west, carto.longitude);
    east = Math.max(east, carto.longitude);
    south = Math.min(south, carto.latitude);
    north = Math.max(north, carto.latitude);
  }

  if (!isFinite(west) || !isFinite(east) || !isFinite(south) || !isFinite(north)) {
    return undefined;
  }

  return new Rectangle(west, south, east, north);
}

export function applyTilesetBounds(
  viewer: Viewer,
  tilesets: Cesium3DTileset[]
) {
  if (!viewer || viewer.isDestroyed?.()) return;
  const sphere = unionAllTilesetsBoundingSphereCompute(tilesets);
  const rectangle = boundingSphereToRectangle(sphere, viewer.scene.globe.ellipsoid) ?? Rectangle.MAX_VALUE;
  viewer.scene.globe.cartographicLimitRectangle = rectangle;
}
