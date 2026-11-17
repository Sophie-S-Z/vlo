import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { AnimatePresence, domAnimation, LazyMotion, m, MotionConfig } from 'motion/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMotionAllowed } from '@/app/PreferencesProvider';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { CountUp } from '@/features/progress/CountUp';
import { dayKey } from '@/features/progress/streaks';
import { downloadBytes } from '@/lib/download';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Segmented } from '@/ui/segmented';
import { Textarea } from '@/ui/textarea';
import { accountErrorText } from './AccountPage';
import { accountsReady } from './auth';
import {
  benchmarks,
  blockSender,
  change,
  feedbackCsv,
  insights,
  isOwner,
  ownerAccounts,
  ownerDaily,
  ownerFeedback,
  ownerSummary,
  ownerVisitors,
  placeLabels,
  setFeedbackStatus,
  total,
  weekdayWords,
  type DayKey,
  type FeedbackStatus,
  type OwnerAccount,
  type OwnerDay,
  type OwnerFeedback,
  type OwnerSummary,
  type OwnerVisitors,
} from './owner';
import { Breakdown, dayText, Meter, n, Sparkline, TrendChart, WeekdayBars, YearMap } from './ownerCharts';
import { readSession } from './session';

/*
 * The owner page (Phase 18, Task A5, decision A6, and the live revamp of migration 0009): how many people
 * use Vlo, how much they write, and what they say. Only an account in `app_owners` can read it, and it
 * shows no writing: the server has none, only counts. The page stays live: it loads again every 30
 * seconds while it is on the screen, and at once when it comes back. A hidden tab sends no request.
 */

/** How often the page loads the numbers again while it is on the screen. */
const LIVE_MS = 30_000;
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
/** The database size of the Supabase free plan. */
const FREE_DB_BYTES = 500_000_000;

/** A change against an earlier period, in words and an arrow, never in color alone. */
function Delta({ now, before, period }: { now: number; before: number; period: string }) {
  const pct = change(now, before);
  if (pct === null) return null;
  const Icon = pct >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className="flex items-center gap-1 text-sm text-muted">
      {pct !== 0 && <Icon aria-hidden="true" className="size-3.5" />}
      {pct === 0 ? `Same as ${period}` : `${pct > 0 ? 'Up' : 'Down'} ${String(Math.abs(pct))}% on ${period}`}
    </span>
  );
}

function Tile({
  label,
  value,
  note,
  trend,
  children,
}: {
  label: string;
  value: number | string;
  note?: string;
  trend?: readonly number[];
  children?: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1 rounded-[var(--radius-card)] border border-rule bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-semibold sm:text-3xl">
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </dd>
      {children && <dd>{children}</dd>}
      {note && <dd className="text-sm text-muted">{note}</dd>}
      {trend && (
        <dd className="pt-1">
          <Sparkline values={trend} />
        </dd>
      )}
    </div>
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

/** The words of today, the hero of the page. A rise since the last load floats up as "+N". */
function Today({ summary, days }: { summary: OwnerSummary; days: OwnerDay[] }) {
  const today = days.at(-1);
  const words = today?.words ?? 0;
  const [seen, setSeen] = useState({ words, gain: 0, key: 0 });
  if (seen.words !== words) setSeen({ words, gain: words - seen.words, key: seen.key + 1 });
  const average = Math.round(total(days, 'words', 7, 1) / 7);
  return (
    <section
      aria-labelledby="owner-today"
      className="grid content-start gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-5"
    >
      <h2 id="owner-today" className="text-sm text-muted">
        Words written today
      </h2>
      <p className="relative flex items-baseline gap-3">
        <CountUp value={words} className="text-6xl font-semibold tracking-tight" />
        <AnimatePresence>
          {seen.gain > 0 && (
            <m.span
              key={seen.key}
              className="text-lg font-semibold text-accent-text"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -12] }}
              transition={{ duration: 4, times: [0, 0.1, 0.8, 1] }}
            >
              +{n(seen.gain)}
            </m.span>
          )}
        </AnimatePresence>
      </p>
      <div className="grid gap-1 text-sm">
        <Delta now={words} before={average} period="the 7-day average" />
        <p>
          {n(today?.writers ?? 0)} {today?.writers === 1 ? 'writer' : 'writers'} today, {n(average)} words on
          an average day
        </p>
        <p className="flex items-center gap-2">
          <span className="relative flex size-2.5" aria-hidden="true">
            {summary.now > 0 && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            )}
            <span
              className={`relative inline-flex size-2.5 rounded-full ${summary.now > 0 ? 'bg-accent' : 'bg-rule'}`}
            />
          </span>
          {n(summary.now)} {summary.now === 1 ? 'writer' : 'writers'} in Vlo in the last 15 minutes
        </p>
      </div>
    </section>
  );
}

