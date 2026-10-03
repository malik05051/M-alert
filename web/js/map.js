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
      // Alerte M-Alert en cours : tout le département prend la couleur du niveau d'alerte, avec un
      // contour blanc épais (largeur fixe à l'écran : les petits départements restent visibles).
      const alertLevel = state.alertLevels[code];
      if (alertLevel) {
        style.fillColor = LEVELS[alertLevel].color;
        style.fillOpacity = tiles ? 0.75 : 0.95;
        style.color = '#ffffff';
        style.weight = 3.5;
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

    function refreshLayer(code) {
      const layer = layers[code];
      if (!layer) return;
      layer.setStyle(styleFor(code));
      const path = layer.getElement && layer.getElement();
      if (path) {
        path.classList.toggle('dep-alert', Boolean(state.alertLevels[code]));
        for (let l = 1; l <= 5; l++) path.classList.toggle(`dep-alert-${l}`, state.alertLevels[code] === l);
      }
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
          layer.setStyle({ weight: Math.max(2.5, styleFor(code).weight), color: '#ffffff' });
        });
        layer.on('mouseout', () => refreshLayer(code));
        layer.on('click', (e) => {
          if (options.onDepartmentClick) options.onDepartmentClick(code, feature.properties.nom, e);
        });
      },
    }).addTo(map);

    // Leaflet recalcule mal la taille si le conteneur change (panneaux, mobile).
    const ro = new ResizeObserver(() => map.invalidateSize());
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
      },

      geo,
    };
  }

  window.MAlertMap = { create };
})();
