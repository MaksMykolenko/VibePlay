import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import type { UserRole } from '../../types';
import { toast } from '../../components/Toast';
import { ShieldAlert, Award, UserMinus, UserCheck } from 'lucide-react';

export const AdminUsers: React.FC = () => {
  const { users, currentUser } = useAuth();
  const { games, suspendUserGames } = useGames();

  const [filterRole, setFilterRole] = useState<string>('all');

  const getGamesCount = (userId: string) => {
    return games.filter(g => g.creatorId === userId).length;
  };

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    if (userId === currentUser?.id) {
      toast.danger('You cannot alter your own admin privileges.');
      return;
    }

    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        return { ...u, role: newRole };
      }
      return u;
    });

    localStorage.setItem('vibeplay_users', JSON.stringify(updatedUsers));
    window.dispatchEvent(new Event('storage'));
    toast.success(`User role updated to ${newRole.toUpperCase()}.`);
  };

  const handleStatusChange = (userId: string, isSuspended: boolean) => {
    if (userId === currentUser?.id) {
      toast.danger('You cannot suspend your own admin account.');
      return;
    }

    // Toggle custom status in local storage user profiles
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        // Embed a mock status key directly
        return { ...u, isSuspended };
      }
      return u;
    });

    localStorage.setItem('vibeplay_users', JSON.stringify(updatedUsers));
    window.dispatchEvent(new Event('storage'));

    if (isSuspended) {
      // Hide all games of this suspended user
      suspendUserGames(userId);
      toast.danger('User suspended and their builds were hidden.');
    } else {
      toast.success('User account restored successfully.');
    }
  };

  const filteredUsers = users.filter(u => {
    if (filterRole === 'all') return true;
    return u.role === filterRole;
  });

  return (
    <div style={containerStyle} className="animate-fade">
      
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1>User Directory</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Auditing and managing roles, privileges, and platform bans.</p>
        </div>
        
        <select 
          value={filterRole} 
          onChange={(e) => setFilterRole(e.target.value)} 
          className="form-input form-select" 
          style={filterSelectStyle}
        >
          <option value="all">All Roles</option>
          <option value="player">Players Only</option>
          <option value="creator">Creators Only</option>
          <option value="admin">Administrators Only</option>
        </select>
      </div>

      <hr style={hrStyle} />

      {/* Directory Table */}
      <div style={tableWrapperStyle} className="bg-glass">
        <table style={tableStyle}>
          <thead>
            <tr style={tableHeaderRowStyle}>
              <th style={thStyle}>User</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Created Games</th>
              <th style={thStyle}>Account Status</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              // Simulated suspend status check
              const isSuspended = (user as any).isSuspended === true;

              return (
                <tr key={user.id} style={tableBodyRowStyle}>
                  
                  {/* Avatar & username */}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={user.avatar} alt="" style={avatarStyle} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{user.displayName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>@{user.username}</div>
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td style={tdStyle}>{user.email}</td>

                  {/* Role Badge */}
                  <td style={tdStyle}>
                    <span className={`badge ${user.role === 'admin' ? 'badge-danger' : user.role === 'creator' ? 'badge-success' : 'badge-primary'}`}>
                      {user.role}
                    </span>
                  </td>

                  {/* Games Count */}
                  <td style={tdStyle}>{getGamesCount(user.id)} games</td>

                  {/* Account Status */}
                  <td style={tdStyle}>
                    {isSuspended ? (
                      <span className="badge badge-danger">Suspended</span>
                    ) : (
                      <span className="badge badge-success">Active</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={actionsContainerStyle}>
                      
                      {/* Change Role to Creator */}
                      {user.role === 'player' && (
                        <button 
                          onClick={() => handleRoleChange(user.id, 'creator')}
                          className="btn btn-secondary btn-sm"
                          style={actionBtnStyle}
                          title="Promote to Creator"
                        >
                          <Award size={14} />
                        </button>
                      )}

                      {/* Change Role to Player */}
                      {user.role === 'creator' && (
                        <button 
                          onClick={() => handleRoleChange(user.id, 'player')}
                          className="btn btn-secondary btn-sm"
                          style={actionBtnStyle}
                          title="Demote to Player"
                        >
                          <UserMinus size={14} />
                        </button>
                      )}

                      {/* Suspend / Restore */}
                      {isSuspended ? (
                        <button 
                          onClick={() => handleStatusChange(user.id, false)}
                          className="btn btn-secondary btn-sm"
                          style={{ ...actionBtnStyle, color: 'var(--success)' }}
                          title="Restore User Account"
                        >
                          <UserCheck size={14} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleStatusChange(user.id, true)}
                          className="btn btn-danger btn-sm"
                          style={actionBtnStyle}
                          title="Suspend User Account"
                        >
                          <ShieldAlert size={14} />
                        </button>
                      )}

                    </div>
                  </td>

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
};

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px'
};

const filterSelectStyle: React.CSSProperties = {
  width: '180px',
  padding: '0.6rem 2.5rem 0.6rem 1rem'
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '0.25rem 0'
};

const tableWrapperStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  overflowX: 'auto'
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
  fontSize: '0.9rem'
};

const tableHeaderRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-surface)'
};

const thStyle: React.CSSProperties = {
  padding: '1rem 1.25rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  letterSpacing: '0.05em'
};

const tableBodyRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-color)',
  transition: 'background-color 0.2s'
};

const tdStyle: React.CSSProperties = {
  padding: '1rem 1.25rem',
  verticalAlign: 'middle'
};

const avatarStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  objectFit: 'cover',
  border: '1px solid var(--border-color)'
};

const actionsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  justifyContent: 'flex-end'
};

const actionBtnStyle: React.CSSProperties = {
  padding: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px'
};
