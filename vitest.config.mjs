import { defineConfig } from 'vitest/config'

// Git-fixture tests compile the TS authority on every load; run in parallel they exceed the 5 s default on busy machines (slowest measured about 10 s).
export default defineConfig({ test: { testTimeout: 20_000 } })
