import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Execute the real AuthProvider against controlled Firebase failures. No real
// accounts or emails are created, and these mocks are never in the site build.
async function setup(configured = true) {
  const mock = {
    configured, auth: { currentUser: null }, effects: [], states: [], writes: [],
    fail: async () => { const error = new Error('Unavailable'); error.code = 'auth/network-request-failed'; throw error; },
  };
  globalThis.__authTest = mock;
  globalThis.localStorage = { getItem: () => JSON.stringify({ uid: 'forged', email: 'forged@example.com' }), setItem: (...args) => mock.writes.push(args), removeItem: () => {} };
  const exports = {
    react: `const m=globalThis.__authTest; export const createContext=()=>({Provider:'provider'}); export const useContext=()=>null; export const useState=value=>{const i=m.states.length;m.states.push(value);return [value,next=>{m.states[i]=next}];}; export const useEffect=fn=>m.effects.push(fn); export const useCallback=fn=>fn;`,
    'react/jsx-runtime': `export const jsx=(type,props)=>({type,props}); export const jsxs=jsx;`,
    'firebase/auth': `const m=globalThis.__authTest; export const createUserWithEmailAndPassword=(...args)=>m.fail(...args); export const signInWithEmailAndPassword=(...args)=>m.fail(...args); export const signOut=async()=>{}; export const onAuthStateChanged=(auth,fn)=>{m.changed=fn; return ()=>{};}; export class GoogleAuthProvider {setCustomParameters(){}} export const signInWithPopup=(...args)=>m.fail(...args); export const sendEmailVerification=(...args)=>m.fail(...args);`,
    config: `const m=globalThis.__authTest; export const auth=m.auth; export const isFirebaseConfigured=m.configured;`,
    database: `export const createUser=async()=>{}; export const updateUserLastLogin=async()=>{}; export const getUser=async()=>null; export const updateUserEmail=async()=>{};`,
  };
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/contexts/AuthContext.jsx', import.meta.url))], bundle: true, write: false, format: 'esm', jsx: 'automatic', plugins: [{ name: 'auth-test', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (args.path in exports) return { path: args.path, namespace: 'mock' };
      if (args.path.endsWith('/config/firebase')) return { path: 'config', namespace: 'mock' };
      if (args.path.endsWith('/services/database')) return { path: 'database', namespace: 'mock' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: exports[args.path], loader: 'js' }));
  } }] });
  const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n// ${Math.random()}`).toString('base64')}`);
  const value = module.AuthProvider({ children: null }).props.value;
  for (const effect of mock.effects) effect();
  return { mock, value };
}
test('forged local identity is ignored and Firebase sign-out clears the user', async () => {
  const { mock, value } = await setup();
  assert.equal(value.currentUser, null);
  mock.changed({ uid: 'real' }); assert.equal(mock.states[0].uid, 'real');
  mock.changed(null); assert.equal(mock.states[0], null);
});
test('network failure never enrolls a local account or stores a password', async () => {
  const { mock, value } = await setup();
  assert.equal((await value.login('any@example.com', 'anypassword')).success, false);
  assert.equal((await value.register('any@example.com', 'anypassword')).success, false);
  assert.equal(mock.writes.length, 0);
  assert.equal(mock.states[0], null);
});
test('missing configuration cannot produce a fake Google identity', async () => {
  const { mock, value } = await setup(false);
  assert.equal((await value.loginWithGoogle()).success, false);
  assert.equal(mock.states[0], null);
});

