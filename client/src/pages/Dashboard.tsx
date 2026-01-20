import { useState, useEffect, useMemo } from 'react';
import { usersApi, dataApi, membersApi, Member, WeightRecord } from '../utils/api';
import { useCrypto } from '../context/CryptoContext';
import { useAuth } from '../context/AuthContext';
import { useLlm } from '../context/LlmContext';
import { maskMemberData, maskWeightMeasurements, MaskMapping, WeightMeasurement } from '../utils/masking';
import { analyzePII, PIIAnalysisResult, getMaskSuggestions } from '../utils/piiProtection';

type TabType = 'users' | 'data' | 'members';

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

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { hasDataKey, needsKeySetup, needsRelogin, setupKeys, decrypt, encrypt, loading: cryptoLoading, reloadKeys } = useCrypto();
  const { hasApiKey, saveApiKey, askLlm, settings: llmSettings } = useLlm();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [weightRecords, setWeightRecords] = useState<WeightRecord[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [decryptedUsers, setDecryptedUsers] = useState<Record<number, User>>({});
  const [decryptedMembers, setDecryptedMembers] = useState<Record<number, Member>>({});
  const [showDecrypted, setShowDecrypted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [settingUpKeys, setSettingUpKeys] = useState(false);
  const [keySetupError, setKeySetupError] = useState('');

  // New weight form
  const [newWeightMemberId, setNewWeightMemberId] = useState<number | ''>('');
  const [newWeight, setNewWeight] = useState('');
  const [newWeightDate, setNewWeightDate] = useState(new Date().toISOString().split('T')[0]);
  const [addingWeight, setAddingWeight] = useState(false);

  // Selected weight records for LLM
  const [selectedWeightIds, setSelectedWeightIds] = useState<Set<number>>(new Set());

  // New member form
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberSurname, setNewMemberSurname] = useState('');
  const [newMemberBirthdate, setNewMemberBirthdate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 15);
    return date.toISOString().split('T')[0];
  });
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberGender, setNewMemberGender] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // LLM Settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [settingsEndpoint, setSettingsEndpoint] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Ask LLM modal
  const [showAskModal, setShowAskModal] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [askingLlm, setAskingLlm] = useState(false);
  const [askResult, setAskResult] = useState<{
    request: string;
    rawResponse: string;
    displayResponse: string;
  } | null>(null);
  const [askError, setAskError] = useState('');
  const [currentAskContext, setCurrentAskContext] = useState<{
    type: 'weight' | 'member';
    ids: number[];
    maskedText: string;
    mappings: MaskMapping[];
  } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // PII Analysis - memoized to update when question or mappings change
  const piiAnalysis = useMemo<PIIAnalysisResult | null>(() => {
    if (!currentAskContext || !askQuestion) return null;
    return analyzePII(askQuestion, currentAskContext.mappings);
  }, [askQuestion, currentAskContext]);

  // Available mask suggestions
  const maskSuggestions = useMemo(() => {
    if (!currentAskContext) return [];
    return getMaskSuggestions(currentAskContext.mappings);
  }, [currentAskContext]);

  async function handleSetupKeys() {
    setSettingUpKeys(true);
    setKeySetupError('');
    try {
      await setupKeys();
      // State updates automatically - no reload needed
      // (reload would lose the password-derived KEK)
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
  }, [hasDataKey, cryptoLoading, users, members]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const result = await usersApi.list();
        setUsers(result);
      } else if (activeTab === 'data') {
        // Load both weight records and members (for dropdown and decryption)
        const [weightResult, membersResult] = await Promise.all([
          dataApi.list(),
          membersApi.list()
        ]);
        setWeightRecords(weightResult);
        setMembers(membersResult);
      } else if (activeTab === 'members') {
        const result = await membersApi.list();
        setMembers(result);
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

    // Decrypt members (weight records use member names which are encrypted)
    const decMembers: Record<number, Member> = {};
    for (const m of members) {
      decMembers[m.id] = {
        ...m,
        name: m.name ? await decrypt(m.name) : '',
        surname: m.surname ? await decrypt(m.surname) : '',
        birthdate: m.birthdate ? await decrypt(m.birthdate) : '',
        email: m.email ? await decrypt(m.email) : '',
        gender: m.gender ? await decrypt(m.gender) : ''
      };
    }
    setDecryptedMembers(decMembers);
  }

  async function handleAddWeight(e: React.FormEvent) {
    e.preventDefault();
    if (!newWeightMemberId || !newWeight || !newWeightDate) {
      alert('Please fill in all fields');
      return;
    }

    setAddingWeight(true);
    try {
      await dataApi.create(
        newWeightMemberId as number,
        parseFloat(newWeight),
        newWeightDate
      );
      setNewWeightMemberId('');
      setNewWeight('');
      setNewWeightDate(new Date().toISOString().split('T')[0]);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to add weight record');
    } finally {
      setAddingWeight(false);
    }
  }

  async function handleDeleteWeight(id: number) {
    if (!confirm('Are you sure you want to delete this weight record?')) return;
    try {
      await dataApi.delete(id);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to delete weight record');
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!hasDataKey) {
      alert('No data key available. Ask an admin to grant you access.');
      return;
    }

    setAddingMember(true);
    try {
      const encryptedName = newMemberName ? await encrypt(newMemberName) : '';
      const encryptedSurname = newMemberSurname ? await encrypt(newMemberSurname) : '';
      const encryptedBirthdate = newMemberBirthdate ? await encrypt(newMemberBirthdate) : '';
      const encryptedEmail = newMemberEmail ? await encrypt(newMemberEmail) : '';
      const encryptedGender = newMemberGender ? await encrypt(newMemberGender) : '';

      await membersApi.create({
        name: encryptedName,
        surname: encryptedSurname,
        birthdate: encryptedBirthdate,
        email: encryptedEmail,
        gender: encryptedGender
      });
      setNewMemberName('');
      setNewMemberSurname('');
      setNewMemberBirthdate('');
      setNewMemberEmail('');
      setNewMemberGender('');
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  }

  async function handleDeleteMember(id: number) {
    if (!confirm('Are you sure you want to delete this member?')) return;
    try {
      await membersApi.delete(id);
      loadData();
    } catch (error: any) {
      alert(error.message || 'Failed to delete member');
    }
  }

  // LLM Settings handlers
  async function handleSaveSettings() {
    if (!settingsApiKey) {
      alert('Please enter an API key');
      return;
    }
    setSavingSettings(true);
    try {
      await saveApiKey(settingsApiKey, settingsEndpoint || undefined);
      setShowSettingsModal(false);
      setSettingsApiKey('');
    } catch (error: any) {
      alert(error.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  }

  // Toggle weight record selection
  function toggleWeightSelection(id: number) {
    setSelectedWeightIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Select/deselect all non-deleted weight records
  function toggleAllWeights() {
    const nonDeleted = weightRecords.filter(w => !w.deleted).map(w => w.id);
    if (selectedWeightIds.size === nonDeleted.length) {
      setSelectedWeightIds(new Set());
    } else {
      setSelectedWeightIds(new Set(nonDeleted));
    }
  }

  // Ask LLM handlers
  function handleOpenAskWeights() {
    if (selectedWeightIds.size === 0) {
      alert('Please select at least one weight record');
      return;
    }

    // Build measurements array from selected records
    const measurements: WeightMeasurement[] = [];
    for (const id of selectedWeightIds) {
      const w = weightRecords.find(r => r.id === id);
      if (w && !w.deleted) {
        const decryptedMember = decryptedMembers[w.member_id];
        const memberName = decryptedMember
          ? `${decryptedMember.name || ''} ${decryptedMember.surname || ''}`.trim()
          : `Member #${w.member_id}`;
        const memberGender = decryptedMember?.gender || undefined;
        measurements.push({
          id: w.id,
          memberId: w.member_id,
          memberName,
          memberGender,
          weight: w.weight,
          date: w.date
        });
      }
    }

    const { maskedText, mappings } = maskWeightMeasurements(measurements);
    setCurrentAskContext({ type: 'weight', ids: Array.from(selectedWeightIds), maskedText, mappings });
    setAskQuestion('');
    setAskResult(null);
    setAskError('');
    setShowAskModal(true);
  }

  function handleOpenAskMember(m: Member) {
    const decrypted = decryptedMembers[m.id];
    if (!decrypted) {
      alert('Member data not decrypted yet');
      return;
    }
    const { maskedText, mappings } = maskMemberData(m.id, {
      name: decrypted.name || undefined,
      surname: decrypted.surname || undefined,
      birthdate: decrypted.birthdate || undefined,
      email: decrypted.email || undefined,
      gender: decrypted.gender || undefined
    });
    setCurrentAskContext({ type: 'member', ids: [m.id], maskedText, mappings });
    setAskQuestion('');
    setAskResult(null);
    setAskError('');
    setShowAskModal(true);
  }

  async function handleAskLlm() {
    if (!currentAskContext || !askQuestion) return;

    // Check for unmatched PII
    if (piiAnalysis?.hasUnmatchedPII) {
      setAskError('Cannot send: Your question contains names or personal data that could not be matched. Please use the mask placeholders instead.');
      return;
    }

    setAskingLlm(true);
    setAskError('');
    setAskResult(null);

    try {
      // Use sanitized question (with PII replaced by masks)
      const sanitizedQuestion = piiAnalysis?.sanitizedText || askQuestion;
      const recordType = currentAskContext.type === 'weight' ? 'weight measurement(s)' : 'member';
      const fullPrompt = `Here is ${recordType} data:\n\n${currentAskContext.maskedText}\n\nQuestion: ${sanitizedQuestion}`;
      const result = await askLlm(
        fullPrompt,
        currentAskContext.mappings,
        currentAskContext.type,
        currentAskContext.ids[0]
      );
      setAskResult(result);
    } catch (error: any) {
      setAskError(error.message || 'Failed to get response from LLM');
    } finally {
      setAskingLlm(false);
    }
  }

  // Apply auto-replacement of detected PII
  function applyPIIReplacements() {
    if (piiAnalysis?.sanitizedText && piiAnalysis.sanitizedText !== askQuestion) {
      setAskQuestion(piiAnalysis.sanitizedText);
    }
  }

  // Insert mask at cursor position
  function insertMask(mask: string) {
    setAskQuestion(prev => prev + ' ' + mask);
    setShowSuggestions(false);
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            <button
              className={`tab ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
            >
              Members
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn"
              onClick={() => {
                setSettingsEndpoint(llmSettings?.endpoint || '');
                setShowSettingsModal(true);
              }}
              style={{ padding: '5px 15px', fontSize: 13 }}
              title="Configure LLM API Key"
            >
              LLM Settings {hasApiKey ? '(configured)' : ''}
            </button>
            <button
              className="btn"
              onClick={() => { loadData(); if (!hasDataKey) reloadKeys(); }}
              disabled={loading}
              style={{ padding: '5px 15px', fontSize: 13 }}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
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
        ) : activeTab === 'data' ? (
          <>
            {canAddData && (
              <form onSubmit={handleAddWeight} style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  className="input"
                  value={newWeightMemberId}
                  onChange={(e) => setNewWeightMemberId(e.target.value ? parseInt(e.target.value) : '')}
                  required
                  style={{ width: 200 }}
                >
                  <option value="">Select Member...</option>
                  {members.filter(m => !m.deleted).map(m => {
                    const dec = decryptedMembers[m.id];
                    const displayName = dec
                      ? `${dec.name || ''} ${dec.surname || ''}`.trim() || `Member #${m.id}`
                      : `Member #${m.id}`;
                    return (
                      <option key={m.id} value={m.id}>{displayName}</option>
                    );
                  })}
                </select>
                <input
                  type="number"
                  className="input"
                  placeholder="Weight (kg)"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  required
                  step="0.1"
                  min="0"
                  style={{ width: 120 }}
                />
                <input
                  type="date"
                  className="input"
                  value={newWeightDate}
                  onChange={(e) => setNewWeightDate(e.target.value)}
                  required
                  style={{ width: 150 }}
                />
                <button type="submit" className="btn btn-primary" disabled={addingWeight}>
                  {addingWeight ? 'Adding...' : 'Add Weight'}
                </button>
              </form>
            )}
            <div style={{ marginBottom: 15, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={handleOpenAskWeights}
                disabled={!hasApiKey || selectedWeightIds.size === 0}
                title={!hasApiKey ? 'Configure LLM API key first' : selectedWeightIds.size === 0 ? 'Select weight records first' : `Ask about ${selectedWeightIds.size} selected record(s)`}
              >
                Ask LLM ({selectedWeightIds.size} selected)
              </button>
              {selectedWeightIds.size > 0 && (
                <button
                  className="btn"
                  onClick={() => setSelectedWeightIds(new Set())}
                  style={{ padding: '5px 10px', fontSize: 12 }}
                >
                  Clear Selection
                </button>
              )}
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={weightRecords.filter(w => !w.deleted).length > 0 &&
                               weightRecords.filter(w => !w.deleted).every(w => selectedWeightIds.has(w.id))}
                      onChange={toggleAllWeights}
                      title="Select all"
                    />
                  </th>
                  <th>ID</th>
                  <th>Member</th>
                  <th>Weight (kg)</th>
                  <th>Date</th>
                  <th>Created</th>
                  {canAddData && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {weightRecords.map((w) => {
                  const decMember = decryptedMembers[w.member_id];
                  const memberDisplay = showDecrypted && decMember
                    ? <span className="decrypted-data">{`${decMember.name || ''} ${decMember.surname || ''}`.trim() || `#${w.member_id}`}</span>
                    : <span className="encrypted-data" title={w.member_name || ''}>
                        {w.member_name ? `${w.member_name.substring(0, 15)}...` : `#${w.member_id}`}
                      </span>;
                  return (
                    <tr key={w.id} style={w.deleted ? { opacity: 0.5, backgroundColor: '#f5f5f5' } : {}}>
                      <td>
                        {!w.deleted && (
                          <input
                            type="checkbox"
                            checked={selectedWeightIds.has(w.id)}
                            onChange={() => toggleWeightSelection(w.id)}
                          />
                        )}
                      </td>
                      <td>{w.id}</td>
                      <td>{memberDisplay}</td>
                      <td>{w.weight}</td>
                      <td>{w.date}</td>
                      <td>
                        {new Date(w.created_at).toLocaleString()}
                        {w.deleted && (
                          <div style={{ fontSize: 11, color: '#dc3545' }}>
                            Deleted: {new Date(w.deleted).toLocaleString()}
                          </div>
                        )}
                      </td>
                      {canAddData && (
                        <td>
                          {!w.deleted && (
                            <button
                              className="btn btn-danger"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => handleDeleteWeight(w.id)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : (
          <>
            {canAddData && (
              <form onSubmit={handleAddMember} style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Name"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  style={{ width: 150 }}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Surname"
                  value={newMemberSurname}
                  onChange={(e) => setNewMemberSurname(e.target.value)}
                  style={{ width: 150 }}
                />
                <input
                  type="date"
                  className="input"
                  value={newMemberBirthdate}
                  onChange={(e) => setNewMemberBirthdate(e.target.value)}
                  style={{ width: 150 }}
                />
                <input
                  type="email"
                  className="input"
                  placeholder="Email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  style={{ width: 200 }}
                />
                <select
                  className="input"
                  value={newMemberGender}
                  onChange={(e) => setNewMemberGender(e.target.value)}
                  style={{ width: 100 }}
                >
                  <option value="">-</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
                <button type="submit" className="btn btn-primary" disabled={addingMember || !hasDataKey}>
                  {addingMember ? 'Adding...' : 'Add Member'}
                </button>
              </form>
            )}
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Surname</th>
                  <th>Birthdate</th>
                  <th>Email</th>
                  <th>Gender</th>
                  <th>Created</th>
                  {canAddData && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} style={m.deleted ? { opacity: 0.5, backgroundColor: '#f5f5f5' } : {}}>
                    <td>{m.id}</td>
                    <td>{displayValue(m.name || '', decryptedMembers[m.id]?.name || '')}</td>
                    <td>{displayValue(m.surname || '', decryptedMembers[m.id]?.surname || '')}</td>
                    <td>{displayValue(m.birthdate || '', decryptedMembers[m.id]?.birthdate || '')}</td>
                    <td>{displayValue(m.email || '', decryptedMembers[m.id]?.email || '')}</td>
                    <td>{displayValue(m.gender || '', decryptedMembers[m.id]?.gender || '')}</td>
                    <td>
                      {new Date(m.created_at).toLocaleString()}
                      {m.deleted && (
                        <div style={{ fontSize: 11, color: '#dc3545' }}>
                          Deleted: {new Date(m.deleted).toLocaleString()}
                        </div>
                      )}
                    </td>
                    {canAddData && (
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {!m.deleted && hasDataKey && (
                            <button
                              className="btn"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => handleOpenAskMember(m)}
                              disabled={!hasApiKey}
                              title={hasApiKey ? 'Ask LLM about this member' : 'Configure LLM API key first'}
                            >
                              Ask
                            </button>
                          )}
                          {!m.deleted && (
                            <button
                              className="btn btn-danger"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => handleDeleteMember(m.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* LLM Settings Modal */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: 8,
            padding: 25,
            maxWidth: 500,
            width: '90%'
          }}>
            <h3 style={{ marginBottom: 20 }}>LLM Settings</h3>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 15 }}>
              Configure your Gemini API key. The key will be encrypted with your data key and stored securely.
            </p>

            <div className="form-group" style={{ marginBottom: 15 }}>
              <label>Gemini API Key</label>
              <input
                type="password"
                className="input"
                value={settingsApiKey}
                onChange={(e) => setSettingsApiKey(e.target.value)}
                placeholder={hasApiKey ? '(key already configured - enter new to replace)' : 'Enter your Gemini API key'}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Endpoint (optional)</label>
              <input
                type="text"
                className="input"
                value={settingsEndpoint}
                onChange={(e) => setSettingsEndpoint(e.target.value)}
                placeholder="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
              />
              <p style={{ fontSize: 11, color: '#888', marginTop: 5 }}>
                Leave empty for default Gemini endpoint
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={() => setShowSettingsModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveSettings}
                disabled={savingSettings || !settingsApiKey}
              >
                {savingSettings ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ask LLM Modal */}
      {showAskModal && currentAskContext && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: 8,
            padding: 25,
            maxWidth: 800,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginBottom: 15 }}>
              Ask LLM about {currentAskContext.type === 'weight'
                ? `${currentAskContext.ids.length} weight record(s)`
                : `member #${currentAskContext.ids[0]}`}
            </h3>

            <div style={{
              backgroundColor: '#f8f9fa',
              border: '1px solid #dee2e6',
              borderRadius: 6,
              padding: 15,
              marginBottom: 15,
              fontSize: 13
            }}>
              <strong>Masked data (sent to LLM):</strong>
              <pre style={{ margin: '10px 0 0 0', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {currentAskContext.maskedText}
              </pre>
            </div>

            <div className="form-group" style={{ marginBottom: 15 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label>Your question:</label>
                <button
                  className="btn"
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >
                  {showSuggestions ? 'Hide' : 'Show'} Mask Placeholders
                </button>
              </div>

              {showSuggestions && maskSuggestions.length > 0 && (
                <div style={{
                  backgroundColor: '#e7f3ff',
                  border: '1px solid #b3d7ff',
                  borderRadius: 4,
                  padding: 10,
                  marginBottom: 10,
                  fontSize: 12
                }}>
                  <strong>Available placeholders (click to insert):</strong>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {maskSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => insertMask(s.mask)}
                        style={{
                          backgroundColor: '#fff',
                          border: '1px solid #007bff',
                          borderRadius: 4,
                          padding: '3px 8px',
                          fontSize: 11,
                          cursor: 'pointer'
                        }}
                        title={s.hint}
                      >
                        {s.mask.replace(/\{\{\s*|\s*\}\}/g, '')}
                      </button>
                    ))}
                  </div>
                  <p style={{ marginTop: 8, marginBottom: 0, color: '#666', fontSize: 11 }}>
                    Hover over a placeholder to see a hint about its value.
                  </p>
                </div>
              )}

              <input
                type="text"
                className="input"
                value={askQuestion}
                onChange={(e) => setAskQuestion(e.target.value)}
                placeholder="e.g., Did this member lose or gain weight?"
                onKeyDown={(e) => e.key === 'Enter' && !askingLlm && !piiAnalysis?.hasUnmatchedPII && handleAskLlm()}
                style={piiAnalysis?.hasUnmatchedPII ? { borderColor: '#dc3545' } : {}}
              />

              {/* PII Detection Feedback */}
              {piiAnalysis && askQuestion && (
                <div style={{ marginTop: 10 }}>
                  {/* Warning for unmatched PII */}
                  {piiAnalysis.hasUnmatchedPII && (
                    <div style={{
                      backgroundColor: '#f8d7da',
                      border: '1px solid #f5c6cb',
                      borderRadius: 4,
                      padding: 10,
                      marginBottom: 10,
                      fontSize: 12,
                      color: '#721c24'
                    }}>
                      <strong>Privacy Warning:</strong> Detected personal data that cannot be automatically replaced:
                      <ul style={{ margin: '5px 0 0 20px', padding: 0 }}>
                        {piiAnalysis.unmatchedPII.map((p, i) => (
                          <li key={i}>"{p.text}" ({p.type})</li>
                        ))}
                      </ul>
                      <p style={{ marginTop: 8, marginBottom: 0 }}>
                        Please remove this data or use the mask placeholders above instead.
                      </p>
                    </div>
                  )}

                  {/* Auto-replacement available */}
                  {piiAnalysis.replacements.length > 0 && !piiAnalysis.hasUnmatchedPII && (
                    <div style={{
                      backgroundColor: '#d4edda',
                      border: '1px solid #c3e6cb',
                      borderRadius: 4,
                      padding: 10,
                      marginBottom: 10,
                      fontSize: 12,
                      color: '#155724'
                    }}>
                      <strong>Auto-detected:</strong> Names will be replaced with masks before sending:
                      <ul style={{ margin: '5px 0 0 20px', padding: 0 }}>
                        {piiAnalysis.replacements.map((r, i) => (
                          <li key={i}>"{r.original}" → <code>{r.mask}</code></li>
                        ))}
                      </ul>
                      <button
                        onClick={applyPIIReplacements}
                        style={{
                          marginTop: 8,
                          backgroundColor: '#28a745',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          padding: '4px 10px',
                          fontSize: 11,
                          cursor: 'pointer'
                        }}
                      >
                        Apply Replacements Now
                      </button>
                    </div>
                  )}

                  {/* Preview of sanitized question */}
                  {piiAnalysis.sanitizedText !== askQuestion && piiAnalysis.replacements.length > 0 && (
                    <div style={{
                      backgroundColor: '#f8f9fa',
                      border: '1px solid #dee2e6',
                      borderRadius: 4,
                      padding: 10,
                      fontSize: 12
                    }}>
                      <strong>Question that will be sent:</strong>
                      <pre style={{ margin: '5px 0 0 0', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 11 }}>
                        {piiAnalysis.sanitizedText}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              className="btn btn-primary"
              onClick={handleAskLlm}
              disabled={askingLlm || !askQuestion || piiAnalysis?.hasUnmatchedPII}
              style={{ marginBottom: 20 }}
              title={piiAnalysis?.hasUnmatchedPII ? 'Cannot send: contains unmatched personal data' : ''}
            >
              {askingLlm ? 'Asking...' : 'Ask'}
            </button>

            {askError && (
              <div className="error" style={{ marginBottom: 15 }}>{askError}</div>
            )}

            {askResult && (
              <div>
                <div style={{ marginBottom: 15 }}>
                  <strong>Request sent (masked):</strong>
                  <pre style={{
                    backgroundColor: '#e9ecef',
                    padding: 10,
                    borderRadius: 4,
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 150,
                    overflow: 'auto'
                  }}>
                    {askResult.request}
                  </pre>
                </div>

                <div style={{ marginBottom: 15 }}>
                  <strong>Raw LLM response (masked):</strong>
                  <pre style={{
                    backgroundColor: '#fff3cd',
                    border: '1px solid #ffc107',
                    padding: 10,
                    borderRadius: 4,
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 200,
                    overflow: 'auto'
                  }}>
                    {askResult.rawResponse}
                  </pre>
                </div>

                <div>
                  <strong>Display response (unmasked):</strong>
                  <pre style={{
                    backgroundColor: '#d4edda',
                    border: '1px solid #28a745',
                    padding: 10,
                    borderRadius: 4,
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    maxHeight: 200,
                    overflow: 'auto'
                  }}>
                    {askResult.displayResponse}
                  </pre>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                className="btn"
                onClick={() => {
                  setShowAskModal(false);
                  setCurrentAskContext(null);
                  setAskResult(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
