import {
  BarChart3,
  BriefcaseBusiness,
  ChevronsLeft,
  ClipboardCheck,
  FileText,
  Home,
  Landmark,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

const items = [
  { label: "Home", icon: Home, active: true },
  { label: "Clients", icon: Users },
  { label: "Portfolio", icon: BriefcaseBusiness },
  { label: "Analytics", icon: BarChart3 },
  { label: "Tasks", icon: ClipboardCheck },
  { label: "Compliance", icon: ShieldCheck },
  { label: "Reports", icon: FileText },
  { label: "Admin", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="workbench-sidebar" aria-label="Workspace navigation">
      <div className="sidebar-mark" aria-label="Advisory Dashboard">
        <Landmark size={28} strokeWidth={1.8} />
      </div>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              className={`sidebar-item${item.active ? " is-active" : ""}`}
              aria-current={item.active ? "page" : undefined}
              aria-disabled={item.active ? undefined : "true"}
              onClick={(event) => event.preventDefault()}
            >
              <Icon size={22} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        className="sidebar-collapse"
        aria-disabled="true"
        onClick={(event) => event.preventDefault()}
      >
        <ChevronsLeft size={24} />
        <span>Collapse</span>
      </button>
    </aside>
  );
}
