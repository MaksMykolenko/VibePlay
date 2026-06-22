import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, NavLink, useNavigate, useLocation, matchPath } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { toast } from '../components/toastEvents';
import { FeedbackModal } from '../components/FeedbackModal';
import {
  Menu,
  X,
  Search,
  Plus,
  Bell,
  User as UserIcon,
  Settings,
  LogOut,
  HelpCircle,
  Home,
  Compass,
  Gamepad2,
  Layers,
  FolderHeart,
  History,
  ThumbsUp,
  LayoutDashboard,
  BarChart2,
  PlusCircle,
  Shield,
  Eye,
  Users,
  AlertTriangle,
  Star,
  ChevronRight,
  Check,
  ChevronDown,
  Library as LibraryIcon,
  Sun,
  Moon,
  Monitor,
  Mail,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useVerificationResend } from '../hooks/useVerificationResend';
import { useI18n } from '../i18n/useI18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { trackEvent } from '../lib/analytics';
import { withReturnTo } from '../lib/returnTo';

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');

    const handleMediaQueryChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaQueryChange);
    } else {
      mediaQuery.addListener(handleMediaQueryChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaQueryChange);
      } else {
        mediaQuery.removeListener(handleMediaQueryChange);
      }
    };
  }, []);

  return isMobile;
};

const SidebarScrollContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollUp(scrollTop > 1);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 3);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    checkScroll();

    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);

    const observer = new MutationObserver(checkScroll);
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="sidebar-scroll-wrapper">
      <div className={`sidebar-scroll-fade top ${canScrollUp ? 'visible' : ''}`} />
      <div ref={containerRef} className="sidebar-scrollable">
        {children}
      </div>
      <div className={`sidebar-scroll-fade bottom ${canScrollDown ? 'visible' : ''}`} />
    </div>
  );
};

