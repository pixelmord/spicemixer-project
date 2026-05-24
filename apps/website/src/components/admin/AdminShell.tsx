import { useState } from "react";
import {
  LayoutDashboard,
  UtensilsCrossed,
  FlaskConical,
  Leaf,
  Link2,
  Import,
  Sparkles,
  Clock,
  BarChart2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { Toaster } from "@/components/ui/sonner.tsx";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: <LayoutDashboard size={16} /> },
  { label: "All Content", href: "/admin/content", icon: <FlaskConical size={16} /> },
  { label: "Recipes", href: "/admin/recipes", icon: <UtensilsCrossed size={16} /> },
  { label: "Mixtures", href: "/admin/mixtures", icon: <FlaskConical size={16} /> },
  { label: "Ingredients", href: "/admin/ingredients", icon: <Leaf size={16} /> },
  { label: "Pairings", href: "/admin/pairings", icon: <Link2 size={16} /> },
  { label: "Needs Review", href: "/admin/needs-review", icon: <Clock size={16} /> },
  { label: "Readiness", href: "/admin/readiness", icon: <BarChart2 size={16} /> },
  { label: "Import from URL", href: "/admin/recipes/import", icon: <Import size={16} /> },
  { label: "AI compose", href: "/admin/import", icon: <Sparkles size={16} /> },
];

interface Props {
  children: React.ReactNode;
  currentPath?: string;
}

export default function AdminShell({ children, currentPath = "" }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Build breadcrumbs starting with Admin
  const breadcrumbs = [{ label: "Admin", href: "/admin" }];
  const segments = currentPath
    .replace(/^\/admin/, "")
    .split("/")
    .filter(Boolean);

  const isDashboard = segments.length === 0;
  const isList = segments.length === 1 && segments[0] !== "import";
  const isMaxWidePage = isDashboard || isList;

  let currentLink = "/admin";
  for (const segment of segments) {
    currentLink += `/${segment}`;
    const label = segment.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    breadcrumbs.push({ label, href: currentLink });
  }

  return (
    <div
      className="flex h-screen bg-background text-foreground overflow-hidden"
      style={{ "--sidebar-w": sidebarOpen ? "224px" : "0px" } as React.CSSProperties}
    >
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-200",
          sidebarOpen ? "w-56" : "w-0 overflow-hidden",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 px-4 border-b border-border">
          <a
            href="/"
            className="text-lg font-bold tracking-tight hover:text-muted-foreground transition-colors"
          >
            🌶 SpiceMixer
          </a>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors shrink-0"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-3 mb-1 px-4">
          Admin
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {(() => {
            const activeItem = NAV.reduce<NavItem | null>((best, nav) => {
              const matches = currentPath === nav.href || currentPath.startsWith(nav.href + "/");
              if (!matches) return best;
              return !best || nav.href.length > best.href.length ? nav : best;
            }, null);
            return NAV.map((item) => {
              const active = item === activeItem;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {item.icon}
                  {item.label}
                </a>
              );
            });
          })()}
        </nav>
        <div className="px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">Local admin · FS mode</span>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-3 px-4 border-b border-border bg-card shrink-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors shrink-0"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}

          <nav aria-label="Breadcrumb" className="flex items-center text-sm font-medium">
            <ol className="flex items-center gap-1.5 text-muted-foreground">
              {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <li key={item.href} className="flex items-center gap-1.5">
                    {index > 0 && <span className="text-muted-foreground/30 select-none">/</span>}
                    {isLast ? (
                      <span className="text-foreground font-semibold" aria-current="page">
                        {item.label}
                      </span>
                    ) : (
                      <a href={item.href} className="hover:text-foreground transition-colors">
                        {item.label}
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          <div className={cn("mx-auto w-full", isMaxWidePage && "max-w-7xl")}>{children}</div>
        </main>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}
