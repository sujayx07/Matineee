import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles.css';

import { MotionConfig } from 'motion/react';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from './components/ui/Toaster';
import { Landing } from './pages/Landing';

const Room = lazy(() => import('./pages/Room').then((m) => ({ default: m.Room })));

// No StrictMode: its double-mount would open, drop and reopen the room
// connection on every visit, which is noisy for everyone else in the room.
createRoot(document.getElementById('root')!).render(
  <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/r/:code"
          element={
            <Suspense fallback={null}>
              <Room />
            </Suspense>
          }
        />
        <Route path="*" element={<Landing />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  </MotionConfig>,
);
