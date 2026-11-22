/*
 * A fake sync relay in memory, with the rules of migrations 0005, 0017 and 0018 that a device relies on: a
 * put replaces its device's blob of a key, and a read gives the other devices' blobs from a time on, oldest
 * first, up to 8 MB, without the blobs that the read names as seen. It holds the file store of the Worker
 * too: a file row's payload is the id of its file. tests/unit/sync-relay.test.ts checks the real functions,
 * and tests/unit/files-worker.test.ts the Worker.
 */

export interface RelayBlob {
  device: string;
  key: string;
  payload: string;
  iv: string;
  updated_at: string;
}

interface Space {
  token: string;
  blobs: RelayBlob[];
}

export class FakeSyncRelay {
  readonly spaces = new Map<string, Space>();
  /** The sealed payloads of the file store, by file id. */
  readonly files = new Map<string, string>();
  private last = 0;

  /** Stores a sealed blob in the file store and registers it, as the Worker does. */
  putFile(args: { p_space: string; p_token: string; p_device: string; p_key: string; payload: string; iv: string }) {
    const id = crypto.randomUUID();
    this.files.set(id, args.payload);
    return this.call('sync_put', { ...args, p_payload: id, p_iv: args.iv });
  }

  /** A relay time after every earlier one, as an ISO string. */
  now(): string {
    this.last = Math.max(Date.now(), this.last + 1);
    return new Date(this.last).toISOString();
  }

  private open(args: Record<string, unknown>): Space {
    const space = this.spaces.get(String(args.p_space));
    if (!space || space.token !== args.p_token) throw new Error('unknown space');
    return space;
  }

  call(name: string, args: Record<string, unknown>): unknown {
    if (name === 'create_sync_space') {
      const id = crypto.randomUUID();
      this.spaces.set(id, { token: String(args.p_token), blobs: [] });
      return id;
    }
    const space = this.open(args);
    const mine = (b: RelayBlob) => b.device === args.p_device;
    switch (name) {
      case 'sync_put': {
        const blob: RelayBlob = {
          device: String(args.p_device),
          key: String(args.p_key),
          payload: String(args.p_payload),
          iv: String(args.p_iv),
          updated_at: this.now(),
        };
        space.blobs = [...space.blobs.filter((b) => !(mine(b) && b.key === blob.key)), blob];
        return blob.updated_at;
      }
      case 'sync_list': {
        const since = typeof args.p_since === 'string' ? Date.parse(args.p_since) : -Infinity;
        const seen = new Set(
          ((args.p_seen ?? []) as { device: string; key: string; at: string }[]).map(
            (s) => `${s.device} ${s.key} ${s.at}`,
          ),
        );
        const order = (b: RelayBlob) => `${b.updated_at} ${b.device} ${b.key}`;
        const out: RelayBlob[] = [];
        let size = 0;
        for (const b of space.blobs
          .filter(
            (b) =>
              !mine(b) &&
              Date.parse(b.updated_at) >= since &&
              !seen.has(`${b.device} ${b.key} ${b.updated_at}`),
          )
          .sort((x, y) => order(x).localeCompare(order(y)))) {
          if (size >= 8_000_000) break;
          out.push(b);
          size += b.payload.length;
        }
        return out;
      }
      case 'sync_devices': {
        const devices = new Map<string, { device: string; updated_at: string; size: number }>();
        for (const b of space.blobs) {
          const d = devices.get(b.device) ?? { device: b.device, updated_at: b.updated_at, size: 0 };
          if (b.updated_at > d.updated_at) d.updated_at = b.updated_at;
          d.size += b.payload.length;
          devices.set(b.device, d);
        }
        return [...devices.values()];
      }
      case 'sync_drop':
        space.blobs = space.blobs.filter((b) => !(mine(b) && b.key === args.p_key));
        return true;
      case 'leave_sync':
        space.blobs = space.blobs.filter((b) => !mine(b));
        return true;
      case 'delete_sync_space':
        this.spaces.delete(String(args.p_space));
        return true;
      default:
        throw new Error(`No fake for ${name}`);
    }
  }
}
