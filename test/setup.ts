// Mock server-only so libraries can be imported in unit tests outside Next.js bundler
try {
  const p = require.resolve("server-only");
  require.cache[p] = {
    id: p,
    filename: p,
    loaded: true,
    exports: {},
  } as unknown as NodeModule;
} catch {
  // ignore
}
