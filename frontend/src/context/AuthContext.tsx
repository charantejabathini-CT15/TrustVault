import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { authApi, profileApi } from '../services/api';
import {
  generateRsaKeyPair,
  exportPublicKeySpki,
  protectPrivateKey,
  unlockPrivateKey,
} from '../services/crypto';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  unlockedPrivateKey: CryptoKey | null;
  isVaultUnlocked: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, displayName: string, orgName: string) => Promise<User>;
  logout: () => Promise<void>;
  unlockVault: (passphrase: string) => Promise<boolean>;
  setupVault: (passphrase: string) => Promise<void>;
  lockVault: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlockedPrivateKey, setUnlockedPrivateKey] = useState<CryptoKey | null>(null);

  const refreshUser = async () => {
    try {
      const u = await authApi.me();
      setUser(u);
    } catch {
      setUser(null);
      setUnlockedPrivateKey(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const u = await authApi.login({ email, password });
    setUser(u);
    return u;
  };

  const register = async (email: string, password: string, displayName: string, orgName: string) => {
    const u = await authApi.register({
      email,
      password,
      display_name: displayName,
      org_name: orgName,
    });
    setUser(u);
    return u;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setUnlockedPrivateKey(null);
    }
  };

  // Setup new vault keys for user
  const setupVault = async (passphrase: string) => {
    // 1. Generate RSA-OAEP key pair
    const keyPair = await generateRsaKeyPair();

    // 2. Export public key to SPKI
    const publicKeySpki = await exportPublicKeySpki(keyPair.publicKey);

    // 3. Encrypt private key with passphrase using PBKDF2 (600,000 iterations)
    const { encryptedKeyBase64, saltBase64 } = await protectPrivateKey(
      keyPair.privateKey,
      passphrase,
      600000
    );

    // 4. Upload to backend (public key + protected private key + salt)
    await profileApi.uploadKeys({
      public_key: publicKeySpki,
      encrypted_private_key: encryptedKeyBase64,
      private_key_salt: saltBase64,
      pbkdf2_iterations: 600000,
    });

    // 5. Keep unlocked private key in memory
    setUnlockedPrivateKey(keyPair.privateKey);
    if (user) {
      setUser({ ...user, has_keys: true });
    }
  };

  // Unlock existing vault keys
  const unlockVault = async (passphrase: string): Promise<boolean> => {
    try {
      const profile = await profileApi.getProfile();
      if (!profile.encrypted_private_key || !profile.private_key_salt) {
        throw new Error('No vault keys found on server');
      }

      const privateKey = await unlockPrivateKey(
        profile.encrypted_private_key,
        profile.private_key_salt,
        passphrase,
        profile.pbkdf2_iterations || 600000
      );

      setUnlockedPrivateKey(privateKey);
      return true;
    } catch (err) {
      console.error('Failed to unlock vault:', err);
      return false;
    }
  };

  const lockVault = () => {
    setUnlockedPrivateKey(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        unlockedPrivateKey,
        isVaultUnlocked: unlockedPrivateKey !== null,
        login,
        register,
        logout,
        unlockVault,
        setupVault,
        lockVault,
        refreshUser,
      }}
    >
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
