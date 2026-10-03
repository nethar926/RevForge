import {useState, type CSSProperties, type ReactNode} from 'react';
import {FAMILIES,THEMES,themeForId,type ThemeFamily,type ThemeLayout} from './catalog';

function ThumbPreview({layout, accent, secondary, uid}: {layout: ThemeLayout; accent: string; secondary: string; uid: string}) {
  const a = accent;
  const s = secondary;
  const common = {width: '100%', height: '100%'} as const;
  const gid = (name: string) => `${name}-${uid}`;
  let body: ReactNode;
  switch (layout) {
    case 'analog':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <circle cx="34" cy="40" r="22" fill="#0c1218" stroke={a} strokeWidth="2"/>
          <circle cx="86" cy="40" r="22" fill="#0c1218" stroke={a} strokeWidth="2"/>
          <line x1="34" y1="40" x2="48" y2="28" stroke={s} strokeWidth="2" strokeLinecap="round"/>
          <line x1="86" y1="40" x2="98" y2="30" stroke={s} strokeWidth="2" strokeLinecap="round"/>
          <circle cx="34" cy="40" r="3" fill={s}/><circle cx="86" cy="40" r="3" fill={s}/>
          <text x="60" y="72" textAnchor="middle" fill={a} fontSize="9" fontFamily="ui-monospace,monospace">68</text>
        </svg>
      );
      break;
    case 'arc':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <path d="M18 58 A42 42 0 0 1 102 58" fill="none" stroke="#ffffff18" strokeWidth="6" strokeLinecap="round"/>
          <path d="M18 58 A42 42 0 0 1 88 28" fill="none" stroke={a} strokeWidth="6" strokeLinecap="round"/>
          <text x="60" y="52" textAnchor="middle" fill="#e8edf1" fontSize="22" fontFamily="ui-monospace,monospace" fontWeight="300">68</text>
          <text x="60" y="66" textAnchor="middle" fill={a} fontSize="8" fontFamily="ui-monospace,monospace">MPH</text>
        </svg>
      );
      break;
    case 'digital':
    case 'bar':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <text x="60" y="36" textAnchor="middle" fill={a} fontSize="26" fontFamily="ui-monospace,monospace" fontWeight="500">68</text>
          {[0,1,2,3,4,5,6,7].map((i) => (
            <rect key={i} x={18 + i * 11} y={48} width="8" height={8 + i * 2.2} rx="1"
              fill={i < 6 ? a : s} opacity={i < 5 ? 1 : 0.85}/>
          ))}
        </svg>
      );
      break;
    case 'line':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <text x="16" y="40" fill="#e8edf1" fontSize="24" fontFamily="ui-monospace,monospace" fontWeight="300">68</text>
          <rect x="58" y="28" width="46" height="10" rx="2" fill="#ffffff14"/>
          <rect x="58" y="28" width="30" height="10" rx="2" fill={a}/>
          <rect x="58" y="46" width="46" height="6" rx="2" fill="#ffffff10"/>
          <rect x="58" y="46" width="18" height="6" rx="2" fill={s}/>
        </svg>
      );
      break;
    case 'numerical':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <defs>
            <linearGradient id={gid('numGlow')} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={a} stopOpacity="0.35"/>
              <stop offset="100%" stopColor={a} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <rect width="120" height="78" rx="6" fill={`url(#${gid('numGlow')})`}/>
          <text x="60" y="48" textAnchor="middle" fill="#f2f6fa" fontSize="36" fontFamily="ui-monospace,monospace" fontWeight="200">68</text>
          <text x="60" y="64" textAnchor="middle" fill={a} fontSize="8" fontFamily="ui-monospace,monospace" letterSpacing="2">MPH</text>
        </svg>
      );
      break;
    case 'driver':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <polygon points="40,18 80,18 110,78 10,78" fill="#1a2430" stroke={a} strokeWidth="1" opacity="0.7"/>
          <rect x="56" y="30" width="8" height="28" fill={a} opacity="0.5"/>
          <text x="60" y="28" textAnchor="middle" fill="#e8edf1" fontSize="16" fontFamily="ui-monospace,monospace">68</text>
        </svg>
      );
      break;
    case 'scanner':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#12080a"/>
          <text x="60" y="38" textAnchor="middle" fill={a} fontSize="24" fontFamily="ui-monospace,monospace">68</text>
          <rect x="20" y="52" width="80" height="8" rx="2" fill="#350c12" stroke="#ae383866"/>
          <rect x="36" y="52" width="28" height="8" fill={a} opacity="0.85">
            <animate attributeName="x" values="20;72;20" dur="2.4s" repeatCount="indefinite"/>
          </rect>
        </svg>
      );
      break;
    case 'time':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#120e0a"/>
          <rect x="10" y="12" width="54" height="16" fill="#2b1c10" stroke="#6e5135"/>
          <rect x="10" y="32" width="54" height="16" fill="#12221b" stroke="#3d6a52"/>
          <rect x="10" y="52" width="54" height="16" fill="#2c1518" stroke="#6a3a40"/>
          <text x="92" y="48" textAnchor="middle" fill={a} fontSize="22" fontFamily="ui-monospace,monospace">88</text>
        </svg>
      );
      break;
    case 'jet':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <rect x="8" y="14" width="28" height="50" fill="none" stroke={a} strokeWidth="1"/>
          <rect x="84" y="14" width="28" height="50" fill="none" stroke={a} strokeWidth="1"/>
          <text x="22" y="44" textAnchor="middle" fill={a} fontSize="12" fontFamily="ui-monospace,monospace">92</text>
          <text x="98" y="44" textAnchor="middle" fill={a} fontSize="12" fontFamily="ui-monospace,monospace">88</text>
          <text x="60" y="42" textAnchor="middle" fill="#e8edf1" fontSize="20" fontFamily="ui-monospace,monospace">68</text>
          <line x1="42" y1="28" x2="78" y2="28" stroke={a} strokeWidth="1" opacity="0.5"/>
          <line x1="48" y1="36" x2="72" y2="36" stroke={a} strokeWidth="1" opacity="0.35"/>
        </svg>
      );
      break;
    case 'space':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <polygon points="60,8 104,39 60,70 16,39" fill="none" stroke={a} strokeWidth="1.5" opacity="0.7"/>
          <circle cx="60" cy="39" r="3" fill={s}/>
          <text x="60" y="44" textAnchor="middle" fill="#e8edf1" fontSize="18" fontFamily="ui-monospace,monospace">◇</text>
          {[18,36,78,96].map((x,i)=><circle key={i} cx={x} cy={14+i*12} r="1.2" fill={a} opacity="0.6"/>)}
        </svg>
      );
      break;
    case 'road':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <defs>
            <linearGradient id={gid('roadSky')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a2740"/><stop offset="100%" stopColor="#070b10"/>
            </linearGradient>
          </defs>
          <rect width="120" height="78" rx="6" fill={`url(#${gid('roadSky')})`}/>
          <polygon points="48,34 72,34 110,78 10,78" fill="#1a2430" stroke={a} strokeWidth="1" opacity="0.8"/>
          <line x1="60" y1="34" x2="60" y2="78" stroke={a} strokeWidth="1.5" strokeDasharray="4 6" opacity="0.7"/>
          <text x="22" y="28" fill="#e8edf1" fontSize="16" fontFamily="ui-monospace,monospace">68</text>
        </svg>
      );
      break;
    case 'gradient':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <defs>
            <radialGradient id={gid('gradBlue')} cx="50%" cy="42%" r="60%">
              <stop offset="0%" stopColor="#2a6bff"/>
              <stop offset="100%" stopColor="#0a1a44"/>
            </radialGradient>
            <linearGradient id={gid('gradRed')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff5040"/>
              <stop offset="100%" stopColor="#1e6fff"/>
            </linearGradient>
          </defs>
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <circle cx="32" cy="39" r="24" fill={`url(#${gid('gradBlue')})`}/>
          <path d="M32 39 L32 17 A24 24 0 0 1 48 27 Z" fill="#bfe9ff" opacity="0.9"/>
          <line x1="32" y1="39" x2="44" y2="22" stroke="#dff4ff" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="88" cy="39" r="24" fill={`url(#${gid('gradRed')})`}/>
          <line x1="88" y1="39" x2="106" y2="39" stroke={s} strokeWidth="2" strokeLinecap="round"/>
          <text x="60" y="70" textAnchor="middle" fill={a} fontSize="10" fontFamily="ui-monospace,monospace">74</text>
        </svg>
      );
      break;
    case 'gradient-macro':
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <circle cx="60" cy="42" r="30" fill="#123a94"/>
          <path d="M60 42 L60 14 A30 30 0 0 1 84 26 Z" fill="#e8f6ff" opacity="0.95"/>
          <rect x="78" y="30" width="10" height="4" rx="2" fill="none" stroke="#ff8a3c" strokeWidth="1.5" transform="rotate(35 83 32)"/>
          <rect x="80" y="42" width="10" height="4" rx="2" fill="none" stroke="#ff8a3c" strokeWidth="1.5" transform="rotate(60 85 44)"/>
          <text x="60" y="64" textAnchor="middle" fill="#0a1830" fontSize="16" fontFamily="ui-monospace,monospace">74</text>
        </svg>
      );
      break;
    case 'custom':
    default:
      body = (
        <svg viewBox="0 0 120 78" style={common} aria-hidden="true">
          <rect width="120" height="78" rx="6" fill="#070b10"/>
          <rect x="12" y="14" width="40" height="24" rx="3" fill="#ffffff10" stroke={a}/>
          <rect x="68" y="14" width="40" height="24" rx="3" fill="#ffffff10" stroke={s}/>
          <rect x="12" y="46" width="96" height="18" rx="3" fill="#ffffff10" stroke={a} opacity="0.7"/>
          <text x="60" y="58" textAnchor="middle" fill={a} fontSize="10" fontFamily="ui-monospace,monospace">GRID</text>
        </svg>
      );
  }
  return <span className={`theme-thumbnail thumb-${layout}`} aria-hidden="true">{body}</span>;
}

