import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import {
  ChevronLeft, ChevronRight, Send, Trash2, List, Loader2, RotateCcw, X,
  Settings as SettingsIcon, Sun, Moon, Monitor,
} from 'lucide-react';
import { loadState, saveState } from './lib/storage.js';
import { recordOpen, recordMonthChange, recordPhrase, getMeasures } from './lib/perf.js';

// ============================================================
// CONSTANTES
// ============================================================
const FR_MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const FR_DAYS_FULL = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const FR_DAYS_SHORT = ["L","M","M","J","V","S","D"];

// ============================================================
// THÈMES
// ============================================================
const THEMES = {
  light: {
    appBg: '#F2F2F7', cardBg: '#FFFFFF',
    cellNormal: '#FFFFFF', cellSaturday: 'rgb(246, 246, 246)', cellSunday: 'rgb(233, 233, 233)',
    cellHoliday: 'rgb(218, 218, 218)', cellOtherMonth: 'rgb(240, 240, 240)',
    headerBg: 'rgb(128, 128, 128)', headerText: '#FFFFFF',
    textPrimary: '#111111', textSecondary: 'rgba(60, 60, 67, 0.6)',
    textDay: 'rgb(80, 80, 80)', textOtherMonth: 'rgb(191, 191, 191)',
    grid: 'rgb(220, 220, 220)', gridLight: 'rgb(238, 238, 238)',
    accent: '#007AFF',
    success: '#E8F5E9', successText: '#1B5E20',
    error: '#FFEBEE', errorText: '#B71C1C',
  },
  dark: {
    appBg: '#000000', cardBg: '#1C1C1E',
    cellNormal: '#1C1C1E', cellSaturday: '#222224', cellSunday: '#28282A',
    cellHoliday: '#2E2E30', cellOtherMonth: '#0E0E10',
    headerBg: '#3A3A3C', headerText: '#FFFFFF',
    textPrimary: '#FFFFFF', textSecondary: 'rgba(235, 235, 245, 0.6)',
    textDay: '#E5E5E7', textOtherMonth: '#48484A',
    grid: '#38383A', gridLight: '#2C2C2E',
    accent: '#0A84FF',
    success: '#1B3D1F', successText: '#A0E0A0',
    error: '#3D1F1F', errorText: '#FFA0A0',
  },
};

// ============================================================
// JOURS FÉRIÉS FRANÇAIS (calcul Pâques)
// ============================================================
function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function holidaysForYear(year) {
  const e = easterDate(year);
  return {
    [fmtDate(new Date(year, 0, 1))]: "Jour de l'An",
    [fmtDate(addDays(e, 1))]: "Lundi de Pâques",
    [fmtDate(new Date(year, 4, 1))]: "Fête du Travail",
    [fmtDate(new Date(year, 4, 8))]: "Victoire 1945",
    [fmtDate(addDays(e, 39))]: "Ascension",
    [fmtDate(addDays(e, 50))]: "Lundi de Pentecôte",
    [fmtDate(new Date(year, 6, 14))]: "Fête Nationale",
    [fmtDate(new Date(year, 7, 15))]: "Assomption",
    [fmtDate(new Date(year, 10, 1))]: "Toussaint",
    [fmtDate(new Date(year, 10, 11))]: "Armistice",
    [fmtDate(new Date(year, 11, 25))]: "Noël",
  };
}
const HOLIDAY_CACHE = {};
function getHolidays(year) { if (!HOLIDAY_CACHE[year]) HOLIDAY_CACHE[year] = holidaysForYear(year); return HOLIDAY_CACHE[year]; }
function getHolidayName(d) { return getHolidays(d.getFullYear())[fmtDate(d)] || null; }
function isHoliday(d) { return getHolidayName(d) !== null; }

