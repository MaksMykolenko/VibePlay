import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CurrentUserDto } from '@vibeplay/shared';
import { api } from '../lib/api';
import { errorMessage } from '../lib/api/errors';
import { DEMO_ROLES_ENABLED, IS_DEMO } from '../lib/appMode';
import type { User, UserRole } from '../types';

/**
 * Server-backed authentication context.
 *
 * The exposed `currentUser` keeps the legacy frontend `User` shape so existing
 * pages keep rendering; it is mapped from the server DTO. The server remains
 * the only authority for roles and permissions (spec §11).
 */

export interface AuthContextType {
  currentUser: User | null;
  /** Raw server DTO (status, emailVerified, …). */
  account: CurrentUserDto | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  register: (input: {
    username: string;
    email: string;
    displayName: string;
    password: string;
    inviteCode?: string;
  }) => Promise<string | null>;
  updateProfile: (displayName: string, bio: string, avatar: string) => Promise<string | null>;
  refresh: () => Promise<void>;
  /**
   * Real mode: roles are server-controlled; this returns an explanatory notice.
   * Demo build: switches to the demo creator account.
   */
  becomeCreator: () => string | null;
  /** Demo-build helper; no-op in real mode. */
  switchDemoRole: (role: UserRole) => void;
  readonly isDemo: boolean;
  readonly demoRolesEnabled: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function dtoToLegacyUser(dto: CurrentUserDto): User {
  return {
    id: dto.id,
    username: dto.username,
    displayName: dto.displayName,
    email: dto.email,
    role: dto.role.toLowerCase() as UserRole,
    bio: dto.bio,
    avatar: dto.avatarUrl ?? '',
    joinDate: dto.createdAt.slice(0, 10),
    followersCount: 0,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<CurrentUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      const user = await api.me();
      setAccount(user);
    } catch {
      setAccount(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((user) => {
        if (active) setAccount(user);
      })
      .catch(() => {
        if (active) setAccount(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!email || !password) return 'Please fill in all fields';
      try {
        const user = await api.login(email, password);
        setAccount(user);
        await queryClient.invalidateQueries();
        return null;
      } catch (err) {
        return errorMessage(err);
      }
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: {
      username: string;
      email: string;
      displayName: string;
      password: string;
      inviteCode?: string;
    }): Promise<string | null> => {
      try {
        const user = await api.register({
          email: input.email,
          username: input.username,
          displayName: input.displayName,
          password: input.password,
          inviteCode: input.inviteCode || undefined,
          acceptTerms: true,
        });
        setAccount(user);
        await queryClient.invalidateQueries();
        return null;
      } catch (err) {
        return errorMessage(err);
      }
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAccount(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const logoutAll = useCallback(async () => {
    try {
      await api.logoutAll();
    } finally {
      setAccount(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const updateProfile = useCallback(
    async (displayName: string, bio: string, avatar: string): Promise<string | null> => {
      try {
        const user = await api.updateProfile({
          displayName: displayName || undefined,
          bio,
          avatarUrl: avatar || null,
        });
        setAccount(user);
        return null;
      } catch (err) {
        return errorMessage(err);
      }
    },
    [],
  );

  const switchDemoRole = useCallback(
    (role: UserRole) => {
      // Statically folded out of the real bundle by Vite.
      if (import.meta.env.APP_MODE !== 'demo') return;
      if (!DEMO_ROLES_ENABLED) return;
      // OWNER is a real-mode founder role, not a switchable demo persona.
      if (role === 'owner') return;
      void api.demoLoginAs?.(role).then((user) => {
        setAccount(user);
        void queryClient.invalidateQueries();
      });
    },
    [queryClient],
  );

  const becomeCreator = useCallback((): string | null => {
    if (
      account?.role === 'CREATOR' ||
      account?.role === 'ADMIN' ||
      account?.role === 'OWNER'
    ) {
      return null;
    }
    if (IS_DEMO) {
      switchDemoRole('creator');
      return null;
    }
    return 'Creator access is invite-based during the private beta. Contact NeoFlux Software to get a creator invite.';
  }, [account, switchDemoRole]);

  const value: AuthContextType = {
    currentUser: account ? dtoToLegacyUser(account) : null,
    account,
    isLoading,
    login,
    logout,
    logoutAll,
    register,
    updateProfile,
    refresh,
    becomeCreator,
    switchDemoRole,
    isDemo: IS_DEMO,
    demoRolesEnabled: DEMO_ROLES_ENABLED,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