export function ThemePicker({selected,onSelect,mode='all'}:{selected:string;onSelect:(id:string)=>void;mode?:'all'|'atmosphere'|'cluster'}) {
  const families=FAMILIES.filter(f=>mode==='all'||(mode==='atmosphere'?f==='RoadView':f!=='RoadView'));
  const [family,setFamily]=useState<ThemeFamily>(()=>families.includes(themeForId(selected).family)?themeForId(selected).family:families[0]);
  const [group,setGroup]=useState('All');
  const groups=[...new Set(THEMES.filter(t=>t.family===family).map(t=>t.group))];
  return <div className="theme-picker">
    <div className="theme-tabs" aria-label="Theme families">{families.map(f=><button key={f} type="button" aria-pressed={family===f} onClick={()=>{setFamily(f);setGroup('All');}}>{f}</button>)}</div>
    <div className="theme-subtabs" aria-label="Theme subcategories">{['All',...groups].map(g=><button key={g} type="button" aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</div>
    <div className="theme-card-grid">{THEMES.filter(t=>t.family===family&&(group==='All'||t.group===group)).map(t=><button className="theme-card" type="button" key={t.id} aria-pressed={selected===t.id} onClick={()=>onSelect(t.id)} style={{'--skin-accent':t.accent,'--skin-secondary':t.secondary} as CSSProperties}>
      <ThumbPreview layout={t.layout} accent={t.accent} secondary={t.secondary} uid={t.id}/>
      <span className="theme-card-title">{t.name}<span>{selected===t.id?'✓':'↗'}</span></span><small>{t.group} · {t.feature}</small><p>{t.description}</p>
    </button>)}</div>
  </div>;
}
