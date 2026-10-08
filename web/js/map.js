/* M-Alert — carte interactive des départements (Leaflet), partagée par M-alert et M-Alert-sender. */
(function () {
  'use strict';

  const M = window.MAlert;
  const { VIGILANCE, LEVELS } = M;
  const FRANCE_BOUNDS = [[41.3, -5.2], [51.1, 9.6]];

  function create(elementId, options = {}) {
    const map = L.map(elementId, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 4,
      maxZoom: 11,
      zoomSnap: 0.25,
      preferCanvas: false,
    });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('Contours © IGN · Vigilance © Météo-France');
    map.fitBounds(FRANCE_BOUNDS);

    // Limite de dézoom : la France entière remplit la carte, on ne peut pas dézoomer au-delà
    // (recalculée quand la carte change de taille). On ne peut pas non plus trop s'en éloigner.
    map.setMaxBounds(L.latLngBounds(FRANCE_BOUNDS).pad(0.25));
    function updateMinZoom() {
      const size = map.getSize();
      if (!size.x || !size.y) return; // carte encore cachée
      // getBoundsZoom est borné par le zoom minimum actuel : on le relâche avant le calcul,
      // sinon il ne pourrait jamais redescendre quand la fenêtre rétrécit.
      map.options.minZoom = 0;
      map.setMinZoom(map.getBoundsZoom(FRANCE_BOUNDS));
    }
    updateMinZoom();

    let tiles = null;
    const state = {
      vigilance: {},      // code -> { level, phenomena }
      alertLevels: {},    // code -> niveau d'alerte M-Alert le plus élevé
      highlighted: new Set(),
      selected: new Set(),
    };
    const layers = {};    // code -> layer

    function styleFor(code) {
      const vig = state.vigilance[code];
      const level = vig ? vig.level : 0;
      const style = {
        fillColor: VIGILANCE[level] ? VIGILANCE[level].color : VIGILANCE[0].color,
        fillOpacity: tiles ? 0.55 : 0.85,
        color: '#0b1220',
        weight: 1.1,
        opacity: 1,
        dashArray: null,
      };
      // Vos départements : contour blanc en pointillés.
      if (state.highlighted.has(code)) {
        style.color = '#ffffff';
        style.weight = 2;
        style.dashArray = '5 4';
      }
      // Alerte M-Alert en cours : tout le département prend la couleur du niveau d'alerte, avec la
      // même luminosité et la même frontière noire que les autres départements.
      const alertLevel = state.alertLevels[code];
      if (alertLevel) {
        style.fillColor = LEVELS[alertLevel].color;
        style.color = '#0b1220';
        style.weight = 1.1;
        style.dashArray = null;
      }
      if (state.selected.has(code)) {
        style.color = '#22d3ee';
        style.weight = 3;
        style.dashArray = '6 4';
        style.fillOpacity = Math.min(1, style.fillOpacity + 0.1);
      }
      return style;
    }

    // Le style n'est réappliqué que s'il a changé : chaque setStyle redessine la carte.
    function refreshLayer(code) {
      const layer = layers[code];
      if (!layer) return;
      const style = styleFor(code);
      const key = JSON.stringify(style);
      if (layer._malertStyle === key) return;
      layer._malertStyle = key;
      layer.setStyle(style);
      // Les contours importants passent au premier plan pour rester visibles.
      if (state.alertLevels[code] || state.selected.has(code) || state.highlighted.has(code)) layer.bringToFront();
    }

    function refreshAll() {
      Object.keys(layers).forEach(refreshLayer);
    }

    const geo = L.geoJSON(window.MALERT_DEPARTMENTS, {
      style: (f) => styleFor(f.properties.code),
      onEachFeature: (feature, layer) => {
        const code = feature.properties.code;
        layers[code] = layer;
        layer.bindTooltip(() => (options.tooltip ? options.tooltip(code, feature.properties.nom) : feature.properties.nom), {
          sticky: true,
          direction: 'top',
          className: 'dep-tooltip',
          offset: [0, -8],
        });
        layer.on('mouseover', () => {
          layer._malertStyle = null;
          layer.setStyle({ weight: Math.max(2.5, styleFor(code).weight), color: '#ffffff' });
        });
        layer.on('mouseout', () => refreshLayer(code));
        layer.on('click', (e) => {
          if (options.onDepartmentClick) options.onDepartmentClick(code, feature.properties.nom, e);
        });
      },
    }).addTo(map);

    // Leaflet recalcule mal la taille si le conteneur change (panneaux, mobile).
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      updateMinZoom();
    });
    ro.observe(document.getElementById(elementId));

    // Alertes tsunami et vagues-submersion : trait épais de la couleur du niveau le long des côtes touchées (comme
    // JQuake), au-dessus de tout le reste. Les départements sans côte ne sont pas tracés.
    const tsunamiPane = map.createPane('tsunami');
    tsunamiPane.style.zIndex = 470;
    tsunamiPane.style.pointerEvents = 'none';
    const tsunamiRenderer = L.svg({ pane: 'tsunami', padding: 0.5 });
    const tsunamiGroup = L.layerGroup().addTo(map);
    let tsunamiKey = '';

    function renderTsunami(levels) {
      const coasts = window.MALERT_COASTS || {};
      const codes = Object.keys(levels).filter((c) => coasts[c]).sort((a, b) => levels[a] - levels[b]);
      const key = codes.map((c) => `${c}:${levels[c]}`).join(',');
      if (key === tsunamiKey) return;
      tsunamiKey = key;
      tsunamiGroup.clearLayers();
      for (const c of codes) { // niveaux croissants : le plus grave est tracé par-dessus
        tsunamiGroup.addLayer(L.polyline(coasts[c], {
          renderer: tsunamiRenderer, interactive: false, color: LEVELS[levels[c]].color, weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round',
        }));
      }
    }

    // Épicentres des tremblements de terre : croix de la couleur du niveau (comme JQuake).
    const epicenterPane = map.createPane('epicenter');
    epicenterPane.style.zIndex = 640; // au-dessus des contours, sous les info-bulles (650)
    const epicenterGroup = L.layerGroup().addTo(map);
    let draftMarker = null;

    function crossIcon(level, draft) {
      const color = LEVELS[level] ? LEVELS[level].color : '#ffffff';
      const svg = `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <path d="M6 6 26 26 M26 6 6 26" stroke="#0b1220" stroke-width="11" stroke-linecap="round"/>
        <path d="M6 6 26 26 M26 6 6 26" stroke="#ffffff" stroke-width="7.5" stroke-linecap="round"/>
        <path d="M6 6 26 26 M26 6 6 26" stroke="${color}" stroke-width="4" stroke-linecap="round"${draft ? ' stroke-dasharray="4 3"' : ''}/>
      </svg>`;
      return L.divIcon({ className: 'epicenter-icon', html: svg, iconSize: [32, 32], iconAnchor: [16, 16] });
    }

    function renderEpicenters(alerts) {
      epicenterGroup.clearLayers();
      for (const a of [...alerts].sort((x, y) => x.level - y.level)) {
        epicenterGroup.addLayer(L.marker([a.epicenter.lat, a.epicenter.lon], {
          icon: crossIcon(a.level), pane: 'epicenter', keyboard: false, title: `Épicentre — ${a.title}${M.quakeSummary(a) ? ` (${M.quakeSummary(a)})` : ''}`,
        }));
      }
    }

    // Point dans un polygone Leaflet (anneaux et multipolygones, règle pair-impair).
    function containsPoint(latlngs, lat, lon) {
      const rings = [];
      (function collect(arr) {
        if (arr.length && arr[0] instanceof L.LatLng) rings.push(arr);
        else arr.forEach(collect);
      }(latlngs));
      let inside = false;
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i];
          const b = ring[j];
          if ((a.lat > lat) !== (b.lat > lat) && lon < ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
        }
      }
      return inside;
    }

    // Cache hors de France : un polygone de la couleur du fond couvrant le monde entier, percé
    // de chaque département. Placé au-dessus des noms de villes, il masque les autres pays.
    let mask = null;
    function franceMask() {
      if (mask) return mask;
      if (!map.getPane('mask')) {
        const pane = map.createPane('mask');
        pane.style.zIndex = 460;
        pane.style.pointerEvents = 'none';
      }
      const holes = [];
      for (const layer of Object.values(layers)) {
        const latlngs = layer.getLatLngs();
        // Polygon : [contour, trous…] ; MultiPolygon : [[contour, trous…], …]
        const polygons = Array.isArray(latlngs[0][0]) ? latlngs : [latlngs];
        for (const polygon of polygons) holes.push(polygon[0]);
      }
      const world = [[-89, -179.9], [89, -179.9], [89, 179.9], [-89, 179.9]];
      const bg = getComputedStyle(map.getContainer()).backgroundColor || '#0b1220';
      mask = L.polygon([world, ...holes], {
        pane: 'mask', renderer: L.svg({ pane: 'mask' }), interactive: false, stroke: false, fillColor: bg, fillOpacity: 1,
      });
      return mask;
    }

    return {
      leaflet: map,

      setVigilance(departments) {
        state.vigilance = departments || {};
        refreshAll();
      },

      setAlerts(alerts) {
        const levels = {};
        const tsunami = {};
        for (const a of alerts || []) {
          const codes = a.departments.includes('ALL') ? Object.keys(layers) : a.departments;
          // Tsunami et vagues-submersion : la côte est colorée, pas le département.
          const coastal = a.category === 'tsunami' || ((a.category || 'meteo') === 'meteo' && Number(a.phenomenon) === 9);
          const target = coastal ? tsunami : levels;
          for (const c of codes) target[c] = Math.max(target[c] || 0, a.level);
        }
        state.alertLevels = levels;
        refreshAll();
        renderTsunami(tsunami);
        renderEpicenters((alerts || []).filter((a) => a.epicenter));
      },

      /** Croix d'épicentre en cours de saisie (sender), ou null pour la retirer. */
      setDraftEpicenter(epicenter, level) {
        if (draftMarker) draftMarker.remove();
        draftMarker = epicenter ? L.marker([epicenter.lat, epicenter.lon], { icon: crossIcon(level, true), pane: 'epicenter', interactive: false, keyboard: false }).addTo(map) : null;
      },

      /** Code du département contenant ce point, ou null (en mer, hors de France). */
      departmentAt(lat, lon) {
        return Object.keys(layers).find((c) => containsPoint(layers[c].getLatLngs(), lat, lon)) || null;
      },

      setHighlighted(codes) {
        state.highlighted = new Set(codes || []);
        refreshAll();
      },

      setSelected(codes) {
        state.selected = new Set(codes || []);
        refreshAll();
      },

      setTiles(enabled) {
        if (enabled && !tiles) {
          // Fond sombre d'Esri (sans clé API ; CARTO exige une clé depuis août 2026). Les noms de
          // villes sont dans une couche à part, posée au-dessus des départements colorés.
          if (!map.getPane('labels')) {
            const pane = map.createPane('labels');
            pane.style.zIndex = 450;
            pane.style.pointerEvents = 'none';
          }
          const esri = (name, opts) => L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${name}/MapServer/tile/{z}/{y}/{x}`, { maxNativeZoom: 16, maxZoom: 19, ...opts });
          tiles = L.layerGroup([
            esri('World_Dark_Gray_Base', { attribution: 'Fond de carte © Esri, HERE, Garmin, © OpenStreetMap' }),
            esri('World_Dark_Gray_Reference', { pane: 'labels' }),
            franceMask(),
          ]).addTo(map);
        } else if (!enabled && tiles) {
          map.removeLayer(tiles);
          tiles = null;
        }
        refreshAll();
      },

      /**
       * Centre la carte sur des départements (et un épicentre éventuel).
       * options.top : hauteur (px) cachée en haut de la carte, par exemple par le bandeau d'alerte.
       */
      focus(codes, { epicenter, top = 0 } = {}) {
        const fly = { duration: 0.8, maxZoom: 8, paddingTopLeft: [20, top + 20], paddingBottomRight: [20, 20] };
        if (!codes || !codes.length || codes.includes('ALL')) {
          map.flyToBounds(FRANCE_BOUNDS, { ...fly, maxZoom: undefined });
          return;
        }
        let bounds = null;
        for (const c of codes) {
          if (!layers[c]) continue;
          bounds = bounds ? bounds.extend(layers[c].getBounds()) : L.latLngBounds(layers[c].getBounds().getSouthWest(), layers[c].getBounds().getNorthEast());
        }
        if (epicenter) bounds = bounds ? bounds.extend([epicenter.lat, epicenter.lon]) : L.latLngBounds([[epicenter.lat, epicenter.lon], [epicenter.lat, epicenter.lon]]);
        if (bounds) map.flyToBounds(bounds.pad(0.25), fly);
      },

      resetView() {
        map.flyToBounds(FRANCE_BOUNDS, { duration: 0.6 });
      },

      codes() {
        return Object.keys(layers);
      },

      invalidate() {
        map.invalidateSize();
        updateMinZoom();
      },

      geo,
    };
  }

  window.MAlertMap = { create };
})();
