/** Choisit le stockage selon DATA_BACKEND. L'import est dynamique pour ne pas charger firebase-admin en mode fichier. */
export async function createStore(config) {
  if (config.dataBackend === 'file') {
    const { createFileStore } = await import('./file.js');
    return createFileStore(config);
  }
  const { createFirestoreStore } = await import('./firestore.js');
  return createFirestoreStore(config);
}
