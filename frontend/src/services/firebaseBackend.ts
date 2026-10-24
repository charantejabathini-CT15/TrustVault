/**
 * TrustVault Firebase Backend Engine
 * Full-stack cloud integration: Firebase Auth, Cloud Firestore, and Firebase Cloud Storage.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc as rawSetDoc,
  getDoc,
  getDocs,
  updateDoc as rawUpdateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  Timestamp,
  increment,
  runTransaction,
  type SetOptions,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getBytes,
  getBlob,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { auth, db, storage } from './firebase';
import type {
  User,
  DocumentItem,
  DocumentDetail,
  AuditEventItem,
  AuditVerificationResult,
  PolicySimulationResult,
  SecurityAlertItem,
  OrgMemberItem,
  DashboardStats,
  UserPublicInfo,
  ShareItem,
} from '../types';

// --- Cryptographic Helper for SHA-256 Audit Hashing ---
async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
  }
  return btoa(binary);
}

// Multi-strategy high-speed binary download helper
async function downloadStorageBytes(storageRef: any): Promise<Uint8Array> {
  // Strategy 1: Direct CDN fetch via signed downloadURL (Fastest - standard browser streaming)
  try {
    const downloadUrl = await getDownloadURL(storageRef);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(downloadUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
  } catch (err) {
    console.warn('Fast direct CDN fetch bypassed, trying getBlob:', err);
  }

  // Strategy 2: Firebase Storage getBlob
  try {
    const blob = await getBlob(storageRef);
    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    console.warn('getBlob bypassed, trying getBytes:', err);
  }

  // Strategy 3: Fallback getBytes (max 50 MB)
  return new Uint8Array(await getBytes(storageRef, 50 * 1024 * 1024));
}

// Generate standard UUID
function generateUUID(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Firestore Safety Sanitizer ---
/**
 * Recursively remove undefined values from an object or array so Firestore does not reject it.
 * In Firestore, undefined values are forbidden; properties with undefined values must either be
 * omitted or set to null. Omitting them is standard Firestore practice.
 */
function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (
    data instanceof Date ||
    (data as any) instanceof Timestamp ||
    typeof (data as any).isEqual === 'function' ||
    '_methodName' in (data as any)
  ) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as any;
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(data as Record<string, any>)) {
    if (val !== undefined) {
      result[key] = sanitizeForFirestore(val);
    }
  }
  return result as T;
}

const setDoc = (ref: any, data: any, options?: SetOptions) => {
  const sanitized = sanitizeForFirestore(data);
  return options ? rawSetDoc(ref, sanitized, options) : rawSetDoc(ref, sanitized);
};

const updateDoc = (ref: any, data: any) => {
  return rawUpdateDoc(ref, sanitizeForFirestore(data));
};

// --- Audit Hash-Chain Engine ---
async function recordAuditEvent(
  orgId: string,
  action: string,
  result: 'success' | 'failure' | 'denied',
  actorId?: string,
  actorEmail?: string,
  actorName?: string,
  documentId?: string,
  documentName?: string,
  metadata?: Record<string, any>
): Promise<AuditEventItem> {
  const chainStateRef = doc(db, 'audit_chains', orgId);
  const now = new Date();
  const isoTime = now.toISOString();

  let newSequence = 1;
  let previousHash = '0'.repeat(64);

  try {
    const chainDoc = await getDoc(chainStateRef);
    if (chainDoc.exists()) {
      const data = chainDoc.data();
      newSequence = (data.last_sequence || 0) + 1;
      previousHash = data.last_hash || '0'.repeat(64);
    }
  } catch (err) {
    console.warn('Could not read chain state, starting genesis:', err);
  }

  // Canonical string: sequence:org_id:actor:doc:action:result:timestamp
  const canonical = `${newSequence}:${orgId}:${actorId || ''}:${documentId || ''}:${action}:${result}:${isoTime}`;
  const eventHash = await sha256Hex(previousHash + canonical);

  const eventItem: Record<string, any> = {
    id: newSequence,
    org_id: orgId,
    action,
    result,
    request_id: generateUUID(),
    previous_hash: previousHash,
    event_hash: eventHash,
    sequence_number: newSequence,
    created_at: isoTime,
  };

  if (actorId) eventItem.actor_id = actorId;
  if (actorEmail) eventItem.actor_email = actorEmail;
  if (actorName) eventItem.actor_name = actorName;
  if (documentId) eventItem.document_id = documentId;
  if (documentName) eventItem.document_name = documentName;
  if (metadata) eventItem.metadata_json = metadata;

  const eventDocRef = doc(db, 'audit_events', `${orgId}_${newSequence}`);
  await setDoc(eventDocRef, eventItem);

  // Update chain head state
  await setDoc(chainStateRef, {
    org_id: orgId,
    last_sequence: newSequence,
    last_hash: eventHash,
    updated_at: Timestamp.now(),
  });

  return eventItem as AuditEventItem;
}

