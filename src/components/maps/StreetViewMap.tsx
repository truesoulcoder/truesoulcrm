// src/components/maps/StreetViewMap.tsx
'use client';

import { GoogleMap, StreetViewPanorama, MarkerF } from '@react-google-maps/api';
import { MapPin, AlertTriangle, Loader2, Eye, Map as MapIcon } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGoogleMapsApi } from './GoogleMapsLoader';

interface StreetViewMapProps {
  address: string;
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  borderRadius: '0.5rem',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: '#e5e7eb',
};

const StatusDisplay: React.FC<{ message: string; icon: React.ReactNode }> = ({ message, icon }) => (
  <div style={containerStyle} className="flex flex-col items-center justify-center bg-base-300 text-base-content/70 p-4">
    <div className="mb-2">{icon}</div>
    <p className="text-sm text-center">{message}</p>
  </div>
);

const StreetViewMapContent: React.FC<StreetViewMapProps> = ({ address }) => {
  const [position, setPosition] = useState<google.maps.LatLngLiteral | null>(null);
  const [hasStreetView, setHasStreetView] = useState(false);
  const [showStreetView, setShowStreetView] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing...');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const streetViewServiceRef = useRef<google.maps.StreetViewService | null>(null);

  useEffect(() => {
    if (window.google?.maps) {
      geocoderRef.current = new window.google.maps.Geocoder();
      streetViewServiceRef.current = new window.google.maps.StreetViewService();
    }
  }, []);

  const checkStreetView = useCallback((latLng: google.maps.LatLngLiteral) => {
    streetViewServiceRef.current?.getPanorama({ location: latLng, radius: 50 }, (data, status) => {
      if (status === 'OK') {
        setHasStreetView(true);
        setShowStreetView(true); // Default to showing street view if available
      } else {
        setHasStreetView(false);
        setShowStreetView(false); // Can't show what's not there
      }
    });
  }, []);

  const geocodeAddress = useCallback(async (addr: string) => {
    if (!geocoderRef.current) return;
    setIsLoading(true);
    setStatusMessage('Finding location...');
    try {
      const { results } = await geocoderRef.current.geocode({ address: addr.trim() });
      if (results && results[0]?.geometry?.location) {
        const location = results[0].geometry.location;
        const latLng = { lat: location.lat(), lng: location.lng() };
        setPosition(latLng);
        checkStreetView(latLng);
      } else {
        setStatusMessage('Location could not be found.');
        setPosition(null);
        setHasStreetView(false);
      }
    } catch (error) {
      console.error(`Geocoding error for address "${addr}":`, error);
      setStatusMessage('Error finding location.');
      setPosition(null);
      setHasStreetView(false);
    } finally {
      setIsLoading(false);
    }
  }, [checkStreetView]);

  useEffect(() => {
    if (address) {
      const handler = setTimeout(() => geocodeAddress(address), 500);
      return () => clearTimeout(handler);
    } else {
      setIsLoading(false);
      setStatusMessage('No address provided.');
      setPosition(null);
      setHasStreetView(false);
    }
  }, [address, geocodeAddress]);

  if (isLoading) {
    return <StatusDisplay message={statusMessage} icon={<Loader2 className="w-8 h-8 animate-spin text-primary" />} />;
  }

  if (!position) {
    return <StatusDisplay message={statusMessage} icon={<AlertTriangle className="w-8 h-8 text-warning" />} />;
  }
  
  const mapOptions = {
    center: position,
    zoom: 17,
    disableDefaultUI: true,
    gestureHandling: 'cooperative',
  };
  
  const panoramaOptions = {
    position,
    pov: { heading: 34, pitch: 10 },
    visible: true,
    disableDefaultUI: true,
    clickToGo: true,
    scrollwheel: true,
  };

  return (
    <div style={containerStyle}>
      <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} {...mapOptions}>
        {hasStreetView && (
          <button
            onClick={() => setShowStreetView(prev => !prev)}
            className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2 z-10 bg-base-100/70 hover:bg-base-100"
            title={showStreetView ? "Switch to Map View" : "Switch to Street View"}
          >
            {showStreetView ? <MapIcon size={18} /> : <Eye size={18} />}
          </button>
        )}

        {showStreetView && hasStreetView ? (
          <StreetViewPanorama options={panoramaOptions} />
        ) : (
          <MarkerF position={position} />
        )}
        
        {!hasStreetView && (
          <div className="absolute bottom-2 left-2 bg-base-100/70 p-1.5 rounded text-xs text-base-content">
            Street View not available for this location.
          </div>
        )}
      </GoogleMap>
    </div>
  );
};

const StreetViewMap: React.FC<StreetViewMapProps> = (props) => {
  const { isLoaded, loadError } = useGoogleMapsApi();

  if (loadError) {
    return <StatusDisplay message="Error loading Google Maps." icon={<AlertTriangle className="w-8 h-8 text-error" />} />;
  }

  if (!isLoaded) {
    return <StatusDisplay message="Loading map..." icon={<Loader2 className="w-8 h-8 animate-spin" />} />;
  }
  
  return <StreetViewMapContent {...props} />;
};

export default StreetViewMap;