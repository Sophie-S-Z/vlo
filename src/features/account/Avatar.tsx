import { cn } from '@/ui/cn';
import { initials, type Profile } from './profile';

/**
 * The writer's photo in a circle, or the initials of the name on a tint of the accent. The SVG scales the
 * letters with the circle, so one component serves each size. The name always shows next to it, so the
 * picture is decoration for a screen reader.
 */
export function Avatar({
  profile,
  className,
}: {
  profile: Pick<Profile, 'name' | 'photo'> | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--accent)_24%,var(--surface))] text-accent-text ring-1 ring-rule',
        className,
      )}
    >
      {profile?.photo ? (
        <img src={profile.photo} alt="" className="size-full object-cover" />
      ) : (
        <svg viewBox="0 0 40 40" className="size-full">
          <text
            x="20"
            y="21"
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
            className="font-display text-[15px] font-semibold"
          >
            {initials(profile?.name ?? '')}
          </text>
        </svg>
      )}
    </span>
  );
}