// --- Current User State Cache ---
let cachedUser: User | null = null;

async function getCurrentUserFromFirestore(fbUser: FirebaseUser): Promise<User> {
  const userDocRef = doc(db, 'users', fbUser.uid);
  const userDoc = await getDoc(userDocRef);

  if (userDoc.exists()) {
    const data = userDoc.data();
    cachedUser = {
      id: fbUser.uid,
      email: data.email || fbUser.email || '',
      display_name: data.display_name || fbUser.displayName || 'Member',
      org_id: data.org_id || 'default_org',
      org_name: data.org_name || 'My Organization',
      role: data.role || 'owner',
      has_keys: Boolean(data.public_key && data.encrypted_private_key),
    };
    return cachedUser;
  }

  // Check if an invited profile already exists for this email
  const userEmail = (fbUser.email || '').toLowerCase().trim();
  let invitedData: any = null;
  let oldInviteId: string | null = null;

  if (userEmail) {
    const inviteQ = query(collection(db, 'users'), where('email', '==', userEmail));
    const inviteSnap = await getDocs(inviteQ);
    for (const d of inviteSnap.docs) {
      if (d.id !== fbUser.uid) {
        invitedData = d.data();
        oldInviteId = d.id;
        break;
      }
    }
  }

  const orgId = invitedData?.org_id || generateUUID();
  const orgName = invitedData?.org_name || `${fbUser.displayName || 'Personal'} Vault`;
  const role = invitedData?.role || 'owner';

  const newProfile = {
    id: fbUser.uid,
    email: fbUser.email || '',
    display_name: fbUser.displayName || invitedData?.display_name || 'User',
    org_id: orgId,
    org_name: orgName,
    role: role,
    has_keys: false,
    created_at: Timestamp.now(),
  };

  await setDoc(userDocRef, newProfile, { merge: true });

  if (oldInviteId) {
    try {
      await deleteDoc(doc(db, 'users', oldInviteId));
    } catch {}
  }

  cachedUser = {
    id: fbUser.uid,
    email: newProfile.email,
    display_name: newProfile.display_name,
    org_id: orgId,
    org_name: orgName,
    role: role,
    has_keys: false,
  };

  return cachedUser;
}

