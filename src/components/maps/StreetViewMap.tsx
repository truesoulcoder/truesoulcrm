// src/components/maps/StreetViewMap.tsx
'use client';

import { GoogleMap, StreetViewPanorama, MarkerF } from '@react-google-maps/api';
import { MapPin, AlertTriangle, Loader2, RefreshCw, Eye, Map } from 'lucide-react';
import React, { useState, useEffect, useRef, useCallback } from 'react';

import { useGoogleMapsApi } from './GoogleMapsLoader';

interface StreetViewMapProps {
  address: string;
  containerStyle?: React.CSSProperties;
  isMapsApiLoaded: boolean; // Added this prop
}

const defaultContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '300px',
  borderRadius: '0.5rem',
  position: 'relative', // Added for positioning child elements
  overflow: 'hidden', // Ensures content stays within rounded corners
};

const ErrorDisplay: React.FC<{ message: string; style: React.CSSProperties }> = ({ message, style }) => (
  <div style={style} className="flex flex-col items-center justify-center bg-base-200 text-base-content p-4">
    <AlertTriangle className="w-8 h-8 mb-2 text-error" />
    <p className="text-sm text-center">{message}</p>
  </div>
);

const LoadingDisplay: React.FC<{ message: string; style: React.CSSProperties }> = ({ message, style }) => (
  <div style={style} className="flex flex-col items-center justify-center bg-base-200 text-base-content p-4">
    <Loader2 className="w-8 h-8 mb-2 animate-spin text-primary" />
    <p className="text-sm text-center">{message}</p>
  </div>
);

