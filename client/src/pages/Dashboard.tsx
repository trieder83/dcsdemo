import { useState, useEffect } from 'react';
import { usersApi, dataApi } from '../utils/api';
import { useCrypto } from '../context/CryptoContext';
import { useAuth } from '../context/AuthContext';

type TabType = 'users' | 'data';

interface User {
  id: number;
  username: string;
  name: string;
  surname: string;
  birthdate: string;
  email: string;
  is_active: number;
  role_name: string;
}

interface DataRecord {
  id: number;
  key: string;
  value: string;
  created_at: string;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { hasDataKey, needsKeySetup, needsRelogin, setupKeys, decrypt, encrypt, loading: cryptoLoading } = useCrypto();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<DataRecord[]>([]);
  const [decryptedUsers, setDecryptedUsers] = useState<Record<number, User>>({});
  const [decryptedData, setDecryptedData] = useState<Record<number, DataRecord>>({});
  const [showDecrypted, setShowDecrypted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [settingUpKeys, setSettingUpKeys] = useState(false);
  const [keySetupError, setKeySetupError] = useState('');

  // New data form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [addingData, setAddingData] = useState(false);

  async function handleSetupKeys() {
    setSettingUpKeys(true);
    setKeySetupError('');
    try {
      await setupKeys();
      // Reload the page to refresh crypto state
      window.location.reload();
    } catch (error: any) {
      setKeySetupError(error.message || 'Failed to set up keys');
    } finally {
      setSettingUpKeys(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    if (hasDataKey && !cryptoLoading) {
      decryptAllData();
    }
  }, [hasDataKey, cryptoLoading, users, data]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const result = await usersApi.list();
        setUsers(result);
      } else {
        const result = await dataApi.list();
        setData(result);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function decryptAllData() {
    if (!hasDataKey) return;

    // Decrypt users
    const decUsers: Record<number, User> = {};
    for (const u of users) {
      decUsers[u.id] = {
        ...u,
        name: u.name ? await decrypt(u.name) : '',
        surname: u.surname ? await decrypt(u.surname) : '',
        birthdate: u.birthdate ? await decrypt(u.birthdate) : '',
        email: u.email ? await decrypt(u.email) : ''
      };
    }
    setDecryptedUsers(decUsers);

    // Decrypt data
    const decData: Record<number, DataRecord> = {};
    for (const d of data) {
      decData[d.id] = {
        ...d,
        value: d.value ? await decrypt(d.value) : ''
      };
    }
    setDecryptedData(decData);
  }

  async function handleAddData(e: React.FormEvent) {
    e.preventDefault();
    if (!hasDataKey) {
      alert('No data key available. Ask an admin to grant you access.');
      return;
    }

    setAddingData(true);
    try {
      const encryptedValue = await encrypt(newValue);
      await dataApi.create(newKey, encryptedValue);
      setNewKey('');
      setNewValue('');
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to add data');
    } finally {
      setAddingData(false);
    }
  }

  const canAddData = user?.role === 'admin-role' || user?.role === 'user-role';

  function getRoleBadge(role: string) {
    const classes: Record<string, string> = {
      'admin-role': 'badge badge-admin',
      'user-role': 'badge badge-user',
      'view-role': 'badge badge-view'
    };
    return <span className={classes[role] || 'badge'}>{role}</span>;
  }

  function displayValue(encrypted: string, decrypted: string | undefined) {
    if (showDecrypted && decrypted !== undefined && hasDataKey) {
      return <span className="decrypted-data">{decrypted}</span>;
    }
    return <span className="encrypted-data" title={encrypted}>{encrypted?.substring(0, 30)}...</span>;
  }

  // Show re-login prompt if KEK is missing (page refresh)
  if (needsRelogin && user?.username !== 'seed') {
    return (
      <div>
        <div className="card" style={{ maxWidth: 500, margin: '0 auto' }}>
          <h2 style={{ marginBottom: 20 }}>Session Expired</h2>
          <p style={{ marginBottom: 20, color: '#666' }}>
            Your encryption session has expired. Please log in again to access encrypted data.
          </p>
          <p style={{ marginBottom: 20, fontSize: 13, color: '#888' }}>
            This happens after a page refresh because encryption keys are derived from your password
            and are never stored permanently for security.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => logout()}
            style={{ width: '100%' }}
          >
            Log In Again
          </button>
        </div>
      </div>
    );
  }

  // Check if error indicates password change
  const passwordChanged = keySetupError.includes('Password may have changed');

  // Show key setup prompt if needed
  if (needsKeySetup && user?.username !== 'seed') {
    return (
      <div>
        <div className="card" style={{ maxWidth: 500, margin: '0 auto' }}>
          <h2 style={{ marginBottom: 20 }}>Key Setup Required</h2>

          {passwordChanged ? (
            <>
              <div className="error" style={{ marginBottom: 15 }}>
                <strong>Password mismatch</strong>
              </div>
              <p style={{ marginBottom: 20, color: '#666' }}>
                Your password appears to have changed since your encryption keys were set up.
                The current password cannot decrypt your existing keys.
              </p>
              <div style={{
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: 6,
                padding: 15,
                marginBottom: 20
              }}>
                <strong style={{ color: '#856404' }}>To recover access:</strong>
                <p style={{ color: '#856404', marginTop: 10, marginBottom: 0 }}>
                  Ask an administrator to click "Reset Keys" for your account on the Admin page.
                  Then log in again and set up new encryption keys.
                </p>
              </div>
            </>
          ) : (
            <>
              <p style={{ marginBottom: 20, color: '#666' }}>
                Your encryption keys need to be set up. This will generate a secure key pair
                that can be used on any device with your password.
              </p>
              {keySetupError && <div className="error">{keySetupError}</div>}
            </>
          )}

          <button
            className="btn btn-primary"
            onClick={handleSetupKeys}
            disabled={settingUpKeys || passwordChanged}
            style={{ width: '100%' }}
          >
            {settingUpKeys ? 'Setting up keys...' : 'Set Up Encryption Keys'}
          </button>

          {!passwordChanged && (
            <p style={{ marginTop: 15, fontSize: 12, color: '#888' }}>
              Note: Your keys are encrypted with your password and stored on the server,
              allowing you to access encrypted data from any device.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2>Dashboard</h2>
          <div>
            <label style={{ marginRight: 10 }}>
              <input
                type="checkbox"
                checked={showDecrypted}
                onChange={(e) => setShowDecrypted(e.target.checked)}
                disabled={!hasDataKey}
              />
              {' '}Show decrypted
            </label>
            {!hasDataKey && user?.username !== 'seed' && (
              <span style={{ color: '#dc3545', fontSize: 12 }}>(Waiting for access)</span>
            )}
            {user?.username === 'seed' && (
              <span style={{ color: '#ffc107', fontSize: 12 }}>(Seed user - no encryption)</span>
            )}
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          <button
            className={`tab ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            Data
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : activeTab === 'users' ? (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Name</th>
                <th>Surname</th>
                <th>Birthdate</th>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>{displayValue(u.name, decryptedUsers[u.id]?.name)}</td>
                  <td>{displayValue(u.surname, decryptedUsers[u.id]?.surname)}</td>
                  <td>{displayValue(u.birthdate, decryptedUsers[u.id]?.birthdate)}</td>
                  <td>{displayValue(u.email, decryptedUsers[u.id]?.email)}</td>
                  <td>{getRoleBadge(u.role_name)}</td>
                  <td>{u.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            {canAddData && (
              <form onSubmit={handleAddData} style={{ marginBottom: 20, display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  required
                  style={{ width: 150 }}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Value (will be encrypted)"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  required
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary" disabled={addingData || !hasDataKey}>
                  {addingData ? 'Adding...' : 'Add Record'}
                </button>
              </form>
            )}
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Key</th>
                  <th>Value</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td>{d.id}</td>
                    <td>{d.key}</td>
                    <td>{displayValue(d.value, decryptedData[d.id]?.value)}</td>
                    <td>{new Date(d.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
