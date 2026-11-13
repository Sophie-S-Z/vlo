import { randomUUID } from 'node:crypto';
import type { FakeSyncRelay } from './syncRelay';

/*
 * A fake of Supabase Auth and the functions of migration 0008 (Phase 18), for the Playwright tests. Each
 * email gets the code 123456. The fake keeps the rules that the app relies on: a function for a signed-in
 * writer reads the account from the bearer token, a vault needs the space token, and the owner functions
 * refuse any account that is not an owner.
 */

export const CODE = '123456';

interface User {
  id: string;
  email: string;
  provider: string;
  createdAt: string;
}

interface Vault {
  space_id: string;
  token: string;
  wrapped: string;
  iv: string;
  salt: string;
  rounds: number;
  updated_at: string;
}

export interface FeedbackRow {
  id: string;
  created_at: string;
  user_id: string | null;
  install: string;
  kind: string;
  message: string;
  rating: number | null;
  contact: string | null;
  app_version: string;
  device: string;
  place: string;
  status: string;
  note: string;
}

export class FakeAccounts {
  readonly users = new Map<string, User>();
  readonly vaults = new Map<string, Vault>();
  readonly pings = new Map<string, { install: string; day: string; user_id: string | null; device: string }>();
  readonly feedback: FeedbackRow[] = [];
  readonly owners = new Set<string>();
  private readonly tokens = new Map<string, string>();
  /** The emails that asked for a code, in order. */
  readonly codesSent: string[] = [];

  constructor(private readonly sync: FakeSyncRelay) {}

