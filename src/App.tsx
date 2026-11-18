import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Activity, Album, AudioLines, Check, ChevronDown, Disc3, FolderMusic,
  Headphones, Heart, Home, Library, ListMusic, Music2, Palette, Pause,
  Play, Plus, Search, Settings2, SlidersHorizontal, Sparkles, Volume2,
  Wifi, X
} from 'lucide-react'

type Theme = 'dark' | 'light' | 'system'
type Accent = 'violet' | 'blue' | 'mint' | 'rose' | 'amber'
type Preferences = { theme: Theme; accent: Accent; compact: boolean; sidebar: boolean; visualizer: boolean }
const defaults: Preferences = { theme: 'dark', accent: 'violet', compact: false, sidebar: true, visualizer: true }
const accents: { id: Accent; label: string; color: string }[] = [
  { id: 'violet', label: 'Electric violet', color: '#a78bfa' },
  { id: 'blue', label: 'Ocean blue', color: '#60a5fa' },
  { id: 'mint', label: 'Fresh mint', color: '#5eead4' },
  { id: 'rose', label: 'Soft rose', color: '#fb7185' },
  { id: 'amber', label: 'Warm amber', color: '#fbbf24' },
]

function readPreferences(): Preferences {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('resonance-preferences') || '{}') } }
  catch { return defaults }
}

