import { useState } from "react";
import {
  LayoutDashboard,
  UtensilsCrossed,
  FlaskConical,
  Droplets,
  Leaf,
  Link2,
  Import,
  Sparkles,
  Menu,
  X,
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
  { label: "Spicemixes", href: "/admin/spicemixes", icon: <FlaskConical size={16} /> },
  { label: "Sauces", href: "/admin/sauces", icon: <Droplets size={16} /> },
  { label: "Ingredients", href: "/admin/ingredients", icon: <Leaf size={16} /> },
  { label: "Pairings", href: "/admin/pairings", icon: <Link2 size={16} /> },
  { label: "Import from URL", href: "/admin/recipes/import", icon: <Import size={16} /> },
  { label: "AI compose", href: "/admin/import", icon: <Sparkles size={16} /> },
];

interface Props {
  children: React.ReactNode;
  currentPath?: string;
}

export default function AdminShell({ children, currentPath = "" }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <span className="text-lg font-bold tracking-tight">🌶 SpiceMixer</span>
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
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="text-sm font-medium text-muted-foreground">
            {currentPath.replace("/admin", "").replace(/^\//, "") || "Dashboard"}
          </span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}
