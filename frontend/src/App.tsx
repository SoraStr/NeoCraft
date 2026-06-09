import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Setup from './pages/Setup';
import Console from './pages/Console';
import Config from './pages/Config';
import Management from './pages/Management';
import About from './pages/About';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="flex h-screen overflow-hidden bg-app-bg text-app-text transition-theme">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/console/:id" element={<Console />} />
              <Route path="/config/:id" element={<Config />} />
              <Route path="/manage/:id" element={<Management />} />
              <Route path="/about" element={<About />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