export default function App() {
  const [prefs, setPrefs] = useState<Preferences>(readPreferences)
  const [page, setPage] = useState<'home' | 'library' | 'playlists' | 'settings'>('home')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('resonance-api-url') || 'http://localhost:4317')
  const [serverState, setServerState] = useState<'checking' | 'online' | 'offline'>('checking')
  const [query, setQuery] = useState('')
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    localStorage.setItem('resonance-preferences', JSON.stringify(prefs))
    document.documentElement.dataset.theme = prefs.theme
    document.documentElement.dataset.accent = prefs.accent
    document.documentElement.dataset.density = prefs.compact ? 'compact' : 'comfortable'
  }, [prefs])

  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const response = await fetch(apiUrl.replace(/\/$/, '') + '/api/health', { signal: AbortSignal.timeout(2500) })
        if (active) setServerState(response.ok ? 'online' : 'offline')
      } catch { if (active) setServerState('offline') }
    }
    check()
    const timer = window.setInterval(check, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [apiUrl])

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPrefs(current => ({ ...current, [key]: value }))
  const currentAccent = useMemo(() => accents.find(item => item.id === prefs.accent)!, [prefs.accent])

  const saveApiUrl = () => {
    const clean = apiUrl.trim().replace(/\/$/, '')
    localStorage.setItem('resonance-api-url', clean)
    setApiUrl(clean)
  }

  return (
    <div className={`app-shell ${prefs.sidebar ? '' : 'sidebar-hidden'}`}>
      {prefs.sidebar && <aside className="sidebar">
        <button className="brand" onClick={() => setPage('home')} aria-label="На главную">
          <span className="brand-mark"><AudioLines size={22}/></span>
          <span><strong>resonance</strong><small>YOUR MUSIC SPACE</small></span>
        </button>
        <div className="side-label">МЕНЮ</div>
        <nav className="nav-list">
          <NavButton active={page === 'home'} icon={<Home size={18}/>} label="Главная" onClick={() => setPage('home')}/>
          <NavButton active={page === 'library'} icon={<Library size={18}/>} label="Моя библиотека" onClick={() => setPage('library')}/>
          <NavButton active={page === 'playlists'} icon={<ListMusic size={18}/>} label="Плейлисты" onClick={() => setPage('playlists')}/>
        </nav>
        <div className="side-label collection-label">ТВОЯ КОЛЛЕКЦИЯ</div>
        <div className="collection-hint"><span className="tiny-dot"/> Музыка появится после подключения сервера</div>
        <div className="sidebar-bottom">
          <div className="server-mini">
            <span className={`status-dot ${serverState}`}/>
            <span><b>{serverState === 'online' ? 'Сервер доступен' : serverState === 'checking' ? 'Проверяем сервер' : 'Сервер не подключён'}</b><small>Домашняя библиотека</small></span>
          </div>
          <button className="nav-button" onClick={() => setPage('settings')}><Settings2 size={18}/> Настройки</button>
          <div className="profile"><div className="avatar">M</div><span><b>Моя музыка</b><small>Личное пространство</small></span><ChevronDown size={15}/></div>
        </div>
      </aside>}

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>МУЗЫКА</span><i>/</i><b>{page === 'home' ? 'Главная' : page === 'library' ? 'Библиотека' : page === 'playlists' ? 'Плейлисты' : 'Персонализация'}</b></div>
          <div className="top-actions">
            <div className={`connection-pill ${serverState}`}><span className="status-dot"/> {serverState === 'online' ? 'Сервер онлайн' : serverState === 'checking' ? 'Проверка' : 'Нет соединения'}</div>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Открыть настройки дизайна"><Palette size={18}/></button>
            <button className="avatar small-avatar" onClick={() => setPage('settings')}>M</button>
          </div>
        </header>

        {page === 'home' && <section className="content">
          <div className="welcome-row">
            <div><div className="eyebrow"><Sparkles size={14}/> ТВОЁ ЛИЧНОЕ МУЗЫКАЛЬНОЕ ПРОСТРАНСТВО</div><h1>Музыка. <span>Без границ.</span></h1><p className="subtitle">Вся твоя коллекция — в одном красивом пространстве.</p></div>
            <div className="date-chip"><Disc3 size={16}/> YOUR SOUND, YOUR RULES</div>
          </div>
          <section className="hero-card">
            <div className="hero-glow"/><div className="hero-content"><div className="hero-kicker">WELCOME TO RESONANCE</div><h2>Твоя музыка.<br/><em>Твои правила.</em></h2><p>Подключи домашнюю библиотеку и создай пространство, которое звучит по-твоему.</p><button className="primary-button" onClick={() => setPage('settings')}><Settings2 size={17}/> Настроить приложение</button></div>
            <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="vinyl"><div className="vinyl-label"><AudioLines size={34}/></div></div><div className="floating-note note-one">♪</div><div className="floating-note note-two">♫</div></div>
          </section>
          <div className="section-heading"><div><span className="eyebrow">ТВОЯ МУЗЫКА</span><h2>Продолжим звучать</h2></div><button className="text-button" onClick={() => setPage('library')}>Открыть библиотеку <span>↗</span></button></div>
          <div className="empty-library">
            <div className="empty-icon"><FolderMusic size={25}/></div><h3>Здесь скоро будет твоя коллекция</h3><p>Папка <code>C:\Users\makhm\Music</code> пока пуста. Это нормально — сначала подключим сервер, а музыку можно добавить позже.</p><button className="secondary-button" onClick={() => setPage('settings')}><Wifi size={16}/> Подключить музыкальный сервер</button>
          </div>
          <div className="feature-strip"><div><Headphones size={19}/><span><b>Твоя библиотека</b><small>Одна коллекция на всех устройствах</small></span></div><div><Activity size={19}/><span><b>Точный звук</b><small>Эквалайзер и аудионастройки</small></span></div><div><Heart size={19}/><span><b>Твои предпочтения</b><small>Избранное и плейлисты с синхронизацией</small></span></div></div>
        </section>}

        {page === 'library' && <section className="content"><div className="page-title"><div className="eyebrow">ВСЁ СОБРАНО В ОДНОМ МЕСТЕ</div><h1>Моя библиотека</h1><p className="subtitle">Треки, альбомы и исполнители — здесь будет вся твоя музыка.</p></div><div className="toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по библиотеке..."/></div><button className="secondary-button" onClick={() => setPage('settings')}><SlidersHorizontal size={16}/> Источник музыки</button></div><div className="empty-library library-empty"><div className="empty-icon"><Album size={25}/></div><h3>{query ? 'Ничего не найдено' : 'Библиотека пока пуста'}</h3><p>Когда подключим сервер и добавим музыку в домашнюю папку, альбомы появятся здесь автоматически.</p></div></section>}

        {page === 'playlists' && <section className="content"><div className="page-title"><div className="eyebrow">СОБИРАЙ СВОЁ НАСТРОЕНИЕ</div><h1>Плейлисты</h1><p className="subtitle">Твои подборки будут синхронизироваться между устройствами.</p></div><div className="empty-library library-empty"><div className="empty-icon"><ListMusic size={25}/></div><h3>Создадим первый плейлист чуть позже</h3><p>Сначала подключим музыкальную библиотеку, затем добавим редактор плейлистов.</p></div></section>}

        {page === 'settings' && <SettingsPage prefs={prefs} update={update} apiUrl={apiUrl} setApiUrl={setApiUrl} saveApiUrl={saveApiUrl} serverState={serverState}/>}
      </main>

      <footer className="player-bar">
        <div className="now-playing"><div className="mini-cover"><Music2 size={19}/></div><div><b>Ничего не воспроизводится</b><small>Подключи свою библиотеку</small></div><button className="subtle-icon" aria-label="Избранное"><Heart size={17}/></button></div>
        <div className="player-controls"><div className="transport"><button className="subtle-icon" aria-label="Предыдущий трек">|◀</button><button className="play-button" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>{playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button><button className="subtle-icon" aria-label="Следующий трек">▶|</button></div><div className="progress-row"><span>0:00</span><div className="progress-track"><div/></div><span>0:00</span></div></div>
        <div className="player-extras"><button className="subtle-icon" aria-label="Очередь"><ListMusic size={18}/></button><button className="subtle-icon" aria-label="Громкость"><Volume2 size={18}/></button><div className="volume-track"><div/></div></div>
      </footer>

      {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="design-modal" onClick={e => e.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2>Твоё оформление</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={18}/></button></div><ThemeControls prefs={prefs} update={update} accent={currentAccent}/><button className="primary-button modal-done" onClick={() => setSettingsOpen(false)}><Check size={16}/> Готово</button></div></div>}
    </div>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{active && <i/>}</button>
}

function ThemeControls({ prefs, update, accent }: { prefs: Preferences; update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void; accent: { label: string; color: string } }) {
  return <div className="theme-controls">
    <div className="control-group"><div className="control-title"><span>Режим оформления</span><small>Выбери атмосферу приложения</small></div><div className="segmented">{(['dark', 'light', 'system'] as Theme[]).map(theme => <button key={theme} className={prefs.theme === theme ? 'selected' : ''} onClick={() => update('theme', theme)}>{theme === 'dark' ? 'Тёмная' : theme === 'light' ? 'Светлая' : 'Системная'}</button>)}</div></div>
    <div className="control-group"><div className="control-title"><span>Акцентный цвет</span><small>{accent.label}</small></div><div className="swatches">{accents.map(item => <button key={item.id} className={`swatch ${prefs.accent === item.id ? 'chosen' : ''}`} style={{ '--swatch': item.color } as CSSProperties} onClick={() => update('accent', item.id)} aria-label={item.label}>{prefs.accent === item.id && <Check size={16}/>}</button>)}</div></div>
    <div className="control-group toggle-row"><div className="control-title"><span>Компактная библиотека</span><small>Больше элементов на экране</small></div><button className={`toggle ${prefs.compact ? 'on' : ''}`} onClick={() => update('compact', !prefs.compact)} aria-pressed={prefs.compact}><i/></button></div>
    <div className="control-group toggle-row"><div className="control-title"><span>Боковая панель</span><small>Навигация слева</small></div><button className={`toggle ${prefs.sidebar ? 'on' : ''}`} onClick={() => update('sidebar', !prefs.sidebar)} aria-pressed={prefs.sidebar}><i/></button></div>
    <div className="control-group toggle-row"><div className="control-title"><span>Визуальные эффекты</span><small>Декоративная анимация интерфейса</small></div><button className={`toggle ${prefs.visualizer ? 'on' : ''}`} onClick={() => update('visualizer', !prefs.visualizer)} aria-pressed={prefs.visualizer}><i/></button></div>
    <div className="api-connection"><div className="control-title"><span>Домашний музыкальный сервер</span><small>Адрес API для подключения библиотеки</small></div><div className="api-input"><input value={localStorage.getItem('resonance-api-url') || 'http://localhost:4317'} readOnly/><span className="api-help">Адрес можно будет изменить в настройках подключения на следующем этапе.</span></div></div>
  </div>
}

function SettingsPage({ prefs, update, apiUrl, setApiUrl, saveApiUrl, serverState }: { prefs: Preferences; update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void; apiUrl: string; setApiUrl: (value: string) => void; saveApiUrl: () => void; serverState: string }) {
  return <section className="content settings-content"><div className="page-title"><div className="eyebrow">YOUR SPACE, YOUR RULES</div><h1>Персонализация</h1><p className="subtitle">Настрой приложение так, чтобы оно ощущалось именно твоим.</p></div><div className="settings-layout"><div className="settings-main"><div className="settings-card"><div className="settings-card-title"><Palette size={19}/><div><h3>Внешний вид</h3><p>Цвета, тема и визуальная плотность</p></div></div><ThemeControls prefs={prefs} update={update} accent={accents.find(a => a.id === prefs.accent)!}/></div></div><aside className="settings-aside"><div className="settings-card server-card"><div className="settings-card-title"><Wifi size={19}/><div><h3>Подключение сервера</h3><p>Твоя домашняя музыкальная библиотека</p></div></div><div className={`server-status ${serverState}`}><span className="status-dot"/>{serverState === 'online' ? 'Сервер доступен' : serverState === 'checking' ? 'Проверяем подключение' : 'Сервер не отвечает'}</div><label className="field-label" htmlFor="api-url">Адрес сервера</label><input id="api-url" className="text-input" value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="http://localhost:4317"/><button className="secondary-button full-button" onClick={saveApiUrl}>Сохранить адрес</button><small className="field-note">На этом этапе localhost работает только на самом ноутбуке. Для телефона настроим защищённый доступ по домашней сети.</small></div><div className="settings-card tip-card"><Sparkles size={19}/><h3>Твоё пространство</h3><p>Выбранная тема и параметры интерфейса сохраняются в этом браузере. Синхронизацию оформления между устройствами добавим вместе с серверной учётной записью.</p></div></aside></div></section>
}