// Renamed isApiReady to isMapsApiLoaded
const StreetViewMapContent: React.FC<StreetViewMapProps & { isMapsApiLoaded: boolean }> = ({
  address,
  containerStyle = defaultContainerStyle,
  isMapsApiLoaded, // Use the new prop name
}) => {
  const [position, setPosition] = useState<google.maps.LatLngLiteral | null>(null);
  const [geocodingError, setGeocodingError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [hasStreetView, setHasStreetView] = useState<boolean>(false);
  const [showStreetView, setShowStreetView] = useState<boolean>(true);

  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const streetViewServiceRef = useRef<google.maps.StreetViewService | null>(null);

  // Moved checkStreetViewAvailability before geocodeAddressAndCheckStreetViewMemoized
  const checkStreetViewAvailability = useCallback(async (latLng: google.maps.LatLngLiteral): Promise<boolean> => {
    if (!streetViewServiceRef.current || !window.google?.maps?.StreetViewService) return false; // Added window.google.maps.StreetViewService check
    try {
      const { data } = await streetViewServiceRef.current.getPanorama({
        location: latLng,
        radius: 50,
        source: window.google.maps.StreetViewSource.OUTDOOR, // Prefer outdoor images
      });
      return data.location?.latLng !== undefined;
    } catch (error) {
      console.warn('Street View check failed:', error);
      return false;
    }
  }, []); // streetViewServiceRef.current will be initialized when isMapsApiLoaded is true

  // Memoize the geocode function to prevent infinite re-renders
  const geocodeAddressAndCheckStreetViewMemoized = useCallback(
    async (addr: string) => {
      if (!geocoderRef.current) {
        console.warn('Geocoder not ready.');
        return;
      }

      setIsGeocoding(true);
      setGeocodingError(null);
      setPosition(null);
      setHasStreetView(false);

      try {
        const { results } = await geocoderRef.current.geocode({ address: addr.trim() });
        if (results && results[0]?.geometry?.location) {
          const location = results[0].geometry.location;
          const latLng = { lat: location.lat(), lng: location.lng() };
          setPosition(latLng);
          
          // Check if Street View is available
          const hasSV = await checkStreetViewAvailability(latLng);
          setHasStreetView(hasSV);
        } else {
          setGeocodingError('No results found for this address.');
        }
      } catch (error) {
        console.error('Geocoding error:', error);
        setGeocodingError('Failed to find this location. Please try another address.');
      } finally {
        setIsGeocoding(false);
      }
    },
    [checkStreetViewAvailability] // Now checkStreetViewAvailability is declared above
  );

  // Initialize services when component mounts or when API is ready
  useEffect(() => {
    // Use isMapsApiLoaded from props
    if (isMapsApiLoaded && window.google?.maps) {
      geocoderRef.current = new window.google.maps.Geocoder();
      streetViewServiceRef.current = new window.google.maps.StreetViewService();
      
      // Initial geocode
      if (address) {
        void geocodeAddressAndCheckStreetViewMemoized(address);
      }
    }
    
    return () => {
      // Cleanup
      geocoderRef.current = null;
      streetViewServiceRef.current = null;
    };
  }, [address, geocodeAddressAndCheckStreetViewMemoized, isMapsApiLoaded]); // Dependency updated

  useEffect(() => {
    // Use isMapsApiLoaded from props
    if (isMapsApiLoaded && address) {
      const handler = setTimeout(() => {
        void geocodeAddressAndCheckStreetViewMemoized(address);
      }, 700); // Debounce
      return () => clearTimeout(handler);
    }
  }, [address, isMapsApiLoaded, geocodeAddressAndCheckStreetViewMemoized]); // Dependency updated

  const toggleViewMode = useCallback(() => {
    if (hasStreetView) { // Only toggle if Street View is an option
      setShowStreetView(prev => !prev);
    }
  }, [hasStreetView]);

  // Redundant checks for API readiness (criticalApiError, apiKey, etc.) are removed.
  // StreetViewMapContent relies on its parent ([StreetViewMap](cci:1://file:///c:/Users/gonzo/Documents/GitHub/crm-admin/src/components/maps/StreetViewMap.tsx:210:0-244:2)) to handle the main API loading/error states.
  // It will only render if isMapsApiLoaded is true, as enforced by the parent.

  // Show loading state while geocoding (this is specific to this component's logic)
  if (isGeocoding) {
    return <LoadingDisplay message="Fetching location data..." style={containerStyle} />;
  }

  // Show error if geocoding failed
  if (geocodingError) {
    return <ErrorDisplay message={geocodingError} style={containerStyle} />;
  }
  
  // Show message if no position is available
  if (!position) {
    return <ErrorDisplay message="No location data available." style={containerStyle} />;
  }
  
  const panoramaOptions = {
    position,
    pov: { heading: 34, pitch: 10 },
    visible: true,
    disableDefaultUI: true,
    clickToGo: true,
    scrollwheel: true,
  };

  const mapOptions = {
    center: position,
    zoom: 17,
    disableDefaultUI: true,
    gestureHandling: 'cooperative',
  };

  return (
    <div style={containerStyle}>
      {/* Ensure window.google.maps is available before trying to use related constants */}
      {isMapsApiLoaded && hasStreetView && (
        <button
          onClick={toggleViewMode}
          className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2 z-10 bg-base-100/70 hover:bg-base-100"
          aria-label={showStreetView ? "Switch to Map View" : "Switch to Street View"}
        >
          {showStreetView ? <Map size={18} /> : <Eye size={18} />}
        </button>
      )}

      {isMapsApiLoaded && showStreetView && hasStreetView ? (
        <StreetViewPanorama
          options={panoramaOptions}
        />
      ) : isMapsApiLoaded ? ( // Also check isMapsApiLoaded for GoogleMap
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={position}
          zoom={mapOptions.zoom}
          options={mapOptions}
        >
          <MarkerF position={position} title={address} />
        </GoogleMap>
      ) : null } {/* Render nothing or a placeholder if API not loaded */}
       {isMapsApiLoaded && !hasStreetView && position && (
         <div className="absolute bottom-2 left-2 bg-base-100/70 p-1.5 rounded text-xs text-base-content">
            Street View not available for this location. Showing map.
          </div>
       )}
    </div>
  );
};

// Main component that handles API loading state
const StreetViewMap: React.FC<Omit<StreetViewMapProps, 'isMapsApiLoaded'>> = (props) => {
  // This would typically come from a global context or a higher-level component
  // For this example, let's assume `useJsApiLoader` is used here or its result is passed down.
  // For simplicity, we'll simulate it being loaded.
  // In a real app, you'd use `useJsApiLoader` from `@react-google-maps/api`
  const isMapsApiLoaded = true; // Replace with actual API load check
  const [criticalApiError, setCriticalApiError] = useState<string | null>(null);

  // Simulate API loading and error
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      setCriticalApiError("Google Maps API key is missing. Please configure it in your environment variables.");
    }
    // Here you might also check if window.google.maps is available after script load
  }, []);


  if (criticalApiError) {
    return <ErrorDisplay message={criticalApiError} style={defaultContainerStyle} />;
  }

  if (!isMapsApiLoaded) {
    return <LoadingDisplay message="Loading Google Maps..." style={defaultContainerStyle} />;
  }

  return <StreetViewMapContent {...props} isMapsApiLoaded={isMapsApiLoaded} />;
};

export default StreetViewMap;
