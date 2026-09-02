import type { MobileAppShellProps } from "../ui/app-shell";
import "./mobile.css";

export function MobileAppShell({ navigationItems, message, children }: MobileAppShellProps) {
  return (
    <div className="bookreader-mobile app-shell" data-ui-mode="mobile">
      <main className="main-view">
        {message}
        {children}
      </main>
      <nav className="mobile-bottom-nav" aria-label="主导航">
        {navigationItems.map((item) => <button key={item.label} className={item.active ? "active" : ""} onClick={item.onSelect}>{item.icon}<span>{item.label}</span></button>)}
      </nav>
    </div>
  );
}
