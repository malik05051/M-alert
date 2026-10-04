'use strict';
/*
 * Génère web/data/cotes.js : le trait de côte de chaque département, pour afficher les alertes
 * tsunami sur les côtes (comme JQuake).
 *
 * Une côte = un bord de département qui ne touche aucun autre département et ne longe pas un
 * pays voisin (frontières terrestres retirées avec Natural Earth, domaine public).
 *
 * Usage : node tools/build-coasts.js ne_10m_admin_0_countries.geojson
 *   (https://github.com/nvkelso/natural-earth-vector/raw/master/geojson/ne_10m_admin_0_countries.geojson)
 */
const fs = require('fs');
const path = require('path');

const NEIGHBOURS = ['BEL', 'LUX', 'DEU', 'CHE', 'ITA', 'ESP', 'AND', 'MCO'];
const BORDER_KM = 3; // bord à moins de 3 km d'un pays voisin = frontière terrestre
// Rives de lacs frontaliers, pas des côtes maritimes : Haute-Savoie (Léman).
const NOT_SEA = ['74'];

global.window = {};
require(path.join(__dirname, '..', 'web', 'data', 'departements.js'));
const departments = window.MALERT_DEPARTMENTS.features;

const countries = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).features
  .filter((f) => NEIGHBOURS.includes(f.properties.ADM0_A3));
// Contours des pays voisins, limités autour de la France pour aller vite.
const borderSegments = [];
for (const c of countries) {
  const polys = c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [a, b] = [ring[i], ring[i + 1]];
        if (Math.max(a[1], b[1]) < 41 || Math.min(a[1], b[1]) > 51.5 || Math.max(a[0], b[0]) < -5.5 || Math.min(a[0], b[0]) > 10) continue;
        borderSegments.push([a, b]);
      }
    }
  }
}

// Distance (km) d'un point à un segment, en projection locale équirectangulaire.
function distKm(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const P = [p[0] * k * 111.32, p[1] * 110.57];
  const A = [a[0] * k * 111.32, a[1] * 110.57];
  const B = [b[0] * k * 111.32, b[1] * 110.57];
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(P[0] - (A[0] + t * dx), P[1] - (A[1] + t * dy));
}

function nearNeighbour(a, b) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const [p, q] of borderSegments) if (distKm(m, p, q) < BORDER_KM) return true;
  return false;
}

const key = (a, b) => {
  const p = a.join(',');
  const q = b.join(',');
  return p < q ? `${p}|${q}` : `${q}|${p}`;
};
const ringsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat();

const count = new Map();
for (const d of departments) {
  for (const ring of ringsOf(d.geometry)) {
    for (let i = 0; i < ring.length - 1; i++) {
      const k = key(ring[i], ring[i + 1]);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
}

const coasts = {};
let edges = 0;
for (const d of departments) {
  const lines = [];
  for (const ring of ringsOf(d.geometry)) {
    const n = ring.length - 1;
    const coastal = [];
    for (let i = 0; i < n; i++) {
      coastal.push(count.get(key(ring[i], ring[i + 1])) === 1 && !nearNeighbour(ring[i], ring[i + 1]));
    }
    if (!coastal.some(Boolean)) continue;
    // Départ sur un bord non côtier pour ne pas couper une côte en deux (anneau fermé).
    const start = coastal.every(Boolean) ? 0 : coastal.findIndex((c) => !c);
    let line = null;
    for (let j = 0; j <= n; j++) {
      const i = (start + j) % n;
      if (j < n && coastal[i]) {
        edges++;
        if (!line) line = [ring[i]];
        line.push(ring[i + 1]);
      } else if (line) {
        lines.push(line);
        line = null;
      }
    }
  }
  if (lines.length && !NOT_SEA.includes(d.properties.code)) coasts[d.properties.code] = lines.map((l) => l.map(([lng, lat]) => [lat, lng]));
}

const out = path.join(__dirname, '..', 'web', 'data', 'cotes.js');
fs.writeFileSync(out, `/* Trait de côte par département, calculé par tools/build-coasts.js depuis les contours IGN
 * (france-geojson, Licence Ouverte) ; frontières terrestres retirées avec Natural Earth (domaine public). */
window.MALERT_COASTS = ${JSON.stringify(coasts)};
`);
console.log(`${Object.keys(coasts).length} départements côtiers, ${edges} segments de côte -> ${path.relative(process.cwd(), out)}`);
console.log(Object.keys(coasts).sort().join(' '));
