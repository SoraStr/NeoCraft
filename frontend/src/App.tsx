import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Setup from './pages/Setup';
import Console from './pages/Console';
import Config from './pages/Config';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-[#0a0a0a] text-[#e0e0e0]">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/console/:id" element={<Console />} />
            <Route path="/config/:id" element={<Config />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
