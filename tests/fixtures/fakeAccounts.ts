import { randomUUID } from 'node:crypto';
import type { FakeSyncRelay } from './syncRelay';

/*
 * A fake of Supabase Auth and the functions of migrations 0008, 0009, 0011, 0012 and 0016 (Phase 18, the live owner page, profiles, feedback guards and the owner's accounts), for the Playwright tests. Each
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
  key: string;
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
  readonly pings = new Map<
    string,
    {
      install: string;
      day: string;
      user_id: string | null;
      device: string;
      words: number;
      total: number;
      country: string | null;
    }
  >();
  readonly feedback: FeedbackRow[] = [];
  /** The installs and accounts that the owner blocked (migration 0012). */
  readonly blocked = new Set<string>();
  readonly owners = new Set<string>();
  readonly profiles = new Map<
    string,
    { name: string; called: string; pen_name: string; bio: string; photo: string | null; updated_at: string }
  >();
  /** The accounts that left the leaderboard (migration 0012). */
  readonly offBoard = new Set<string>();
  private readonly tokens = new Map<string, string>();
  /** The emails that asked for a code, in order. */
  readonly codesSent: string[] = [];
  /** The password of each account that set one. */
  readonly passwords = new Map<string, string>();
  /** True when a password change needs a code from the email, as with "Secure password change". */
  passwordNeedsCode = false;

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
    if (path === 'token' && typeof body.password === 'string') {
      const user = [...this.users.values()].find((u) => u.email === String(body.email).toLowerCase());
      if (!user || this.passwords.get(user.id) !== body.password)
        return [400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }];
      return [200, this.session(user)];
    }
    if (path === 'user' || path === 'reauthenticate') {
      const id = this.tokens.get(bearer);
      if (!id) return [401, { error_code: 'no_authorization' }];
      if (path === 'reauthenticate') {
        this.codesSent.push(this.users.get(id)?.email ?? '');
        return [200, {}];
      }
      const password = String(body.password);
      if (password.length < 6) return [422, { error_code: 'weak_password' }];
      if (this.passwords.get(id) === password) return [422, { error_code: 'same_password' }];
      if (this.passwordNeedsCode && body.nonce !== CODE)
        return [400, { error_code: body.nonce ? 'reauthentication_not_valid' : 'reauthentication_needed' }];
      this.passwords.set(id, password);
      return [200, { id }];
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
          key: String(body.p_key),
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
        this.profiles.delete(id);
        this.users.delete(id);
        return { value: true };
      }
      case 'profile_get': {
        const profile = this.profiles.get(signedIn());
        return { value: profile ? [profile] : [] };
      }
      case 'profile_put': {
        const id = signedIn();
        const name = String(body.p_name).trim();
        if (name === '' || name.length > 80) throw new Error('bad name');
        const photo = typeof body.p_photo === 'string' ? body.p_photo : null;
        if (photo !== null && (photo.length > 60000 || !/^data:image\/(jpeg|webp);base64,/.test(photo)))
          throw new Error('bad photo');
        const updated_at = new Date().toISOString();
        this.profiles.set(id, {
          name,
          called: String(body.p_called).trim(),
          pen_name: String(body.p_pen_name).trim(),
          bio: String(body.p_bio).trim(),
          photo,
          updated_at,
        });
        return { value: updated_at };
      }
      case 'daily_count': {
        const install = String(body.p_install);
        const day = typeof body.p_day === 'string' ? body.p_day : today;
        const key = `${install}|${day}`;
        const old = this.pings.get(key);
        this.pings.set(key, {
          install,
          day,
          user_id: uid ?? old?.user_id ?? null,
          device: String(body.p_device),
          words: Number(body.p_words ?? old?.words ?? 0),
          total: Number(body.p_total ?? old?.total ?? 0),
          country: typeof body.p_country === 'string' ? body.p_country : (old?.country ?? null),
        });
        return { value: true };
      }
      case 'send_feedback': {
        const message = String(body.p_message).trim();
        if (message === '') throw new Error('empty message');
        const install = String(body.p_install);
        if (this.blocked.has(install) || (uid !== null && this.blocked.has(uid))) throw new Error('feedback blocked');
        const mine = this.feedback.filter((f) => f.install === install || (uid !== null && f.user_id === uid));
        if (mine.some((f) => Date.now() - Date.parse(f.created_at) < 30_000)) throw new Error('feedback too fast');
        if (mine.some((f) => f.message === message)) throw new Error('feedback duplicate');
        const id = randomUUID();
        this.feedback.push({
          id,
          created_at: new Date().toISOString(),
          user_id: uid,
          install,
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
            now: pings.length,
            active_1d: pings.length,
            active_7d: pings.length,
            active_30d: pings.length,
            active_prev_7d: 0,
            returning_7d: 0,
            accounts_active_7d: new Set(pings.map((p) => p.user_id).filter(Boolean)).size,
            accounts_active_30d: new Set(pings.map((p) => p.user_id).filter(Boolean)).size,
            words_total: pings.reduce((n, p) => n + p.total, 0),
            projects: pings.length,
            syncing: this.vaults.size,
            spaces: this.sync.spaces.size,
            sync_bytes: 0,
            synced_at: null,
            shares: 0,
            comments: 0,
            rooms: 0,
            db_bytes: 12_000_000,
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
            writers: pings.filter((p) => p.words > 0).length,
            words: pings.reduce((n, p) => n + p.words, 0),
            new_devices: pings.length,
            new_accounts: [...this.users.values()].filter((u) => u.createdAt.startsWith(day)).length,
            feedback: this.feedback.filter((f) => f.created_at.startsWith(day)).length,
          });
        }
        return { value: rows };
      }
      case 'owner_visitors': {
        owner();
        const pings = [...this.pings.values()];
        const signedOut = pings.filter((p) => p.user_id === null).length;
        const countries: Record<string, number> = {};
        for (const p of pings) if (p.country) countries[p.country] = (countries[p.country] ?? 0) + 1;
        return {
          value: {
            signed_out_1d: signedOut,
            signed_out_7d: signedOut,
            signed_out_30d: signedOut,
            located: pings.filter((p) => p.country).length,
            countries,
            regions: {},
            cities: {},
          },
        };
      }
      case 'owner_accounts':
        owner();
        return {
          value: [...this.users.values()].map((u) => ({
            id: u.id,
            email: u.email,
            name: this.profiles.get(u.id)?.name ?? null,
            provider: u.provider,
            created_at: u.createdAt,
            last_sign_in_at: u.createdAt,
            last_active: [...this.pings.values()].some((p) => p.user_id === u.id) ? today : null,
            devices: new Set([...this.pings.values()].filter((p) => p.user_id === u.id).map((p) => p.install)).size,
            syncing: this.vaults.has(u.id),
            feedback: this.feedback.filter((f) => f.user_id === u.id).length,
            days_30d: 0,
            words_30d: 0,
            words_total: null,
            projects: null,
          })),
        };
      case 'owner_feedback':
        owner();
        return {
          value: [...this.feedback].reverse().map((f) => ({
            ...f,
            email: f.user_id ? (this.users.get(f.user_id)?.email ?? null) : null,
            blocked: this.blocked.has(f.install) || (f.user_id !== null && this.blocked.has(f.user_id)),
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
      case 'leaderboard': {
        // The fake keeps no calendar: "day" is the day that the app sends, and each longer period is every day.
        const me = signedIn();
        const words = new Map<string, number>();
        const best = new Map<string, number>();
        for (const p of this.pings.values()) {
          if (!p.user_id || (body.p_period === 'day' && p.day !== body.p_today)) continue;
          const key = `${p.user_id}|${p.day}`;
          best.set(key, Math.max(best.get(key) ?? 0, p.words));
        }
        for (const [key, n] of best) {
          const id = key.split('|')[0] ?? '';
          words.set(id, (words.get(id) ?? 0) + n);
        }
        const rows = [...words]
          .filter(([id, n]) => n > 0 && this.profiles.has(id) && !this.offBoard.has(id))
          .sort((a, b) => b[1] - a[1]);
        return {
          value: rows.map(([id, n]) => {
            const profile = this.profiles.get(id);
            const names = [profile?.pen_name, profile?.called, profile?.name.split(' ')[0]];
            return {
              place: rows.findIndex(([, m]) => m === n) + 1,
              name: names.find((name) => name !== undefined && name !== '') ?? '',
              photo: profile?.photo ?? null,
              words: n,
              me: id === me,
            };
          }),
        };
      }
      case 'leaderboard_show': {
        const me = signedIn();
        if (body.p_on === false) this.offBoard.add(me);
        if (body.p_on === true) this.offBoard.delete(me);
        return { value: this.profiles.has(me) && !this.offBoard.has(me) };
      }
      case 'owner_block_sender': {
        owner();
        const row = this.feedback.find((f) => f.id === body.p_id);
        if (!row) return { value: false };
        for (const key of [row.install, row.user_id]) {
          if (key === null) continue;
          if (body.p_blocked === true) this.blocked.add(key);
          else this.blocked.delete(key);
        }
        return { value: true };
      }
      case 'owner_add_account': {
        owner();
        const email = String(body.p_email).trim().toLowerCase();
        if ([...this.users.values()].some((u) => u.email === email)) throw new Error('email taken');
        const id = randomUUID();
        this.users.set(id, { id, email, provider: 'email', createdAt: new Date().toISOString() });
        const name = String(body.p_name).trim();
        if (name !== '')
          this.profiles.set(id, { name, called: '', pen_name: '', bio: '', photo: null, updated_at: '' });
        return { value: id };
      }
      case 'owner_edit_account': {
        owner();
        const user = this.users.get(String(body.p_id));
        if (!user) return { value: false };
        const email = String(body.p_email).trim().toLowerCase();
        if (email !== user.email) {
          if (user.provider !== 'email') throw new Error('email locked');
          if ([...this.users.values()].some((u) => u.email === email)) throw new Error('email taken');
          user.email = email;
        }
        const name = String(body.p_name).trim();
        const profile = this.profiles.get(user.id);
        if (name === '' && profile) throw new Error('bad name');
        if (name !== '')
          this.profiles.set(user.id, { called: '', pen_name: '', bio: '', photo: null, ...profile, name, updated_at: '' });
        return { value: true };
      }
      case 'owner_delete_account': {
        owner();
        const id = String(body.p_id);
        if (id === uid) throw new Error('own account');
        const vault = this.vaults.get(id);
        if (vault) this.sync.spaces.delete(vault.space_id);
        this.vaults.delete(id);
        this.profiles.delete(id);
        return { value: this.users.delete(id) };
      }
      default:
        return undefined;
    }
  }
}
