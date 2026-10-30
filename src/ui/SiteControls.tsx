import { SoundSwitch } from "@/audio/SoundSwitch";
import { CalmSwitch } from "@/motion/CalmSwitch";
import { cn } from "@/ui/lib/utils";
import { ThemeSwitch } from "@/ui/theme/ThemeSwitch";

export function SiteControls({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-0.5 sm:gap-1", className)}>
      <ThemeSwitch className="gap-0 sm:gap-1" />
      <SoundSwitch className="hidden sm:inline-flex" />
      <CalmSwitch />
    </div>
  );
}
