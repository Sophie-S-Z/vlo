import { CalmSwitch } from "@/motion/CalmSwitch";
import { cn } from "@/ui/lib/utils";
import { ThemeSwitch } from "@/ui/theme/ThemeSwitch";

export function SiteControls({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <ThemeSwitch />
      <CalmSwitch />
    </div>
  );
}
