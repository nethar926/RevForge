import { useCallback, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { HamburgerMenu } from './NavBar';
import type { UiPrefs } from '../hooks/useUiPrefs';
import { Icon } from '../ui/hig';

interface Props {
  prefs: UiPrefs;
  engineName: string;
  running: boolean;
  onMuteToggle: () => void;
  skinId?: string;
}

export function AppShell({ prefs, engineName, running, onMuteToggle, skinId = 'default' }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Return focus to the hamburger when the menu closes (HIG / WCAG 2.4.3).
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  }, []);
  const speedScript = skinId === 'ion-twin' ? prefs.ionTwinSpeedScript : undefined;

  return (
    <div
      className={`app-shell density-${prefs.density}`}
      data-skin={skinId}
      {...(speedScript ? { 'data-speed-script': speedScript } : {})}
    >
      <header className="top-chrome" inert={menuOpen || undefined}>
        <div className="chrome-leading">
          <button
            ref={menuButton}
            type="button"
            className="hamburger-btn"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="revforge-menu"
            onClick={() => setMenuOpen(true)}
          >
            <span className="hamburger-glyph" aria-hidden="true">
              <Icon name="menu" />
            </span>
          </button>
          <div className="brand">
            <span className="brand-mark">RF</span>
            <div>
              <div className="brand-name">
                {skinId === 'ion-twin' ? (
                  <>
                    <span className="aurebesh brand-ab">RF</span>
                    <span className="brand-lat">RevForge</span>
                  </>
                ) : (
                  'RevForge'
                )}
              </div>
              <div className="brand-sub">{engineName} · free</div>
            </div>
          </div>
        </div>
        <div className="chrome-actions">
          {/* Status is separate text; the button keeps one constant name + aria-pressed (F-12). */}
          <span className="chrome-status" role="status">
            {prefs.masterMuted ? 'Muted' : running ? 'Live' : 'Idle'}
          </span>
          <button
            type="button"
            className={`icon-btn hig-btn chrome-mute ${prefs.masterMuted ? 'muted' : ''}`}
            onClick={onMuteToggle}
            aria-pressed={prefs.masterMuted}
          >
            <Icon name={prefs.masterMuted ? 'volume-x' : 'volume-2'} />
            <span>Mute</span>
          </button>
        </div>
      </header>

      <HamburgerMenu open={menuOpen} onClose={closeMenu} />

      <main className="main-stage" inert={menuOpen || undefined}>
        <Outlet />
      </main>

      {prefs.showKeepAliveTip && (
        <footer className="keepalive-footer">
          <aside className="keepalive-tip" aria-label="Tip">
            Keep this browser tab open. Switching away may pause audio and GPS.
          </aside>
        </footer>
      )}
    </div>
  );
}
