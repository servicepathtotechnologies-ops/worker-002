/**
 * Firebase Node Executor
 *
 * Supports operations:
 * - get:          Retrieve a Firestore document by collection + documentId
 * - add:          Add a new document to a Firestore collection
 * - update:       Merge-update a Firestore document
 * - delete:       Delete a Firestore document
 * - query:        Query a Firestore collection with optional filter and limit
 * - realtime_get: Read a value from Firebase Realtime Database
 * - realtime_set: Write a value to Firebase Realtime Database
 *
 * Uses firebase-admin SDK.
 * Each execution initializes a unique Firebase app instance to prevent
 * re-initialization conflicts across concurrent workflow executions.
 */

import * as admin from 'firebase-admin';
import { NodeExecutionContext } from '../../core/types/node-definition';

type FirebaseOperation =
  | 'get'
  | 'add'
  | 'update'
  | 'delete'
  | 'query'
  | 'realtime_get'
  | 'realtime_set';

const VALID_OPERATIONS: FirebaseOperation[] = [
  'get',
  'add',
  'update',
  'delete',
  'query',
  'realtime_get',
  'realtime_set',
];

/**
 * Parse a value that may arrive as a JSON string or already be an object.
 */
function parseData(value: any): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// ---------------------------------------------------------------------------
// Operation handlers
// ---------------------------------------------------------------------------

async function handleGet(
  db: admin.firestore.Firestore,
  inputs: Record<string, any>
): Promise<any> {
  const { collection, documentId } = inputs;

  if (!collection) {
    return { success: false, error: 'collection is required' };
  }
  if (!documentId) {
    return { success: false, error: 'documentId is required' };
  }

  const docRef = db.collection(collection).doc(documentId);
  const snapshot = await docRef.get();

  return {
    success: true,
    data: snapshot.exists ? snapshot.data() : null,
    documentId,
  };
}

async function handleAdd(
  db: admin.firestore.Firestore,
  inputs: Record<string, any>
): Promise<any> {
  const { collection } = inputs;
  const data = parseData(inputs.data);

  if (!collection) {
    return { success: false, error: 'collection is required' };
  }
  if (!data) {
    return { success: false, error: 'data is required' };
  }

  const docRef = await db.collection(collection).add(data);

  return {
    success: true,
    documentId: docRef.id,
    data,
  };
}

async function handleUpdate(
  db: admin.firestore.Firestore,
  inputs: Record<string, any>
): Promise<any> {
  const { collection, documentId } = inputs;
  const data = parseData(inputs.data);

  if (!collection) {
    return { success: false, error: 'collection is required' };
  }
  if (!documentId) {
    return { success: false, error: 'documentId is required' };
  }
  if (!data) {
    return { success: false, error: 'data is required' };
  }

  const docRef = db.collection(collection).doc(documentId);
  await docRef.set(data, { merge: true });

  return {
    success: true,
    documentId,
    data,
  };
}

async function handleDelete(
  db: admin.firestore.Firestore,
  inputs: Record<string, any>
): Promise<any> {
  const { collection, documentId } = inputs;

  if (!collection) {
    return { success: false, error: 'collection is required' };
  }
  if (!documentId) {
    return { success: false, error: 'documentId is required' };
  }

  await db.collection(collection).doc(documentId).delete();

  return {
    success: true,
    documentId,
    deleted: true,
  };
}

async function handleQuery(
  db: admin.firestore.Firestore,
  inputs: Record<string, any>
): Promise<any> {
  const { collection } = inputs;
  const filter = parseData(inputs.filter);
  const limit: number = inputs.limit ?? 100;

  if (!collection) {
    return { success: false, error: 'collection is required' };
  }

  let query: admin.firestore.Query = db.collection(collection);

  // Apply simple equality filters when provided
  if (filter && typeof filter === 'object') {
    for (const [key, value] of Object.entries(filter)) {
      query = query.where(key, '==', value);
    }
  }

  if (limit) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();
  const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  return {
    success: true,
    data,
    count: data.length,
  };
}

async function handleRealtimeGet(
  rtdb: admin.database.Database,
  inputs: Record<string, any>
): Promise<any> {
  const { collection } = inputs; // `collection` is used as the path for Realtime DB

  if (!collection) {
    return { success: false, error: 'collection is required' };
  }

  const snapshot = await rtdb.ref(collection).get();

  return {
    success: true,
    data: snapshot.val(),
  };
}

async function handleRealtimeSet(
  rtdb: admin.database.Database,
  inputs: Record<string, any>
): Promise<any> {
  const { collection } = inputs; // `collection` is used as the path for Realtime DB
  const data = parseData(inputs.data);

  if (!collection) {
    return { success: false, error: 'collection is required' };
  }
  if (data === undefined || data === null) {
    return { success: false, error: 'data is required' };
  }

  await rtdb.ref(collection).set(data);

  return {
    success: true,
    path: collection,
  };
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

/**
 * Run Firebase node.
 *
 * Initializes a unique Firebase Admin app per execution to prevent
 * re-initialization conflicts, then dispatches to the appropriate
 * operation handler. The app is always deleted in a finally block.
 */
export async function runFirebaseNode(context: NodeExecutionContext): Promise<any> {
  const { inputs, nodeId } = context;

  // --- Credential validation (before any SDK call) ---
  const projectId: string = inputs.projectId;
  const clientEmail: string = inputs.clientEmail;
  const privateKey: string = inputs.privateKey;

  if (!projectId) {
    return { success: false, error: 'projectId is required' };
  }
  if (!clientEmail) {
    return { success: false, error: 'clientEmail is required' };
  }
  if (!privateKey) {
    return { success: false, error: 'privateKey is required' };
  }

  // --- Operation validation ---
  const operation: string = inputs.operation;
  if (!operation || !VALID_OPERATIONS.includes(operation as FirebaseOperation)) {
    return { success: false, error: `Invalid operation: ${operation}` };
  }

  // --- Unique app name per execution ---
  const appName = `firebase-app-${nodeId}-${Date.now()}`;

  let app: admin.app.App | null = null;

  try {
    app = admin.initializeApp(
      {
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          // Replace escaped newlines that may arrive from env vars or JSON strings
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
        databaseURL: inputs.databaseUrl || undefined,
      },
      appName
    );

    switch (operation as FirebaseOperation) {
      case 'get': {
        const db = admin.firestore(app);
        return await handleGet(db, inputs);
      }
      case 'add': {
        const db = admin.firestore(app);
        return await handleAdd(db, inputs);
      }
      case 'update': {
        const db = admin.firestore(app);
        return await handleUpdate(db, inputs);
      }
      case 'delete': {
        const db = admin.firestore(app);
        return await handleDelete(db, inputs);
      }
      case 'query': {
        const db = admin.firestore(app);
        return await handleQuery(db, inputs);
      }
      case 'realtime_get': {
        if (!inputs.databaseUrl) {
          return { success: false, error: 'databaseUrl is required' };
        }
        const rtdb = admin.database(app);
        return await handleRealtimeGet(rtdb, inputs);
      }
      case 'realtime_set': {
        if (!inputs.databaseUrl) {
          return { success: false, error: 'databaseUrl is required' };
        }
        const rtdb = admin.database(app);
        return await handleRealtimeSet(rtdb, inputs);
      }
      default:
        return { success: false, error: `Invalid operation: ${operation}` };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Firebase operation failed',
    };
  } finally {
    if (app) {
      try {
        await app.delete();
      } catch (deleteError) {
        console.error('[Firebase] Error deleting app instance:', deleteError);
      }
    }
  }
}
