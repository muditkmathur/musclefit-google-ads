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
  {
    id: 2,
    label: "Pages",
    items: [
      {
        title: "Authentication",
        url: "/auth",
        icon: Fingerprint,
        subItems: [
          { title: "Login v1", url: "/auth/v1/login", newTab: true },
          { title: "Login v2", url: "/auth/v2/login", newTab: true },
          { title: "Register v1", url: "/auth/v1/register", newTab: true },
          { title: "Register v2", url: "/auth/v2/register", newTab: true },
        ],
      },
    ],
  },
  {
    id: 3,
    label: "Legacy",
    items: [
      {
        title: "Dashboards",
        url: "/dashboard/default-v1",
        subItems: [
          { title: "Default V1", url: "/dashboard/default-v1" },
          { title: "CRM V1", url: "/dashboard/crm-v1" },
          { title: "Finance V1", url: "/dashboard/finance-v1" },
          { title: "Analytics V1", url: "/dashboard/analytics-v1" },
        ],
      },
    ],
  },
];
