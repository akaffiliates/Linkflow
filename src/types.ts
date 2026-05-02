export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  credits: number;
  isBlocked: boolean;
  isAdmin: boolean;
  createdAt: number;
}

export interface LinkEntry {
  id: string;
  url: string;
  title: string;
  ownerId: string;
  ownerName: string;
  viewsRemaining: number;
  createdAt: number;
}

export interface SocialPost {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  likes: number;
  createdAt: number;
}

export interface SocialComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
}