// --- Auth API ---
export const firebaseAuthApi = {
  register: async (data: { email: string; password: string; display_name: string; org_name: string }): Promise<User> => {
    let fbUser: FirebaseUser;
    try {
      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
      fbUser = cred.user;
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, data.email, data.password);
        fbUser = cred.user;
      } else {
        throw err;
      }
    }

    try {
      await firebaseUpdateProfile(fbUser, { displayName: data.display_name });
    } catch {
      // Non-fatal
    }

    const userDocRef = doc(db, 'users', fbUser.uid);
    const existingDoc = await getDoc(userDocRef);

    // Check if an invited profile already exists for this email
    const userEmail = data.email.toLowerCase().trim();
    let invitedData: any = null;
    let oldInviteId: string | null = null;
    const inviteQ = query(collection(db, 'users'), where('email', '==', userEmail));
    const inviteSnap = await getDocs(inviteQ);
    for (const d of inviteSnap.docs) {
      if (d.id !== fbUser.uid) {
        invitedData = d.data();
        oldInviteId = d.id;
        break;
      }
    }

    let orgId = invitedData?.org_id || generateUUID();
    let orgName = invitedData?.org_name || data.org_name;
    let role = invitedData?.role || 'owner';
    let hasKeys = false;

    if (existingDoc.exists()) {
      const exData = existingDoc.data();
      if (exData.org_id) orgId = exData.org_id;
      if (exData.org_name) orgName = exData.org_name;
      if (exData.role) role = exData.role;
      hasKeys = Boolean(exData.public_key && exData.encrypted_private_key);
    }

    const orgDocRef = doc(db, 'organizations', orgId);

    await setDoc(orgDocRef, {
      id: orgId,
      name: orgName,
      created_at: Timestamp.now(),
    }, { merge: true });

    const userProfile = {
      id: fbUser.uid,
      email: data.email,
      display_name: data.display_name,
      org_id: orgId,
      org_name: orgName,
      role: role,
      has_keys: hasKeys,
      created_at: Timestamp.now(),
    };

    await setDoc(userDocRef, userProfile, { merge: true });

    if (oldInviteId) {
      try {
        await deleteDoc(doc(db, 'users', oldInviteId));
      } catch {}
    }

    // Add membership
    await setDoc(doc(db, 'org_memberships', `${orgId}_${fbUser.uid}`), {
      id: generateUUID(),
      user_id: fbUser.uid,
      org_id: orgId,
      role: 'owner',
      display_name: data.display_name,
      email: data.email,
      created_at: Timestamp.now(),
    }, { merge: true });

    // Record audit event
    try {
      await recordAuditEvent(
        orgId,
        'user_registered',
        'success',
        fbUser.uid,
        data.email,
        data.display_name,
        undefined,
        undefined,
        { email: data.email }
      );
    } catch (auditErr) {
      console.warn('Audit record warning on registration:', auditErr);
    }

    cachedUser = {
      id: fbUser.uid,
      email: data.email,
      display_name: data.display_name,
      org_id: orgId,
      org_name: orgName,
      role: 'owner',
      has_keys: hasKeys,
    };

    return cachedUser;
  },

  login: async (data: { email: string; password: string }): Promise<User> => {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, data.email, data.password);
    } catch (err: any) {
      // Auto-provision demo accounts if logging in with DemoPass1 for demo users
      if (data.email.endsWith('@trustvault.demo') && data.password === 'DemoPass1') {
        try {
          cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
          const nameMap: Record<string, { name: string; role: 'owner' | 'admin' | 'member' | 'auditor' }> = {
            'alice@trustvault.demo': { name: 'Alice Johnson', role: 'owner' },
            'bob@trustvault.demo': { name: 'Bob Smith', role: 'member' },
            'carol@trustvault.demo': { name: 'Carol Williams', role: 'admin' },
            'dave@trustvault.demo': { name: 'Dave Auditor', role: 'auditor' },
          };
          const info = nameMap[data.email] || { name: 'Demo Member', role: 'member' };
          const orgId = 'demo-corp-org-id';

          await setDoc(doc(db, 'users', cred.user.uid), {
            id: cred.user.uid,
            email: data.email,
            display_name: info.name,
            org_id: orgId,
            org_name: 'TrustVault Demo Corp',
            role: info.role,
            has_keys: false,
            created_at: Timestamp.now(),
          });
        } catch {
          // If already created, retry login
          cred = await signInWithEmailAndPassword(auth, data.email, data.password);
        }
      } else {
        throw err;
      }
    }

    const u = await getCurrentUserFromFirestore(cred.user);
    if (u.org_id) {
      await recordAuditEvent(
        u.org_id,
        'user_login',
        'success',
        u.id,
        u.email,
        u.display_name
      );
    }
    return u;
  },

  logout: async (): Promise<void> => {
    if (cachedUser?.org_id) {
      await recordAuditEvent(
        cachedUser.org_id,
        'user_logout',
        'success',
        cachedUser.id,
        cachedUser.email,
        cachedUser.display_name
      );
    }
    await firebaseSignOut(auth);
    cachedUser = null;
  },

  me: async (): Promise<User> => {
    return new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
        unsubscribe();
        if (fbUser) {
          try {
            const u = await getCurrentUserFromFirestore(fbUser);
            resolve(u);
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error('Unauthenticated'));
        }
      });
    });
  },
};

