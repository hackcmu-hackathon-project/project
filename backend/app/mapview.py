"""A small Leaflet page the app embeds, so picking a location is a real map.

Served from our own origin rather than a third party: an iframe on web and a
WebView on a device load the same page, and it posts the marker back when it
moves, so someone can correct a geocode that landed on the wrong side of the
street. OpenStreetMap tiles, Leaflet from a CDN — no account, no key, no quota.
"""

from fastapi import APIRouter, Query, Response

router = APIRouter()

PAGE = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; height: 100%%; background: #eee9e2; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var lat = %(lat)s, lon = %(lon)s, draggable = %(draggable)s;
  var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([lat, lon], %(zoom)s);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  var marker = L.marker([lat, lon], { draggable: draggable }).addTo(map);

  function publish(point) {
    var message = JSON.stringify({ lat: point.lat, lon: point.lng });
    // The app is either a parent window (web) or a WebView (device).
    if (window.parent !== window) window.parent.postMessage(message, '*');
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
  }

  marker.on('dragend', function () { publish(marker.getLatLng()); });
  if (draggable) {
    map.on('click', function (e) { marker.setLatLng(e.latlng); publish(e.latlng); });
  }
</script>
</body>
</html>
"""


@router.get("/map", include_in_schema=False)
async def map_page(
    lat: float,
    lon: float,
    zoom: int = Query(15, ge=1, le=19),
    draggable: bool = False,
):
    html = PAGE % {
        "lat": lat,
        "lon": lon,
        "zoom": zoom,
        "draggable": "true" if draggable else "false",
    }
    return Response(content=html, media_type="text/html", headers={"Cache-Control": "no-store"})
