/* M-Alert — carte interactive des départements (Leaflet), partagée par M-alert et M-Alert-sender. */
(function () {
  'use strict';

  const { VIGILANCE, LEVELS } = window.MAlert;
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

    // Départements en alerte : même luminosité que la vigilance (même opacité de remplissage) et
    // contour blanc fin, adouci pour ne pas éblouir à côté des frontières sombres.
    const EDGE_WEIGHT = 2;
    const EDGE_OPACITY = 0.7;

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
      // Alerte M-Alert en cours : tout le département prend la couleur du niveau d'alerte, avec un
      // contour blanc épais (largeur fixe à l'écran : les petits départements restent visibles).
      const alertLevel = state.alertLevels[code];
      if (alertLevel) {
        style.fillColor = LEVELS[alertLevel].color;
        style.color = '#ffffff';
        style.opacity = EDGE_OPACITY;
        style.weight = EDGE_WEIGHT;
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

    // Contour blanc des départements en alerte, tracé dans un panneau au-dessus des autres
    // départements pour rester entier (non recouvert par les voisins).
    const edgePane = map.createPane('alertEdge');
    edgePane.style.zIndex = 420;
    edgePane.style.pointerEvents = 'none';
    const edgeRenderer = L.svg({ pane: 'alertEdge' });
    const edgeGroup = L.layerGroup().addTo(map);
    let edgeKey = '';

    function renderEdges() {
      const codes = Object.keys(state.alertLevels).filter((c) => layers[c] && !state.selected.has(c)).sort();
      const key = codes.join(',');
      if (key === edgeKey) return;
      edgeKey = key;
      edgeGroup.clearLayers();
      for (const c of codes) {
        edgeGroup.addLayer(L.polygon(layers[c].getLatLngs(), {
          renderer: edgeRenderer, interactive: false, fill: false, color: '#ffffff', opacity: EDGE_OPACITY, weight: EDGE_WEIGHT,
        }));
      }
    }

    function refreshAll() {
      Object.keys(layers).forEach(refreshLayer);
      renderEdges();
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

    return {
      leaflet: map,

      setVigilance(departments) {
        state.vigilance = departments || {};
        refreshAll();
      },

      setAlerts(alerts) {
        const levels = {};
        for (const a of alerts || []) {
          const codes = a.departments.includes('ALL') ? Object.keys(layers) : a.departments;
          for (const c of codes) levels[c] = Math.max(levels[c] || 0, a.level);
        }
        state.alertLevels = levels;
        refreshAll();
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
          tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19,
            attribution: '© OpenStreetMap © CARTO',
          }).addTo(map);
          tiles.bringToBack();
        } else if (!enabled && tiles) {
          map.removeLayer(tiles);
          tiles = null;
        }
        refreshAll();
      },

      focus(codes) {
        if (!codes || !codes.length || codes.includes('ALL')) {
          map.flyToBounds(FRANCE_BOUNDS, { duration: 0.8 });
          return;
        }
        let bounds = null;
        for (const c of codes) {
          if (!layers[c]) continue;
          bounds = bounds ? bounds.extend(layers[c].getBounds()) : L.latLngBounds(layers[c].getBounds().getSouthWest(), layers[c].getBounds().getNorthEast());
        }
        if (bounds) map.flyToBounds(bounds.pad(0.4), { duration: 0.8, maxZoom: 8 });
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
