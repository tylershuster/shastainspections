/* Areas of Service — county map (MapLibre GL) */
(function () {
  "use strict";

  var frame = document.querySelector(".map-frame");
  var container = document.getElementById("areas-map");
  if (!frame || !container) return;

  // If MapLibre was blocked (ad blocker, offline, CDN failure) show the fallback.
  if (typeof maplibregl === "undefined") {
    frame.setAttribute("data-failed", "true");
    return;
  }

  var REDDING = [-122.381088, 40.574638];
  var GREEN = "#4a8622";

  try {
    var map = new maplibregl.Map({
      container: "areas-map",
      style: "https://styles.gtfs.media/sfmta/basemap.json",
      center: REDDING,
      zoom: 6.6,
      maxBounds: [
        [-125.396835, 39.523427],
        [-119.365341, 41.609589]
      ],
      attributionControl: { compact: true }
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.scrollZoom.disable(); // don't hijack page scrolling

    new maplibregl.Marker({ color: GREEN })
      .setLngLat(REDDING)
      .setPopup(new maplibregl.Popup({ offset: 24 }).setText("Redding — our home base"))
      .addTo(map);

    map.on("error", function (e) {
      // Style or tile failure: surface the fallback rather than an empty grey box.
      if (e && e.error && e.sourceId === undefined) {
        frame.setAttribute("data-failed", "true");
      }
    });

    map.on("load", function () {
      fetch("/assets/data/counties.json")
        .then(function (r) {
          if (!r.ok) throw new Error("counties " + r.status);
          return r.json();
        })
        .then(function (data) {
          map.addSource("counties", { type: "geojson", data: data });

          map.addLayer({
            id: "counties-fill",
            type: "fill",
            source: "counties",
            paint: { "fill-color": GREEN, "fill-opacity": 0.14 }
          });

          map.addLayer({
            id: "counties-line",
            type: "line",
            source: "counties",
            paint: { "line-color": GREEN, "line-width": 2.5, "line-opacity": 0.9 }
          });
        })
        .catch(function () {
          /* Basemap still works without the overlay — leave the map up. */
        });
    });
  } catch (err) {
    frame.setAttribute("data-failed", "true");
  }
})();
