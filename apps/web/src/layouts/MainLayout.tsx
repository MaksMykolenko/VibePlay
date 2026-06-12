import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { MobileNavbar } from '../components/MobileNavbar';
import { Footer } from '../components/Footer';
import { ToastContainer } from '../components/Toast';

export const MainLayout: React.FC = () => {
  return (
    <div style={layoutWrapperStyle}>
      {/* Toast notifications */}
      <ToastContainer />

      {/* Desktop Header */}
      <Navbar />

      {/* Main Content Area */}
      <main style={mainContentStyle}>
        <Outlet />
      </main>

      {/* Footer */}
      <Footer />

      {/* Mobile Sticky Footer Nav */}
      <div className="mobile-only-nav">
        <MobileNavbar />
      </div>
    </div>
  );
};

const layoutWrapperStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-primary)',
};

const mainContentStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  // On mobile screens, add padding so the sticky bottom navbar does not overlap content.
  // This is handled in CSS media queries or dynamically via a wrapper class.
};