// ============================================================
// HELPERS DATE
// ============================================================
const pad = n => String(n).padStart(2, '0');
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(s) { const [y,m,dd]=s.split('-').map(Number); return new Date(y,m-1,dd); }
const mondayIdx = d => (d.getDay() + 6) % 7;
const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function getMonthWeeks(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  const first = new Date(year, month - 1, 1);
  const last  = new Date(year, month - 1, lastDay);
  const startOffset = mondayIdx(first);
  const endOffset   = 6 - mondayIdx(last);
  const totalDays = lastDay + startOffset + endOffset;
  const nWeeks = totalDays / 7;
  const weeks = [];
  const cur = new Date(year, month - 1, 1 - startOffset);
  for (let w = 0; w < nWeeks; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
    weeks.push(week);
  }
  return weeks;
}
function fmtFr(s) { if (!s) return ''; const [, m, d] = s.split('-'); return `${d}/${m}`; }
function fmtFrLong(s) {
  const d = parseDate(s);
  return `${FR_DAYS_FULL[mondayIdx(d)]} ${d.getDate()} ${FR_MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

// ============================================================
// ÉTAT INITIAL
// ============================================================
const DEFAULT_STATE = {
  categories: [],
  recurringRules: [],
  events: [],
  dayNotes: [],
  settings: {
    vacationPeriod: 'civil',  // 'civil' | 'university' | { startMonth, startDay, endMonth, endDay }
    theme: 'auto',
  },
};

// ============================================================
// HOOKS
// ============================================================
// Valeurs lues dès le premier rendu : sinon l'app dessine d'abord la version
// ordinateur (ou le thème clair), puis tout redessine une fraction de seconde après.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

function useTheme(preferred) {
  const [systemDark, setSystemDark] = useState(() =>
    !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const upd = () => setSystemDark(mq.matches);
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);
  const isDark = preferred === 'dark' || (preferred === 'auto' && systemDark);
  useEffect(() => { document.body.classList.toggle('dark', isDark); }, [isDark]);
  return isDark ? THEMES.dark : THEMES.light;
}

function useSwipe(onLeft, onRight) {
  const startX = useRef(null), startY = useRef(null);
  const onTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);
  const onTouchEnd = useCallback((e) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (dx < 0) onLeft(); else onRight();
    }
    startX.current = null; startY.current = null;
  }, [onLeft, onRight]);
  return { onTouchStart, onTouchEnd };
}

// ============================================================
// LOGIQUE CALENDRIER (centrale)
// ============================================================
function buildCatMap(state) { return new Map(state.categories.map(c => [c.id, c])); }

function getDayContent(date, currentMonth, state, catById = buildCatMap(state)) {
  const dateStr = fmtDate(date);
  const inMonth = date.getMonth() + 1 === currentMonth;
  const wd = mondayIdx(date);
  const isSat = wd === 5, isSun = wd === 6;
  const holiday = getHolidayName(date);

  // Événements ponctuels actifs
  const matchingEvents = state.events.filter(e =>
    dateStr >= e.startDate && dateStr <= (e.endDate || e.startDate)
  );

  // Règles récurrentes actives
  const matchingRules = state.recurringRules.filter(r => {
    if (r.startDate && dateStr < r.startDate) return false;
    if (r.endDate && dateStr > r.endDate) return false;
    if (r.weekdays && !r.weekdays.includes(wd)) return false;
    if (r.exceptions && r.exceptions.includes(dateStr)) return false;
    const cat = catById.get(r.categoryId);
    // Si catégorie "work" et c'est un férié → masquer (sauf override ponctuel)
    if (cat && cat.kind === 'work' && holiday) {
      const hasOverride = matchingEvents.some(e => e.categoryId === r.categoryId);
      if (!hasOverride) return false;
    }
    return true;
  });

  // Catégories actives ce jour
  let activeCategories = [];
  const seen = new Set();
  for (const e of matchingEvents) {
    const cat = catById.get(e.categoryId);
    if (cat && !seen.has(cat.id)) {
      seen.add(cat.id);
      activeCategories.push({ category: cat, source: 'event', event: e });
    }
  }
  for (const r of matchingRules) {
    const cat = catById.get(r.categoryId);
    if (cat && !seen.has(cat.id)) {
      seen.add(cat.id);
      activeCategories.push({ category: cat, source: 'rule', rule: r });
    }
  }

  // RÈGLE V2.1 : si une catégorie "vacation" est active ce jour,
  // on masque toutes les catégories "work" (stages + regular)
  const hasVacation = activeCategories.some(ac => ac.category.kind === 'vacation');
  if (hasVacation) {
    activeCategories = activeCategories.filter(ac => ac.category.kind !== 'work');
  }

  // RÈGLE V2.1.1 : les jours hors du mois courant n'affichent aucune catégorie
  // (pour ne pas polluer les cases grisées des semaines débordantes)
  if (!inMonth) {
    activeCategories = [];
  }

  const note = state.dayNotes.find(n => n.date === dateStr) || null;
  return { dateStr, inMonth, wd, isSat, isSun, holiday, activeCategories, note };
}

function resolveCellBackground(c, theme) {
  if (!c.inMonth) return theme.cellOtherMonth;
  if (c.holiday) return theme.cellHoliday;
  const withCell = c.activeCategories.find(ac => ac.category.cellColor);
  if (withCell) return withCell.category.cellColor;
  if (c.isSun) return theme.cellSunday;
  if (c.isSat) return theme.cellSaturday;
  return theme.cellNormal;
}

// ============================================================
// CELLULES
// ============================================================
function DesktopDayCell({ date, c, theme, onTap }) {
  const bg = resolveCellBackground(c, theme);
  const pills = c.activeCategories.filter(ac => ac.category.pillColor);
  const vacationLabel = c.activeCategories.find(ac => ac.category.kind === 'vacation' && ac.source === 'event');
  return (
    <div onClick={onTap} style={{
      background: bg,
      borderRight: `1px solid ${theme.grid}`,
      borderBottom: `1px solid ${theme.grid}`,
      minHeight: 96, padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 4,
      cursor: 'pointer', position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{
          fontSize: c.inMonth ? 20 : 14,
          color: c.inMonth ? theme.textDay : theme.textOtherMonth,
          lineHeight: 1,
        }}>{date.getDate()}</span>
        {c.note && <span style={{ fontSize: 12 }}>📝</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {pills.map((ac, i) => {
          const label = ac.event ? ac.event.label : ac.category.name;
          return (
            <span key={i} style={{
              border: `1px solid ${ac.category.pillColor}`,
              color: ac.category.pillColor,
              borderRadius: 999, padding: '1px 7px',
              fontSize: 10, fontWeight: 700,
              alignSelf: 'flex-start', maxWidth: '100%',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              letterSpacing: 0.2,
            }}>{label}</span>
          );
        })}
      </div>
      {c.inMonth && c.holiday && (
        <div style={{ fontSize: 10, fontStyle: 'italic', color: theme.textSecondary, marginTop: 'auto' }}>{c.holiday}</div>
      )}
      {c.inMonth && vacationLabel && (
        <div style={{ fontSize: 10, fontStyle: 'italic', color: theme.textSecondary, marginTop: 'auto' }}>{vacationLabel.event.label}</div>
      )}
    </div>
  );
}

function MobileDayCell({ date, c, theme, isSelected, onTap }) {
  const bg = resolveCellBackground(c, theme);
  const dots = c.activeCategories.map(ac => ac.category.pillColor || ac.category.cellColor).filter(Boolean).slice(0, 4);
  return (
    <button onClick={onTap} style={{
      background: bg, border: 'none',
      borderRight: `1px solid ${theme.gridLight}`, borderBottom: `1px solid ${theme.gridLight}`,
      aspectRatio: '1', padding: 0, cursor: 'pointer', position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      paddingTop: 6,
    }}>
      <span style={{
        fontSize: c.inMonth ? 15 : 12, fontWeight: 400,
        width: 26, height: 26, display: 'grid', placeItems: 'center',
        borderRadius: '50%',
        background: isSelected ? theme.accent : 'transparent',
        color: isSelected ? 'white' : (c.inMonth ? theme.textDay : theme.textOtherMonth),
        transition: 'background 0.15s',
      }}>{date.getDate()}</span>
      {dots.length > 0 && (
        <div style={{ display: 'flex', gap: 2.5, marginTop: 3, justifyContent: 'center', flexWrap: 'wrap', maxWidth: '90%' }}>
          {dots.map((color, i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />)}
        </div>
      )}
      {c.note && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9 }}>📝</span>}
    </button>
  );
}

// ============================================================
// GRILLE — mémorisée : ne se redessine que si le mois, les données,
// le thème ou le jour sélectionné changent (pas à chaque lettre tapée).
// ============================================================
const MonthGrid = memo(function MonthGrid({ year, month, state, theme, isMobile, selected, setSelected, slideDir }) {
  const days = useMemo(() => {
    const catById = buildCatMap(state);
    return getMonthWeeks(year, month).flat().map(d => ({ d, ds: fmtDate(d), c: getDayContent(d, month, state, catById) }));
  }, [year, month, state]);
  const DaysHeader = isMobile ? FR_DAYS_SHORT : FR_DAYS_FULL;
  return (
    <div key={`${year}-${month}`} style={{
      background: theme.cardBg,
      border: isMobile ? 'none' : `1px solid ${theme.grid}`,
      borderRadius: isMobile ? 14 : 0,
      overflow: 'hidden',
      boxShadow: isMobile ? '0 1px 0 rgba(0,0,0,0.04)' : 'none',
      animation: slideDir ? `${slideDir > 0 ? 'slideFromRight' : 'slideFromLeft'} 0.16s ease-out` : 'none',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        background: isMobile ? 'transparent' : theme.headerBg,
        borderBottom: isMobile ? `1px solid ${theme.grid}` : 'none',
      }}>
        {DaysHeader.map((d, i) => (
          <div key={i} style={{
            color: isMobile ? theme.textSecondary : theme.headerText,
            fontSize: isMobile ? 11 : 12, fontWeight: isMobile ? 600 : 400,
            padding: '8px 0', textAlign: 'center',
            letterSpacing: isMobile ? 0.5 : 0.3,
            textTransform: isMobile ? 'uppercase' : 'none',
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map(({ d, ds, c }, i) => isMobile ? (
          <MobileDayCell key={i} date={d} c={c} theme={theme}
            isSelected={selected === ds}
            onTap={() => setSelected(ds)} />
        ) : (
          <DesktopDayCell key={i} date={d} c={c} theme={theme}
            onTap={() => setSelected(ds)} />
        ))}
      </div>
    </div>
  );
});

// ============================================================
// DÉTAIL D'UN JOUR
// ============================================================
const DayDetail = memo(function DayDetail({ dateStr, state, theme, isMobile, onClose }) {
  if (!dateStr) return null;
  const date = parseDate(dateStr);
  const c = getDayContent(date, date.getMonth() + 1, state);
  return (
    <div style={{
      background: theme.cardBg, borderRadius: 14, padding: 16,
      boxShadow: '0 1px 0 rgba(0,0,0,0.04)', position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
          color: theme.textSecondary, textTransform: 'uppercase',
        }}>{fmtFrLong(dateStr)}</div>
        {isMobile && onClose && (
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: theme.textSecondary, cursor: 'pointer', padding: 0,
          }}><X size={16} /></button>
        )}
      </div>
      {c.holiday && <DetailRow theme={theme} color={theme.textSecondary} label={c.holiday} sub="Jour férié" />}
      {c.activeCategories.map((ac, i) => {
        const subLabel = ac.category.kind === 'work'
          ? (ac.category.subkind === 'stage' ? 'Stage' : 'Travail')
          : ac.category.kind === 'vacation' ? 'Vacances'
          : ac.category.name;
        return (
          <DetailRow
            key={i}
            theme={theme}
            color={ac.category.pillColor || ac.category.cellColor || theme.accent}
            label={ac.event ? ac.event.label : ac.category.name}
            sub={subLabel}
          />
        );
      })}
      {c.note && <DetailRow theme={theme} color={theme.accent} label={c.note.text} sub="Note" emoji="📝" />}
      {!c.holiday && c.activeCategories.length === 0 && !c.note && (
        <div style={{ color: theme.textSecondary, fontSize: 14, padding: '8px 0' }}>Rien de prévu.</div>
      )}
    </div>
  );
});
function DetailRow({ theme, color, label, sub, emoji }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${theme.gridLight}` }}>
      {emoji ? <span style={{ fontSize: 14, width: 10 }}>{emoji}</span>
              : <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, color: theme.textPrimary, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

// ============================================================
// LISTE COMPLÈTE
// ============================================================
function ListSheet({ state, setState, theme, onClose, isMobile }) {
  const delCategory = (id) => {
    if (!confirm('Supprimer cette catégorie et tout ce qui y est associé ?')) return;
    setState(s => ({ ...s,
      categories: s.categories.filter(c => c.id !== id),
      recurringRules: s.recurringRules.filter(r => r.categoryId !== id),
      events: s.events.filter(e => e.categoryId !== id),
    }));
  };
  const delEvent = (id) => setState(s => ({ ...s, events: s.events.filter(e => e.id !== id) }));
  const delRule = (id) => setState(s => ({ ...s, recurringRules: s.recurringRules.filter(r => r.id !== id) }));
  const delNote = (id) => setState(s => ({ ...s, dayNotes: s.dayNotes.filter(n => n.id !== id) }));
  const content = (
    <div style={{ padding: 20, fontSize: 13, color: theme.textPrimary }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Tout afficher</h3>
        <button onClick={onClose} style={{ background: theme.gridLight, border: 'none', cursor: 'pointer', width: 30, height: 30, borderRadius: 15, display: 'grid', placeItems: 'center', color: theme.textSecondary }}><X size={16} /></button>
      </div>
      <Section title={`Catégories (${state.categories.length})`} theme={theme}>
        {state.categories.length === 0 && <Empty theme={theme} />}
        {state.categories.map(c => {
          const sub = c.kind === 'work' ? (c.subkind === 'stage' ? 'Stage' : 'Travail')
                    : c.kind === 'vacation' ? 'Vacances' : 'Neutre';
          return (
            <ListRow key={c.id} theme={theme}
              dot={c.pillColor || c.cellColor || theme.accent}
              ring={c.cellColor && !c.pillColor ? theme.textSecondary : null}
              label={c.name} sub={sub}
              onDelete={() => delCategory(c.id)} />
          );
        })}
      </Section>
      <Section title={`Règles récurrentes (${state.recurringRules.length})`} theme={theme}>
        {state.recurringRules.length === 0 && <Empty theme={theme} />}
        {state.recurringRules.map(r => {
          const cat = state.categories.find(c => c.id === r.categoryId);
          if (!cat) return null;
          const days = r.weekdays.map(w => FR_DAYS_FULL[w].toLowerCase()).join(', ');
          return (
            <ListRow key={r.id} theme={theme}
              dot={cat.pillColor || cat.cellColor || theme.accent}
              label={cat.name}
              sub={`${days}${r.endDate ? ` jusqu'au ${fmtFr(r.endDate)}` : ''}${r.exceptions && r.exceptions.length ? ` · ${r.exceptions.length} exception(s)` : ''}`}
              onDelete={() => delRule(r.id)} />
          );
        })}
      </Section>
      <Section title={`Événements (${state.events.length})`} theme={theme}>
        {state.events.length === 0 && <Empty theme={theme} />}
        {state.events.map(e => {
          const cat = state.categories.find(c => c.id === e.categoryId);
          return (
            <ListRow key={e.id} theme={theme}
              dot={cat ? (cat.pillColor || cat.cellColor || theme.accent) : theme.accent}
              ring={cat && cat.cellColor && !cat.pillColor ? theme.textSecondary : null}
              label={e.label}
              sub={`${fmtFr(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ` → ${fmtFr(e.endDate)}` : ''}`}
              onDelete={() => delEvent(e.id)} />
          );
        })}
      </Section>
      <Section title={`Notes (${state.dayNotes.length})`} theme={theme}>
        {state.dayNotes.length === 0 && <Empty theme={theme} />}
        {state.dayNotes.map(n => (
          <ListRow key={n.id} theme={theme} dot={theme.accent}
            label={n.text} sub={fmtFr(n.date)}
            onDelete={() => delNote(n.id)} />
        ))}
      </Section>
    </div>
  );
  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: theme.cardBg, width: '100%', maxHeight: '85vh',
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 20px)',
        }}>
          <div style={{ display: 'grid', placeItems: 'center', paddingTop: 8 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: theme.grid }} />
          </div>
          {content}
        </div>
      </div>
    );
  }
  return <div style={{ width: 320, background: theme.cardBg, borderLeft: `1px solid ${theme.grid}`, overflowY: 'auto' }}>{content}</div>;
}