  private session(user: User) {
    const access = `at-${randomUUID()}`;
    const refresh = `rt-${randomUUID()}`;
    this.tokens.set(access, user.id);
    this.tokens.set(refresh, user.id);
    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: user.id, email: user.email, app_metadata: { provider: user.provider } },
    };
  }

  /** The answer of an /auth/v1 path: [status, body]. */
  auth(path: string, body: Record<string, unknown>, bearer: string): [number, unknown] {
    if (path === 'otp') {
      const email = String(body.email).toLowerCase();
      if (![...this.users.values()].some((u) => u.email === email)) {
        const id = randomUUID();
        this.users.set(id, { id, email, provider: 'email', createdAt: new Date().toISOString() });
      }
      this.codesSent.push(email);
      return [200, {}];
    }
    if (path === 'verify') {
      const user = [...this.users.values()].find((u) => u.email === String(body.email).toLowerCase());
      if (!user || body.token !== CODE) return [403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }];
      return [200, this.session(user)];
    }
    if (path === 'token') {
      const id = this.tokens.get(String(body.refresh_token));
      const user = id ? this.users.get(id) : undefined;
      if (!user) return [400, { error_code: 'refresh_token_not_found' }];
      return [200, this.session(user)];
    }
    if (path === 'logout') {
      this.tokens.delete(bearer);
      return [204, null];
    }
    return [404, {}];
  }

  /** Makes the account of an email an owner, as the SQL editor does. */
  makeOwner(email: string): void {
    const user = [...this.users.values()].find((u) => u.email === email);
    if (!user) throw new Error(`No account for ${email}.`);
    this.owners.add(user.id);
  }

  /** The answer of an RPC of migration 0008, or undefined for another name. Throws with the SQL message. */
  call(name: string, body: Record<string, unknown>, bearer: string): { value: unknown } | undefined {
    const uid = this.tokens.get(bearer) ?? null;
    const signedIn = () => {
      if (!uid) throw new Error('not signed in');
      return uid;
    };
    const owner = () => {
      if (!this.owners.has(signedIn())) throw new Error('not owner');
    };
    const today = new Date().toISOString().slice(0, 10);
    switch (name) {
      case 'vault_get': {
        const vault = this.vaults.get(signedIn());
        return { value: vault ? [vault] : [] };
      }
      case 'vault_put': {
        const id = signedIn();
        const space = this.sync.spaces.get(String(body.p_space));
        if (space?.token !== body.p_token) throw new Error('unknown space');
        this.vaults.set(id, {
          space_id: String(body.p_space),
          token: String(body.p_token),
          wrapped: String(body.p_wrapped),
          iv: String(body.p_iv),
          salt: String(body.p_salt),
          rounds: Number(body.p_rounds),
          updated_at: new Date().toISOString(),
        });
        return { value: true };
      }
      case 'vault_delete':
        return { value: this.vaults.delete(signedIn()) };
      case 'delete_my_account': {
        const id = signedIn();
        const vault = this.vaults.get(id);
        if (vault) this.sync.spaces.delete(vault.space_id);
        this.vaults.delete(id);
        this.users.delete(id);
        return { value: true };
      }
      case 'daily_count': {
        const install = String(body.p_install);
        const key = `${install}|${today}`;
        const old = this.pings.get(key);
        this.pings.set(key, { install, day: today, user_id: uid ?? old?.user_id ?? null, device: String(body.p_device) });
        return { value: true };
      }
      case 'send_feedback': {
        const message = String(body.p_message).trim();
        if (message === '') throw new Error('empty message');
        const id = randomUUID();
        this.feedback.push({
          id,
          created_at: new Date().toISOString(),
          user_id: uid,
          install: String(body.p_install),
          kind: String(body.p_kind),
          message,
          rating: body.p_rating === null ? null : Number(body.p_rating),
          contact: typeof body.p_contact === 'string' && body.p_contact !== '' ? body.p_contact : null,
          app_version: String(body.p_version),
          device: String(body.p_device),
          place: String(body.p_place),
          status: 'new',
          note: '',
        });
        return { value: id };
      }
      case 'is_owner':
        return { value: uid !== null && this.owners.has(uid) };
      case 'owner_summary': {
        owner();
        const pings = [...this.pings.values()];
        const byStatus: Record<string, number> = {};
        const byKind: Record<string, number> = {};
        for (const f of this.feedback) {
          byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
          byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
        }
        const devices: Record<string, number> = {};
        for (const p of pings) devices[p.device] = (devices[p.device] ?? 0) + 1;
        const ratings = this.feedback.filter((f) => f.rating !== null);
        return {
          value: {
            accounts: this.users.size,
            accounts_7d: this.users.size,
            accounts_30d: this.users.size,
            active_1d: pings.length,
            active_7d: pings.length,
            active_30d: pings.length,
            accounts_active_7d: new Set(pings.map((p) => p.user_id).filter(Boolean)).size,
            accounts_active_30d: new Set(pings.map((p) => p.user_id).filter(Boolean)).size,
            syncing: this.vaults.size,
            spaces: this.sync.spaces.size,
            installed: 0,
            devices,
            versions: { '0.1.0': pings.length },
            feedback: byStatus,
            feedback_kinds: byKind,
            rating: ratings.length ? ratings.reduce((n, f) => n + (f.rating ?? 0), 0) / ratings.length : null,
            ratings: ratings.length,
            reports: 0,
            features: {},
            templates: {},
            words: {},
          },
        };
      }
      case 'owner_daily': {
        owner();
        const days = Number(body.p_days);
        const rows = [];
        for (let i = days - 1; i >= 0; i--) {
          const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
          const pings = [...this.pings.values()].filter((p) => p.day === day);
          rows.push({
            day,
            devices: pings.length,
            accounts: new Set(pings.map((p) => p.user_id).filter(Boolean)).size,
            new_accounts: [...this.users.values()].filter((u) => u.createdAt.startsWith(day)).length,
            feedback: this.feedback.filter((f) => f.created_at.startsWith(day)).length,
          });
        }
        return { value: rows };
      }
      case 'owner_accounts':
        owner();
        return {
          value: [...this.users.values()].map((u) => ({
            id: u.id,
            email: u.email,
            provider: u.provider,
            created_at: u.createdAt,
            last_sign_in_at: u.createdAt,
            last_active: [...this.pings.values()].some((p) => p.user_id === u.id) ? today : null,
            devices: new Set([...this.pings.values()].filter((p) => p.user_id === u.id).map((p) => p.install)).size,
            syncing: this.vaults.has(u.id),
            feedback: this.feedback.filter((f) => f.user_id === u.id).length,
          })),
        };
      case 'owner_feedback':
        owner();
        return {
          value: [...this.feedback].reverse().map((f) => ({
            ...f,
            email: f.user_id ? (this.users.get(f.user_id)?.email ?? null) : null,
          })),
        };
      case 'owner_set_feedback': {
        owner();
        const row = this.feedback.find((f) => f.id === body.p_id);
        if (!row) return { value: false };
        row.status = String(body.p_status);
        if (typeof body.p_note === 'string') row.note = body.p_note;
        return { value: true };
      }
      default:
        return undefined;
    }
  }
}
