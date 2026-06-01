import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Setup from './pages/Setup';
import Console from './pages/Console';
import Config from './pages/Config';
import Management from './pages/Management';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-app-bg text-app-text">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/console/:id" element={<Console />} />
            <Route path="/config/:id" element={<Config />} />
            <Route path="/manage/:id" element={<Management />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
