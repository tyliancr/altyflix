import { createRoot } from 'react-dom/client'
import './index.css'
import { StrictMode } from 'react';
import { MotionConfig } from 'framer-motion';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA support
registerSW({
  onNeedRefresh() {
    window.location.reload();
  },
  onOfflineReady() {
    // App is ready to work offline (PWA cached)
  },
});



createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <ThemeProvider>
        <MotionConfig reducedMotion="user"><App /></MotionConfig>
      </ThemeProvider>
    </HelmetProvider>
  </StrictMode>,
)


