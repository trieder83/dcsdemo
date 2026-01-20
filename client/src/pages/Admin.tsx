import { useState, useEffect } from 'react';
import { usersApi, keysApi, auditApi, AuditLog } from '../utils/api';
import { useCrypto } from '../context/CryptoContext';

interface User {
  id: number;
  username: string;
  name: string;
  surname: string;
  role_name: string;
  is_active: number;
}

interface UserKeyInfo {
  userId: number;
  hasPublicKey: boolean;
  hasWrappedKey: boolean;
  publicKey: string;
}

interface Role {
  id: number;
  name: string;
}

type AdminTab = 'users' | 'audit';

export default function Admin() {
  const { encrypt, wrapKeyForUser, hasDataKey } = useCrypto();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [userKeys, setUserKeys] = useState<Record<number, UserKeyInfo>>({});
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<Record<number, string>>({});

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditPage, setAuditPage] = useState(0);
  const [auditActions, setAuditActions] = useState<string[]>([]);
  const [filterAction, setFilterAction] = useState<string>('');
  const AUDIT_PAGE_SIZE = 25;

  // New user form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'audit') {
      loadAuditLogs();
      loadAuditActions();
    }
  }, [activeTab, auditPage, filterAction]);

  async function loadAuditLogs() {
    setAuditLoading(true);
    try {
      const result = await auditApi.list({
        limit: AUDIT_PAGE_SIZE,
        offset: auditPage * AUDIT_PAGE_SIZE,
        action: filterAction || undefined
      });
      setAuditLogs(result.logs);
      setAuditTotal(result.total);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setAuditLoading(false);
    }
  }

  async function loadAuditActions() {
    try {
      const actions = await auditApi.getActions();
      setAuditActions(actions);
    } catch (error) {
      console.error('Error loading audit actions:', error);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [usersResult, rolesResult] = await Promise.all([
        usersApi.list(),
        keysApi.getRoles()
      ]);
      setUsers(usersResult);
      setRoles(rolesResult);
      if (rolesResult.length > 0 && !roleId) {
        setRoleId(rolesResult.find(r => r.name === 'view-role')?.name || rolesResult[0].name);
      }

      // Load key info for each user
      const keyInfoMap: Record<number, UserKeyInfo> = {};
      for (const user of usersResult) {
        try {
          const keyInfo = await keysApi.get(user.id);
          const hasPublicKey = keyInfo.public_key &&
            keyInfo.public_key !== 'SEED_PUBLIC_KEY_PLACEHOLDER' &&
            keyInfo.public_key !== '';
          const hasWrappedKey = keyInfo.wrapped_data_key &&
            keyInfo.wrapped_data_key !== 'SEED_WRAPPED_KEY_PLACEHOLDER' &&
            keyInfo.wrapped_data_key !== '';
          keyInfoMap[user.id] = {
            userId: user.id,
            hasPublicKey,
            hasWrappedKey,
            publicKey: keyInfo.public_key
          };
        } catch {
          keyInfoMap[user.id] = {
            userId: user.id,
            hasPublicKey: false,
            hasWrappedKey: false,
            publicKey: ''
          };
        }
      }
      setUserKeys(keyInfoMap);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);

    try {
      // Don't encrypt PII here - the user will set up their own keys
      // and admin will grant access later. PII should be entered after user has keys.
      // For now, create user with empty PII - they can be updated later.

      // Create user with placeholder public key - user will set up real keys on first login
      const result = await usersApi.create({
        username,
        password,
        name: '',
        surname: '',
        birthdate: '',
        email: '',
        roleId,
        publicKey: '' // User will set this up on first login
      });

      setSuccess(`User "${username}" created! They must log in to set up encryption keys, then you can grant access.`);
      setUsername('');
      setPassword('');
      setName('');
      setSurname('');
      setBirthdate('');
      setEmail('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  async function handleGrantAccess(userId: number) {
    const keyInfo = userKeys[userId];
    if (!keyInfo?.hasPublicKey) {
      setActionStatus({ ...actionStatus, [userId]: 'User has no public key yet. They must log in first.' });
      return;
    }

    setActionStatus({ ...actionStatus, [userId]: 'Granting...' });
    try {
      const wrappedKey = await wrapKeyForUser(keyInfo.publicKey);
      await keysApi.grant(userId, wrappedKey);
      setActionStatus({ ...actionStatus, [userId]: 'Access granted!' });
      loadData();
    } catch (err: any) {
      setActionStatus({ ...actionStatus, [userId]: `Error: ${err.message}` });
    }
  }

  async function handleResetKeys(userId: number) {
    if (!confirm('Reset this user\'s keys? They will need to set up keys again and you\'ll need to grant access again.')) {
      return;
    }

    setActionStatus({ ...actionStatus, [userId]: 'Resetting...' });
    try {
      await keysApi.reset(userId);
      setActionStatus({ ...actionStatus, [userId]: 'Keys reset. User must set up keys again.' });
      loadData();
    } catch (err: any) {
      setActionStatus({ ...actionStatus, [userId]: `Error: ${err.message}` });
    }
  }

  function getKeyStatus(userId: number) {
    const info = userKeys[userId];
    if (!info) return <span style={{ color: '#999' }}>Loading...</span>;

    if (info.hasPublicKey && info.hasWrappedKey) {
      return <span style={{ color: '#28a745' }}>Ready</span>;
    }
    if (info.hasPublicKey && !info.hasWrappedKey) {
      return <span style={{ color: '#ffc107' }}>Needs access</span>;
    }
    return <span style={{ color: '#dc3545' }}>No keys</span>;
  }

  // Get users who need access (have public key but no wrapped key)
  const pendingAccessUsers = users.filter(u => {
    const keyInfo = userKeys[u.id];
    return keyInfo?.hasPublicKey && !keyInfo?.hasWrappedKey && u.username !== 'seed';
  });

  function getActionBadge(action: string) {
    const colors: Record<string, string> = {
      'LOGIN': '#28a745',
      'LOGIN_FAILED': '#dc3545',
      'LOGOUT': '#6c757d',
      'PASSWORD_CHANGE': '#17a2b8',
      'USER_CREATE': '#007bff',
      'USER_UPDATE': '#007bff',
      'USER_DEACTIVATE': '#ffc107',
      'KEY_SETUP': '#6f42c1',
      'KEY_RESET': '#fd7e14',
      'ACCESS_GRANT': '#20c997',
      'WEIGHT_CREATE': '#e83e8c',
      'WEIGHT_DELETE': '#dc3545',
      'MEMBER_CREATE': '#17a2b8',
      'MEMBER_DELETE': '#dc3545'
    };
    return (
      <span style={{
        backgroundColor: colors[action] || '#6c757d',
        color: '#fff',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500
      }}>
        {action}
      </span>
    );
  }

  const totalAuditPages = Math.ceil(auditTotal / AUDIT_PAGE_SIZE);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2>Admin Panel</h2>
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Users
            </button>
            <button
              className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              Audit Log
            </button>
          </div>
        </div>

        {activeTab === 'users' && (
          <>
            {!hasDataKey && (
              <div className="error" style={{ marginBottom: 20 }}>
                Warning: You don't have a data key. You cannot grant access to other users.
              </div>
            )}

            {/* Pending Access Requests - Prominent Section */}
        {pendingAccessUsers.length > 0 && (
          <div style={{
            backgroundColor: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: 8,
            padding: 20,
            marginBottom: 25
          }}>
            <h3 style={{ margin: 0, marginBottom: 15, color: '#856404', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                backgroundColor: '#ffc107',
                color: '#000',
                borderRadius: '50%',
                width: 28,
                height: 28,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: 14
              }}>
                {pendingAccessUsers.length}
              </span>
              Pending Access Requests
            </h3>
            <p style={{ color: '#856404', fontSize: 13, marginBottom: 15 }}>
              These users have set up their encryption keys and are waiting for you to grant them access to the data key.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingAccessUsers.map(user => (
                <div key={user.id} style={{
                  backgroundColor: '#fff',
                  border: '1px solid #ffc107',
                  borderRadius: 6,
                  padding: '12px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <strong>{user.username}</strong>
                    <span style={{ marginLeft: 10, color: '#666', fontSize: 13 }}>
                      Role: {user.role_name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {actionStatus[user.id] && (
                      <span style={{ fontSize: 12, color: actionStatus[user.id].startsWith('Error') ? '#dc3545' : '#28a745' }}>
                        {actionStatus[user.id]}
                      </span>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={() => handleGrantAccess(user.id)}
                      disabled={!hasDataKey}
                      style={{ padding: '8px 16px' }}
                    >
                      Grant Access
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <h3>Create New User</h3>
        <form onSubmit={handleCreateUser} style={{ marginBottom: 30 }}>
          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 15 }}>
            <div className="form-group">
              <label>Username *</label>
              <input
                type="text"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select
                className="input"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
            Note: PII data (name, email, etc.) should be added after user sets up encryption keys.
          </p>

          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Creating...' : 'Create User'}
          </button>
        </form>

        <h3>Existing Users</h3>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Key Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>{u.role_name}</td>
                  <td>{getKeyStatus(u.id)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      {u.username !== 'seed' && (
                        <>
                          {!userKeys[u.id]?.hasPublicKey ? (
                            <span style={{ color: '#999', fontSize: 12, fontStyle: 'italic' }}>
                              Waiting for public key...
                            </span>
                          ) : userKeys[u.id]?.hasWrappedKey ? (
                            <span style={{ color: '#28a745', fontSize: 12 }}>
                              Access granted
                            </span>
                          ) : (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '5px 10px', fontSize: 12 }}
                              onClick={() => handleGrantAccess(u.id)}
                              disabled={!hasDataKey}
                            >
                              Grant Access
                            </button>
                          )}
                          <button
                            className="btn btn-danger"
                            style={{ padding: '5px 10px', fontSize: 12 }}
                            onClick={() => handleResetKeys(u.id)}
                          >
                            Reset Keys
                          </button>
                        </>
                      )}
                      {actionStatus[u.id] && (
                        <span style={{ fontSize: 11, marginLeft: 5 }}>{actionStatus[u.id]}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
          </>
        )}

        {activeTab === 'audit' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Filter:
                  <select
                    className="input"
                    value={filterAction}
                    onChange={(e) => { setFilterAction(e.target.value); setAuditPage(0); }}
                    style={{ width: 180 }}
                  >
                    <option value="">All Actions</option>
                    {auditActions.map(action => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </label>
                <span style={{ color: '#666', fontSize: 13 }}>
                  {auditTotal} total entries
                </span>
              </div>
              <button
                className="btn"
                onClick={() => loadAuditLogs()}
                disabled={auditLoading}
                style={{ padding: '5px 15px', fontSize: 13 }}
              >
                {auditLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {auditLoading ? (
              <p>Loading...</p>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>User</th>
                      <th>Target</th>
                      <th>Details</th>
                      <th>IP</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td>{getActionBadge(log.action)}</td>
                        <td>{log.actor_username || '-'}</td>
                        <td>{log.target_username || '-'}</td>
                        <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.details || '-'}
                        </td>
                        <td style={{ fontSize: 11, color: '#666' }}>{log.ip_address || '-'}</td>
                        <td>
                          {log.success ? (
                            <span style={{ color: '#28a745' }}>OK</span>
                          ) : (
                            <span style={{ color: '#dc3545' }}>Failed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: '#666' }}>
                          No audit logs found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {totalAuditPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 15, marginTop: 20 }}>
                    <button
                      className="btn"
                      onClick={() => setAuditPage(p => Math.max(0, p - 1))}
                      disabled={auditPage === 0}
                      style={{ padding: '5px 15px' }}
                    >
                      Previous
                    </button>
                    <span style={{ color: '#666' }}>
                      Page {auditPage + 1} of {totalAuditPages}
                    </span>
                    <button
                      className="btn"
                      onClick={() => setAuditPage(p => Math.min(totalAuditPages - 1, p + 1))}
                      disabled={auditPage >= totalAuditPages - 1}
                      style={{ padding: '5px 15px' }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
