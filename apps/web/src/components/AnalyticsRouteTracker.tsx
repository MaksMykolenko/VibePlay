import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initGA, trackPageView } from '../lib/analytics';

export const AnalyticsRouteTracker: React.FC = () => {
  const location = useLocation();

  // Initialize GA once on mount
  useEffect(() => {
    initGA();
  }, []);

  // Track page views on location change
  useEffect(() => {
    // Wait a brief tick to ensure document.title is updated by the page component
    const timer = setTimeout(() => {
      trackPageView(location.pathname + location.search);
    }, 100);
    return () => clearTimeout(timer);
  }, [location]);

  return null;
};
