'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

const DRAWER_FULL = 260;
const DRAWER_MINI = 72;

const NAV_ITEMS = [
  {
    label: 'Overview',
    href: '/#overview',
    icon: DashboardOutlinedIcon,
  },
  {
    label: 'Campaign report',
    href: '/#campaign-report',
    icon: CampaignOutlinedIcon,
  },
  {
    label: 'Search terms',
    href: '/#search-terms',
    icon: SearchOutlinedIcon,
  },
  {
    label: 'N-gram analysis',
    href: '/#ngram-analysis',
    icon: AnalyticsOutlinedIcon,
  },
] as const;

export default function AdminShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mini, setMini] = useState(false);

  const drawerWidth = isMdUp && mini ? DRAWER_MINI : DRAWER_FULL;
  /** Mobile overlay drawer always shows full labels; mini mode is desktop-only. */
  const compact = isMdUp && mini;

  const drawer = (
    <>
      <Toolbar className="flex min-h-14 items-center justify-between gap-2 px-3">
        {!compact && (
          <Typography variant="subtitle1" className="truncate font-semibold tracking-tight">
            MuscleFit Ads
          </Typography>
        )}
        {isMdUp && (
          <Tooltip title={mini ? 'Expand sidebar' : 'Collapse sidebar'}>
            <IconButton
              size="small"
              onClick={() => setMini((m) => !m)}
              aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}
              className={compact ? 'mx-auto' : ''}
            >
              {mini ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
          </Tooltip>
        )}
      </Toolbar>
      <Divider />
      <List className="py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const button = (
            <ListItemButton
              component={Link}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg mx-2"
              sx={{
                justifyContent: compact ? 'center' : 'flex-start',
                px: compact ? 1.5 : 2,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: compact ? 0 : 40,
                  justifyContent: 'center',
                }}
              >
                <Icon fontSize="small" />
              </ListItemIcon>
              {!compact && <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />}
            </ListItemButton>
          );
          return (
            <li key={item.href}>
              {compact ? (
                <Tooltip title={item.label} placement="right">
                  {button}
                </Tooltip>
              ) : (
                button
              )}
            </li>
          );
        })}
      </List>
    </>
  );

  return (
    <Box className="flex min-h-screen">
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        className="border-b border-slate-200/80 bg-white/90 backdrop-blur md:border-slate-200"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar className="min-h-14 gap-2">
          <IconButton
            color="inherit"
            edge="start"
            aria-label="open navigation"
            onClick={() => setMobileOpen(true)}
            className="md:hidden"
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" className="truncate text-base font-semibold text-slate-900">
            Ads console
          </Typography>
        </Toolbar>
      </AppBar>

      <Box component="nav" aria-label="main navigation" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_FULL,
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: '1px solid',
              borderColor: 'divider',
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        className="flex min-h-screen flex-1 flex-col bg-slate-50"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        <Box className="flex flex-1 flex-col px-3 py-6 md:px-6">{children}</Box>
      </Box>
    </Box>
  );
}