export const AppShell: React.FC = () => {
  const { currentUser, logout, becomeCreator, switchDemoRole, demoRolesEnabled, isDemo } =
    useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const {
    cooldown: verificationCooldown,
    isSending: isResending,
    resend,
  } = useVerificationResend();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(
    currentUser?.id,
  );
  const navigate = useNavigate();
  const location = useLocation();

  // Sidebar collapse state (saved in LocalStorage, default false/expanded)
  const [isSidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('vibeplay.sidebar.collapsed');
    return saved === 'true';
  });

  // Mobile Drawer state
  const [mobileDrawerPath, setMobileDrawerPath] = useState<string | null>(null);

  // Determine if viewport is mobile (< 768px)
  const isMobile = useIsMobile();
  const isMobileDrawerOpen = isMobile && mobileDrawerPath === location.pathname;
  const setMobileDrawerOpen = React.useCallback(
    (next: React.SetStateAction<boolean>) => {
      setMobileDrawerPath((openPath) => {
        const currentlyOpen = isMobile && openPath === location.pathname;
        const shouldOpen = typeof next === 'function' ? next(currentlyOpen) : next;
        return shouldOpen ? location.pathname : null;
      });
    },
    [isMobile, location.pathname],
  );

  // Expandable submenu state for Library (saved in LocalStorage)
  const [isLibraryExpanded, setIsLibraryExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem('vibeplay.library.expanded');
    return saved === 'true';
  });

  // Dropdown states
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showSidebarProfileDropdown, setShowSidebarProfileDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showDemoDropdown, setShowDemoDropdown] = useState(false);

  // Ref elements for click outside dropdowns
  const profileRef = useRef<HTMLDivElement>(null);
  const sidebarProfileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Global search input state
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-collapse sidebar on tablet widths (769px to 1024px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && window.innerWidth <= 1024) {
        setSidebarCollapsed(true);
      } else if (window.innerWidth > 1024) {
        // Restore from localStorage
        const saved = localStorage.getItem('vibeplay.sidebar.collapsed');
        setSidebarCollapsed(saved === 'true');
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // trigger initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Click outside dropdowns listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (sidebarProfileRef.current && !sidebarProfileRef.current.contains(event.target as Node)) {
        setShowSidebarProfileDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
      if (demoRef.current && !demoRef.current.contains(event.target as Node)) {
        setShowDemoDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape key handler for drawer/modal/dropdowns
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileDrawerOpen(false);
        setShowProfileDropdown(false);
        setShowSidebarProfileDropdown(false);
        setShowNotifDropdown(false);
        setShowDemoDropdown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setMobileDrawerOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobile && isMobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, isMobileDrawerOpen]);

  // Focus return to hamburger button when mobile drawer is closed
  const prevMobileDrawerOpen = useRef(isMobileDrawerOpen);
  useEffect(() => {
    if (prevMobileDrawerOpen.current && !isMobileDrawerOpen && isMobile) {
      hamburgerRef.current?.focus();
    }
    prevMobileDrawerOpen.current = isMobileDrawerOpen;
  }, [isMobileDrawerOpen, isMobile]);

  // Focus trap for mobile drawer
  useEffect(() => {
    if (!isMobile || !isMobileDrawerOpen) return;

    const drawerElement = drawerRef.current;
    if (!drawerElement) return;

    const getFocusableElements = () => {
      return Array.from(
        drawerElement.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0);
    };

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !focusable.includes(active as HTMLElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !focusable.includes(active as HTMLElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // Auto focus first element in mobile drawer on open
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    window.addEventListener('keydown', handleFocusTrap);
    return () => {
      window.removeEventListener('keydown', handleFocusTrap);
    };
  }, [isMobile, isMobileDrawerOpen]);

  // Navigation toggling logic (desktop collapse / mobile drawer)
  const handleNavigationToggle = () => {
    if (isMobile) {
      setMobileDrawerOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => {
        const nextState = !prev;
        localStorage.setItem('vibeplay.sidebar.collapsed', String(nextState));
        return nextState;
      });
    }
  };

  // Search submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const handlePublishClick = () => {
    if (!currentUser) {
      toast.info(t('app.publishLogin'));
      navigate('/login');
    } else if (currentUser.role === 'player') {
      toast.info(t('app.creatorRequired'));
    } else if (currentUser.role === 'creator' && !currentUser.emailVerified) {
      toast.warning(t('verification.beforeCreator'));
      navigate('/creator');
    } else {
      navigate('/creator/publish');
    }
  };

  const handleBecomeCreatorClick = () => {
    if (!currentUser) {
      toast.info(t('app.loginFirst'));
      navigate('/login');
      return;
    }
    if (currentUser.role === 'player' && !currentUser.emailVerified) {
      toast.warning(t('verification.beforeCreator'));
      return;
    }
    const notice = becomeCreator();
    if (notice) {
      // Real MVP: roles are server-controlled (invite-based creator access).
      toast.info(notice);
      return;
    }
    toast.success(t('app.creatorSuccess'));
    navigate('/creator');
  };

  const handleDemoSwitch = (role: 'player' | 'creator' | 'admin') => {
    switchDemoRole(role);
    toast.success(t('app.demoSwitched', { role }));
    setShowDemoDropdown(false);
    if (role === 'creator') navigate('/creator');
    else if (role === 'admin') navigate('/admin');
    else navigate('/');
  };

  // Path authorization guards
  const isCreatorPath = location.pathname.startsWith('/creator');
  const isAdminPath = location.pathname.startsWith('/admin');

  const hasCreatorAccess =
    currentUser &&
    (currentUser.role === 'creator' ||
      currentUser.role === 'admin' ||
      currentUser.role === 'owner');
  const hasAdminAccess =
    currentUser && (currentUser.role === 'admin' || currentUser.role === 'owner');
  const isCreatorEmailBlocked =
    isCreatorPath && currentUser?.role === 'creator' && !currentUser.emailVerified;

  interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ size: number; className?: string }>;
    path: string;
    matchPaths?: string[];
    children?: NavItem[];
  }

  interface NavSection {
    id: string;
    label?: string;
    items: NavItem[];
  }

  // Centralized route matching checker using react-router matchPath
  const isNavigationItemActive = (item: NavItem) => {
    const currentPath = location.pathname;
    const patterns = item.matchPaths ?? [item.path];

    return patterns.some((pattern) => {
      if (pattern.startsWith('#')) return false;

      const match = matchPath(
        {
          path: pattern,
          end: true, // Always match exactly to prevent sibling/overlap highlight issues
        },
        currentPath,
      );
      return !!match;
    });
  };

  // Navigation sections configuration
  const navSections: NavSection[] = [
    {
      id: 'primary',
      items: [
        { id: 'home', label: t('nav.home'), icon: Home, path: '/', matchPaths: ['/', '/home'] },
        {
          id: 'discover',
          label: t('nav.discover'),
          icon: Compass,
          path: '/discover',
          matchPaths: ['/discover'],
        },
        {
          id: 'browse',
          label: t('nav.browse'),
          icon: Gamepad2,
          path: '/games',
          matchPaths: ['/games', '/browse'],
        },
        {
          id: 'categories',
          label: t('nav.categories'),
          icon: Layers,
          path: '/categories',
          matchPaths: ['/categories'],
        },
      ],
    },
    {
      id: 'library',
      label: t('nav.library'),
      items: [
        {
          id: 'library',
          label: t('nav.myLibrary'),
          icon: LibraryIcon,
          path: '/library',
          matchPaths: ['/library', '/library/favorites', '/library/liked'],
          children: [
            {
              id: 'favorites',
              label: t('nav.favorites'),
              icon: Star,
              path: '/library/favorites',
              matchPaths: ['/library/favorites'],
            },
            {
              id: 'liked',
              label: t('nav.likedGames'),
              icon: ThumbsUp,
              path: '/library/liked',
              matchPaths: ['/library/liked'],
            },
          ],
        },
        {
          id: 'recent',
          label: t('nav.recentlyPlayed'),
          icon: History,
          path: '/recently-played',
          matchPaths: ['/recent', '/recently-played'],
        },
      ],
    },
    {
      id: 'creator',
      label: t('nav.creator'),
      items: [
        {
          id: 'creator-overview',
          label: t('nav.overview'),
          icon: LayoutDashboard,
          path: '/creator',
          matchPaths: ['/creator'],
        },
        {
          id: 'creator-games',
          label: t('nav.myGames'),
          icon: Gamepad2,
          path: '/creator/my-games',
          matchPaths: [
            '/creator/my-games',
            '/creator/games',
            '/creator/games/:id',
            '/creator/games/:id/edit',
          ],
        },
        {
          id: 'creator-publish',
          label: t('nav.publishGame'),
          icon: PlusCircle,
          path: '/creator/publish',
          matchPaths: ['/creator/publish'],
        },
        {
          id: 'creator-analytics',
          label: t('nav.analytics'),
          icon: BarChart2,
          path: '/creator/analytics',
          matchPaths: ['/creator/analytics'],
        },
      ],
    },
    {
      id: 'admin',
      label: t('nav.admin'),
      items: [
        {
          id: 'admin-overview',
          label: t('nav.overview'),
          icon: Shield,
          path: '/admin',
          matchPaths: ['/admin'],
        },
        {
          id: 'admin-moderation',
          label: t('nav.moderation'),
          icon: Eye,
          path: '/admin/moderation',
          matchPaths: ['/admin/moderation', '/admin/moderation/:id'],
        },
        {
          id: 'admin-users',
          label: t('nav.users'),
          icon: Users,
          path: '/admin/users',
          matchPaths: ['/admin/users'],
        },
        {
          id: 'admin-reports',
          label: t('nav.reports'),
          icon: AlertTriangle,
          path: '/admin/reports',
          matchPaths: ['/admin/reports'],
        },
      ],
    },
  ];

  // Filtering sections based on role access
  const filteredSections = navSections.filter((section) => {
    if (section.id === 'admin') {
      return hasAdminAccess;
    }
    if (section.id === 'creator') {
      return !!currentUser;
    }
    return true;
  });

  const renderNavItems = (items: NavItem[], isMobileOrDrawer = false) => {
    return items.map((item) => {
      const Icon = item.icon;
      const isActive = isNavigationItemActive(item);
      const isMyLibrary = item.id === 'library';

      // Expandable Library Menu item
      if (isMyLibrary && item.children) {
        return (
          <div key={item.path} style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              onClick={() => {
                if (!isSidebarCollapsed || isMobileOrDrawer) {
                  setIsLibraryExpanded(!isLibraryExpanded);
                }
                navigate('/library');
              }}
              className={`sidebar-link ${isActive ? 'sidebar-item--active' : ''}`}
              data-tooltip={isSidebarCollapsed && !isMobileOrDrawer ? item.label : undefined}
              role="button"
              aria-expanded={isLibraryExpanded}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/library');
                  if (!isSidebarCollapsed || isMobileOrDrawer)
                    setIsLibraryExpanded(!isLibraryExpanded);
                }
              }}
            >
              <Icon size={20} />
              {(!isSidebarCollapsed || isMobileOrDrawer) && (
                <>
                  <span style={{ marginLeft: '10px', flex: 1, fontWeight: isActive ? 600 : 500 }}>
                    {item.label}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setIsLibraryExpanded(!isLibraryExpanded);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    aria-label={t('sidebar.toggleLibrary')}
                  >
                    {isLibraryExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </>
              )}
            </div>

            {/* Submenu items */}
            {isLibraryExpanded && (!isSidebarCollapsed || isMobileOrDrawer) && (
              <div
                className="sidebar-submenu"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  paddingLeft: '16px',
                }}
              >
                {item.children.map((child) => {
                  const ChildIcon = child.icon;
                  const isChildActive = isNavigationItemActive(child);
                  return (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={`sidebar-link sidebar-submenu-item ${isChildActive ? 'sidebar-item--active' : ''}`}
                      style={{ height: '36px', minHeight: '36px', fontSize: '13px' }}
                    >
                      <ChildIcon size={16} />
                      <span>{child.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      }

      // Standard Nav Link
      return (
        <NavLink
          key={item.path}
          to={item.path}
          className={`sidebar-link ${isActive ? 'sidebar-item--active' : ''}`}
          data-tooltip={isSidebarCollapsed && !isMobileOrDrawer ? item.label : undefined}
          aria-current={isActive ? 'page' : undefined}
        >
          <Icon size={20} />
          {(!isSidebarCollapsed || isMobileOrDrawer) && (
            <span style={{ marginLeft: '10px', fontWeight: isActive ? 600 : 500 }}>
              {item.label}
            </span>
          )}
        </NavLink>
      );
    });
  };

  const renderSidebarBottom = (isMobileOrDrawer = false) => {
    const isNotificationsActive = isNavigationItemActive({
      id: 'notifications',
      label: t('nav.notifications'),
      path: '/notifications',
      matchPaths: ['/notifications'],
    } as NavItem);
    const isSettingsActive = isNavigationItemActive({
      id: 'settings',
      label: t('nav.settings'),
      path: '/settings',
      matchPaths: ['/settings', '/settings/billing'],
    } as NavItem);

    return (
      <div className="sidebar-bottom">
        {/* Quick Role Switch in Mobile Drawer — demo builds only; the
            APP_MODE check is statically folded so this block (and its strings)
            never reaches the real bundle. */}
        {import.meta.env.APP_MODE === 'demo' &&
          demoRolesEnabled &&
          isMobileOrDrawer &&
          currentUser && (
            <div
              style={{
                padding: '12px 14px',
                margin: '4px 8px 12px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '8px',
                }}
              >
                Quick Role Switch
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                <button
                  onClick={() => {
                    handleDemoSwitch('player');
                    setMobileDrawerOpen(false);
                  }}
                  style={{
                    padding: '6px 4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color:
                      currentUser?.role === 'player'
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    backgroundColor:
                      currentUser?.role === 'player' ? 'var(--primary)' : 'transparent',
                    border:
                      '1px solid ' +
                      (currentUser?.role === 'player' ? 'var(--primary)' : 'var(--border-color)'),
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Player
                </button>
                <button
                  onClick={() => {
                    handleDemoSwitch('creator');
                    setMobileDrawerOpen(false);
                  }}
                  style={{
                    padding: '6px 4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color:
                      currentUser?.role === 'creator'
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    backgroundColor:
                      currentUser?.role === 'creator' ? 'var(--primary)' : 'transparent',
                    border:
                      '1px solid ' +
                      (currentUser?.role === 'creator' ? 'var(--primary)' : 'var(--border-color)'),
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Creator
                </button>
                <button
                  onClick={() => {
                    handleDemoSwitch('admin');
                    setMobileDrawerOpen(false);
                  }}
                  style={{
                    padding: '6px 4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color:
                      currentUser?.role === 'admin'
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    backgroundColor:
                      currentUser?.role === 'admin' ? 'var(--primary)' : 'transparent',
                    border:
                      '1px solid ' +
                      (currentUser?.role === 'admin' ? 'var(--primary)' : 'var(--border-color)'),
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Admin
                </button>
              </div>
            </div>
          )}

        {/* Beta feedback (spec §38) */}
        {currentUser && (
          <FeedbackModal asSidebarItem collapsed={isSidebarCollapsed && !isMobileOrDrawer} />
        )}

        {/* Notifications */}
        <NavLink
          to="/notifications"
          className={`sidebar-link ${isNotificationsActive ? 'sidebar-item--active' : ''}`}
          data-tooltip={
            isSidebarCollapsed && !isMobileOrDrawer ? t('nav.notifications') : undefined
          }
          aria-current={isNotificationsActive ? 'page' : undefined}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Bell size={20} />
            {isSidebarCollapsed && !isMobileOrDrawer && unreadCount > 0 && (
              <span
                className="collapsed-badge-dot"
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--danger)',
                }}
              />
            )}
          </div>
          {(!isSidebarCollapsed || isMobileOrDrawer) && (
            <div
              style={{ display: 'flex', alignItems: 'center', width: '100%', marginLeft: '10px' }}
            >
              <span style={{ flex: 1, fontWeight: isNotificationsActive ? 600 : 500 }}>
                {t('nav.notifications')}
              </span>
              {unreadCount > 0 && (
                <span
                  className="sidebar-badge"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 4px',
                    borderRadius: '9px',
                    backgroundColor: 'var(--danger)',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 700,
                    marginLeft: 'auto',
                  }}
                  aria-label={`${unreadCount} unread notifications`}
                >
                  {unreadCount}
                </span>
              )}
            </div>
          )}
        </NavLink>

        {/* Settings */}
        <NavLink
          to="/settings"
          className={`sidebar-link ${isSettingsActive ? 'sidebar-item--active' : ''}`}
          data-tooltip={isSidebarCollapsed && !isMobileOrDrawer ? t('nav.settings') : undefined}
          aria-current={isSettingsActive ? 'page' : undefined}
        >
          <Settings size={20} />
          {(!isSidebarCollapsed || isMobileOrDrawer) && (
            <span style={{ marginLeft: '10px', fontWeight: isSettingsActive ? 600 : 500 }}>
              {t('nav.settings')}
            </span>
          )}
        </NavLink>

        {/* Help Center */}
        <a
          href="#help"
          className="sidebar-link"
          data-tooltip={isSidebarCollapsed && !isMobileOrDrawer ? t('nav.help') : undefined}
        >
          <HelpCircle size={20} />
          {(!isSidebarCollapsed || isMobileOrDrawer) && (
            <span style={{ marginLeft: '10px' }}>{t('nav.help')}</span>
          )}
        </a>

        {/* Language Switcher in Sidebar (Visible when expanded or in mobile drawer) */}
        {(!isSidebarCollapsed || isMobileOrDrawer) && (
          <>
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--border-subtle)',
                margin: '8px 12px',
              }}
            />
            <div
              style={{ padding: '6px 14px', margin: '4px 8px 8px' }}
              className="sidebar-language-control"
            >
              <LanguageSwitcher />
            </div>
          </>
        )}

        {/* Profile Block */}
        {currentUser && (
          <>
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--border-subtle)',
                margin: '4px 12px 8px',
              }}
            />
            <div
              ref={sidebarProfileRef}
              style={{ position: 'relative', padding: '6px 8px', margin: '2px 8px' }}
            >
              {/* Dropdown Menu (Flyout) */}
              {showSidebarProfileDropdown && (
                <div
                  className="sidebar-profile-dropdown"
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '0px',
                    width: '200px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '6px',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 'var(--z-dropdown)',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ padding: '6px 10px' }}>
                    <div
                      style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    >
                      {currentUser.displayName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      @{currentUser.username}
                    </div>
                    <span
                      className={`badge ${currentUser.role === 'owner' ? 'badge-danger' : currentUser.role === 'admin' ? 'badge-danger' : currentUser.role === 'creator' ? 'badge-success' : 'badge-primary'}`}
                      style={{ marginTop: '6px', fontSize: '0.65rem' }}
                    >
                      {currentUser.role}
                    </span>
                  </div>
                  <hr style={hrStyle} />
                  <Link
                    to={`/profile/${currentUser.username}`}
                    onClick={() => setShowSidebarProfileDropdown(false)}
                    style={profileDropdownItemStyle}
                  >
                    <UserIcon size={14} />
                    <span>{t('profile.myProfile')}</span>
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setShowSidebarProfileDropdown(false)}
                    style={profileDropdownItemStyle}
                  >
                    <Settings size={14} />
                    <span>{t('nav.settings')}</span>
                  </Link>
                  {hasCreatorAccess && (
                    <Link
                      to="/creator"
                      onClick={() => setShowSidebarProfileDropdown(false)}
                      style={profileDropdownItemStyle}
                    >
                      <LayoutDashboard size={14} />
                      <span>{t('profile.creatorStudio')}</span>
                    </Link>
                  )}
                  {hasAdminAccess && (
                    <Link
                      to="/admin"
                      onClick={() => setShowSidebarProfileDropdown(false)}
                      style={profileDropdownItemStyle}
                    >
                      <Shield size={14} />
                      <span>{t('profile.adminControl')}</span>
                    </Link>
                  )}
                  <hr style={hrStyle} />
                  <div style={{ padding: '4px 8px 6px' }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        marginBottom: '6px',
                      }}
                    >
                      {t('profile.appearance')}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '3px',
                        background: 'var(--surface-2)',
                        padding: '2px',
                        borderRadius: '6px',
                      }}
                    >
                      <button
                        onClick={() => setTheme('light')}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '5px 2px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          background: theme === 'light' ? 'var(--surface-1)' : 'transparent',
                          color: theme === 'light' ? 'var(--primary)' : 'var(--text-secondary)',
                          boxShadow: theme === 'light' ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <Sun size={11} />
                        <span>{t('profile.light')}</span>
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '5px 2px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          background: theme === 'dark' ? 'var(--surface-1)' : 'transparent',
                          color: theme === 'dark' ? 'var(--primary)' : 'var(--text-secondary)',
                          boxShadow: theme === 'dark' ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <Moon size={11} />
                        <span>{t('profile.dark')}</span>
                      </button>
                      <button
                        onClick={() => setTheme('system')}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '5px 2px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          background: theme === 'system' ? 'var(--surface-1)' : 'transparent',
                          color: theme === 'system' ? 'var(--primary)' : 'var(--text-secondary)',
                          boxShadow: theme === 'system' ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <Monitor size={11} />
                        <span>{t('profile.system')}</span>
                      </button>
                    </div>
                  </div>
                  <hr style={hrStyle} />
                  <div style={{ padding: '4px 8px 6px' }}>
                    <LanguageSwitcher />
                  </div>
                  <hr style={hrStyle} />
                  <button
                    onClick={() => {
                      logout();
                      toast.success(t('app.loggedOut'));
                      navigate('/');
                      setShowSidebarProfileDropdown(false);
                    }}
                    style={{
                      ...profileDropdownItemStyle,
                      width: '100%',
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--danger)',
                    }}
                  >
                    <LogOut size={14} />
                    <span>{t('profile.logout')}</span>
                  </button>
                </div>
              )}

              {/* Profile Trigger Button */}
              <button
                onClick={() => setShowSidebarProfileDropdown(!showSidebarProfileDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  background: showSidebarProfileDropdown
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: '10px',
                }}
                data-tooltip={
                  isSidebarCollapsed && !isMobileOrDrawer ? 'Profile Options' : undefined
                }
                aria-label="User Profile Options"
                aria-expanded={showSidebarProfileDropdown}
              >
                <img
                  src={currentUser.avatar}
                  alt={currentUser.displayName}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '1.5px solid var(--border-color)',
                    flexShrink: 0,
                  }}
                />
                {(!isSidebarCollapsed || isMobileOrDrawer) && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      flex: 1,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {currentUser.displayName}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {currentUser.role}
                    </span>
                  </div>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSidebarContent = (isMobileOrDrawer = false) => {
    return (
      <>
        <SidebarScrollContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {filteredSections.map((section) => {
              const isCreatorSection = section.id === 'creator';
              const isPlayer = currentUser && currentUser.role === 'player';

              return (
                <div key={section.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Section Title */}
                  {section.label && (!isSidebarCollapsed || isMobileOrDrawer) && (
                    <div className="sidebar-section-header">{section.label}</div>
                  )}

                  {/* If Creator Section and user is Player, render Become a Creator CTA */}
                  {isCreatorSection && isPlayer ? (
                    <div
                      style={{
                        padding: isSidebarCollapsed && !isMobileOrDrawer ? '4px' : '4px 8px',
                      }}
                    >
                      {!isSidebarCollapsed || isMobileOrDrawer ? (
                        <button
                          onClick={handleBecomeCreatorClick}
                          className="become-creator-sidebar-btn"
                          style={{ width: 'calc(100% - 16px)', margin: '4px 8px' }}
                        >
                          <PlusCircle size={16} />
                          <span>{t('home.becomeCreator')}</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleBecomeCreatorClick}
                          className="become-creator-sidebar-btn"
                          style={{
                            width: '40px',
                            height: '40px',
                            padding: 0,
                            borderRadius: '50%',
                            margin: '4px auto',
                          }}
                          data-tooltip="Become a Creator"
                          aria-label={t('home.becomeCreator')}
                        >
                          <PlusCircle size={20} />
                        </button>
                      )}
                    </div>
                  ) : (
                    renderNavItems(section.items, isMobileOrDrawer)
                  )}
                </div>
              );
            })}
          </div>
        </SidebarScrollContainer>
        {renderSidebarBottom(isMobileOrDrawer)}
      </>
    );
  };

  const toggleLabel = isMobile
    ? isMobileDrawerOpen
      ? t('common.close')
      : t('sidebar.expand')
    : isSidebarCollapsed
      ? t('sidebar.expand')
      : t('sidebar.collapse');

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Top Header */}
      <header className="top-header app-header">
        {/* Left header group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Hamburger Sidebar/Drawer Toggle */}
          <button
            ref={hamburgerRef}
            onClick={handleNavigationToggle}
            style={hamburgerBtnStyle}
            className="hamburger-toggle"
            aria-label={toggleLabel}
            aria-expanded={isMobile ? isMobileDrawerOpen : !isSidebarCollapsed}
            aria-controls={isMobile ? 'mobile-navigation-drawer' : 'desktop-sidebar'}
          >
            {isMobile && isMobileDrawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Logo */}
          <Link to="/" style={logoContainerStyle}>
            <div style={logoIconStyle} className="mobile-header__logo-icon">
              <span style={logoTextVStyle}>V</span>
              <div style={logoPlayStyle}></div>
            </div>
            <span style={logoTextStyle} className="mobile-header__wordmark">
              Vibe<span style={{ color: 'var(--primary)' }}>Play</span>
            </span>
            <span style={betaBadgeStyle} title="VibePlay is an invite-only private beta">
              Beta
            </span>
          </Link>

          {/* Global Search (Desktop Only) */}
          <form onSubmit={handleSearchSubmit} style={searchFormStyle} className="desktop-only">
            <input
              type="text"
              placeholder={t('header.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchInputStyle}
              className="header-search"
            />
            <button type="submit" style={searchButtonStyle} aria-label={t('nav.search')}>
              <Search size={14} color="var(--text-secondary)" />
            </button>
          </form>
        </div>

        {/* Right header group */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
          className="mobile-header__right-group"
        >
          <LanguageSwitcher compact className="header-language-switcher" />

          {/* Search Button (Mobile Only) */}
          <button
            onClick={() => navigate('/search')}
            className="mobile-only search-toggle-btn"
            style={{
              ...iconBtnStyle,
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label={t('nav.search')}
          >
            <Search size={20} color="var(--text-primary)" />
          </button>

          {/* Demo-build-only role switcher (spec §12): never present in the real bundle */}
          {import.meta.env.APP_MODE === 'demo' && demoRolesEnabled && (
            <div ref={demoRef} style={dropdownRelativeStyle} className="desktop-only">
              <button
                onClick={() => setShowDemoDropdown(!showDemoDropdown)}
                style={demoBtnStyle}
                className="roles-button"
                aria-label="Switch Demo User Role"
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary)',
                  }}
                ></span>
                <span>Roles</span>
              </button>
              {showDemoDropdown && (
                <div style={demoDropdownContentStyle} className="animate-fade">
                  <div style={dropdownTitleStyle}>Quick Role Switch (demo)</div>
                  <button onClick={() => handleDemoSwitch('player')} style={dropdownItemBtnStyle}>
                    Player{' '}
                    {currentUser?.role === 'player' && (
                      <Check size={14} style={{ marginLeft: 'auto', color: 'var(--success)' }} />
                    )}
                  </button>
                  <button onClick={() => handleDemoSwitch('creator')} style={dropdownItemBtnStyle}>
                    Creator{' '}
                    {currentUser?.role === 'creator' && (
                      <Check size={14} style={{ marginLeft: 'auto', color: 'var(--success)' }} />
                    )}
                  </button>
                  <button onClick={() => handleDemoSwitch('admin')} style={dropdownItemBtnStyle}>
                    Admin{' '}
                    {currentUser?.role === 'admin' && (
                      <Check size={14} style={{ marginLeft: 'auto', color: 'var(--success)' }} />
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Publish Action Button */}
          <button
            onClick={handlePublishClick}
            className="btn btn-primary btn-sm publish-button"
            style={{ gap: '4px' }}
          >
            <Plus size={16} />
            <span className="desktop-only">{t('header.publish')}</span>
          </button>

          {/* Notifications Dropdown */}
          {currentUser && (
            <div ref={notifRef} style={dropdownRelativeStyle}>
              <button
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                style={iconBtnStyle}
                aria-label={`${unreadCount} notifications`}
                aria-expanded={showNotifDropdown}
              >
                <Bell size={20} color="var(--text-primary)" />
                {unreadCount > 0 && (
                  <span style={badgeCountStyle} className="header-badge">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifDropdown && (
                <div style={notifDropdownStyle} className="animate-fade">
                  <div style={dropdownHeaderStyle}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                      {t('nav.notifications')}
                    </h3>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} style={textLinkStyle}>
                        {t('header.markAllRead')}
                      </button>
                    )}
                  </div>
                  <div style={notifListStyle}>
                    {notifications.length === 0 ? (
                      <div style={emptyNotifStyle}>{t('header.noNotifications')}</div>
                    ) : (
                      notifications.slice(0, 5).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            markAsRead(n.id);
                            if (n.relatedSlug) navigate(`/game/${n.relatedSlug}`);
                            setShowNotifDropdown(false);
                          }}
                          style={{
                            ...notifItemStyle,
                            backgroundColor: n.isRead ? 'transparent' : 'rgba(124, 92, 255, 0.05)',
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '0.8rem',
                              marginBottom: '2px',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {n.title}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            {n.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <Link
                    to="/notifications"
                    onClick={() => setShowNotifDropdown(false)}
                    style={viewAllNotifStyle}
                  >
                    {t('header.viewAllNotifications')}
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Profile Dropdown */}
          {currentUser ? (
            <div ref={profileRef} style={dropdownRelativeStyle}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                style={avatarBtnStyle}
                aria-expanded={showProfileDropdown}
              >
                <img
                  src={currentUser.avatar}
                  alt={currentUser.displayName}
                  style={avatarImgStyle}
                />
              </button>

              {showProfileDropdown && (
                <div style={profileDropdownStyle} className="animate-fade">
                  <div style={userHeaderInfoStyle}>
                    <div
                      style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    >
                      {currentUser.displayName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      @{currentUser.username}
                    </div>
                    <span
                      className={`badge ${currentUser.role === 'owner' ? 'badge-danger' : currentUser.role === 'admin' ? 'badge-danger' : currentUser.role === 'creator' ? 'badge-success' : 'badge-primary'}`}
                      style={{ marginTop: '6px', fontSize: '0.65rem' }}
                    >
                      {currentUser.role}
                    </span>
                  </div>

                  <hr style={hrStyle} />

                  <Link
                    to={`/profile/${currentUser.username}`}
                    onClick={() => setShowProfileDropdown(false)}
                    style={profileDropdownItemStyle}
                  >
                    <UserIcon size={14} />
                    <span>{t('profile.myProfile')}</span>
                  </Link>

                  <Link
                    to="/settings"
                    onClick={() => setShowProfileDropdown(false)}
                    style={profileDropdownItemStyle}
                  >
                    <Settings size={14} />
                    <span>{t('nav.settings')}</span>
                  </Link>

                  {hasCreatorAccess && (
                    <Link
                      to="/creator"
                      onClick={() => setShowProfileDropdown(false)}
                      style={profileDropdownItemStyle}
                    >
                      <LayoutDashboard size={14} />
                      <span>{t('profile.creatorStudio')}</span>
                    </Link>
                  )}

                  {hasAdminAccess && (
                    <Link
                      to="/admin"
                      onClick={() => setShowProfileDropdown(false)}
                      style={profileDropdownItemStyle}
                    >
                      <Shield size={14} />
                      <span>{t('profile.adminControl')}</span>
                    </Link>
                  )}

                  <hr style={hrStyle} />
                  <div style={{ padding: '4px 8px 6px' }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        marginBottom: '6px',
                      }}
                    >
                      {t('profile.appearance')}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '3px',
                        background: 'var(--surface-2)',
                        padding: '2px',
                        borderRadius: '6px',
                      }}
                    >
                      <button
                        onClick={() => setTheme('light')}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '5px 2px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          background: theme === 'light' ? 'var(--surface-1)' : 'transparent',
                          color: theme === 'light' ? 'var(--primary)' : 'var(--text-secondary)',
                          boxShadow: theme === 'light' ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <Sun size={11} />
                        <span>{t('profile.light')}</span>
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '5px 2px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          background: theme === 'dark' ? 'var(--surface-1)' : 'transparent',
                          color: theme === 'dark' ? 'var(--primary)' : 'var(--text-secondary)',
                          boxShadow: theme === 'dark' ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <Moon size={11} />
                        <span>{t('profile.dark')}</span>
                      </button>
                      <button
                        onClick={() => setTheme('system')}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '5px 2px',
                          borderRadius: '4px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          background: theme === 'system' ? 'var(--surface-1)' : 'transparent',
                          color: theme === 'system' ? 'var(--primary)' : 'var(--text-secondary)',
                          boxShadow: theme === 'system' ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <Monitor size={11} />
                        <span>{t('profile.system')}</span>
                      </button>
                    </div>
                  </div>

                  <hr style={hrStyle} />
                  <div style={{ padding: '4px 8px 6px' }}>
                    <LanguageSwitcher />
                  </div>

                  <hr style={hrStyle} />

                  <button
                    onClick={() => {
                      logout();
                      toast.success(t('app.loggedOut'));
                      navigate('/');
                      setShowProfileDropdown(false);
                    }}
                    style={{
                      ...profileDropdownItemStyle,
                      width: '100%',
                      border: 'none',
                      background: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--danger)',
                    }}
                  >
                    <LogOut size={14} />
                    <span>{t('profile.logout')}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Link
                to={withReturnTo('/login', location.pathname + location.search)}
                onClick={() =>
                  trackEvent('login_cta_clicked', {
                    source: 'header',
                    cta_location: 'top_navigation',
                    logged_in: false,
                  })
                }
                className="btn btn-secondary btn-sm"
                style={{ padding: '0.4rem 0.8rem' }}
              >
                {t('header.login')}
              </Link>
              <Link
                to={withReturnTo('/register', location.pathname + location.search)}
                onClick={() =>
                  trackEvent('signup_cta_clicked', {
                    source: 'header',
                    cta_location: 'top_navigation',
                    logged_in: false,
                  })
                }
                className="btn btn-primary btn-sm"
                style={{ padding: '0.4rem 0.8rem' }}
              >
                {t('header.signUp')}
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Left Sidebar (Desktop Only) */}
      {!isMobile && (
        <aside
          id="desktop-sidebar"
          className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}
          aria-label="Main navigation"
        >
          {renderSidebarContent(false)}
        </aside>
      )}

      {/* Mobile Sidebar Drawer */}
      {isMobile && (
        <>
          {isMobileDrawerOpen && (
            <div
              className="drawer-overlay"
              onClick={() => setMobileDrawerOpen(false)}
              role="presentation"
            />
          )}
          <div
            ref={drawerRef}
            id="mobile-navigation-drawer"
            className={`mobile-drawer ${isMobileDrawerOpen ? 'open' : ''}`}
            aria-label="Mobile navigation"
            role="dialog"
            aria-modal="true"
          >
            <div style={drawerHeaderStyle}>
              <span style={logoTextStyle}>
                Vibe<span style={{ color: 'var(--primary)' }}>Play</span>
              </span>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                style={closeDrawerBtnStyle}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <hr style={hrStyle} />
            {renderSidebarContent(true)}
          </div>
        </>
      )}

      {/* Main Content Area */}
      <main className="main-content app-main">
        {/* Demo build banner (spec §43) — statically removed from real builds */}
        {import.meta.env.APP_MODE === 'demo' && isDemo && (
          <div
            role="note"
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              marginBottom: '1rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              backgroundColor: 'rgba(255,184,0,0.12)',
              border: '1px solid rgba(255,184,0,0.35)',
              color: 'var(--text-primary)',
              textAlign: 'center',
            }}
          >
            Frontend Demo — data is stored only in this browser. Uploads, emails and moderation need
            the real VibePlay backend.
          </div>
        )}

        {/* Path Guards warning */}
        {isCreatorPath && !hasCreatorAccess && (
          <div style={accessDeniedContainerStyle} className="bg-glass">
            <ShieldAlertStyle />
            <h2>Access Denied</h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                margin: '0.5rem 0 1.5rem',
                textAlign: 'center',
              }}
            >
              You must be registered as a Creator to access this dashboard.
            </p>
            <button onClick={handleBecomeCreatorClick} className="btn btn-primary">
              Become a Creator
            </button>
          </div>
        )}

        {isCreatorEmailBlocked && (
          <div style={accessDeniedContainerStyle} className="bg-glass">
            <Mail size={48} color="var(--secondary)" aria-hidden="true" />
            <h2>{t('verification.blockerTitle')}</h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                margin: '0.5rem 0 1.5rem',
                textAlign: 'center',
                maxWidth: '36rem',
              }}
            >
              {t('verification.blockerBody')}
            </p>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => void resend()}
                disabled={isResending || verificationCooldown > 0}
                className="btn btn-primary"
              >
                {isResending
                  ? t('verification.sending')
                  : verificationCooldown > 0
                    ? t('verification.resendCooldown', { seconds: verificationCooldown })
                    : t('verification.resend')}
              </button>
              <button type="button" onClick={() => navigate('/')} className="btn btn-secondary">
                {t('verification.backHome')}
              </button>
            </div>
          </div>
        )}

        {isAdminPath && !hasAdminAccess && (
          <div style={accessDeniedContainerStyle} className="bg-glass">
            <ShieldAlertStyle />
            <h2>Restricted Area</h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                margin: '0.5rem 0 1.5rem',
                textAlign: 'center',
              }}
            >
              This section is restricted to VibePlay Platform Administrators only.
            </p>
            <button onClick={() => navigate('/')} className="btn btn-secondary">
              Go Home
            </button>
          </div>
        )}

        {/* Render pages if path check passes */}
        {(!isCreatorPath || (hasCreatorAccess && !isCreatorEmailBlocked)) &&
          (!isAdminPath || hasAdminAccess) && <Outlet />}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav mobile-only">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <Home className="mobile-bottom-nav__icon" />
          <span className="mobile-bottom-nav__label">{t('nav.home')}</span>
        </NavLink>
        <NavLink
          to="/games"
          className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <Compass className="mobile-bottom-nav__icon" />
          <span className="mobile-bottom-nav__label">{t('nav.discover')}</span>
        </NavLink>
        <NavLink
          to="/search"
          className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <Search className="mobile-bottom-nav__icon" />
          <span className="mobile-bottom-nav__label">{t('nav.search')}</span>
        </NavLink>
        <NavLink
          to="/library"
          className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <FolderHeart className="mobile-bottom-nav__icon" />
          <span className="mobile-bottom-nav__label">{t('nav.library')}</span>
        </NavLink>
        <NavLink
          to={currentUser ? `/profile/${currentUser.username}` : '/login'}
          className={({ isActive }) => `mobile-bottom-nav__item ${isActive ? 'active' : ''}`}
        >
          <UserIcon className="mobile-bottom-nav__icon" />
          <span className="mobile-bottom-nav__label">{t('nav.profile')}</span>
        </NavLink>
      </nav>
    </div>
  );
};

