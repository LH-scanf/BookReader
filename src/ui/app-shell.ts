import type { ReactNode } from "react";

export type DesktopAppShellProps = {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  onOpenSidebar: () => void;
  navigationItems: ShellNavigationItem[];
  footerItem: ShellNavigationItem;
  sidebarStatus: ReactNode;
  message: ReactNode;
  children: ReactNode;
};

export type MobileAppShellProps = {
  navigationItems: ShellNavigationItem[];
  message: ReactNode;
  children: ReactNode;
};

export type ShellNavigationItem = {
  label: string;
  icon: ReactNode;
  active: boolean;
  onSelect: () => void;
};
