import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

// One 24×24 silhouette per item. Used for the HUD (SVG) and extruded into glowing 3D pickups.
// Swap these paths (or the 3D builder) when real weapon art arrives.
export const ICONS = {
  pistol: 'M2 6h18v4h-9v1.5a2 2 0 0 1-2 2H8.5L7.4 19H3.6l1.3-9H2z',
  dual: 'M1.6 4.8h14.4v3.2H8.8v1.2a1.6 1.6 0 0 1-1.6 1.6H6.8L5.92 15.2H2.88l1.04-7.2H1.6z M8 12h14.4v3.2h-7.2v1.2a1.6 1.6 0 0 1-1.6 1.6h-.4l-.88 4.4h-3.04l1.04-7.2H8z',
  smg: 'M1 8h18l1 1h2v3h-9v1.2h-1.4L10.2 18H7.4l.8-4.8H6.4V12H1z M12.6 12.5h3l-1 6.5H12z',
  shotgun: 'M6 7h17v2H6z M1 9h15v2.6h-5l-.6 1.4H6.7L4 17.5H1z M12 11.6h4.5v2H12z',
  mag: 'M8 2h8l.8 5-1 15H8.2l-1-15z M11.25 9.5h1.5v2.25H15v1.5h-2.25v2.25h-1.5v-2.25H9v-1.5h2.25z',
  med: 'M3 7h18v13H3z M9 3.5h6V7h-1.6V5.1h-2.8V7H9z M10.75 9.5h2.5v2.75H16v2.5h-2.75v2.75h-2.5v-2.75H8v-2.5h2.75z'
};
export const svgIcon = k => `<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="${ICONS[k]}"/></svg>`;
export const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>';
export const MOON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5z"/></svg>';

const cache = {};
/** Extruded 3D version of an icon, centred, ~1 m wide, standing upright facing +Z. */
export function iconGeometry(key) {
  if (cache[key]) return cache[key];
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" fill="#fff" d="${ICONS[key]}"/></svg>`);
  const shapes = [];
  for (const p of data.paths) shapes.push(...SVGLoader.createShapes(p));
  const g = new THREE.ExtrudeGeometry(shapes, { depth: 3.2, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.45, bevelSegments: 2, curveSegments: 6 });
  g.translate(-12, -12, -1.6);
  g.scale(1 / 24, -1 / 24, -1 / 24); // flip Y (SVG is y-down) and Z together so faces keep their winding
  g.computeVertexNormals();
  return (cache[key] = g);
}