// --- Documents API with Firebase Cloud Storage ---
export const firebaseDocumentsApi = {
  upload: async (formData: FormData): Promise<DocumentItem> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const file = formData.get('file') as File;
    const name = (formData.get('name') as string) || file.name;
    const encryptedFileHash = formData.get('encrypted_file_hash') as string;
    const encryptedKey = formData.get('encrypted_key') as string;

    if (!file) throw new Error('No file provided');

    const docId = generateUUID();
    const orgId = user.org_id || 'default_org';
    const storagePath = `documents/${orgId}/${docId}`;

    // Upload encrypted binary directly to Firebase Cloud Storage
    const storageRef = ref(storage, storagePath);
    const fileBuffer = await file.arrayBuffer();
    await uploadBytes(storageRef, new Uint8Array(fileBuffer), {
      contentType: 'application/octet-stream',
      customMetadata: {
        hash: encryptedFileHash,
        ownerId: user.id,
        orgId: orgId,
      },
    });

    const now = new Date().toISOString();

    // Store metadata in Firestore
    const docData: DocumentItem & { storage_path: string; deleted: boolean } = {
      id: docId,
      name: name.trim() || 'Untitled Document',
      content_type: file.type || 'application/octet-stream',
      size: file.size,
      owner_id: user.id,
      owner_name: user.display_name,
      org_id: orgId,
      encrypted_file_hash: encryptedFileHash,
      storage_path: storagePath,
      created_at: now,
      share_count: 0,
      has_access: true,
      permission: 'owner',
      deleted: false,
    };

    await setDoc(doc(db, 'documents', docId), docData);

    // Store key envelope for the owner
    const envelopeId = generateUUID();
    await setDoc(doc(db, 'key_envelopes', envelopeId), {
      id: envelopeId,
      document_id: docId,
      user_id: user.id,
      encrypted_key: encryptedKey,
      created_at: now,
    });

    // Record audit event
    await recordAuditEvent(
      orgId,
      'document_upload',
      'success',
      user.id,
      user.email,
      user.display_name,
      docId,
      name,
      { file_size: file.size, content_type: file.type }
    );

    return docData;
  },

  list: async (filter?: 'owned' | 'shared'): Promise<{ documents: DocumentItem[]; total: number }> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const orgId = user.org_id || 'default_org';

    let q = query(
      collection(db, 'documents'),
      where('org_id', '==', orgId),
      where('deleted', '==', false)
    );

    const snapshot = await getDocs(q);
    const allDocs: DocumentItem[] = [];

    // Also get active shares for current user
    const sharesQuery = query(
      collection(db, 'shares'),
      where('grantee_id', '==', user.id),
      where('revoked', '==', false)
    );
    const sharesSnap = await getDocs(sharesQuery);
    const shareMap = new Map<string, ShareItem>();
    sharesSnap.forEach(s => {
      const sData = s.data() as ShareItem;
      shareMap.set(sData.document_id, sData);
    });

    snapshot.forEach(d => {
      const data = d.data() as DocumentItem & { deleted?: boolean };
      if (data.deleted) return;

      const isOwner = data.owner_id === user.id;
      const share = shareMap.get(data.id);
      const hasAccess = isOwner || Boolean(share);

      let permission: 'owner' | 'view' | 'download' | undefined;
      if (isOwner) {
        permission = 'owner';
      } else if (share) {
        permission = share.permission;
      }

      const item: DocumentItem = {
        id: data.id,
        name: data.name,
        content_type: data.content_type,
        size: data.size,
        owner_id: data.owner_id,
        owner_name: data.owner_name,
        org_id: data.org_id,
        encrypted_file_hash: data.encrypted_file_hash,
        created_at: data.created_at,
        share_count: data.share_count || 0,
        has_access: hasAccess,
        permission: permission,
      };

      if (filter === 'owned' && isOwner) {
        allDocs.push(item);
      } else if (filter === 'shared' && !isOwner && share) {
        allDocs.push(item);
      } else if (!filter) {
        allDocs.push(item);
      }
    });

    // Sort by created_at descending
    allDocs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { documents: allDocs, total: allDocs.length };
  },

  get: async (id: string): Promise<DocumentDetail> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const docRef = doc(db, 'documents', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().deleted) {
      throw new Error('Document not found');
    }

    const data = docSnap.data() as DocumentItem & { storage_path?: string };
    const isOwner = data.owner_id === user.id;

    // Fetch shares for this document
    const sharesQ = query(collection(db, 'shares'), where('document_id', '==', id));
    const sharesSnap = await getDocs(sharesQ);
    const shares: ShareItem[] = [];
    sharesSnap.forEach(s => shares.push(s.data() as ShareItem));

    // Fetch user's envelope
    const envQ = query(
      collection(db, 'key_envelopes'),
      where('document_id', '==', id),
      where('user_id', '==', user.id)
    );
    const envSnap = await getDocs(envQ);
    let keyEnvelope: string | undefined;
    envSnap.forEach(e => {
      keyEnvelope = e.data().encrypted_key;
    });

    const userShare = shares.find(s => s.grantee_id === user.id && !s.revoked);

    return {
      ...data,
      shares,
      key_envelope: keyEnvelope,
      has_access: isOwner || Boolean(userShare),
      permission: isOwner ? 'owner' : userShare?.permission,
    };
  },

  getContent: async (id: string, action: 'view' | 'download' = 'view'): Promise<{
    encrypted_content: string;
    encrypted_key: string;
    encrypted_file_hash: string;
  }> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const docRef = doc(db, 'documents', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().deleted) {
      throw new Error('Document not found');
    }

    const docData = docSnap.data();
    const isOwner = docData.owner_id === user.id;

    // Verify access
    if (!isOwner) {
      const sharesQ = query(
        collection(db, 'shares'),
        where('document_id', '==', id),
        where('grantee_id', '==', user.id),
        where('revoked', '==', false)
      );
      const sharesSnap = await getDocs(sharesQ);
      let allowed = false;

      sharesSnap.forEach(s => {
        const sData = s.data();
        if (sData.expires_at && new Date(sData.expires_at).getTime() < Date.now()) {
          return;
        }
        if (action === 'download' && sData.permission !== 'download') {
          return;
        }
        allowed = true;
      });

      if (!allowed) {
        await recordAuditEvent(
          docData.org_id,
          action === 'download' ? 'document_download' : 'document_access',
          'denied',
          user.id,
          user.email,
          user.display_name,
          id,
          docData.name
        );
        throw new Error('Access denied by document authorization policy.');
      }
    }

    // Retrieve user's key envelope
    const envQ = query(
      collection(db, 'key_envelopes'),
      where('document_id', '==', id),
      where('user_id', '==', user.id)
    );
    const envSnap = await getDocs(envQ);
    let encryptedKey: string | null = null;
    envSnap.forEach(e => {
      encryptedKey = e.data().encrypted_key;
    });

    if (!encryptedKey) {
      throw new Error('Cryptographic key envelope not found for your account.');
    }

    // Download ciphertext directly from Firebase Cloud Storage with CDN acceleration
    const storagePath = docData.storage_path || `documents/${docData.org_id}/${id}`;
    const storageRef = ref(storage, storagePath);
    const bytes = await downloadStorageBytes(storageRef);
    const base64Content = bufferToBase64(bytes);

    // Record audit event asynchronously (non-blocking) so document decryption is instant!
    recordAuditEvent(
      docData.org_id,
      action === 'download' ? 'document_download' : 'document_access',
      'success',
      user.id,
      user.email,
      user.display_name,
      id,
      docData.name
    ).catch(err => console.warn('Background audit warning:', err));

    return {
      encrypted_content: base64Content,
      encrypted_key: encryptedKey,
      encrypted_file_hash: docData.encrypted_file_hash,
    };
  },

  delete: async (id: string): Promise<void> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const docRef = doc(db, 'documents', id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.owner_id !== user.id && user.role !== 'owner' && user.role !== 'admin') {
        throw new Error('Only the owner or admin can delete this document.');
      }

      await updateDoc(docRef, { deleted: true, deleted_at: Timestamp.now() });

      // Clean up storage file
      try {
        const storagePath = data.storage_path || `documents/${data.org_id}/${id}`;
        await deleteObject(ref(storage, storagePath));
      } catch (e) {
        console.warn('Storage delete warning:', e);
      }

      await recordAuditEvent(
        data.org_id,
        'document_deleted',
        'success',
        user.id,
        user.email,
        user.display_name,
        id,
        data.name
      );
    }
  },

  createShare: async (
    documentId: string,
    data: { grantee_email: string; permission: 'view' | 'download'; encrypted_key: string; expires_at?: string }
  ): Promise<ShareItem> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const docRef = doc(db, 'documents', documentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data().deleted) {
      throw new Error('Document not found');
    }

    const docData = docSnap.data();

    // Find grantee by email
    const usersQ = query(collection(db, 'users'), where('email', '==', data.grantee_email.toLowerCase().trim()));
    const usersSnap = await getDocs(usersQ);
    if (usersSnap.empty) {
      throw new Error(`User with email "${data.grantee_email}" not found.`);
    }

    const granteeUser = usersSnap.docs[0].data();
    const shareId = generateUUID();
    const now = new Date().toISOString();

    const shareItem: ShareItem = {
      id: shareId,
      document_id: documentId,
      grantor_id: user.id,
      grantor_name: user.display_name,
      grantee_id: granteeUser.id,
      grantee_email: granteeUser.email,
      grantee_name: granteeUser.display_name,
      permission: data.permission,
      expires_at: data.expires_at,
      revoked: false,
      created_at: now,
    };

    await setDoc(doc(db, 'shares', shareId), shareItem);

    // Save wrapped key for grantee
    const envelopeId = generateUUID();
    await setDoc(doc(db, 'key_envelopes', envelopeId), {
      id: envelopeId,
      document_id: documentId,
      user_id: granteeUser.id,
      encrypted_key: data.encrypted_key,
      created_at: now,
    });

    // Increment share count
    await updateDoc(docRef, { share_count: increment(1) });

    await recordAuditEvent(
      docData.org_id,
      'share_created',
      'success',
      user.id,
      user.email,
      user.display_name,
      documentId,
      docData.name,
      { grantee_email: data.grantee_email, permission: data.permission, expires_at: data.expires_at }
    );

    return shareItem;
  },

  revokeShare: async (docIdOrShareId: string, shareId?: string): Promise<void> => {
    const actualShareId = shareId || docIdOrShareId;
    const user = cachedUser || (await firebaseAuthApi.me());
    const shareRef = doc(db, 'shares', actualShareId);
    const shareSnap = await getDoc(shareRef);

    if (shareSnap.exists()) {
      const shareData = shareSnap.data() as ShareItem;
      await updateDoc(shareRef, {
        revoked: true,
        revoked_at: new Date().toISOString(),
      });

      // Decrement document share count
      const docRef = doc(db, 'documents', shareData.document_id);
      await updateDoc(docRef, { share_count: increment(-1) });

      if (user.org_id) {
        await recordAuditEvent(
          user.org_id,
          'share_revoked',
          'success',
          user.id,
          user.email,
          user.display_name,
          shareData.document_id,
          undefined,
          { revoked_grantee_email: shareData.grantee_email }
        );
      }
    }
  },
};

