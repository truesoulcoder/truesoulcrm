'use client';

import { useJsApiLoader, Libraries } from '@react-google-maps/api';
import React, { memo, createContext, useContext } from 'react';

// Define the libraries array with the correct type
const libraries: Libraries = ['places', 'geocoding', 'streetView'];

interface GoogleMapsApiContextType {
  isLoaded: boolean;
  loadError?: Error;
}

export const GoogleMapsApiContext = createContext<GoogleMapsApiContextType | undefined>(undefined);

export const useGoogleMapsApi = () => {
  const context = useContext(GoogleMapsApiContext);
  if (context === undefined) {
    throw new Error('useGoogleMapsApi must be used within a GoogleMapsLoader');
  }
  return context;
};

interface GoogleMapsLoaderProps {
  children: React.ReactNode;
}

const GoogleMapsLoader: React.FC<GoogleMapsLoaderProps> = memo(({ children }) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-script-main-loader', // Ensures the script is loaded only once
    googleMapsApiKey: apiKey || '', // Pass empty string if apiKey is undefined, hook might handle it or error out
    libraries,
    preventGoogleFontsLoading: true,
  });

  if (!apiKey) {
    console.error('Google Maps API key is not set. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your environment variables.');
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
        Error: Google Maps API key is not configured. Mapping features will be unavailable.
      </div>
    );
  }

  // No changes needed for the error handling and loading states here,
  // but they will now be passed down via context.

  // The visual feedback for API key error, loadError, and loading state
  // should ideally be handled by consuming components or a global error boundary/notification system.
  // For now, GoogleMapsLoader can still return these messages, but children won't render.
  // Alternatively, pass these states through context and let children decide how to render.
  // For this refactor, we'll pass them through context and let this component also handle initial visual feedback.

  if (loadError) {
    console.error('GoogleMapsLoader: useJsApiLoader error:', loadError);
    // Return or display error, but also provide context for children who might handle it differently
  }

  // if (!isLoaded) {
    // console.log('GoogleMapsLoader: API loading via useJsApiLoader...');
    // Return or display loading, context will also reflect this
  // }
  
  // console.log('GoogleMapsLoader: API loaded successfully via useJsApiLoader. Rendering children.');

  return (
    <GoogleMapsApiContext.Provider value={{ isLoaded, loadError }}>
      {/* Render children regardless of isLoaded, allowing them to use the context values */}
      {/* However, if there's an API key issue, we might not want to render children */}
      {!apiKey ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
          Error: Google Maps API key is not configured. Mapping features will be unavailable.
        </div>
      ) : loadError ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'orange' }}>
          Error loading Google Maps: {loadError.message}. Some map features might be unavailable.
        </div>
      ) : !isLoaded ? (
        <div>Loading Google Maps via hook...</div> // Or any other loading indicator
      ) : (
        children
      )}
    </GoogleMapsApiContext.Provider>
  );
});

GoogleMapsLoader.displayName = 'GoogleMapsLoader';

export default GoogleMapsLoader;