// SVG warning icon for guard screens
const ShieldAlertStyle = () => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--danger)"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginBottom: '1rem' }}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// Styles

const hamburgerBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  padding: '8px',
  borderRadius: '4px',
  transition: 'background-color 0.2s',
};

const logoContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  cursor: 'pointer',
};

const logoIconStyle: React.CSSProperties = {
  width: '30px',
  height: '30px',
  borderRadius: '6px',
  background: 'var(--gradient)',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const logoTextVStyle: React.CSSProperties = {
  color: '#fff',
  fontWeight: 'bold',
  fontSize: '1rem',
  fontFamily: 'var(--font-display)',
  zIndex: 2,
  transform: 'translateX(-2px)',
};

const logoPlayStyle: React.CSSProperties = {
  width: '0',
  height: '0',
  borderTop: '4px solid transparent',
  borderBottom: '4px solid transparent',
  borderLeft: '7px solid #fff',
  position: 'absolute',
  right: '8px',
  top: '11px',
  zIndex: 1,
};

const logoTextStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.25rem',
  fontWeight: 700,
  color: 'var(--text-primary)',
  letterSpacing: '-0.02em',
};

// Small, quiet beta indicator (spec §38) — informative, not a warning.
const betaBadgeStyle: React.CSSProperties = {
  marginLeft: '6px',
  padding: '2px 7px',
  borderRadius: '999px',
  fontSize: '0.62rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--primary)',
  border: '1px solid var(--primary)',
  lineHeight: 1.4,
  alignSelf: 'center',
};

