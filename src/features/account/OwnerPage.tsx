import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { downloadBytes } from '@/lib/download';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Segmented } from '@/ui/segmented';
import { Textarea } from '@/ui/textarea';
import { accountErrorText } from './AccountPage';
import { accountsReady } from './auth';
import {
  feedbackCsv,
  isOwner,
  ownerAccounts,
  ownerDaily,
  ownerFeedback,
  ownerSummary,
  ranked,
  setFeedbackStatus,
  type FeedbackStatus,
  type OwnerAccount,
  type OwnerDay,
  type OwnerFeedback,
  type OwnerSummary,
} from './owner';
import { readSession } from './session';

/*
 * The owner page (Phase 18, Task A5, decision A6): how many people use Vlo, how they use it, and what
 * they say. Only an account in `app_owners` can read it, and it shows no writing: the server has none.
 */

const NUMBER = new Intl.NumberFormat('en-GB');
const n = (value: number) => NUMBER.format(value);
const dayText = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: iso.length === 10 ? 'UTC' : undefined,
      })
    : 'Never';

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-[var(--radius-card)] border border-rule bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-display text-3xl font-semibold">{value}</dd>
      {note && <dd className="text-sm text-muted">{note}</dd>}
    </div>
  );
}

/** Active devices each day: one series, so the title names it and no legend shows. */
function DailyChart({ days }: { days: OwnerDay[] }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...days.map((d) => d.devices));
  const top = max <= 4 ? max : Math.ceil(max / 5) * 5;
  const W = 600;
  const H = 180;
  const slot = W / Math.max(1, days.length);
  const bar = Math.min(16, slot - 2);
  const y = (v: number) => H - (v / top) * H;
  const active = hover === null ? null : days[hover];
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${id}-title`} className="text-lg font-semibold">
          Devices that opened Vlo each day, last {days.length} days
        </h3>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={table}
          onClick={() => {
            setTable(!table);
          }}
        >
          {table ? 'Show the chart' : 'Show as a table'}
        </Button>
      </div>
      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-4 font-medium">Day (UTC)</th>
                <th className="py-1 pr-4 font-medium">Devices</th>
                <th className="py-1 pr-4 font-medium">Signed-in accounts</th>
                <th className="py-1 pr-4 font-medium">New accounts</th>
                <th className="py-1 font-medium">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day} className="border-t border-rule">
                  <td className="py-1 pr-4">{dayText(d.day)}</td>
                  <td className="py-1 pr-4">{n(d.devices)}</td>
                  <td className="py-1 pr-4">{n(d.accounts)}</td>
                  <td className="py-1 pr-4">{n(d.new_accounts)}</td>
                  <td className="py-1">{n(d.feedback)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="flex gap-2">
            <div
              className="flex h-[180px] flex-col justify-between text-right text-xs text-muted"
              aria-hidden="true"
            >
              <span>{n(top)}</span>
              <span>{n(Math.round(top / 2))}</span>
              <span>0</span>
            </div>
            <svg
              viewBox={`0 0 ${String(W)} ${String(H)}`}
              preserveAspectRatio="none"
              className="h-[180px] w-full overflow-visible"
              role="img"
              aria-label={`Devices each day. Today: ${n(days.at(-1)?.devices ?? 0)}. Highest: ${n(max)}.`}
              onPointerLeave={() => {
                setHover(null);
              }}
            >
              {[0, 0.5, 1].map((f) => (
                <line
                  key={f}
                  x1={0}
                  x2={W}
                  y1={H * f}
                  y2={H * f}
                  stroke="var(--rule)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {days.map((d, i) => {
                const x = i * slot + (slot - bar) / 2;
                const h = H - y(d.devices);
                const r = Math.min(4, h / 2);
                return (
                  <g
                    key={d.day}
                    onPointerEnter={() => {
                      setHover(i);
                    }}
                  >
                    {/* The hit target is the whole slot, taller and wider than the bar. */}
                    <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
                    {d.devices > 0 && (
                      <path
                        d={`M${String(x)} ${String(H)}V${String(H - h + r)}q0 -${String(r)} ${String(r)} -${String(r)}h${String(bar - 2 * r)}q${String(r)} 0 ${String(r)} ${String(r)}V${String(H)}z`}
                        fill="var(--accent)"
                        opacity={hover === null || hover === i ? 1 : 0.55}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-1 flex justify-between pl-8 text-xs text-muted" aria-hidden="true">
            <span>{dayText(days[0]?.day ?? null)}</span>
            <span>{dayText(days.at(-1)?.day ?? null)}</span>
          </div>
          {active && (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 right-0 grid gap-0.5 rounded-md border border-rule bg-surface px-3 py-2 text-sm shadow-[var(--shadow-hover)]"
            >
              <span className="font-semibold">{dayText(active.day)}</span>
              <span>{n(active.devices)} devices</span>
              <span className="text-muted">{n(active.accounts)} signed-in accounts</span>
              <span className="text-muted">{n(active.new_accounts)} new accounts</span>
              <span className="text-muted">{n(active.feedback)} feedback</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const LABELS: Record<string, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  computer: 'Computer',
  novel: 'Novel',
  memoir: 'Memoir',
  poetry: 'Poetry collection',
  open: 'Open writing',
  script: 'Script',
  essay: 'Essay',
  article: 'Article',
  research: 'Research paper',
};

/** A ranked list with a bar for each value: magnitude in one hue. */
function Breakdown({
  title,
  counts,
  note,
}: {
  title: string;
  counts: Record<string, number>;
  note?: string;
}) {
  const rows = ranked(counts);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <section className="grid content-start gap-2">
      <h3 className="font-semibold">{title}</h3>
      {note && <p className="text-sm text-muted">{note}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.slice(0, 10).map(([name, value]) => (
            <li
              key={name}
              className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-2 text-sm"
            >
              <span className="truncate">{LABELS[name] ?? name}</span>
              <span
                className="h-3 rounded-r-[4px] bg-accent"
                style={{ width: `${String((value / max) * 100)}%` }}
                aria-hidden="true"
              />
              <span className="tabular-nums">{n(value)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Overview({ summary, days }: { summary: OwnerSummary; days: OwnerDay[] }) {
  const newFeedback = summary.feedback.new ?? 0;
  return (
    <div className="grid gap-8">
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
        <Tile label="Accounts" value={n(summary.accounts)} note={`${n(summary.accounts_7d)} new this week`} />
        <Tile label="Devices today" value={n(summary.active_1d)} />
        <Tile label="Devices this week" value={n(summary.active_7d)} />
        <Tile
          label="Devices this month"
          value={n(summary.active_30d)}
          note={`${n(summary.installed)} installed the app`}
        />
        <Tile
          label="Accounts active this month"
          value={n(summary.accounts_active_30d)}
          note={`${n(summary.accounts_active_7d)} this week`}
        />
        <Tile
          label="Accounts that sync"
          value={n(summary.syncing)}
          note={`${n(summary.spaces)} sync spaces in all`}
        />
        <Tile label="New feedback" value={n(newFeedback)} />
        <Tile
          label="Average rating"
          value={summary.rating === null ? 'None' : `${String(summary.rating)} of 5`}
          note={`${n(summary.ratings)} ratings`}
        />
      </dl>
      <DailyChart days={days} />
      <div className="grid gap-8 sm:grid-cols-2">
        <Breakdown title="Kinds of device, this month" counts={summary.devices} />
        <Breakdown title="Versions of Vlo, this month" counts={summary.versions} />
        <Breakdown
          title="Writing modes in weekly reports"
          counts={summary.templates}
          note={`From ${n(summary.reports)} reports in the last 8 weeks. Only writers who turn on usage counts send one.`}
        />
        <Breakdown title="Features in weekly reports" counts={summary.features} />
        <Breakdown title="Words added in a week" counts={summary.words} />
        <Breakdown title="Feedback by kind" counts={summary.feedback_kinds} />
      </div>
    </div>
  );
}

function People({ accounts }: { accounts: OwnerAccount[] }) {
  const id = useId();
  const [filter, setFilter] = useState('');
  const shown = accounts.filter((a) => a.email.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div className="grid gap-4">
      <div className="grid max-w-sm gap-1.5">
        <label htmlFor={id} className="text-sm">
          Find an email
        </label>
        <Input
          id={id}
          type="search"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
        />
      </div>
      <p className="text-sm text-muted">
        {n(shown.length)} of {n(accounts.length)} accounts. People who write with no account show only in the
        device counts.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Joined</th>
              <th className="py-2 pr-4 font-medium">Last active</th>
              <th className="py-2 pr-4 font-medium">Devices</th>
              <th className="py-2 pr-4 font-medium">Sync</th>
              <th className="py-2 font-medium">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className="border-t border-rule">
                <td className="py-2 pr-4">
                  {a.email}
                  {a.provider === 'google' ? <span className="text-muted"> (Google)</span> : null}
                </td>
                <td className="py-2 pr-4">{dayText(a.created_at)}</td>
                <td className="py-2 pr-4">{dayText(a.last_active)}</td>
                <td className="py-2 pr-4 tabular-nums">{n(a.devices)}</td>
                <td className="py-2 pr-4">{a.syncing ? 'On' : 'Off'}</td>
                <td className="py-2 tabular-nums">{n(a.feedback)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'read', label: 'Read' },
  { value: 'planned', label: 'Planned' },
  { value: 'done', label: 'Done' },
];
const KIND_LABELS: Record<OwnerFeedback['kind'], string> = {
  idea: 'Idea',
  problem: 'Problem',
  praise: 'Praise',
  question: 'Question',
};

function FeedbackItem({ item, onSaved }: { item: OwnerFeedback; onSaved: (item: OwnerFeedback) => void }) {
  const id = useId();
  const [note, setNote] = useState(item.note);
  const [message, setMessage] = useState('');
  const save = (status: FeedbackStatus, text: string) => {
    setMessage('');
    setFeedbackStatus(item.id, status, text).then(
      () => {
        onSaved({ ...item, status, note: text });
        setMessage('Saved.');
      },
      (error: unknown) => {
        setMessage(accountErrorText(error));
      },
    );
  };
  const from = item.email ?? item.contact;
  return (
    <li className="grid gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4">
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
        <span className="font-semibold text-text">{KIND_LABELS[item.kind]}</span>
        <span>{dayText(item.created_at)}</span>
        {item.rating !== null && <span>Rating {item.rating} of 5</span>}
        <span>
          {item.device}, version {item.app_version}
          {item.place ? `, from ${item.place}` : ''}
        </span>
      </p>
      <p className="whitespace-pre-wrap">{item.message}</p>
      <p className="text-sm">
        {from ? (
          <>
            From{' '}
            <a href={`mailto:${from}`} className="underline">
              {from}
            </a>
            {item.email ? '' : ' (typed by the writer)'}
          </>
        ) : (
          <span className="text-muted">No reply address.</span>
        )}
      </p>
      <Segmented
        label="Status"
        options={STATUSES}
        value={item.status}
        onChange={(status) => {
          save(status, note);
        }}
      />
      <div className="grid gap-1.5">
        <label htmlFor={id} className="text-sm">
          Your note (only you see it)
        </label>
        <Textarea
          id={id}
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={note === item.note}
            onClick={() => {
              save(item.status, note);
            }}
          >
            Save the note
          </Button>
          <span role="status" className="text-sm">
            {message}
          </span>
        </div>
      </div>
    </li>
  );
}

function Inbox({ items, onChange }: { items: OwnerFeedback[]; onChange: (items: OwnerFeedback[]) => void }) {
  const [status, setStatus] = useState<FeedbackStatus | 'all'>('all');
  const [kind, setKind] = useState<OwnerFeedback['kind'] | 'all'>('all');
  const shown = items.filter(
    (f) => (status === 'all' || f.status === status) && (kind === 'all' || f.kind === kind),
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Show"
          options={[{ value: 'all', label: 'All' }, ...STATUSES]}
          value={status}
          onChange={setStatus}
        />
        <Segmented
          label="Kind"
          options={[
            { value: 'all', label: 'Every kind' },
            ...(Object.keys(KIND_LABELS) as OwnerFeedback['kind'][]).map((k) => ({
              value: k,
              label: KIND_LABELS[k],
            })),
          ]}
          value={kind}
          onChange={setKind}
        />
        <Button
          type="button"
          variant="outline"
          disabled={items.length === 0}
          onClick={() => {
            downloadBytes('vlo-feedback.csv', 'text/csv', new TextEncoder().encode(feedbackCsv(items)));
          }}
        >
          Download all as CSV
        </Button>
      </div>
      {shown.length === 0 ? (
        <p className="text-muted">No feedback here.</p>
      ) : (
        <ul aria-label="Feedback" className="grid gap-3">
          {shown.map((item) => (
            <FeedbackItem
              key={item.id}
              item={item}
              onSaved={(saved) => {
                onChange(items.map((f) => (f.id === saved.id ? saved : f)));
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface Data {
  summary: OwnerSummary;
  days: OwnerDay[];
  accounts: OwnerAccount[];
  feedback: OwnerFeedback[];
}

type View = 'overview' | 'people' | 'feedback';

function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<View>('overview');
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    const run = { live: true };
    (async () => {
      if (!(await isOwner())) {
        if (run.live) setAllowed(false);
        return;
      }
      const [summary, days, accounts, feedback] = await Promise.all([
        ownerSummary(),
        ownerDaily(30),
        ownerAccounts(),
        ownerFeedback(),
      ]);
      if (run.live) {
        setAllowed(true);
        setData({ summary, days, accounts, feedback });
      }
    })().catch((error: unknown) => {
      if (run.live) setMessage(accountErrorText(error));
    });
    return () => {
      run.live = false;
    };
  }, [loads]);

  const counts = useMemo(() => (data ? data.feedback.filter((f) => f.status === 'new').length : 0), [data]);

  if (allowed === false) return <p>This page is for the owner of Vlo. Your account cannot open it.</p>;
  if (!data)
    return (
      <p role="status" className="text-sm">
        {message || 'Loading the numbers.'}
      </p>
    );
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View>
          label="Owner view"
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'people', label: `People (${n(data.accounts.length)})` },
            { value: 'feedback', label: `Feedback (${n(counts)} new)` },
          ]}
          value={view}
          onChange={setView}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setLoads((x) => x + 1);
          }}
        >
          Refresh
        </Button>
      </div>
      {view === 'overview' && <Overview summary={data.summary} days={data.days} />}
      {view === 'people' && <People accounts={data.accounts} />}
      {view === 'feedback' && (
        <Inbox
          items={data.feedback}
          onChange={(feedback) => {
            setData({ ...data, feedback });
          }}
        />
      )}
      <p className="text-sm text-muted">
        Days are in UTC. A device is one browser on one device; a writer with a phone and a laptop counts as
        two devices and one account. This page shows no project, title or word of writing.
      </p>
    </div>
  );
}

export function OwnerPage() {
  useDocumentTitle('Owner');
  const session = useLiveQuery(readSession);
  let body: React.ReactNode;
  if (!accountsReady()) body = <p>Accounts are not set up in this build.</p>;
  else if (session === undefined) body = null;
  else if (!session)
    body = (
      <p>
        <Link to="/account" className="underline">
          Sign in
        </Link>{' '}
        with the owner account to see who uses Vlo.
      </p>
    );
  else body = <Dashboard key={session.userId} />;
  return (
    <div className="grid gap-6">
      <h1 className="font-display text-4xl font-semibold">Owner</h1>
      {body}
    </div>
  );
}
