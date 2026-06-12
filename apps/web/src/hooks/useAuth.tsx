import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, UserRole } from '../types';
import { mockUsers, DEMO_PASSWORD } from '../data/mockUsers';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (email: string, password: string) => Promise<string | null>; // Returns error message or null
  logout: () => void;
  register: (username: string, email: string, displayName: string) => Promise<string | null>;
  becomeCreator: () => void;
  updateProfile: (displayName: string, bio: string, avatar: string) => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Initialize users and session from localStorage
  useEffect(() => {
    const storedUsers = localStorage.getItem('vibeplay_users');
    let loadedUsers = mockUsers;
    if (storedUsers) {
      try {
        loadedUsers = JSON.parse(storedUsers);
      } catch (e) {
        console.error(e);
      }
    } else {
      localStorage.setItem('vibeplay_users', JSON.stringify(mockUsers));
    }
    setUsers(loadedUsers);

    const storedSession = localStorage.getItem('vibeplay_current_user');
    if (storedSession) {
      try {
        setCurrentUser(JSON.parse(storedSession));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const login = async (email: string, password: string): Promise<string | null> => {
    // Basic validation
    if (!email || !password) return 'Please fill in all fields';
    if (password !== DEMO_PASSWORD && !email.includes('@')) {
      return 'Invalid password for this demo';
    }

    const foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!foundUser) {
      return 'Account not found. Use demo accounts for testing.';
    }

    setCurrentUser(foundUser);
    localStorage.setItem('vibeplay_current_user', JSON.stringify(foundUser));
    return null;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('vibeplay_current_user');
  };

  const register = async (username: string, email: string, displayName: string): Promise<string | null> => {
    if (!username || !email || !displayName) return 'All fields are required';
    
    const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase() || u.username.toLowerCase() === username.toLowerCase());
    if (exists) return 'Username or email already exists';

    const newUser: User = {
      id: `user_${Date.now()}`,
      username: username.toLowerCase().replace(/\s+/g, '_'),
      displayName,
      email,
      role: 'player', // Default role
      bio: 'New VibePlay gamer. Ready to play!',
      avatar: `https://images.unsplash.com/photo-${1535713875002 + Math.floor(Math.random() * 10000)}?w=150`, // Random avatar
      joinDate: new Date().toISOString().split('T')[0],
      followersCount: 0
    };

    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    localStorage.setItem('vibeplay_users', JSON.stringify(updatedUsers));

    // Auto login
    setCurrentUser(newUser);
    localStorage.setItem('vibeplay_current_user', JSON.stringify(newUser));

    return null;
  };

  const becomeCreator = () => {
    if (!currentUser) return;
    const updatedUser: User = { ...currentUser, role: 'creator' };
    
    // Update current user
    setCurrentUser(updatedUser);
    localStorage.setItem('vibeplay_current_user', JSON.stringify(updatedUser));

    // Update users list
    const updatedUsers = users.map(u => u.id === currentUser.id ? updatedUser : u);
    setUsers(updatedUsers);
    localStorage.setItem('vibeplay_users', JSON.stringify(updatedUsers));
  };

  const updateProfile = async (displayName: string, bio: string, avatar: string) => {
    if (!currentUser) return;
    const updatedUser: User = {
      ...currentUser,
      displayName: displayName || currentUser.displayName,
      bio: bio || currentUser.bio,
      avatar: avatar || currentUser.avatar
    };

    setCurrentUser(updatedUser);
    localStorage.setItem('vibeplay_current_user', JSON.stringify(updatedUser));

    const updatedUsers = users.map(u => u.id === currentUser.id ? updatedUser : u);
    setUsers(updatedUsers);
    localStorage.setItem('vibeplay_users', JSON.stringify(updatedUsers));
  };

  const switchDemoRole = (role: UserRole) => {
    // Quick role login for demo
    const matchingUser = users.find(u => u.role === role);
    if (matchingUser) {
      setCurrentUser(matchingUser);
      localStorage.setItem('vibeplay_current_user', JSON.stringify(matchingUser));
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, users, login, logout, register, becomeCreator, updateProfile, switchDemoRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
