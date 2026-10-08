import { useEffect, useId, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from '../ui/hig';

/** RevForge IA — labels differ from path segments where product renamed surfaces. */
const links = [
  { to: '/drive', label: 'Drive' },
  { to: '/engines', label: 'Garage' },
  { to: '/customize', label: 'Interface Options' },
  { to: '/builder', label: 'Pro Builder' },
  { to: '/sound-builder', label: 'Sound Builder' },
  { to: '/diag', label: 'Diagnostics' },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function HamburgerMenu({ open, onClose }: Props) {
  const location = useLocation();
  const titleId = useId();
  const firstLinkRef = useRef<HTMLAnchorElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const prevPath = useRef(location.pathname);

  // Close on navigate
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      if (open) onClose();
    }
  }, [location.pathname, open, onClose]);

  // Escape + focus first item when opened
  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      // Keep Tab inside the drawer while it is open (modal focus trap).
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const items = [...drawerRef.current.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!drawerRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while drawer open (Tesla / mobile)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="menu-root" role="presentation">
      <button
        type="button"
        className="menu-backdrop"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <nav ref={drawerRef} id="revforge-menu" className="menu-drawer glass-strong" aria-labelledby={titleId}>
        <div className="menu-drawer-head">
          <h2 id={titleId} className="menu-drawer-title">
            RevForge
          </h2>
          <button
            type="button"
            className="menu-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <Icon name="x" />
          </button>
        </div>
        <ul className="menu-list">
          {links.map((l, i) => (
            <li key={l.to}>
              <NavLink
                ref={i === 0 ? firstLinkRef : undefined}
                to={l.to}
                className={({ isActive }) => `menu-link ${isActive ? 'active' : ''}`}
                aria-current={location.pathname === l.to ? 'page' : undefined}
                onClick={onClose}
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** @deprecated Bottom tab bar removed — use HamburgerMenu via AppShell. */
export function NavBar() {
  return null;
}