function Section({ title, children, theme }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: theme.textSecondary, marginBottom: 8, fontWeight: 600 }}>{title}</h4>
      {children}
    </section>
  );
}
function Empty({ theme }) { return <p style={{ color: theme.textSecondary, fontSize: 13, margin: '6px 0', opacity: 0.6 }}>Aucun</p>; }
function ListRow({ theme, dot, ring, label, sub, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${theme.gridLight}` }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot, border: ring ? `1px solid ${ring}` : 'none', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, color: theme.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 1 }}>{sub}</div>
      </div>
      <button onClick={onDelete} style={{ background: theme.gridLight, border: 'none', cursor: 'pointer', width: 30, height: 30, borderRadius: 15, display: 'grid', placeItems: 'center', color: theme.textSecondary }}><Trash2 size={14} /></button>
    </div>
  );
}

// ============================================================
// RÉGLAGES (avec période vacances customisable)
// ============================================================
function SettingsSheet({ state, setState, theme, onClose, isMobile, counts }) {
  const setS = (patch) => setState(s => ({ ...s, settings: { ...s.settings, ...patch } }));
  const isCustom = typeof state.settings.vacationPeriod === 'object' && state.settings.vacationPeriod !== null;
  const period = state.settings.vacationPeriod;

  const setCustomPeriod = (partial) => {
    const cur = isCustom ? period : { startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 };
    setS({ vacationPeriod: { ...cur, ...partial } });
  };

  const content = (
    <div style={{ padding: 20, fontSize: 14, color: theme.textPrimary }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Réglages</h3>
        <button onClick={onClose} style={{ background: theme.gridLight, border: 'none', cursor: 'pointer', width: 30, height: 30, borderRadius: 15, display: 'grid', placeItems: 'center', color: theme.textSecondary }}><X size={16} /></button>
      </div>

      <Section title="Thème" theme={theme}>
        <SegmentedControl theme={theme} value={state.settings.theme} onChange={v => setS({ theme: v })}
          options={[
            { value: 'auto', label: 'Auto', icon: Monitor },
            { value: 'light', label: 'Clair', icon: Sun },
            { value: 'dark', label: 'Sombre', icon: Moon },
          ]} />
      </Section>

      <Section title="Décompte des vacances" theme={theme}>
        <SegmentedControl theme={theme}
          value={isCustom ? 'custom' : period}
          onChange={v => {
            if (v === 'custom') setCustomPeriod({});
            else setS({ vacationPeriod: v });
          }}
          options={[
            { value: 'civil', label: 'Année civile (1er jan – 31 déc)' },
            { value: 'university', label: 'Année universitaire (nov – oct)' },
            { value: 'custom', label: 'Personnalisée…' },
          ]} />
        {isCustom && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>Du</span>
            <DayMonthInput theme={theme} day={period.startDay} month={period.startMonth}
              onChange={(d,m) => setCustomPeriod({ startDay: d, startMonth: m })} />
            <span style={{ fontSize: 13 }}>au</span>
            <DayMonthInput theme={theme} day={period.endDay} month={period.endMonth}
              onChange={(d,m) => setCustomPeriod({ endDay: d, endMonth: m })} />
          </div>
        )}
        <CountSummary theme={theme} title="Total" value={`${counts.vacationTotal} jours`} />
      </Section>

      <Section title="Décompte des stages" theme={theme}>
        {Object.entries(counts.stages).length === 0
          ? <Empty theme={theme} />
          : (
            <>
              {Object.entries(counts.stages).map(([name, n]) => (
                <CountRow key={name} theme={theme}
                  color={counts.colors[name] || theme.accent}
                  label={name} value={`${n} jours`} />
              ))}
              <CountSummary theme={theme} title="Total" value={`${counts.stagesTotal} jours`} />
            </>
          )}
      </Section>

      <Section title="Décompte du travail" theme={theme}>
        {Object.entries(counts.work).length === 0
          ? <Empty theme={theme} />
          : (
            <>
              {Object.entries(counts.work).map(([name, n]) => (
                <CountRow key={name} theme={theme}
                  color={counts.colors[name] || theme.accent}
                  label={name} value={`${n} jours`} />
              ))}
              <CountSummary theme={theme} title="Total" value={`${counts.workTotal} jours`} />
            </>
          )}
      </Section>

      <DiagnosticSection theme={theme} />

      <Section title="Données" theme={theme}>
        <button onClick={() => {
          if (confirm('Effacer TOUTES tes données ?')) { setState(DEFAULT_STATE); onClose(); }
        }} style={{
          background: theme.error, color: theme.errorText, border: 'none', borderRadius: 8,
          padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}>Tout effacer</button>
      </Section>
    </div>
  );
  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: theme.cardBg, width: '100%', maxHeight: '85vh',
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom, 20px)',
        }}>
          <div style={{ display: 'grid', placeItems: 'center', paddingTop: 8 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: theme.grid }} />
          </div>
          {content}
        </div>
      </div>
    );
  }
  return <div style={{ width: 360, background: theme.cardBg, borderLeft: `1px solid ${theme.grid}`, overflowY: 'auto' }}>{content}</div>;
}

function DiagnosticSection({ theme }) {
  const m = getMeasures();
  const row = (label, value) => <CountRow key={label} theme={theme} color={theme.textSecondary} label={label} value={value} />;
  return (
    <Section title="Diagnostic de vitesse" theme={theme}>
      {row('Ouverture de l\'app', m.open === null ? '—' : `${m.open} ms`)}
      {row('Changements de mois', m.month.length ? m.month.map(v => `${v}`).join(' · ') + ' ms' : '—')}
      {m.phrase.length === 0 && row('Phrases envoyées', '—')}
      {m.phrase.map((p, i) => {
        const t = p.timing;
        const parts = p.error ? ['erreur'] : [
          t && `Gemini ${t.geminiMs} ms`,
          t && `serveur ${t.serverMs} ms`,
          t && t.thoughtsTokens > 0 && `${t.thoughtsTokens} jetons de réflexion`,
          t && t.cold && 'démarrage à froid',
          `affichage ${p.appMs} ms`,
        ].filter(Boolean);
        return (
          <div key={i} style={{ padding: '6px 0', borderBottom: `1px solid ${theme.gridLight}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>Phrase {i + 1}</span>
              <span style={{ color: theme.textSecondary, fontWeight: 500 }}>{p.networkMs} ms au total</span>
            </div>
            <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{parts.join(' · ')}</div>
          </div>
        );
      })}
      <p style={{ fontSize: 12, color: theme.textSecondary, margin: '8px 0 0' }}>
        Mesures de cette session uniquement, gardées sur l'appareil. Les plus récentes en premier.
      </p>
    </Section>
  );
}