// --- Cryptographic Audit Trail API ---
export const firebaseAuditApi = {
  list: async (params?: {
    actor_id?: string;
    document_id?: string;
    action?: string;
    result?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ events: AuditEventItem[]; total: number }> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const orgId = user.org_id || 'default_org';

    const eventsQ = query(
      collection(db, 'audit_events'),
      where('org_id', '==', orgId),
      orderBy('sequence_number', 'desc'),
      firestoreLimit(params?.limit || 100)
    );

    const snapshot = await getDocs(eventsQ);
    const events: AuditEventItem[] = [];

    snapshot.forEach(d => {
      events.push(d.data() as AuditEventItem);
    });

    return { events, total: events.length };
  },

  verify: async (): Promise<AuditVerificationResult> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const orgId = user.org_id || 'default_org';

    // Retrieve all events ordered sequentially
    const q = query(
      collection(db, 'audit_events'),
      where('org_id', '==', orgId),
      orderBy('sequence_number', 'asc')
    );

    const snapshot = await getDocs(q);
    const events: AuditEventItem[] = [];
    snapshot.forEach(d => events.push(d.data() as AuditEventItem));

    if (events.length === 0) {
      return {
        valid: true,
        events_checked: 0,
        message: 'No events in audit log. Genesis state valid.',
      };
    }

    let previousHash = '0'.repeat(64);

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const expectedSeq = i + 1;

      // Check sequence gap
      if (e.sequence_number !== expectedSeq) {
        return {
          valid: false,
          events_checked: i,
          first_failure_sequence: e.sequence_number,
          message: `Sequence break detected at event #${e.sequence_number} (expected #${expectedSeq}). A record may have been deleted!`,
        };
      }

      // Check previous hash pointer
      if (e.previous_hash !== previousHash) {
        return {
          valid: false,
          events_checked: i,
          first_failure_sequence: e.sequence_number,
          message: `Hash link broken at sequence #${e.sequence_number}. Previous hash mismatch indicates database alteration.`,
        };
      }

      // Recompute SHA-256 hash
      const canonical = `${e.sequence_number}:${e.org_id}:${e.actor_id || ''}:${e.document_id || ''}:${e.action}:${e.result}:${e.created_at}`;
      const computedHash = await sha256Hex(previousHash + canonical);

      if (computedHash !== e.event_hash) {
        return {
          valid: false,
          events_checked: i,
          first_failure_sequence: e.sequence_number,
          message: `Cryptographic signature mismatch at sequence #${e.sequence_number}. Event payload was tampered with!`,
        };
      }

      previousHash = e.event_hash;
    }

    return {
      valid: true,
      events_checked: events.length,
      message: `Audit chain verified successfully! All ${events.length} sequential SHA-256 hashes are tamper-free.`,
    };
  },
};

