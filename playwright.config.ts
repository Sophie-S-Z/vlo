import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // The timing tests hold ceilings that were set with one test at a time. The runners of a public
  // repository have 4 cores, so the default would run 2 workers and the timing tests would share the CPU.
  workers: isCI ? 1 : '50%',
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    // A fake Supabase project: the share and usage tests answer its RPC paths with page.route.
    env: {
      VITE_SUPABASE_URL: 'https://vlo-test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      // A fake WordPress.com app: publish.spec.ts answers its sign-in and API with page.route.
      VITE_WPCOM_CLIENT_ID: '12345',
    },
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
  projects: isCI
    ? [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        {
          name: 'firefox',
          use: {
            ...devices['Desktop Firefox'],
          },
        },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
      ]
    : [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
