import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useGames } from '../../hooks/useGames';
import type { User, UserRole } from '../../types';
import { toast } from '../../components/toastEvents';
import { useI18n } from '../../i18n/useI18n';
import { ShieldAlert, Award, UserMinus, UserCheck } from 'lucide-react';
import { api } from '../../lib/api';

export const AdminUsers: React.FC = () => {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { games, suspendUserGames } = useGames();
  const [users, setUsers] = useState<User[]>([]);
  const [filterRole, setFilterRole] = useState<string>('all');

  const loadUsers = useCallback(async () => {
    const page = await api.adminListUsers({
      page: 1,
      perPage: 50,
      role: filterRole === 'all' ? undefined : filterRole.toUpperCase(),
    });
    setUsers(
      page.items.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role.toLowerCase() as UserRole,
        bio: user.bio,
        avatar: user.avatarUrl ?? '',
        joinDate: user.createdAt,
        followersCount: 0,
        creatorPlus: user.creatorPlus,
        isSuspended: user.status === 'SUSPENDED' || user.status === 'BANNED',
      })),
    );
  }, [filterRole]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers().catch((error) => {
        toast.danger(error instanceof Error ? error.message : t('admin.users.loadFailed'));
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, t]);

  const getGamesCount = (userId: string) => {
    return games.filter((g) => g.creatorId === userId).length;
  };

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    if (userId === currentUser?.id) {
      toast.danger(t('admin.users.cannotAlterSelf'));
      return;
    }

    if (newRole !== 'creator') {
      toast.warning(t('admin.users.onlyCreatorPromotion'));
      return;
    }
    void api
      .adminPromoteCreator(userId)
      .then(loadUsers)
      .then(() => toast.success(t('admin.users.promoted')))
      .catch((error) =>
        toast.danger(error instanceof Error ? error.message : t('admin.users.updateFailed')),
      );
  };

  const handleStatusChange = (userId: string, isSuspended: boolean) => {
    if (userId === currentUser?.id) {
      toast.danger(t('admin.users.cannotSuspendSelf'));
      return;
    }

    // Audit reason recorded server-side (kept in English for the audit trail).
    const operation = isSuspended
      ? api.adminSuspendUser(userId, 'Suspended from the admin user directory')
      : api.adminRestoreUser(userId);
    void operation
      .then(loadUsers)
      .then(() => {
        if (isSuspended) {
          suspendUserGames(userId);
          toast.danger(t('admin.users.suspended'));
        } else {
          toast.success(t('admin.users.restored'));
        }
      })
      .catch((error) =>
        toast.danger(error instanceof Error ? error.message : t('admin.users.updateFailed')),
      );
  };

  const roleLabel = (role: string): string => t(`role.${role}`);

  const filteredUsers = users.filter((u) => {
    if (filterRole === 'all') return true;
    return u.role === filterRole;
  });

  return (
    <div style={containerStyle} className="animate-fade">
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1>{t('admin.userDirectory')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
            {t('admin.users.subtitle')}
          </p>
        </div>

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="form-input form-select"
          style={filterSelectStyle}
        >
          <option value="all">{t('admin.users.allRoles')}</option>
          <option value="player">{t('admin.users.playersOnly')}</option>
          <option value="creator">{t('admin.users.creatorsOnly')}</option>
          <option value="admin">{t('admin.users.adminsOnly')}</option>
        </select>
      </div>

      <hr style={hrStyle} />

      {/* Directory Table */}
      <div style={tableWrapperStyle} className="bg-glass">
        <table style={tableStyle}>
          <thead>
            <tr style={tableHeaderRowStyle}>
              <th style={thStyle}>{t('common.user')}</th>
              <th style={thStyle}>{t('common.email')}</th>
              <th style={thStyle}>{t('common.role')}</th>
              <th style={thStyle}>{t('admin.users.colGames')}</th>
              <th style={thStyle}>{t('admin.users.colStatus')}</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => {
              const isSuspended = user.isSuspended === true;

              return (
                <tr key={user.id} style={tableBodyRowStyle}>
                  {/* Avatar & username */}
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={user.avatar} alt="" style={avatarStyle} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{user.displayName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          @{user.username}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td style={tdStyle}>{user.email}</td>

                  {/* Role Badge */}
                  <td style={tdStyle}>
                    <span
                      className={`badge ${user.role === 'owner' ? 'badge-danger' : user.role === 'admin' ? 'badge-danger' : user.role === 'creator' ? 'badge-success' : 'badge-primary'}`}
                    >
                      {roleLabel(user.role)}
                    </span>
                  </td>

                  {/* Games Count */}
                  <td style={tdStyle}>{t('home.gamesCount', { count: getGamesCount(user.id) })}</td>

                  {/* Account Status */}
                  <td style={tdStyle}>
                    {isSuspended ? (
                      <span className="badge badge-danger">{t('admin.users.statusSuspended')}</span>
                    ) : (
                      <span className="badge badge-success">{t('admin.users.statusActive')}</span>
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
                          title={t('admin.users.promoteToCreator')}
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
                          title={t('admin.users.demoteToPlayer')}
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
                          title={t('admin.users.restoreAccount')}
                        >
                          <UserCheck size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(user.id, true)}
                          className="btn btn-danger btn-sm"
                          style={actionBtnStyle}
                          title={t('admin.users.suspendAccount')}
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
  gap: '1.5rem',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '12px',
};

const filterSelectStyle: React.CSSProperties = {
  width: '180px',
  padding: '0.6rem 2.5rem 0.6rem 1rem',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '0.25rem 0',
};

const tableWrapperStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  overflowX: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
  fontSize: '0.9rem',
};

const tableHeaderRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-surface)',
};

const thStyle: React.CSSProperties = {
  padding: '1rem 1.25rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  letterSpacing: '0.05em',
};

const tableBodyRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-color)',
  transition: 'background-color 0.2s',
};

const tdStyle: React.CSSProperties = {
  padding: '1rem 1.25rem',
  verticalAlign: 'middle',
};

const avatarStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  objectFit: 'cover',
  border: '1px solid var(--border-color)',
};

const actionsContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  justifyContent: 'flex-end',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
};