// --- Access Policy Simulator ---
export const firebasePolicyApi = {
  simulate: async (data: {
    user_id: string;
    document_id: string;
    action: 'view' | 'download';
    simulated_time?: string;
  }): Promise<PolicySimulationResult> => {
    const checks: { check: string; passed: boolean; detail: string }[] = [];

    // 1. Fetch user
    const userDoc = await getDoc(doc(db, 'users', data.user_id));
    if (!userDoc.exists()) {
      checks.push({ check: 'user_exists', passed: false, detail: 'Target user does not exist.' });
      return { allowed: false, reason: 'Target user does not exist.', checks };
    }
    const targetUser = userDoc.data();
    checks.push({ check: 'user_exists', passed: true, detail: `User: ${targetUser.email} (${targetUser.role})` });

    // 2. Fetch document
    const docSnap = await getDoc(doc(db, 'documents', data.document_id));
    if (!docSnap.exists() || docSnap.data().deleted) {
      checks.push({ check: 'document_exists', passed: false, detail: 'Document does not exist or has been deleted.' });
      return { allowed: false, reason: 'Document not found.', checks };
    }
    const docData = docSnap.data();
    checks.push({ check: 'document_exists', passed: true, detail: `Document: ${docData.name}` });

    // 3. Organization boundary check
    const sameOrg = targetUser.org_id === docData.org_id;
    checks.push({
      check: 'org_boundary',
      passed: sameOrg,
      detail: sameOrg ? 'Same organization verified' : 'Cross-tenant access prohibited',
    });
    if (!sameOrg) {
      return { allowed: false, reason: 'Cross-organization access is prohibited by tenant isolation policy.', checks };
    }

    // 4. Ownership check
    const isOwner = docData.owner_id === targetUser.id;
    checks.push({
      check: 'is_owner',
      passed: isOwner,
      detail: isOwner ? 'User is document owner (full access granted)' : 'User is not document owner',
    });
    if (isOwner) {
      return { allowed: true, reason: 'Owner has full access rights.', checks };
    }

    // 5. Active Share Grant Check
    const sharesQ = query(
      collection(db, 'shares'),
      where('document_id', '==', data.document_id),
      where('grantee_id', '==', data.user_id)
    );
    const sharesSnap = await getDocs(sharesQ);

    if (sharesSnap.empty) {
      checks.push({ check: 'share_grant', passed: false, detail: 'No share grant exists for this user.' });
      return { allowed: false, reason: 'Access denied: No active share grant exists.', checks };
    }

    const share = sharesSnap.docs[0].data() as ShareItem;

    if (share.revoked) {
      checks.push({ check: 'revocation_check', passed: false, detail: 'Grant was previously revoked.' });
      return { allowed: false, reason: 'Access denied: Permission grant has been revoked.', checks };
    }
    checks.push({ check: 'revocation_check', passed: true, detail: 'Grant is active (not revoked).' });

    // 6. Expiration Check
    const evalTime = data.simulated_time ? new Date(data.simulated_time).getTime() : Date.now();
    if (share.expires_at) {
      const expTime = new Date(share.expires_at).getTime();
      const isExpired = evalTime > expTime;
      checks.push({
        check: 'expiration_check',
        passed: !isExpired,
        detail: isExpired
          ? `Expired on ${new Date(share.expires_at).toLocaleDateString()}`
          : `Valid until ${new Date(share.expires_at).toLocaleDateString()}`,
      });
      if (isExpired) {
        return { allowed: false, reason: 'Access denied: Share grant has expired.', checks };
      }
    } else {
      checks.push({ check: 'expiration_check', passed: true, detail: 'Permanent grant (no expiration).' });
    }

    // 7. Permission level check
    if (data.action === 'download' && share.permission === 'view') {
      checks.push({
        check: 'permission_level',
        passed: false,
        detail: 'Grant allows "view" only. Download request rejected.',
      });
      return { allowed: false, reason: 'Access denied: View-only grant cannot download raw file.', checks };
    }
    checks.push({ check: 'permission_level', passed: true, detail: `Permission "${share.permission}" satisfies action "${data.action}".` });

    return { allowed: true, reason: 'All cryptographic and authorization policies satisfied.', checks };
  },
};

