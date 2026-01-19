import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCrypto } from '../context/CryptoContext';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth();
  const { clearKeys, hasDataKey, needsKeySetup, needsRelogin } = useCrypto();
  const location = useLocation();

  async function handleLogout() {
    await clearKeys();
    await logout();
  }

  const isActive = (path: string) => location.pathname === path;

  function getKeyStatus() {
    if (user?.username === 'seed') {
      return <span style={{ color: '#ffc107' }}>(seed - no crypto)</span>;
    }
    if (needsRelogin) {
      return <span style={{ color: '#dc3545' }}>(session expired)</span>;
    }
    if (needsKeySetup) {
      return <span style={{ color: '#dc3545' }}>(needs setup)</span>;
    }
    if (!hasDataKey) {
      return <span style={{ color: '#ffc107' }}>(waiting access)</span>;
    }
    return <span style={{ color: '#28a745' }}>(ready)</span>;
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">DCS Demo</div>

        <nav className="sidebar-nav">
          <Link to="/" className={isActive('/') ? 'active' : ''}>
            Dashboard
          </Link>
          {user?.role === 'admin-role' && (
            <Link to="/admin" className={isActive('/admin') ? 'active' : ''}>
              Admin
            </Link>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">{user?.username}</div>
          <div className="sidebar-role">
            {user?.role}
          </div>
          <div style={{ fontSize: 11, marginBottom: 10 }}>
            Keys: {getKeyStatus()}
          </div>
          <button className="btn btn-danger" onClick={handleLogout} style={{ width: '100%' }}>
            Logout
          </button>
        </div>
      </aside>

      <div className="main-content">
        <div className="container" style={{ padding: 20 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
