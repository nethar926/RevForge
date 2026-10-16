import { useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { HamburgerMenu } from './NavBar';
import { CjNavRow } from '../packs/mounts/CjNavRow';
import { currentCjPage, type CjNavAction } from '../packs/carrier-jet.nav';
import type { UiPrefs } from '../hooks/useUiPrefs';

interface Props {
  prefs: UiPrefs;
  engineName: string;
  running: boolean;
  onMuteToggle: () => void;
  skinId?: string;
  /** Carrier Jet pack active: its switch row replaces the ☰ button (same destinations, same mute state). */
  cjNav?: boolean;
}

export function AppShell({ prefs, engineName, running, onMuteToggle, skinId = 'default', cjNav = false }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  // Drive-only destinations (Tuner panels) open on arrival via /drive?panel=<id>.
  const onCjNav = (a: CjNavAction) => {
    if (a.type === 'route') navigate(a.to);
    else if (a.type === 'panel') navigate(`/drive?panel=${a.panel}`);
    else if (a.type === 'drive') navigate('/drive');
    else if (a.type === 'mute') onMuteToggle();
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const speedScript = skinId === 'ion-twin' ? prefs.ionTwinSpeedScript : undefined;

  return (
    <div
      className={`app-shell density-${prefs.density}`}
      data-skin={skinId}
      {...(speedScript ? { 'data-speed-script': speedScript } : {})}
    >
      <header className="top-chrome">
        <div className="chrome-leading">
          {!cjNav && (
            <button
              type="button"
              className="hamburger-btn"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="revforge-menu"
              onClick={() => setMenuOpen(true)}
            >
              <span className="hamburger-glyph" aria-hidden="true">
                ☰
              </span>
            </button>
          )}
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
        {cjNav && <CjNavRow current={currentCjPage(location.pathname, null)} muted={prefs.masterMuted} onAction={onCjNav} />}
        <div className="chrome-actions">
          <button
            type="button"
            className={`icon-btn ${prefs.masterMuted ? 'muted' : ''}`}
            onClick={onMuteToggle}
            aria-label={prefs.masterMuted ? 'Unmute' : 'Mute'}
          >
            {prefs.masterMuted ? 'Muted' : running ? 'Live' : 'Idle'}
          </button>
        </div>
      </header>

      <HamburgerMenu open={menuOpen} onClose={closeMenu} />

      <main className="main-stage">
        <Outlet />
      </main>

      {prefs.showKeepAliveTip && (
        <div className="keepalive-tip" role="note">
          Tesla tip: keep this Browser tab open — backgrounding may pause audio & GPS.
        </div>
      )}
    </div>
  );
}