function DayMonthInput({ theme, day, month, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <select value={day} onChange={e => onChange(parseInt(e.target.value), month)} style={selectStyle(theme)}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={month} onChange={e => onChange(day, parseInt(e.target.value))} style={selectStyle(theme)}>
        {FR_MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
    </div>
  );
}
const selectStyle = (theme) => ({
  padding: '6px 8px', fontSize: 13, border: `1px solid ${theme.grid}`,
  borderRadius: 6, background: theme.cardBg, color: theme.textPrimary,
});

function CountRow({ theme, color, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: `1px solid ${theme.gridLight}` }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
      <span style={{ fontSize: 13, color: theme.textSecondary, fontWeight: 500 }}>{value}</span>
    </div>
  );
}
function CountSummary({ theme, title, value }) {
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.gridLight}`, display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600 }}>
      <span>{title}</span>
      <span style={{ color: theme.accent }}>{value}</span>
    </div>
  );
}

function SegmentedControl({ theme, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map(opt => {
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: active ? theme.accent : theme.gridLight,
            color: active ? 'white' : theme.textPrimary,
            border: 'none', borderRadius: 8, padding: '10px 14px',
            cursor: 'pointer', fontSize: 14, textAlign: 'left',
          }}>
            {Icon && <Icon size={16} />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// COMPTEURS
// ============================================================
function getVacationPeriodBounds(setting, refDate) {
  const y = refDate.getFullYear();
  if (typeof setting === 'object' && setting !== null) {
    const start = new Date(y, setting.startMonth - 1, setting.startDay);
    let endY = y;
    // si la fin est avant le début dans l'année, c'est qu'elle est l'année d'après
    if (setting.endMonth < setting.startMonth || (setting.endMonth === setting.startMonth && setting.endDay < setting.startDay)) {
      // période qui chevauche : si on est avant le début, la période a commencé l'an dernier
      if (refDate < start) {
        return { start: new Date(y - 1, setting.startMonth - 1, setting.startDay), end: new Date(y, setting.endMonth - 1, setting.endDay) };
      } else {
        return { start, end: new Date(y + 1, setting.endMonth - 1, setting.endDay) };
      }
    }
    return { start, end: new Date(y, setting.endMonth - 1, setting.endDay) };
  }
  if (setting === 'university') {
    if (refDate.getMonth() >= 10) return { start: new Date(y, 10, 1), end: new Date(y + 1, 9, 31) };
    return { start: new Date(y - 1, 10, 1), end: new Date(y, 9, 31) };
  }
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
}

function computeCounts(state, refDate) {
  const { start, end } = getVacationPeriodBounds(state.settings.vacationPeriod, refDate);

  // Vacances par mois
  const vacationCats = state.categories.filter(c => c.kind === 'vacation');
  const vacIds = new Set(vacationCats.map(c => c.id));
  const vacByMonth = {};
  let vacationTotal = 0;
  for (const e of state.events) {
    if (!vacIds.has(e.categoryId)) continue;
    const eStart = parseDate(e.startDate);
    const eEnd = parseDate(e.endDate || e.startDate);
    const it = new Date(Math.max(eStart, start));
    const itEnd = new Date(Math.min(eEnd, end));
    while (it <= itEnd) {
      const m = it.getMonth();
      vacByMonth[m] = (vacByMonth[m] || 0) + 1;
      vacationTotal++;
      it.setDate(it.getDate() + 1);
    }
  }

  // Travail / stages : on compte sur l'année civile en cours pour rester simple
  const y = refDate.getFullYear();
  const wkStart = new Date(y, 0, 1);
  const wkEnd = new Date(y, 11, 31);
  const stages = {}, work = {}, colors = {};
  const workCats = [];
  for (const c of state.categories) {
    if (c.kind !== 'work') continue;
    if (c.subkind === 'stage') stages[c.name] = 0; else work[c.name] = 0;
    colors[c.name] = c.pillColor || c.cellColor;
    // Pré-tri une seule fois (au lieu de re-filtrer toutes les listes pour chacun des 365 jours)
    workCats.push({
      cat: c,
      rules: state.recurringRules.filter(r => r.categoryId === c.id)
        .map(r => ({ ...r, exceptions: new Set(r.exceptions || []) })),
      events: state.events.filter(e => e.categoryId === c.id),
    });
  }
  const vacEvents = state.events.filter(e => vacIds.has(e.categoryId));
  const it = new Date(wkStart);
  while (it <= wkEnd) {
    const wd = mondayIdx(it);
    const ds = fmtDate(it);
    const hol = isHoliday(it);

    // Si l'utilisateur est en vacances ce jour, on ne compte pas
    const inVac = vacEvents.some(e => ds >= e.startDate && ds <= (e.endDate || e.startDate));

    if (!hol && !inVac) {
      for (const { cat, rules, events } of workCats) {
        // 1. Vérifier les règles récurrentes
        let active = false;
        for (const r of rules) {
          if (r.startDate && ds < r.startDate) continue;
          if (r.endDate && ds > r.endDate) continue;
          if (r.weekdays && !r.weekdays.includes(wd)) continue;
          if (r.exceptions.has(ds)) continue;
          active = true; break;
        }
        // 2. Vérifier aussi les événements ponctuels (jours ajoutés un par un)
        if (!active) {
          active = events.some(e => ds >= e.startDate && ds <= (e.endDate || e.startDate));
        }
        if (active) {
          if (cat.subkind === 'stage') stages[cat.name]++;
          else work[cat.name]++;
        }
      }
    }
    it.setDate(it.getDate() + 1);
  }
  const stagesTotal = Object.values(stages).reduce((a,b)=>a+b, 0);
  const workTotal = Object.values(work).reduce((a,b)=>a+b, 0);
  return { vacByMonth, vacationTotal, stages, stagesTotal, work, workTotal, colors, periodStart: start, periodEnd: end };
}

// ============================================================
// APPEL API
// ============================================================
async function callAI(instruction, categories) {
  const r = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction, categories, today: fmtDate(new Date()) }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`HTTP ${r.status}: ${t}`); }
  return r.json();
}

// ============================================================
// APPLICATION DES ACTIONS (avec nouvelle action add_exceptions_to_category)
// ============================================================
function applyActions(state, actions) {
  let s = {
    ...state,
    categories: [...state.categories],
    recurringRules: state.recurringRules.map(r => ({ ...r, exceptions: [...(r.exceptions || [])] })),
    events: [...state.events],
    dayNotes: [...state.dayNotes],
  };
  let changed = false;
  const norm = str => (str || '').toLowerCase().trim();
  const findCat = (name) => s.categories.find(c => norm(c.name) === norm(name));

  for (const a of actions || []) {
    switch (a.type) {
      case 'create_category': {
        const existing = findCat(a.name);
        if (existing) {
          if (a.pillColor !== undefined) existing.pillColor = a.pillColor;
          if (a.cellColor !== undefined) existing.cellColor = a.cellColor;
          if (a.kind !== undefined) existing.kind = a.kind;
          if (a.subkind !== undefined) existing.subkind = a.subkind;
        } else {
          s.categories.push({
            id: uid('cat'),
            name: a.name,
            pillColor: a.pillColor || null,
            cellColor: a.cellColor || null,
            kind: a.kind || 'neutral',
            subkind: a.subkind || null,
          });
        }
        changed = true;
        break;
      }
      case 'update_category': {
        const cat = findCat(a.name);
        if (cat) {
          if (a.pillColor !== undefined) cat.pillColor = a.pillColor;
          if (a.cellColor !== undefined) cat.cellColor = a.cellColor;
          if (a.kind !== undefined) cat.kind = a.kind;
          if (a.subkind !== undefined) cat.subkind = a.subkind;
          if (a.newName !== undefined) cat.name = a.newName;
          changed = true;
        }
        break;
      }
      case 'delete_category': {
        const cat = findCat(a.name);
        if (cat) {
          s.categories = s.categories.filter(c => c.id !== cat.id);
          s.recurringRules = s.recurringRules.filter(r => r.categoryId !== cat.id);
          s.events = s.events.filter(e => e.categoryId !== cat.id);
          changed = true;
        }
        break;
      }
      case 'add_recurring': {
        const cat = findCat(a.categoryName);
        if (cat) {
          s.recurringRules.push({
            id: uid('rule'),
            categoryId: cat.id,
            weekdays: a.weekdays || [],
            startDate: a.startDate || null,
            endDate: a.endDate || null,
            exceptions: a.exceptions || [],
          });
          changed = true;
        }
        break;
      }
      case 'add_exceptions_to_category': {
        const cat = findCat(a.categoryName);
        if (cat) {
          const start = parseDate(a.start);
          const end = parseDate(a.end);
          const exceptions = [];
          const it = new Date(start);
          while (it <= end) { exceptions.push(fmtDate(it)); it.setDate(it.getDate() + 1); }
          const rules = s.recurringRules.filter(r => r.categoryId === cat.id);
          for (const r of rules) {
            for (const ex of exceptions) {
              if (!r.exceptions.includes(ex)) r.exceptions.push(ex);
            }
          }
          if (rules.length > 0) changed = true;
        }
        break;
      }
      case 'remove_recurring': {
        const cat = findCat(a.categoryName);
        if (cat) {
          const before = s.recurringRules.length;
          s.recurringRules = s.recurringRules.filter(r => r.categoryId !== cat.id);
          if (s.recurringRules.length !== before) changed = true;
        }
        break;
      }
      case 'add_event': {
        let cat = findCat(a.categoryName);
        if (!cat) {
          cat = {
            id: uid('cat'),
            name: a.categoryName || 'Sans catégorie',
            pillColor: '#007AFF',
            cellColor: null,
            kind: 'neutral',
            subkind: null,
          };
          s.categories.push(cat);
        }
        s.events.push({
          id: uid('evt'),
          categoryId: cat.id,
          label: a.label || a.categoryName,
          startDate: a.startDate,
          endDate: a.endDate || a.startDate,
        });
        changed = true;
        break;
      }
      case 'remove_event': {
        const before = s.events.length;
        if (a.date) {
          s.events = s.events.filter(e => !(
            norm(e.label).includes(norm(a.label)) &&
            a.date >= e.startDate && a.date <= (e.endDate || e.startDate)
          ));
        } else {
          s.events = s.events.filter(e => !norm(e.label).includes(norm(a.label)));
        }
        if (s.events.length !== before) changed = true;
        break;
      }
      case 'add_note': {
        s.dayNotes.push({ id: uid('note'), date: a.date, text: a.text });
        changed = true;
        break;
      }
      case 'remove_note': {
        const before = s.dayNotes.length;
        s.dayNotes = s.dayNotes.filter(n => n.date !== a.date);
        if (s.dayNotes.length !== before) changed = true;
        break;
      }
      case 'update_settings': {
        s.settings = { ...s.settings };
        if (a.vacationPeriod !== undefined) s.settings.vacationPeriod = a.vacationPeriod;
        if (a.theme !== undefined) s.settings.theme = a.theme;
        changed = true;
        break;
      }
    }
  }
  return { newState: s, changed };
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const isMobile = useIsMobile();
  const [state, setState] = useState(() => loadState(DEFAULT_STATE));
  const theme = useTheme(state.settings.theme);
  const [history, setHistory] = useState([]);
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selected, setSelected] = useState(fmtDate(today));
  const [slideDir, setSlideDir] = useState(0);

  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => {
    recordOpen();
    // La transition de couleur du fond n'est activée qu'après le premier affichage
    requestAnimationFrame(() => document.body.classList.add('ready'));
  }, []);

  const lastSubmitRef = useRef(0);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || processing) return;
    // Protection double-clic : ignore si une soumission a eu lieu il y a moins de 500ms
    const now = Date.now();
    if (now - lastSubmitRef.current < 500) return;
    lastSubmitRef.current = now;

    setProcessing(true);
    setFeedback(null);
    const t0 = performance.now();
    try {
      const result = await callAI(text, state.categories);
      const tNet = performance.now();
      const { newState, changed } = applyActions(state, result.actions);
      setHistory(h => [{ prevState: state, instruction: text, feedback: result.feedback }, ...h].slice(0, 20));
      setState(newState);
      const ecoSuffix = result.usedFallback ? ' · ⚡ mode éco' : '';
      if (!changed && (!result.actions || result.actions.length === 0)) {
        setFeedback({ type: 'err', text: (result.feedback || 'Rien trouvé.') + ecoSuffix });
      } else {
        setFeedback({ type: 'ok', text: (result.feedback || 'Mis à jour.') + ecoSuffix });
      }
      setInput('');
      recordPhrase({ networkMs: Math.round(tNet - t0), timing: result.timing || null }, tNet);
    } catch (e) {
      recordPhrase({ networkMs: Math.round(performance.now() - t0), error: true });
      setFeedback({ type: 'err', text: `Erreur : ${e.message}` });
    } finally {
      setProcessing(false);
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    const [last, ...rest] = history;
    setState(last.prevState);
    setHistory(rest);
    setFeedback({ type: 'ok', text: 'Annulé.' });
  };

  // Changement de mois immédiat (l'ancienne version attendait 120 ms avant de
  // changer, puis rejouait 3 rendus complets). L'animation est jouée par le CSS.
  const animateMonthChange = (delta) => {
    const t0 = performance.now();
    let m = month + delta, y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setSlideDir(delta);
    setMonth(m); setYear(y);
    if (isMobile) setSelected(`${y}-${pad(m)}-01`);
    recordMonthChange(t0);
  };

  const goToMonth = (y, m) => {
    if (y === year && m === month) return;
    const t0 = performance.now();
    setSlideDir(y * 12 + m > year * 12 + month ? 1 : -1);
    setYear(y); setMonth(m);
    if (isMobile) setSelected(`${y}-${pad(m)}-01`);
    recordMonthChange(t0);
  };

  const swipeHandlers = useSwipe(
    () => animateMonthChange(1),
    () => animateMonthChange(-1),
  );

  const counts = useMemo(() => computeCounts(state, today), [state, today]);
  const closeDetail = useCallback(() => setSelected(null), []);

  // Liste de mois à proposer dans le select (24 mois autour de l'année courante)
  const monthOptions = useMemo(() => {
    const opts = [];
    const baseY = today.getFullYear();
    for (let y = baseY - 1; y <= baseY + 2; y++) {
      for (let m = 1; m <= 12; m++) opts.push({ y, m });
    }
    return opts;
  }, [today]);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif',
      color: theme.textPrimary, minHeight: '100vh', background: theme.appBg,
      display: 'flex', flexDirection: 'column',
      paddingTop: isMobile ? 'env(safe-area-inset-top, 0)' : 0,
      transition: 'background 0.3s, color 0.3s',
    }}>
      {/* HEADER */}
      <header style={{
        padding: isMobile ? '12px 16px 10px' : '16px 24px',
        background: theme.appBg,
        borderBottom: isMobile ? 'none' : `1px solid ${theme.grid}`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? 8 : 0 }}>
          <div>
            {/* Sélecteur de mois en dropdown */}
            <select value={`${year}-${month}`} onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              goToMonth(y, m);
            }} style={{
              border: 'none', background: 'transparent',
              fontSize: isMobile ? 22 : 18,
              fontWeight: isMobile ? 700 : 500,
              color: theme.textPrimary,
              letterSpacing: isMobile ? -0.4 : 0.3,
              cursor: 'pointer', padding: 0,
              appearance: 'none', WebkitAppearance: 'none',
              fontFamily: 'inherit',
            }}>
              {monthOptions.map(({ y, m }) => (
                <option key={`${y}-${m}`} value={`${y}-${m}`}>{FR_MONTHS[m - 1]} {y}</option>
              ))}
            </select>
            {isMobile && (
              <p style={{ margin: 0, fontSize: 14, color: theme.textSecondary, fontWeight: 400 }}>
                {(() => {
                  const t = new Date();
                  return `Aujourd'hui : ${fmtFr(fmtDate(t))}`;
                })()}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8 }}>
            <IconButton onClick={undo} disabled={history.length === 0} title="Annuler" iconColor={theme.accent} mobile={isMobile}>
              <RotateCcw size={isMobile ? 18 : 15} />
            </IconButton>
            <IconButton onClick={() => setShowSheet(true)} title="Tout afficher" iconColor={theme.accent} mobile={isMobile}>
              <List size={isMobile ? 19 : 16} />
            </IconButton>
            <IconButton onClick={() => setShowSettings(true)} title="Réglages" iconColor={theme.accent} mobile={isMobile}>
              <SettingsIcon size={isMobile ? 18 : 15} />
            </IconButton>
          </div>
        </div>
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <button onClick={() => animateMonthChange(-1)} style={navBtn(theme)}>
              <ChevronLeft size={20} /> {FR_MONTHS[(month - 2 + 12) % 12]}
            </button>
            <button onClick={() => animateMonthChange(1)} style={navBtn(theme)}>
              {FR_MONTHS[month % 12]} <ChevronRight size={20} />
            </button>
          </div>
        )}
      </header>

      <main {...(isMobile ? swipeHandlers : {})} style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '12px 12px 16px' : 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!isMobile && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => animateMonthChange(-1)} style={btnDesktop(theme)}><ChevronLeft size={16} /></button>
              <h2 style={{ margin: 0, fontSize: 22, color: theme.textPrimary, fontWeight: 400 }}>{FR_MONTHS[month - 1]} {year}</h2>
              <button onClick={() => animateMonthChange(1)} style={btnDesktop(theme)}><ChevronRight size={16} /></button>
            </div>
          )}

          <MonthGrid year={year} month={month} state={state} theme={theme}
            isMobile={isMobile} selected={selected} setSelected={setSelected} slideDir={slideDir} />

          {selected && (
            <DayDetail dateStr={selected} state={state} theme={theme}
              isMobile={isMobile} onClose={isMobile ? closeDetail : null} />
          )}

          {/* Compteur stages */}
          {Object.keys(counts.stages).length > 0 && (
            <CountBlock theme={theme} isMobile={isMobile}
              title={`Stages ${today.getFullYear()}`}
              items={Object.entries(counts.stages).map(([name, n]) => ({
                name, value: n, color: counts.colors[name] || theme.accent,
              }))}
              total={counts.stagesTotal} />
          )}

          {/* Compteur travail régulier */}
          {Object.keys(counts.work).length > 0 && (
            <CountBlock theme={theme} isMobile={isMobile}
              title={`Travail ${today.getFullYear()}`}
              items={Object.entries(counts.work).map(([name, n]) => ({
                name, value: n, color: counts.colors[name] || theme.accent,
              }))}
              total={counts.workTotal} />
          )}

          {/* Compteur vacances */}
          {counts.vacationTotal > 0 && (
            <CountBlock theme={theme} isMobile={isMobile}
              title={`Vacances (${typeof state.settings.vacationPeriod === 'object' ? 'période personnalisée' : (state.settings.vacationPeriod === 'university' ? 'année universitaire' : 'année civile')})`}
              items={Object.entries(counts.vacByMonth).sort(([a],[b])=>parseInt(a)-parseInt(b)).map(([m,n]) => ({
                name: FR_MONTHS[parseInt(m)].slice(0, 3), value: `${n}j`, color: '#FFB5B5',
              }))}
              total={`${counts.vacationTotal} jours`} />
          )}

          {state.categories.length === 0 && (
            <div style={{
              padding: '20px 18px', background: theme.cardBg, borderRadius: 14,
              fontSize: 14, color: theme.textPrimary, border: `1px dashed ${theme.grid}`, lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>👋 Bienvenue dans Planning</div>
              <div style={{ color: theme.textSecondary, marginBottom: 10 }}>
                Crée tes catégories en écrivant naturellement dans la zone de chat en bas. Exemples :
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, color: theme.textSecondary, fontSize: 13 }}>
                <li><em>HAD en mauve les lundis</em></li>
                <li><em>sport en rouge tous les vendredis sauf le 03/07</em></li>
                <li><em>vacances été du 1 au 15 août</em></li>
                <li><em>Topo le 26/05</em></li>
                <li><em>note pour le 10 juin : appeler le secrétariat</em></li>
              </ul>
            </div>
          )}
        </div>
        {!isMobile && showSheet && <ListSheet state={state} setState={setState} theme={theme} onClose={() => setShowSheet(false)} isMobile={false} />}
        {!isMobile && showSettings && <SettingsSheet state={state} setState={setState} theme={theme} onClose={() => setShowSettings(false)} isMobile={false} counts={counts} />}
      </main>
      {isMobile && showSheet && <ListSheet state={state} setState={setState} theme={theme} onClose={() => setShowSheet(false)} isMobile={true} />}
      {isMobile && showSettings && <SettingsSheet state={state} setState={setState} theme={theme} onClose={() => setShowSettings(false)} isMobile={true} counts={counts} />}

      <footer style={{
        background: theme.cardBg, borderTop: `1px solid ${theme.grid}`,
        padding: isMobile ? '10px 12px' : 16,
        paddingBottom: isMobile ? 'calc(10px + env(safe-area-inset-bottom, 0px))' : 16,
        position: 'sticky', bottom: 0, zIndex: 5,
      }}>
        {feedback && (
          <div style={{
            marginBottom: 10, padding: '8px 12px', borderRadius: 10, fontSize: 13,
            background: feedback.type === 'ok' ? theme.success : theme.error,
            color: feedback.type === 'ok' ? theme.successText : theme.errorText,
          }}>{feedback.text}</div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={processing}
            placeholder={isMobile ? "HAD en mauve les lundis…" : 'Décris ce que tu veux ajouter ou modifier…'}
            rows={1}
            style={{
              flex: 1, resize: 'none',
              border: `1px solid ${theme.grid}`, borderRadius: 18,
              padding: isMobile ? '10px 16px' : '12px 14px',
              fontSize: 16, fontFamily: 'inherit', outline: 'none',
              color: theme.textPrimary, maxHeight: 120, background: theme.appBg,
            }}
          />
          <button onClick={handleSubmit} disabled={!input.trim() || processing} style={{
            height: 40, width: 40, borderRadius: 20,
            background: !input.trim() || processing ? theme.grid : theme.accent,
            color: 'white', border: 'none',
            cursor: !input.trim() || processing ? 'not-allowed' : 'pointer',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>{processing ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}</button>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Composants utilitaires
// ============================================================
function CountBlock({ theme, isMobile, title, items, total }) {
  return (
    <div style={{
      padding: isMobile ? '12px 16px' : '12px 14px',
      background: theme.cardBg, borderRadius: 14,
      fontSize: 13, color: theme.textPrimary,
      boxShadow: '0 1px 0 rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: theme.textSecondary, textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {items.map(({ name, value, color }) => (
          <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <strong>{name}</strong> : {value}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', color: theme.textSecondary, fontWeight: 500 }}>Total : {total}</span>
      </div>
    </div>
  );
}

function IconButton({ children, onClick, disabled, title, iconColor, mobile }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      background: 'transparent', border: 'none', borderRadius: mobile ? 8 : 6,
      width: mobile ? 38 : 32, height: mobile ? 38 : 32,
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'grid', placeItems: 'center',
      color: disabled ? '#ccc' : iconColor,
    }}>{children}</button>
  );
}
const btnDesktop = (theme) => ({
  background: theme.cardBg, border: `1px solid ${theme.grid}`, borderRadius: 6,
  width: 32, height: 32, cursor: 'pointer', display: 'grid', placeItems: 'center', color: theme.textSecondary,
});
const navBtn = (theme) => ({
  background: 'transparent', border: 'none', color: theme.accent, padding: '6px 4px',
  display: 'flex', alignItems: 'center', gap: 2, fontSize: 15, cursor: 'pointer', fontWeight: 500,
});
