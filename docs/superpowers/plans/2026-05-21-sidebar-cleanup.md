# Sidebar Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all non-Google Ads navigation, routes, and dead code from the dashboard, leaving only the 7 Google Ads pages.

**Architecture:** Delete 12 directories and 3 sidebar components, then update 4 files. No new code — pure deletion and simplification. Verify with `pnpm typecheck` after each task.

**Tech Stack:** Next.js App Router, TypeScript, Biome

---

### Task 1: Strip sidebar navigation to Google Ads only

**Files:**
- Modify: `src/navigation/sidebar/sidebar-items.ts`

- [ ] **Step 1: Replace the full sidebarItems export**

Open `src/navigation/sidebar/sidebar-items.ts` and replace the entire file content with:

```typescript
import {
  Clock,
  Fingerprint,
  History,
  Layers,
  type LucideIcon,
  Megaphone,
  Monitor,
  Star,
  TextSearch,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Google Ads",
    items: [
      {
        title: "Campaigns",
        url: "/dashboard/campaigns",
        icon: Megaphone,
      },
      {
        title: "Keyword analysis",
        url: "/dashboard/keyword-analysis",
        icon: TextSearch,
      },
      {
        title: "Ad groups",
        url: "/dashboard/ad-groups",
        icon: Layers,
      },
      {
        title: "Schedule",
        url: "/dashboard/schedule",
        icon: Clock,
      },
      {
        title: "Devices",
        url: "/dashboard/devices",
        icon: Monitor,
      },
      {
        title: "Quality Score",
        url: "/dashboard/quality-score",
        icon: Star,
      },
      {
        title: "Change history",
        url: "/dashboard/history",
        icon: History,
      },
    ],
  },
];
```

Note: `Fingerprint` is now unused — remove it from the import list (already done above).

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/navigation/sidebar/sidebar-items.ts
git commit -m "chore: remove Pages and Legacy groups from sidebar"
```

---

### Task 2: Simplify app-sidebar — remove footer, fix logo link

**Files:**
- Modify: `src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx`

- [ ] **Step 1: Replace the full file content**

```typescript
"use client";

import Link from "next/link";

import { Command } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { APP_CONFIG } from "@/config/app-config";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : props.variant;
  const collapsible = isSynced ? sidebarCollapsible : props.collapsible;

  return (
    <Sidebar {...props} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/dashboard/campaigns">
                <Command />
                <span className="font-semibold text-base">{APP_CONFIG.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/dashboard/_components/sidebar/app-sidebar.tsx"
git commit -m "chore: remove sidebar footer and fix logo link to campaigns"
```

---

### Task 3: Clean up dashboard layout — remove AccountSwitcher and GitHub link

**Files:**
- Modify: `src/app/(main)/dashboard/layout.tsx`

- [ ] **Step 1: Replace the full file content**

```typescript
import type { ReactNode } from "react";

import { cookies } from "next/headers";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SIDEBAR_COLLAPSIBLE_VALUES, SIDEBAR_VARIANT_VALUES } from "@/lib/preferences/layout";
import { cn } from "@/lib/utils";
import { getPreference } from "@/server/server-actions";

import { LayoutControls } from "./_components/sidebar/layout-controls";
import { SearchDialog } from "./_components/sidebar/search-dialog";
import { ThemeSwitcher } from "./_components/sidebar/theme-switcher";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [variant, collapsible] = await Promise.all([
    getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
    getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
  ]);

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 68)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant={variant} collapsible={collapsible} />
      <SidebarInset
        className={cn(
          "[html[data-content-layout=centered]_&>*]:mx-auto",
          "[html[data-content-layout=centered]_&>*]:w-full",
          "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
          "peer-data-[variant=inset]:border",
        )}
      >
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
          )}
        >
          <div className="flex w-full items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
              />
              <SearchDialog />
            </div>
            <div className="flex items-center gap-2">
              <LayoutControls />
              <ThemeSwitcher />
            </div>
          </div>
        </header>
        <div className="h-full p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/dashboard/layout.tsx"
git commit -m "chore: remove AccountSwitcher and GitHub link from dashboard header"
```

---

### Task 4: Fix dashboard root page — redirect to campaigns

**Files:**
- Modify: `src/app/(main)/dashboard/page.tsx`

- [ ] **Step 1: Replace the file content**

```typescript
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard/campaigns");
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(main)/dashboard/page.tsx"
git commit -m "chore: redirect dashboard root to campaigns"
```

---

### Task 5: Delete stub dashboard pages and auth routes

**Files:**
- Delete: `src/app/(main)/dashboard/analytics/` (entire directory)
- Delete: `src/app/(main)/dashboard/crm/` (entire directory)
- Delete: `src/app/(main)/dashboard/default/` (entire directory)
- Delete: `src/app/(main)/dashboard/finance/` (entire directory)
- Delete: `src/app/(main)/dashboard/productivity/` (entire directory)
- Delete: `src/app/(main)/dashboard/coming-soon/` (entire directory)
- Delete: `src/app/(main)/dashboard/(legacy)/` (entire directory)
- Delete: `src/app/(main)/auth/` (entire directory)

- [ ] **Step 1: Delete all stub routes**

```bash
rm -rf "src/app/(main)/dashboard/analytics" \
       "src/app/(main)/dashboard/crm" \
       "src/app/(main)/dashboard/default" \
       "src/app/(main)/dashboard/finance" \
       "src/app/(main)/dashboard/productivity" \
       "src/app/(main)/dashboard/coming-soon" \
       "src/app/(main)/dashboard/(legacy)" \
       "src/app/(main)/auth"
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors (none of these pages were imported anywhere — they were only reachable as routes).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete stub dashboard pages and auth routes"
```

---

### Task 6: Delete unused sidebar components and users data file

**Files:**
- Delete: `src/app/(main)/dashboard/_components/sidebar/account-switcher.tsx`
- Delete: `src/app/(main)/dashboard/_components/sidebar/nav-user.tsx`
- Delete: `src/app/(main)/dashboard/_components/sidebar/sidebar-support-card.tsx`
- Delete: `src/data/users.ts`

- [ ] **Step 1: Delete the files**

```bash
rm "src/app/(main)/dashboard/_components/sidebar/account-switcher.tsx" \
   "src/app/(main)/dashboard/_components/sidebar/nav-user.tsx" \
   "src/app/(main)/dashboard/_components/sidebar/sidebar-support-card.tsx" \
   "src/data/users.ts"
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors (these files were already removed from all imports in Tasks 2 and 3).

- [ ] **Step 3: Final lint check**

```bash
pnpm check
```

Expected: no errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete unused sidebar components and users stub data"
```