function Insights({ lines }: { lines: string[] }) {
  return (
    <section
      aria-labelledby="owner-insights"
      className="grid content-start gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-5"
    >
      <h2 id="owner-insights" className="text-sm text-muted">
        What stands out
      </h2>
      {lines.length === 0 ? (
        <p className="text-sm text-muted">Facts show here when writers start to write.</p>
      ) : (
        <ul className="grid gap-2">
          {lines.map((line, i) => (
            <m.li
              key={line}
              className="border-l-2 border-accent pl-3"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              {line}
            </m.li>
          ))}
        </ul>
      )}
    </section>
  );
}

const MEASURES: { value: DayKey; label: string; unit: string }[] = [
  { value: 'words', label: 'Words', unit: 'Words' },
  { value: 'writers', label: 'Writers', unit: 'Writers who added words' },
  { value: 'devices', label: 'Devices', unit: 'Devices that opened Vlo' },
  { value: 'new_devices', label: 'New devices', unit: 'New devices' },
  { value: 'new_accounts', label: 'New accounts', unit: 'New accounts' },
  { value: 'feedback', label: 'Feedback', unit: 'Feedback messages' },
];
const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: 'Year' },
];

/** The box around a wide table. It takes focus, so a keyboard can scroll it on a narrow screen. */
function TableBox({
  name,
  className = 'overflow-x-auto',
  children,
}: {
  name: { labelledBy: string } | { label: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      role="region"
      aria-labelledby={'labelledBy' in name ? name.labelledBy : undefined}
      aria-label={'label' in name ? name.label : undefined}
      className={`${className} rounded-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none`}
    >
      {children}
    </div>
  );
}

function OverTime({ days }: { days: OwnerDay[] }) {
  const [measure, setMeasure] = useState<DayKey>('words');
  const [range, setRange] = useState('30');
  const [table, setTable] = useState(false);
  const shown = days.slice(-Number(range));
  const def = MEASURES.find((x) => x.value === measure) ?? MEASURES[0];
  return (
    <section aria-labelledby="owner-time" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="owner-time" className="mr-auto text-lg font-semibold">
          {def?.unit} each day
        </h2>
        <Segmented label="Days" options={RANGES} value={range} onChange={setRange} />
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
      <div className="overflow-x-auto">
        <div className="w-max">
          <Segmented label="Measure" options={MEASURES} value={measure} onChange={setMeasure} />
        </div>
      </div>
      {table ? (
        <TableBox name={{ labelledBy: 'owner-time' }} className="max-h-96 overflow-auto">
          <table aria-labelledby="owner-time" className="w-full min-w-[40rem] text-sm">
            <thead className="sticky top-0 bg-bg">
              <tr className="text-left text-muted">
                <th className="py-1 pr-4 font-medium">Day</th>
                {MEASURES.map((x) => (
                  <th key={x.value} className="py-1 pr-4 font-medium">
                    {x.label}
                  </th>
                ))}
                <th className="py-1 font-medium">Signed-in accounts</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...shown].reverse().map((d) => (
                <tr key={d.day} className="border-t border-rule">
                  <td className="py-1 pr-4">{dayText(d.day)}</td>
                  {MEASURES.map((x) => (
                    <td key={x.value} className="py-1 pr-4">
                      {n(d[x.value])}
                    </td>
                  ))}
                  <td className="py-1">{n(d.accounts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      ) : (
        <TrendChart
          key={`${measure}-${range}`}
          days={shown}
          value={(d) => d[measure]}
          unit={def?.unit ?? ''}
        />
      )}
    </section>
  );
}

/** The daily benchmarks: each measure today against yesterday, an average day and the best day. */
function Daily({ days }: { days: OwnerDay[] }) {
  return (
    <section aria-labelledby="owner-daily" className="grid content-start gap-3">
      <h2 id="owner-daily" className="text-lg font-semibold">
        Today against other days
      </h2>
      <TableBox name={{ labelledBy: 'owner-daily' }}>
        <table aria-labelledby="owner-daily" className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4 font-medium">Measure</th>
              <th className="py-2 pr-4 font-medium">Today</th>
              <th className="py-2 pr-4 font-medium">Yesterday</th>
              <th className="py-2 pr-4 font-medium">Average day, last 4 weeks</th>
              <th className="py-2 pr-4 font-medium">Best day of the year</th>
              <th className="py-2 font-medium">Today against an average day</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {MEASURES.map(({ value, label }) => {
              const b = benchmarks(days, value);
              const share = b.average === 0 ? null : b.today / b.average;
              return (
                <tr key={value} className="border-t border-rule">
                  <th scope="row" className="py-2 pr-4 text-left font-medium">
                    {label}
                  </th>
                  <td className="py-2 pr-4 font-semibold">{n(b.today)}</td>
                  <td className="py-2 pr-4">{n(b.yesterday)}</td>
                  <td className="py-2 pr-4">{n(b.average)}</td>
                  <td className="py-2 pr-4">{n(b.best)}</td>
                  <td className="py-2">
                    {share === null ? (
                      <span className="text-muted">No average yet</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="h-1.5 w-20 overflow-hidden rounded-full bg-rule">
                          <span
                            className="block h-full rounded-full bg-accent transition-[width] duration-700 motion-reduce:transition-none"
                            style={{ width: `${String(Math.min(100, Math.max(share * 100, 1)))}%` }}
                          />
                        </span>
                        {String(Math.round(share * 100))}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableBox>
    </section>
  );
}

/** The share of `part` in `whole`, in whole percent. */
const percent = (part: number, whole: number) =>
  `${String(whole === 0 ? 0 : Math.round((part / whole) * 100))}%`;

/** Visitors with no account, and where the devices of the month are. */
function Visitors({ summary, visitors }: { summary: OwnerSummary; visitors: OwnerVisitors }) {
  return (
    <section aria-labelledby="owner-visitors" className="grid gap-4">
      <h2 id="owner-visitors" className="text-lg font-semibold">
        Signed-out visitors and places
      </h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile
          label="Signed out today"
          value={visitors.signed_out_1d}
          note={`${percent(visitors.signed_out_1d, summary.active_1d)} of today's devices`}
        />
        <Tile
          label="Signed out this week"
          value={visitors.signed_out_7d}
          note={`${percent(visitors.signed_out_7d, summary.active_7d)} of this week's devices`}
        />
        <Tile
          label="Signed out this month"
          value={visitors.signed_out_30d}
          note={`${percent(visitors.signed_out_30d, summary.active_30d)} of this month's devices`}
        />
      </dl>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <Breakdown
          title="Countries, this month"
          counts={visitors.countries}
          labels={placeLabels(visitors.countries)}
          note={`${n(visitors.located)} of ${n(summary.active_30d)} devices have a place.`}
        />
        <Breakdown title="Regions" counts={visitors.regions} labels={placeLabels(visitors.regions)} />
        <Breakdown title="Cities" counts={visitors.cities} labels={placeLabels(visitors.cities)} />
      </div>
      <p className="text-sm text-muted">
        A signed-out device had no account on any count of the period. A place is the newest country, region
        and city of a device, from its internet address. Vlo keeps no address and no exact location.
      </p>
    </section>
  );
}

function Overview({
  summary,
  days,
  visitors,
}: {
  summary: OwnerSummary;
  days: OwnerDay[];
  visitors: OwnerVisitors;
}) {
  const lines = useMemo(() => insights(summary, days, dayText), [summary, days]);
  const spark = (key: DayKey) => days.slice(-14).map((d) => d[key]);
  const newFeedback = summary.feedback.new ?? 0;
  return (
    <div className="grid gap-10">
      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <Today summary={summary} days={days} />
        <Insights lines={lines} />
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Words this week" value={total(days, 'words', 7)} trend={spark('words')}>
          <Delta now={total(days, 'words', 7)} before={total(days, 'words', 7, 7)} period="last week" />
        </Tile>
        <Tile
          label="Words this month"
          value={total(days, 'words', 30)}
          note={`${n(total(days, 'words', days.length))} in the last year`}
        />
        <Tile
          label="Words in Vlo now"
          value={summary.words_total}
          note={`In ${n(summary.projects)} ${summary.projects === 1 ? 'project' : 'projects'} on writers' devices`}
        />
        <Tile label="Devices today" value={summary.active_1d} trend={spark('devices')}>
          <Delta now={summary.active_7d} before={summary.active_prev_7d} period="last week, for the week" />
        </Tile>
        <Tile
          label="Devices this month"
          value={summary.active_30d}
          note={`${n(summary.active_7d)} this week, ${n(summary.installed)} installed the app`}
        />
        <Tile
          label="Came back this week"
          value={
            summary.active_prev_7d === 0
              ? 'None yet'
              : `${String(Math.round((summary.returning_7d / summary.active_prev_7d) * 100))}%`
          }
          note={`${n(summary.returning_7d)} of ${n(summary.active_prev_7d)} devices from the week before`}
        />
        <Tile
          label="Accounts"
          value={summary.accounts}
          note={`${n(summary.accounts_7d)} new this week, ${n(summary.accounts_active_7d)} active, ${n(summary.syncing)} sync`}
          trend={spark('new_accounts')}
        />
        <Tile
          label="New feedback"
          value={newFeedback}
          note={
            summary.rating === null
              ? 'No ratings yet'
              : `Rating ${String(summary.rating)} of 5, from ${n(summary.ratings)}`
          }
          trend={spark('feedback')}
        />
      </dl>
      <Visitors summary={summary} visitors={visitors} />
      <Daily days={days} />
      <OverTime days={days} />
      <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="owner-year" className="grid content-start gap-3">
          <h2 id="owner-year" className="text-lg font-semibold">
            A year of writing
          </h2>
          <YearMap days={days} />
        </section>
        <section aria-labelledby="owner-week" className="grid content-start gap-3">
          <h2 id="owner-week" className="text-lg font-semibold">
            Average words on each weekday
          </h2>
          <WeekdayBars values={weekdayWords(days)} />
        </section>
      </div>
      <div className="grid gap-8 sm:grid-cols-2">
        <Breakdown title="Kinds of device, this month" counts={summary.devices} labels={LABELS} />
        <Breakdown title="Versions of Vlo, this month" counts={summary.versions} labels={LABELS} />
        <Breakdown title="Feedback by kind" counts={summary.feedback_kinds} labels={KIND_LABELS} />
        <Breakdown
          title="Writing modes in weekly reports"
          counts={summary.templates}
          labels={LABELS}
          note={`From ${n(summary.reports)} reports in the last 8 weeks. Each device sends one a week.`}
        />
        <Breakdown title="Features in weekly reports" counts={summary.features} labels={LABELS} />
      </div>
      <section aria-labelledby="owner-server" className="grid gap-4">
        <h2 id="owner-server" className="text-lg font-semibold">
          Server and storage
        </h2>
        <Meter
          label={`Database: ${mb(summary.db_bytes)} of ${mb(FREE_DB_BYTES)} on the free plan`}
          used={summary.db_bytes}
          of={FREE_DB_BYTES}
        />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile
            label="Sealed sync copies"
            value={mb(summary.sync_bytes)}
            note={`Last sync ${dayText(summary.synced_at)}`}
          />
          <Tile
            label="Open share links"
            value={summary.shares}
            note={`${n(summary.comments)} reader comments`}
          />
          <Tile label="Open sprint rooms" value={summary.rooms} />
        </dl>
      </section>
    </div>
  );
}

const SORTS = [
  { value: 'active', label: 'Last active' },
  { value: 'words', label: 'Most words' },
  { value: 'joined', label: 'Newest' },
] as const;
type Sort = (typeof SORTS)[number]['value'];
const SORTERS: Record<Sort, (a: OwnerAccount, b: OwnerAccount) => number> = {
  active: (a, b) => (b.last_active ?? '').localeCompare(a.last_active ?? ''),
  words: (a, b) => b.words_30d - a.words_30d || (b.words_total ?? 0) - (a.words_total ?? 0),
  joined: (a, b) => b.created_at.localeCompare(a.created_at),
};

function People({ accounts }: { accounts: OwnerAccount[] }) {
  const id = useId();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<Sort>('active');
  const find = filter.trim().toLowerCase();
  const shown = accounts
    .filter((a) => `${a.name ?? ''} ${a.email}`.toLowerCase().includes(find))
    .sort(SORTERS[sort]);
  const top = Math.max(1, ...accounts.map((a) => a.words_30d));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid w-full max-w-sm gap-1.5">
          <label htmlFor={id} className="text-sm">
            Find a name or email
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
        <Segmented<Sort> label="Sort" options={[...SORTS]} value={sort} onChange={setSort} />
      </div>
      <p className="text-sm text-muted">
        {n(shown.length)} of {n(accounts.length)} accounts. People who write with no account show only in the
        device and word counts.
      </p>
      <TableBox name={{ label: 'Accounts' }}>
        <table aria-label="Accounts" className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4 font-medium">Writer</th>
              <th className="py-2 pr-4 font-medium">Joined</th>
              <th className="py-2 pr-4 font-medium">Last active</th>
              <th className="py-2 pr-4 font-medium">Words, 30 days</th>
              <th className="py-2 pr-4 font-medium">Days with Vlo, 30 days</th>
              <th className="py-2 pr-4 font-medium">Words in Vlo</th>
              <th className="py-2 pr-4 font-medium">Projects</th>
              <th className="py-2 pr-4 font-medium">Devices</th>
              <th className="py-2 pr-4 font-medium">Sync</th>
              <th className="py-2 font-medium">Feedback</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {shown.map((a) => (
              <tr key={a.id} className="border-t border-rule">
                <td className="py-2 pr-4">
                  {a.name && <span className="block font-medium">{a.name}</span>}
                  <span className={a.name ? 'text-muted' : undefined}>{a.email}</span>
                  {a.provider === 'google' ? <span className="text-muted"> (Google)</span> : null}
                </td>
                <td className="py-2 pr-4">{dayText(a.created_at)}</td>
                <td className="py-2 pr-4">{dayText(a.last_active)}</td>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-2">
                    {n(a.words_30d)}
                    <span
                      aria-hidden="true"
                      className="h-2 rounded-r-[4px] bg-accent"
                      style={{ width: `${String((a.words_30d / top) * 4)}rem` }}
                    />
                  </span>
                </td>
                <td className="py-2 pr-4">{n(a.days_30d)}</td>
                <td className="py-2 pr-4">{a.words_total === null ? 'Not yet' : n(a.words_total)}</td>
                <td className="py-2 pr-4">{a.projects === null ? 'Not yet' : n(a.projects)}</td>
                <td className="py-2 pr-4">{n(a.devices)}</td>
                <td className="py-2 pr-4">{a.syncing ? 'On' : 'Off'}</td>
                <td className="py-2">{n(a.feedback)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
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
  note: 'Note to you',
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
  const block = (blocked: boolean) => {
    setMessage('');
    blockSender(item.id, blocked).then(
      () => {
        onSaved({ ...item, blocked });
        setMessage(blocked ? 'Blocked. This sender cannot send more messages.' : 'Unblocked.');
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
        {item.blocked && <span className="font-semibold text-accent-text">Sender blocked</span>}
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
        <div className="flex flex-wrap items-center gap-3">
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
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              block(!item.blocked);
            }}
          >
            {item.blocked ? 'Unblock this sender' : 'Block this sender'}
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
  visitors: OwnerVisitors;
  /** When the numbers came, in ms. */
  at: number;
}

type View = 'overview' | 'people' | 'feedback';

async function loadAll(): Promise<Data> {
  const today = dayKey(Date.now());
  const [summary, days, accounts, feedback, visitors] = await Promise.all([
    ownerSummary(today),
    ownerDaily(365, today),
    ownerAccounts(today),
    ownerFeedback(),
    ownerVisitors(today),
  ]);
  return { summary, days, accounts, feedback, visitors, at: Date.now() };
}

function Dashboard() {
  const motion = useMotionAllowed();
  const [data, setData] = useState<Data | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<View>('overview');
  const [loads, setLoads] = useState(0);

  // Live: a load now, every LIVE_MS while the page is on the screen, and when it comes back or goes
  // online. One load at a time, and a failed load keeps the numbers of the last one.
  useEffect(() => {
    const run = { live: true, busy: false };
    let owner: boolean | null = null;
    const load = async () => {
      if (run.busy || document.visibilityState !== 'visible') return;
      run.busy = true;
      try {
        owner ??= await isOwner();
        const next = owner ? await loadAll() : null;
        if (!run.live) return;
        setAllowed(next !== null);
        if (next) setData(next);
        setMessage('');
      } catch (error: unknown) {
        if (run.live) setMessage(accountErrorText(error));
      } finally {
        run.busy = false;
      }
    };
    const show = () => {
      void load();
    };
    show();
    const tick = setInterval(show, LIVE_MS);
    document.addEventListener('visibilitychange', show);
    window.addEventListener('online', show);
    return () => {
      run.live = false;
      clearInterval(tick);
      document.removeEventListener('visibilitychange', show);
      window.removeEventListener('online', show);
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
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={motion ? 'user' : 'always'}>
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
            <div className="flex items-center gap-3">
              <p className="flex items-center gap-2 text-sm text-muted">
                <span className="relative flex size-2" aria-hidden="true">
                  {!message && (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                  )}
                  <span
                    className={`relative inline-flex size-2 rounded-full ${message ? 'bg-muted' : 'bg-accent'}`}
                  />
                </span>
                {message
                  ? `Not live: ${message} Vlo tries again in 30 seconds.`
                  : `Live. Updated at ${TIME.format(data.at)}.`}
              </p>
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
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={view}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {view === 'overview' && (
                <Overview summary={data.summary} days={data.days} visitors={data.visitors} />
              )}
              {view === 'people' && <People accounts={data.accounts} />}
              {view === 'feedback' && (
                <Inbox
                  items={data.feedback}
                  onChange={(feedback) => {
                    setData((d) => (d ? { ...d, feedback } : d));
                  }}
                />
              )}
            </m.div>
          </AnimatePresence>
          <p className="text-sm text-muted">
            A day is the local day of each device. A device is one browser on one device; a writer with a
            phone and a laptop counts as two devices and one account, and their words count once. Words are
            the net words that a writer added on the day. This page shows no project, title or word of
            writing.
          </p>
        </div>
      </MotionConfig>
    </LazyMotion>
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
