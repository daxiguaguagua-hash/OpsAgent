import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { ModeToggle } from "./mode-toggle";

export default function Header() {
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
        <Link className="flex min-w-0 items-center gap-2" to="/">
          <span className="flex size-7 shrink-0 items-center justify-center bg-foreground text-background">
            <Activity className="size-4" />
          </span>
          <span className="truncate text-sm font-semibold">OpsAgent</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Incident Lab（故障实验台）
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
            <span className="size-1.5 bg-emerald-500" />
            Local stack（本地环境）
          </span>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