const searchFormStyle: React.CSSProperties = {
  position: 'relative',
  marginLeft: '1rem',
  width: '280px',
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 2.2rem 0.4rem 1rem',
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: '999px',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  outline: 'none',
};

const searchButtonStyle: React.CSSProperties = {
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
};

const dropdownRelativeStyle: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block',
};

const demoBtnStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-default)',
  padding: '0.35rem 0.7rem',
  borderRadius: '6px',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.2s',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const demoDropdownContentStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '8px',
  width: '180px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  padding: '6px',
  boxShadow: 'var(--shadow-lg)',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  zIndex: 'var(--z-dropdown)',
};

const dropdownTitleStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
};

const dropdownItemBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderRadius: '6px',
  fontSize: '0.8rem',
  color: 'var(--text-primary)',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background-color 0.2s',
  width: '100%',
};

const iconBtnStyle: React.CSSProperties = {
  position: 'relative',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
};

const badgeCountStyle: React.CSSProperties = {
  position: 'absolute',
  top: '-4px',
  right: '-4px',
  backgroundColor: 'var(--danger)',
  color: '#fff',
  fontSize: '0.6rem',
  fontWeight: 'bold',
  borderRadius: '999px',
  padding: '1px 4px',
  minWidth: '14px',
  textAlign: 'center',
};

const notifDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '12px',
  width: '320px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 'var(--z-dropdown)',
  overflow: 'hidden',
};

const dropdownHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  borderBottom: '1px solid var(--border-color)',
  backgroundColor: 'rgba(255,255,255,0.01)',
};

const textLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--secondary)',
  fontSize: '0.7rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const notifListStyle: React.CSSProperties = {
  maxHeight: '260px',
  overflowY: 'auto',
};

const notifItemStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid var(--border-color)',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};

const emptyNotifStyle: React.CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
};

const viewAllNotifStyle: React.CSSProperties = {
  display: 'block',
  textAlign: 'center',
  padding: '8px',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--secondary)',
  borderTop: '1px solid var(--border-color)',
  backgroundColor: 'rgba(255,255,255,0.01)',
};

const avatarBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  borderRadius: '50%',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const avatarImgStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  objectFit: 'cover',
  borderRadius: '50%',
  border: '1.5px solid var(--border-color)',
};

const profileDropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '12px',
  width: '200px',
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '6px',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 'var(--z-dropdown)',
};

const userHeaderInfoStyle: React.CSSProperties = {
  padding: '6px 10px',
};

const hrStyle: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid var(--border-color)',
  margin: '6px 0',
};

const profileDropdownItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 10px',
  borderRadius: '6px',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  transition: 'all 0.15s ease',
  cursor: 'pointer',
};

const drawerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  height: '64px',
};

const closeDrawerBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  padding: '6px',
};

const accessDeniedContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3rem 2rem',
  borderRadius: '16px',
  margin: '2rem auto',
  maxWidth: '500px',
  border: '1px solid var(--border-color)',
  animation: 'slideUp 0.3s ease forwards',
};

/* mobileNavLinkStyle and mobileNavTextStyle removed to prevent unused locals compilation errors */
