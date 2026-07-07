import { Link, Outlet } from 'react-router-dom';

// Shell estático do app — as páginas em src/pages são geradas pela esteira.
export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <strong>{{PROJECT_NAME}}</strong>
        <nav>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/settings">Configurações</Link>
          <Link to="/login">Login</Link>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="footer">Gerado pelo SaaS-Forge</footer>
    </div>
  );
}
