import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types/index.js';
import { apiRequest } from '../api/client.js';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isSales: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('captain_crm_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('captain_crm_token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    async function verifySession() {
      if (token) {
        try {
          const res = await apiRequest('/auth/me');
          if (res.success && res.user) {
            setUser(res.user);
            localStorage.setItem('captain_crm_user', JSON.stringify(res.user));
          }
        } catch (err) {
          console.warn('Session expired or invalid', err);
          logout();
        }
      }
      setIsLoading(false);
    }

    verifySession();
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.success && res.token && res.user) {
      setToken(res.token);
      setUser(res.user);
      localStorage.setItem('captain_crm_token', res.token);
      localStorage.setItem('captain_crm_user', JSON.stringify(res.user));
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('captain_crm_token');
    localStorage.removeItem('captain_crm_user');
  };

  const isAdmin = user?.role === 'ADMIN';
  const isSales = user?.role === 'SALES';

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, isAdmin, isSales }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
