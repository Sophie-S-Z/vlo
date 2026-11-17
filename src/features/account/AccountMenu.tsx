import { ChevronDown, RefreshCw, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { Avatar } from './Avatar';
import { greetingName, type Profile } from './profile';

/**
 * The signed-in writer in the header (ADR 0011): the photo and the first name open a menu with the profile
 * and the account. A phone shows the photo only.
 */
export function AccountMenu({ email, profile }: { email: string; profile: Profile | null }) {
  const name = profile ? greetingName(profile) : '';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account: ${name || email}`}
        className="ml-1 inline-flex min-h-11 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm text-muted transition-colors hover:bg-surface hover:text-text data-[state=open]:bg-surface data-[state=open]:text-text sm:pr-3"
      >
        <Avatar
          profile={{ name: profile?.name ?? email, photo: profile?.photo ?? null }}
          className="size-8"
        />
        <span className="hidden max-w-32 truncate sm:inline">{name || 'Account'}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.5} className="hidden size-3.5 sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex items-center gap-3 px-3 py-3">
          <Avatar
            profile={{ name: profile?.name ?? email, photo: profile?.photo ?? null }}
            className="size-11"
          />
          <div className="min-w-0">
            {profile && (
              <p className="truncate font-display text-lg leading-tight font-semibold">{profile.name}</p>
            )}
            <p className="truncate text-sm text-muted">{email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile" className="text-text no-underline">
            <UserRound aria-hidden="true" strokeWidth={1.5} className="size-4 text-muted" />
            Your profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/account" className="text-text no-underline">
            <RefreshCw aria-hidden="true" strokeWidth={1.5} className="size-4 text-muted" />
            Account and sync
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
