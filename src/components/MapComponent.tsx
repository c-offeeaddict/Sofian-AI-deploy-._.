import React, { useEffect, useRef, useState } from 'react';
import { Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';

interface Place {
  id: string;
  displayName: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingCount?: number;
}

interface MapComponentProps {
  places: Place[];
  center?: { lat: number; lng: number };
  zoom?: number;
  engine?: 'google' | 'osm';
}

// Google Marker with InfoWindow
const GoogleMarkerWithInfoWindow = ({ place }: { place: Place }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoWindowShown, setInfoWindowShown] = useState(false);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={place.location}
        onClick={() => setInfoWindowShown(true)}
        title={place.displayName}
      >
        <Pin background={'#4f46e5'} glyphColor={'#fff'} borderColor={'#4338ca'} />
      </AdvancedMarker>

      {infoWindowShown && (
        <InfoWindow
          anchor={marker}
          onCloseClick={() => setInfoWindowShown(false)}
          className="rounded-xl overflow-hidden"
        >
          <div className="p-2 max-w-[200px]">
            <h4 className="font-bold text-zinc-900 text-sm truncate">{place.displayName}</h4>
            <p className="text-[11px] text-zinc-500 mt-1 leading-tight">{place.formattedAddress}</p>
            {place.rating !== undefined && (
              <div className="flex items-center gap-1 mt-2">
                <span className="text-amber-500">★</span>
                <span className="text-[11px] font-bold text-zinc-700">{place.rating}</span>
                {place.userRatingCount !== undefined && (
                  <span className="text-[10px] text-zinc-400">({place.userRatingCount})</span>
                )}
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
};

// OpenStreetMap Map using Leaflet preloaded CDN
const OSMMapComponent: React.FC<{ places: Place[]; center: { lat: number; lng: number }; zoom: number }> = ({
  places,
  center,
  zoom,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  // Check if Leaflet is loaded from CDN in window object
  useEffect(() => {
    const checkLeaflet = () => {
      if ((window as any).L) {
        setLeafletLoaded(true);
      } else {
        setTimeout(checkLeaflet, 200);
      }
    };
    checkLeaflet();
  }, []);

  useEffect(() => {
    if (!leafletLoaded || !containerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Destroy existing map if it already exists
    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch (err) {
        console.error("Error removing leaflet map:", err);
      }
      mapRef.current = null;
    }

    // Initialize Leaflet Map
    const map = L.map(containerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([center.lat, center.lng], zoom);
    
    mapRef.current = map;

    // Use OpenStreetMap Tile Layer
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    });
    tileLayer.addTo(map);

    // Apply dark mode styling to leaflet tile elements if body/document has dark class
    let styleNode: HTMLStyleElement | null = null;
    const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
    if (isDark) {
      styleNode = document.createElement('style');
      styleNode.id = 'leaflet-dark-mode-styles';
      styleNode.innerHTML = `
        .leaflet-container .leaflet-tile {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%) !important;
        }
        .leaflet-container {
          background-color: #09090b !important;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: #18181b !important;
          color: #f4f4f5 !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5) !important;
        }
      `;
      document.head.appendChild(styleNode);
    }

    // Custom marker icon with reset background for Leaflet
    const customIcon = L.divIcon({
      className: 'custom-osm-pin border-0 bg-transparent',
      html: `
        <div class="relative flex items-center justify-center w-8 h-8 -ml-4 -mt-4">
          <div class="absolute w-6 h-6 rounded-full bg-indigo-500 border-2 border-white dark:border-zinc-950 shadow-md flex items-center justify-center animate-bounce">
            <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
          </div>
          <div class="absolute bottom-0 w-1 h-1 rounded-full bg-indigo-500 shadow-sm"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });

    // Add markers
    places.forEach((place) => {
      const marker = L.marker([place.location.lat, place.location.lng], { icon: customIcon }).addTo(map);
      
      const ratingStars = place.rating 
        ? `<div style="display: flex; align-items: center; gap: 4px; margin-top: 6px;">
            <span style="color: #f59e0b; font-size: 11px;">★</span>
            <span style="font-size: 11px; font-weight: bold;">${place.rating}</span>
            ${place.userRatingCount ? `<span style="color: #a1a1aa; font-size: 10px;">(${place.userRatingCount})</span>` : ''}
           </div>`
        : '';

      const isDarkMode = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
      const titleColor = isDarkMode ? '#f4f4f5' : '#18181b';
      const addressColor = isDarkMode ? '#a1a1aa' : '#71717a';

      const popupContent = `
        <div style="font-family: sans-serif; padding: 4px; max-width: 200px;">
          <h4 style="margin: 0; font-weight: 700; font-size: 13px; color: ${titleColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${place.displayName}</h4>
          <p style="margin: 4px 0 0 0; font-size: 10.5px; color: ${addressColor}; line-height: 1.3;">${place.formattedAddress}</p>
          ${ratingStars}
        </div>
      `;
      marker.bindPopup(popupContent);
    });

    // Auto fit bounds if multiple places exist
    if (places.length > 1) {
      const bounds = L.latLngBounds(places.map(p => [p.location.lat, p.location.lng]));
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    // Set up ResizeObserver to automatically adjust map container dynamically
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Force map container size calculation immediately
    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 150);

    return () => {
      if (styleNode) {
        try {
          styleNode.remove();
        } catch (e) {}
      }
      resizeObserver.disconnect();
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
      }
    };
  }, [leafletLoaded, places, center, zoom]);

  if (!leafletLoaded) {
    return (
      <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 flex flex-col items-center justify-center gap-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Initializing OpenStreetMap Engine...</span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full z-0 relative" />;
};

const MapComponent: React.FC<MapComponentProps> = ({ places, center, zoom = 13, engine = 'google' }) => {
  const defaultCenter = center || (places.length > 0 ? places[0].location : { lat: 48.8566, lng: 2.3522 });

  return (
    <div className="w-full h-[350px] rounded-2xl overflow-hidden border border-zinc-200 dark:border-white/10 shadow-xl relative z-0">
      {engine === 'google' ? (
        <Map
          defaultCenter={defaultCenter}
          defaultZoom={zoom}
          mapId="sofian_ai_map"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          gestureHandling={'greedy'}
          disableDefaultUI={false}
          className="w-full h-full"
        >
          {places.map((place) => (
            <GoogleMarkerWithInfoWindow key={place.id} place={place} />
          ))}
        </Map>
      ) : (
        <OSMMapComponent places={places} center={defaultCenter} zoom={zoom} />
      )}
    </div>
  );
};

export default MapComponent;