// --- Security Alerts API ---
export const firebaseAlertsApi = {
  list: async (params?: { status?: string; severity?: string }): Promise<{ alerts: SecurityAlertItem[]; total: number }> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const orgId = user.org_id || 'default_org';

    let q = query(
      collection(db, 'security_alerts'),
      where('org_id', '==', orgId),
      orderBy('created_at', 'desc')
    );

    const snapshot = await getDocs(q);
    const alerts: SecurityAlertItem[] = [];

    snapshot.forEach(d => {
      const item = d.data() as SecurityAlertItem;
      if (params?.status && item.status !== params.status) return;
      if (params?.severity && item.severity !== params.severity) return;
      alerts.push(item);
    });

    return { alerts, total: alerts.length };
  },

  updateStatus: async (alertId: string, status: 'acknowledged' | 'resolved' | 'dismissed'): Promise<SecurityAlertItem> => {
    const alertRef = doc(db, 'security_alerts', alertId);
    await updateDoc(alertRef, {
      status,
      resolved_at: new Date().toISOString(),
    });
    const updated = await getDoc(alertRef);
    return updated.data() as SecurityAlertItem;
  },
};

// --- Team & Members API ---
export const firebaseTeamApi = {
  getMembers: async (): Promise<{ members: OrgMemberItem[]; total: number }> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const orgId = user.org_id || 'default_org';

    const q = query(collection(db, 'users'), where('org_id', '==', orgId));
    const snapshot = await getDocs(q);
    const members: OrgMemberItem[] = [];

    snapshot.forEach(d => {
      const data = d.data();
      members.push({
        id: d.id,
        user_id: d.id,
        email: data.email,
        display_name: data.display_name || data.email,
        role: data.role || 'member',
        joined_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : new Date().toISOString(),
        has_keys: Boolean(data.public_key && data.encrypted_private_key),
      });
    });

    return { members, total: members.length };
  },

  addMember: async (data: { email: string; role: string; display_name?: string }): Promise<any> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const orgId = user.org_id || 'default_org';

    // Find if user already registered
    const usersQ = query(collection(db, 'users'), where('email', '==', data.email.toLowerCase().trim()));
    const usersSnap = await getDocs(usersQ);

    if (!usersSnap.empty) {
      const existingDoc = usersSnap.docs[0];
      await updateDoc(existingDoc.ref, {
        org_id: orgId,
        org_name: user.org_name,
        role: data.role,
      });
      return { message: 'Existing user added to organization.' };
    }

    // If user not registered yet, create placeholder invitation
    const inviteId = generateUUID();
    await setDoc(doc(db, 'users', inviteId), {
      id: inviteId,
      email: data.email.toLowerCase().trim(),
      display_name: data.display_name || data.email.split('@')[0],
      org_id: orgId,
      org_name: user.org_name,
      role: data.role,
      has_keys: false,
      created_at: Timestamp.now(),
      pending_invite: true,
    });

    return { message: 'Member invited successfully.' };
  },
};

