import { BookOpen, Menu, PanelLeftClose } from "lucide-react";
import type { AppShellProps } from "../ui/app-shell";
import "./desktop.css";

export function DesktopAppShell({ sidebarOpen, onCloseSidebar, onOpenSidebar, navigationItems, footerItem, sidebarStatus, message, children }: AppShellProps) {
  return (
    <div className={`bookreader-desktop app-shell ${sidebarOpen ? "sidebar-is-open" : "sidebar-is-closed"}`} data-ui-mode="desktop">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="关闭导航" onClick={onCloseSidebar} />}
      <aside className="library-sidebar">
        <div className="sidebar-heading">
          <BookOpen size={20} />
          {sidebarOpen && <span>BookReader</span>}
          <button className="icon-button sidebar-collapse" aria-label="收起侧边栏" onClick={onCloseSidebar}><PanelLeftClose size={18} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="书库导航">
          {navigationItems.map((item) => <button key={item.label} className={item.active ? "active" : ""} onClick={item.onSelect}>{item.icon}<span>{item.label}</span></button>)}
        </nav>
        <div className="sidebar-footer">
          <button className={footerItem.active ? "active" : ""} onClick={footerItem.onSelect}>{footerItem.icon}<span>{footerItem.label}</span></button>
          {sidebarStatus}
        </div>
      </aside>
      <main className="main-view">
        {!sidebarOpen && <button className="icon-button sidebar-open-button" aria-label="展开侧边栏" onClick={onOpenSidebar}><Menu size={20} /></button>}
        {message}
        {children}
      </main>
    </div>
  );
}
