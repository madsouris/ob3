import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { App } from '@/app';
import { WorkspaceProvider } from '@/lib/workspace';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <TooltipProvider delayDuration={300}>
      <WorkspaceProvider>
        <App />
        <Toaster position="bottom-right" closeButton />
      </WorkspaceProvider>
    </TooltipProvider>
  </StrictMode>,
);