// --- Profile & Key Management API ---
export const firebaseProfileApi = {
  getProfile: async (): Promise<{
    id: string;
    email: string;
    display_name: string;
    public_key?: string;
    encrypted_private_key?: string;
    private_key_salt?: string;
    pbkdf2_iterations: number;
  }> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const userSnap = await getDoc(doc(db, 'users', user.id));

    if (!userSnap.exists()) {
      throw new Error('Profile not found');
    }

    const data = userSnap.data();
    return {
      id: user.id,
      email: data.email,
      display_name: data.display_name,
      public_key: data.public_key,
      encrypted_private_key: data.encrypted_private_key,
      private_key_salt: data.private_key_salt,
      pbkdf2_iterations: data.pbkdf2_iterations || 600000,
    };
  },

  uploadKeys: async (data: {
    public_key: string;
    encrypted_private_key: string;
    private_key_salt: string;
    pbkdf2_iterations: number;
  }): Promise<{ message: string }> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const userRef = doc(db, 'users', user.id);

    await updateDoc(userRef, {
      public_key: data.public_key,
      encrypted_private_key: data.encrypted_private_key,
      private_key_salt: data.private_key_salt,
      pbkdf2_iterations: data.pbkdf2_iterations,
      has_keys: true,
    });

    if (cachedUser) {
      cachedUser.has_keys = true;
    }

    if (user.org_id) {
      await recordAuditEvent(
        user.org_id,
        'keys_updated',
        'success',
        user.id,
        user.email,
        user.display_name
      );
    }

    return { message: 'Cryptographic keys updated successfully.' };
  },

  getUserPublicKey: async (userId: string): Promise<UserPublicInfo> => {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) {
      throw new Error('User not found');
    }
    const data = userSnap.data();
    if (!data.public_key) {
      throw new Error('User has not uploaded their cryptographic public key yet.');
    }
    return {
      id: userId,
      email: data.email,
      display_name: data.display_name,
      public_key: data.public_key,
    };
  },
};

// --- Dashboard API ---
export const firebaseDashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const user = cachedUser || (await firebaseAuthApi.me());
    const orgId = user.org_id || 'default_org';

    const docsRes = await firebaseDocumentsApi.list();
    const allDocs = docsRes.documents;

    const totalDocuments = allDocs.length;
    const sharedDocuments = allDocs.filter(d => d.share_count > 0).length;

    // Active shares
    const sharesQ = query(collection(db, 'shares'), where('revoked', '==', false));
    const sharesSnap = await getDocs(sharesQ);
    const activeShares = sharesSnap.size;

    // Expiring soon (within 7 days)
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    let expiringSoon = 0;
    sharesSnap.forEach(s => {
      const exp = s.data().expires_at;
      if (exp) {
        const diff = new Date(exp).getTime() - now;
        if (diff > 0 && diff <= sevenDaysMs) {
          expiringSoon++;
        }
      }
    });

    // Recent alerts
    const alertsRes = await firebaseAlertsApi.list({ status: 'open' });
    const recentAlerts = alertsRes.alerts.length;

    // Recent events
    const auditRes = await firebaseAuditApi.list({ limit: 10 });

    return {
      total_documents: totalDocuments,
      active_shares: activeShares,
      open_alerts: recentAlerts,
      total_audit_events: auditRes.total,
      chain_verified: true,
    };
  },
};
