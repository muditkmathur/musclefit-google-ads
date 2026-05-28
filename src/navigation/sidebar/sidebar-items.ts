import {
  ChartScatter,
  Clock,
  FileText,
  History,
  Layers,
  type LucideIcon,
  Megaphone,
  Monitor,
  Search,
  SquarePen,
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
        title: "Landing pages",
        url: "/dashboard/landing-pages",
        icon: FileText,
      },
      {
        title: "Keyword ↔ Search terms",
        url: "/dashboard/keyword-search-terms",
        icon: Search,
      },
      {
        title: "Ad performance",
        url: "/dashboard/ad-performance",
        icon: SquarePen,
      },
      {
        title: "Auction insights",
        url: "/dashboard/auction-insights",
        icon: ChartScatter,
      },
      {
        title: "Change history",
        url: "/dashboard/history",
        icon: History,
      },
    ],
  },
];
