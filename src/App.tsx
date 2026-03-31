import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import './index.css'

interface Post { id: string; author: string; rank: string; faction_id: string; content: string; hp: number; shields: number; created_at: string }
interface Comment { id: string; post_id: string; author: string; content: string; created_at: string }
interface ActionLog { id: string; actor: string; action_type: string; details: string; created_at: string }
interface Faction { id: string; name: string; color: string; bonus: string; chipClass: string; badgeClass: string }
interface Weapon { id: string; name: string; icon: string; damage: number; cost: number; xpGain: number; special?: string; desc: string }
interface Projectile { id: number; startX: number; startY: number; endX: number; endY: number }
interface Explosion { id: number; x: number; y: number }

const FACTIONS: Faction[] = [
  { id: 'guardians', name: 'GUARDIÕES', color: '#4EA8DE', bonus: 'DEFENSE', chipClass: 'chip-blue', badgeClass: 'faction-guardians' },
  { id: 'raiders', name: 'INVASORES', color: '#E74C3C', bonus: 'ATTACK', chipClass: 'chip-red', badgeClass: 'faction-raiders' },
  { id: 'ghosts', name: 'FANTASMAS', color: '#9B59B6', bonus: 'TACTICAL', chipClass: 'chip-purple', badgeClass: 'faction-ghosts' },
];

const RANKS = ['RECRUTA', 'SARGENTO', 'CAPITÃO', 'MAJOR', 'GENERAL'];
const RANK_TITLES = ['Aprendiz das Sombras', 'Guerreiro Tático', 'Comandante de Campo', 'Senhor da Guerra', 'Lenda Suprema'];

const WEAPONS: Weapon[] = [
  { id: 'missile', name: 'MÍSSIL', icon: '🚀', damage: 15, cost: 2, xpGain: 5, desc: '15 DMG · Rápido' },
  { id: 'emp', name: 'EMP', icon: '⚡', damage: 10, cost: 8, xpGain: 15, special: 'REMOVE_SHIELDS', desc: '10 DMG · Remove Escudos' },
  { id: 'nuke', name: 'NUKE', icon: '💥', damage: 50, cost: 20, xpGain: 40, desc: '50 DMG · Devastador' },
];

const MOCK_LEADERS = [
  { name: 'GENERAL_ZEUS', rank: 'GENERAL', points: 42903, icon: '⚡' },
  { name: 'MAJOR_VORTEX', rank: 'MAJOR', points: 31200, icon: '🌀' },
  { name: 'SRGT_GLITCH', rank: 'SARGENTO', points: 15900, icon: '🔥' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedUserStats, setSelectedUserStats] = useState({ attacks: 0, defends: 0, drops: 0 });
  const [showSkills, setShowSkills] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [currentSkin, setCurrentSkin] = useState('default');

  const [energy, setEnergy] = useState(100);
  const [hp, setHp] = useState(100);
  const [xp, setXp] = useState(0);
  const [sp, setSp] = useState(0);
  const [rankIndex, setRankIndex] = useState(0);

  const [selectedWeapon, setSelectedWeapon] = useState<Weapon>(WEAPONS[0]);
  const [userFaction, setUserFaction] = useState<Faction>(FACTIONS[0]);

  const [shakeId, setShakeId] = useState<string | null>(null);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [unlockedSkills, setUnlockedSkills] = useState<string[]>(['base']);

  const userName = session?.user.email?.split('@')[0].toUpperCase() || 'SOLDADO';

  useEffect(() => {
    document.body.setAttribute('data-theme', currentSkin);
  }, [currentSkin]);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => { setSession(session); })
      .catch(() => {})
      .finally(() => setLoadingAuth(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
      const channel = supabase.channel('combat-channel');
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
        if (payload.eventType === 'INSERT') setPosts(prev => [payload.new as Post, ...prev]);
        else if (payload.eventType === 'UPDATE') {
          setPosts(prev => prev.map(p => p.id === payload.new.id ? payload.new as Post : p));
          if (payload.new.hp < payload.old?.hp) { setShakeId(payload.new.id); setTimeout(() => setShakeId(null), 500); }
        }
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        if (payload.eventType === 'INSERT') setComments(prev => [...prev, payload.new as Comment]);
      });
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'actions_log' }, (payload) => {
        if (payload.eventType === 'INSERT') setActionLogs(prev => [payload.new as ActionLog, ...prev].slice(0, 30));
      });
      channel.subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [session]);

  const fetchData = async () => {
    const { data: p } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (p) setPosts(p);
    const { data: c } = await supabase.from('comments').select('*').order('created_at', { ascending: true }).limit(500);
    if (c) setComments(c);
    const { data: l } = await supabase.from('actions_log').select('*').order('created_at', { ascending: false }).limit(30);
    if (l) setActionLogs(l);
  };

  useEffect(() => {
    if (!session) return;
    const t = unlockedSkills.includes('regen') ? 5000 : 10000;
    const timer = setInterval(() => setEnergy(prev => Math.min(100, prev + 1)), t);
    return () => clearInterval(timer);
  }, [unlockedSkills, session]);

  useEffect(() => {
    if (xp >= 100) { setXp(xp - 100); setSp(prev => prev + 1); if (rankIndex < RANKS.length - 1) setRankIndex(prev => prev + 1); }
  }, [xp, rankIndex]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError('');
    if (isSignUp) { const { error } = await supabase.auth.signUp({ email, password }); if (error) setAuthError(error.message); else setAuthError('Registro concluído! Bem-vindo(a) às tropas.'); }
    else { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) setAuthError(error.message); }
  };

  const logAction = async (actor: string, type: string, details: string) => { await supabase.from('actions_log').insert([{ actor, action_type: type, details }]); };

  const calculateCost = (baseCost: number, type: 'ATTACK' | 'DEFENSE' | 'TACTICAL') => {
    let cost = baseCost;
    if (userFaction.bonus === type) { if (type === 'ATTACK') cost = 1; else if (type === 'DEFENSE') cost = 3; else cost = baseCost - 2; }
    if (unlockedSkills.includes('efficiency') && type === 'ATTACK') cost = Math.max(1, cost - 1);
    return cost;
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPostContent.trim() === '' || energy < 10 || !session) return;
    const initialShields = unlockedSkills.includes('aegis') ? 1 : 0;
    const { error } = await supabase.from('posts').insert([{ author: userName, rank: RANKS[rankIndex], faction_id: userFaction.id, content: newPostContent, hp: 100, shields: initialShields }]);
    if (!error) { logAction(userName, 'DEPLOY', 'estabeleceu um novo bunker na posição tática.'); setNewPostContent(''); setEnergy(prev => prev - 10); setXp(prev => prev + 20); }
  };

  const handleComment = async (e: React.FormEvent, postId: string) => {
    e.preventDefault();
    const txt = commentInputs[postId];
    if (!txt || txt.trim() === '' || !session) return;
    const { error } = await supabase.from('comments').insert([{ post_id: postId, author: userName, content: txt }]);
    if (!error) { setCommentInputs(prev => ({ ...prev, [postId]: '' })); setXp(prev => prev + 2); }
  };

  const fireProjectile = (e: React.MouseEvent, targetId: string, onHit: () => void) => {
    const startX = e.clientX; const startY = e.clientY;
    const targetEl = document.getElementById(`bunker-${targetId}`);
    if (!targetEl) { onHit(); return; }
    const rect = targetEl.getBoundingClientRect();
    const endX = rect.left + rect.width / 2; const endY = rect.top + rect.height / 2;
    const projId = Date.now();
    setProjectiles(prev => [...prev, { id: projId, startX, startY, endX, endY }]);
    setTimeout(() => {
      setProjectiles(prev => prev.filter(p => p.id !== projId));
      setExplosions(prev => [...prev, { id: projId, x: endX, y: endY }]);
      setTimeout(() => setExplosions(prev => prev.filter(ex => ex.id !== projId)), 500);
      onHit();
    }, 400);
  };

  const getThemedWeapons = () => {
    if (currentSkin === 'brasil') return [
      { id: 'missile', name: 'TACAPE', icon: '🪵', damage: 15, cost: 2, xpGain: 5, desc: '15 DMG · Ancestral' },
      { id: 'emp', name: 'CAPOEIRA', icon: '🤸', damage: 10, cost: 8, xpGain: 15, special: 'REMOVE_SHIELDS', desc: '10 DMG · Ginga' },
      { id: 'nuke', name: 'AMAZÔNIA', icon: '🐆', damage: 50, cost: 20, xpGain: 40, desc: '50 DMG · Fúria Verde' },
    ];
    return WEAPONS;
  };

  const themedWeapons = getThemedWeapons();

  const handleAttack = (e: React.MouseEvent, id: string, currentPost: Post) => {
    const activeWeapon = themedWeapons.find(w => w.id === selectedWeapon.id) || themedWeapons[0];
    const cost = calculateCost(activeWeapon.cost, activeWeapon.special ? 'TACTICAL' : 'ATTACK');
    if (energy < cost || currentPost.hp === 0) return;
    setEnergy(prev => prev - cost);
    fireProjectile(e, id, async () => {
      const extraDmg = unlockedSkills.includes('firepower') ? 5 : 0;
      const newHp = Math.max(0, currentPost.hp - (activeWeapon.damage + extraDmg));
      let newShields = currentPost.shields;
      if (activeWeapon.special === 'REMOVE_SHIELDS') newShields = 0;
      const { error } = await supabase.from('posts').update({ hp: newHp, shields: newShields }).eq('id', id);
      if (!error) { setXp(prev => prev + activeWeapon.xpGain); logAction(userName, 'ATTACK', `usou ${activeWeapon.name} contra @${currentPost.author}.`); }
    });
  };

  const handleShield = async (id: string, currentPost: Post) => {
    const cost = calculateCost(5, 'DEFENSE');
    if (energy < cost || currentPost.hp === 0) return;
    const healAmount = unlockedSkills.includes('nano') ? 25 : 10;
    const { error } = await supabase.from('posts').update({ shields: currentPost.shields + 1, hp: Math.min(100, currentPost.hp + healAmount) }).eq('id', id);
    if (!error) { 
      setEnergy(prev => prev - cost); 
      setXp(prev => prev + 10); 
      setHp(prev => Math.min(100, prev + 5)); // Increment HUD life when defending
      logAction(userName, 'DEFEND', `reforçou o escudo de @${currentPost.author}.`); 
    }
  };

  const buySkill = (skillId: string, cost: number) => {
    if (sp >= cost && !unlockedSkills.includes(skillId)) { setSp(prev => prev - cost); setUnlockedSkills(prev => [...prev, skillId]); }
  };

  const openUserProfile = async (authorName: string) => {
    setSelectedUser(authorName);
    const { data } = await supabase.from('actions_log').select('action_type').eq('actor', authorName);
    if (data) {
      setSelectedUserStats({
        attacks: data.filter(d => d.action_type === 'ATTACK').length,
        defends: data.filter(d => d.action_type === 'DEFEND').length,
        drops: data.filter(d => d.action_type === 'DEPLOY').length,
      });
    }
  };

  // ── LOADING ──
  if (loadingAuth) return <div className="loading-wrap"><h2>⚔️ WAR SOCIAL</h2><p style={{ color: '#5A6A82' }}>Iniciando rede...</p></div>;

  // ── AUTH ──
  if (!session) return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">⚔️ WarSocial</div>
        <p className="auth-sub">ACESSO RESTRITO ÀS TROPAS</p>
        <form onSubmit={handleAuth} className="auth-form">
          <input className="auth-input" type="email" placeholder="Identificação (E-mail)" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="auth-input" type="password" placeholder="Senha Criptografada" value={password} onChange={e => setPassword(e.target.value)} required />
          {authError && <p className="auth-error">{authError}</p>}
          <button type="submit" className="auth-btn">{isSignUp ? '⚔️ ALISTAR-SE' : '🔑 ACESSAR BASE'}</button>
        </form>
        <p className="auth-toggle" onClick={() => setIsSignUp(!isSignUp)}>{isSignUp ? 'Já pertence às tropas? Faça Login.' : 'Recruta novo? Aliste-se aqui.'}</p>
      </div>
    </div>
  );

  // ── MAIN APP ──
  return (
    <>
      {/* FX */}
      {projectiles.map(p => {
        const angle = Math.atan2(p.endY - p.startY, p.endX - p.startX) * 180 / Math.PI;
        const dist = Math.hypot(p.endX - p.startX, p.endY - p.startY);
        return <div key={p.id} className="projectile" style={{ left: p.startX, top: p.startY, transform: `rotate(${angle}deg)` }} ref={el => { if (el) setTimeout(() => { el.style.transform = `rotate(${angle}deg) translate(${dist}px, 0)`; }, 10); }}>{selectedWeapon.icon}</div>;
      })}
      {explosions.map(ex => <div key={ex.id} className="explosion-ring" style={{ left: ex.x, top: ex.y }} />)}

      {/* TOPNAV */}
      <header className="topnav">
        <div className="logo"><div className="logo-icon">⚔️</div><span className="logo-text">WarSocial</span></div>
        <div className="nav-search"><span className="si">🔍</span><input type="text" placeholder="Buscar heróis, guildas, batalhas..." /></div>
        <nav className="nav-tabs">
          <button className="ntab active">🏠 Feed</button>
          <button className="ntab">⚔️ Batalhas</button>
          <button className="ntab">🏆 Ranking</button>
        </nav>
        <div className="nav-right">
          <button className="nav-ico" title="Notificações" onClick={() => setShowSkills(true)}>🧬<span className="nav-badge">{sp}</span></button>
          <div className="nav-user" onClick={() => openUserProfile(userName)}>
            <div className="nav-av">{userName.charAt(0)}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="nav-uname">{userName}</span>
              <span className="nav-ulevel">⭐ {RANKS[rankIndex]} · {userFaction.name}</span>
            </div>
          </div>
          <button className="nav-ico" onClick={async () => { await supabase.auth.signOut(); }} title="Sair" style={{ fontSize: '14px' }}>🚪</button>
        </div>
      </header>

      {/* PAGE */}
      <div className="page">
        {/* ── LEFT COLUMN ── */}
        <aside className="left-col">
          {/* Profile Card */}
          <div className="card profile-card">
            <div className="profile-banner"><div className="profile-banner-text">{userFaction.name} · ZONA DE GUERRA</div></div>
            <div className="profile-av-wrap">
              <div className="profile-av">{userName.charAt(0)}<div className="online-ring"></div></div>
              <span className={`faction-badge ${userFaction.badgeClass}`}>⚔ {userFaction.name}</span>
            </div>
            <div className="profile-body">
              <div className="profile-name">{userName}</div>
              <div className="profile-title">✦ {RANK_TITLES[rankIndex]} · Nível {rankIndex + 1}</div>
              <div className="profile-bio">"Dominando o campo de batalha, um bunker de cada vez."</div>

              <div className="xp-row"><span className="xp-label">⭐ Experiência</span><span className="xp-val">{xp} / 100 XP</span></div>
              <div className="bar-track"><div className="bar-fill bar-xp" style={{ width: `${xp}%` }}></div></div>

              <div className="xp-row"><span className="xp-label">⚡ Energia</span><span className="xp-val" style={{ color: '#4EA8DE' }}>{energy} / 100</span></div>
              <div className="bar-track"><div className="bar-fill bar-energy" style={{ width: `${energy}%` }}></div></div>

              <div className="stats-grid">
                <div className="stat-box"><span className="stat-val">{actionLogs.filter(l => l.actor === userName && l.action_type === 'ATTACK').length}</span><span className="stat-key">Ataques</span></div>
                <div className="stat-box"><span className="stat-val">{actionLogs.filter(l => l.actor === userName && l.action_type === 'DEFEND').length}</span><span className="stat-key">Defesas</span></div>
                <div className="stat-box"><span className="stat-val">{actionLogs.filter(l => l.actor === userName && l.action_type === 'DEPLOY').length}</span><span className="stat-key">Bunkers</span></div>
                <div className="stat-box"><span className="stat-val">{sp}</span><span className="stat-key">Skill Pts</span></div>
                <div className="stat-box"><span className="stat-val">{posts.length}</span><span className="stat-key">Posts</span></div>
                <div className="stat-box"><span className="stat-val" style={{ color: '#2ECC71' }}>{RANKS[rankIndex]}</span><span className="stat-key">Rank</span></div>
              </div>

              <div className="karma-strip">
                <span className="karma-icon">✨</span>
                <div className="karma-info"><div className="karma-label">Karma Total</div><div className="karma-val">{xp + (rankIndex * 100)} pontos</div></div>
                <span className="karma-tier">🔥 {rankIndex >= 3 ? 'Lendário' : rankIndex >= 1 ? 'Épico' : 'Raro'}</span>
              </div>

              <button className={`btn-outline ${sp > 0 ? 'btn-pulse' : ''}`} onClick={() => setShowSkills(true)}>🧬 Nexus Skills (SP: {sp})</button>
              <button className="btn-vip" style={{ marginTop: '10px', width: '100%' }} onClick={() => setShowShop(true)}>💎 Pacote Especial (R$ 15)</button>
            </div>
          </div>

          {/* Faction Selector */}
          <div className="card">
            <div className="ch"><span className="ch-title"><span className="dot-accent"></span>Alinhamento</span></div>
            <div className="faction-picker">
              {FACTIONS.map(f => (
                <button key={f.id} className={`faction-btn ${userFaction.id === f.id ? 'selected' : ''}`} style={userFaction.id === f.id ? { borderColor: f.color, color: f.color, background: `${f.color}15` } : {}} onClick={() => setUserFaction(f)}>
                  {f.name}
                </button>
              ))}
            </div>
          </div>

          {/* Achievements */}
          <div className="card">
            <div className="ch"><span className="ch-title"><span className="dot-accent"></span>Condecorações</span></div>
            <div className="ach-list">
              <div className="ach-item" style={{ opacity: actionLogs.filter(l => l.actor === userName && l.action_type === 'ATTACK').length >= 5 ? 1 : 0.35 }}>
                <div className="ach-icon gold">💀</div>
                <div className="ach-info"><div className="ach-name">Carrasco</div><div className="ach-desc">5+ ataques realizados</div></div>
                <span className="ach-pts">+500 XP</span>
              </div>
              <div className="ach-item" style={{ opacity: actionLogs.filter(l => l.actor === userName && l.action_type === 'DEFEND').length >= 3 ? 1 : 0.35 }}>
                <div className="ach-icon epic">🛡️</div>
                <div className="ach-info"><div className="ach-name">Muralha</div><div className="ach-desc">3+ bunkers defendidos</div></div>
                <span className="ach-pts">+350 XP</span>
              </div>
              <div className="ach-item" style={{ opacity: actionLogs.filter(l => l.actor === userName && l.action_type === 'DEPLOY').length >= 2 ? 1 : 0.35 }}>
                <div className="ach-icon silver">🏗️</div>
                <div className="ach-info"><div className="ach-name">Engenheiro</div><div className="ach-desc">2+ bunkers construídos</div></div>
                <span className="ach-pts">+200 XP</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── CENTER FEED ── */}
        <main className="feed">
          {/* Composer */}
          <div className="composer">
            <div className="comp-top">
              <div className="comp-av">{userName.charAt(0)}</div>
              <textarea className="comp-input" placeholder={`O que está acontecendo na zona de guerra, ${userName}? ⚔️`} value={newPostContent} onChange={e => setNewPostContent(e.target.value)} />
            </div>
            <div className="comp-footer">
              <div className="comp-tools">
                {themedWeapons.map(w => (
                  <button key={w.id} className={`comp-tool ${selectedWeapon.id === w.id ? 'active' : ''}`} onClick={() => setSelectedWeapon(w)}>
                    {w.icon} {w.name}
                  </button>
                ))}
              </div>
              <button className="btn-post" disabled={energy < 10 || !newPostContent.trim()} onClick={handleDeploy}>🛡️ Fortificar (10⚡)</button>
            </div>
          </div>

          {/* Feed Tabs */}
          <div className="feed-tabs">
            <button className="ftab active">✨ Todos</button>
            <button className="ftab">🛡️ {userFaction.name}</button>
            <button className="ftab">⚔️ PvP</button>
            <button className="ftab">🔥 Em Alta</button>
          </div>

          {/* Posts */}
          {posts.map(post => {
            const faction = FACTIONS.find(f => f.id === post.faction_id) || FACTIONS[0];
            const isDead = post.hp === 0;
            const postComments = comments.filter(c => c.post_id === post.id);

            return (
              <article key={post.id} id={`bunker-${post.id}`} className={`post ${shakeId === post.id ? 'shake-hard' : ''} ${isDead ? 'dead-post' : ''}`}>
                {/* Faction Bar */}
                <div className="post-guild-bar">
                  <span className="guild-dot" style={{ background: faction.color }}></span>
                  Facção: <strong style={{ color: faction.color }}>{faction.name}</strong>
                  <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>{post.rank}</span>
                </div>

                {/* Header */}
                <div className="post-head">
                  <div className="post-av" style={{ background: `linear-gradient(135deg, ${faction.color}44, ${faction.color})` }} onClick={() => openUserProfile(post.author)}>
                    {post.author.charAt(0)}
                  </div>
                  <div className="post-meta">
                    <div className="post-meta-top">
                      <span className="post-author" onClick={() => openUserProfile(post.author)}>@{post.author}</span>
                      <span className={`chip ${faction.chipClass}`}>{faction.name}</span>
                      <span className="chip chip-gold">⭐ {post.rank}</span>
                    </div>
                    <span className="post-time">⏱ {timeAgo(post.created_at)}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="post-body">
                  {isDead ? <span className="glitch-text">SISTEMA COMPROMETIDO // BUNKER NEUTRALIZADO</span> : post.content}
                </div>

                {/* HP Bar */}
                <div className="bunker-hp">
                  <div className="hp-row">
                    <span>INTEGRIDADE: {post.hp}%</span>
                    {post.shields > 0 && <span className="shield-count">🛡️ Escudo: {post.shields}</span>}
                  </div>
                  <div className="bar-track">
                    <div className={`bar-fill ${post.hp > 30 ? 'bar-hp' : 'bar-danger'}`} style={{ width: `${post.hp}%` }}></div>
                  </div>
                </div>

                {/* Actions */}
                <hr className="post-divider" />
                <div className="post-actions">
                  <button className="post-action def" onClick={() => handleShield(post.id, post)} disabled={isDead}>
                    🛡️ Defender <span className="cnt">{calculateCost(5, 'DEFENSE')}⚡</span>
                  </button>
                  <button className="post-action atk" onClick={e => handleAttack(e, post.id, post)} disabled={isDead}>
                    {themedWeapons.find(w => w.id === selectedWeapon.id)?.icon || selectedWeapon.icon} Atacar <span className="cnt">{calculateCost(selectedWeapon.cost, selectedWeapon.special ? 'TACTICAL' : 'ATTACK')}⚡</span>
                  </button>
                  <button className="post-action com">💬 <span className="cnt">{postComments.length}</span></button>
                </div>

                {/* Comments */}
                {postComments.length > 0 && (
                  <div className="comments-section">
                    <h4>💬 Transmissões</h4>
                    {postComments.map(c => (
                      <div key={c.id} className="comment-item">
                        <span className="comment-author" onClick={() => openUserProfile(c.author)}>@{c.author}</span>
                        <span className="comment-text">{c.content}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!isDead && (
                  <form onSubmit={e => handleComment(e, post.id)} className="comments-section" style={{ paddingTop: postComments.length > 0 ? 0 : undefined }}>
                    <div className="comment-form">
                      <input className="comment-input" type="text" placeholder="Responder transmissão..." value={commentInputs[post.id] || ''} onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))} />
                      <button type="submit" className="comment-send" disabled={!commentInputs[post.id]}>Enviar</button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}

          {posts.length === 0 && (
            <div className="card" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', marginBottom: '12px' }}>🏜️</p>
              <p style={{ color: 'var(--t3)', fontWeight: 700 }}>Zona silenciosa. Construa o primeiro bunker!</p>
            </div>
          )}
        </main>

        {/* ── RIGHT COLUMN ── */}
        <aside className="right-col">
          {/* Combat Radar */}
          <div className="card">
            <div className="ch">
              <span className="ch-title"><span className="dot-accent" style={{ animation: 'pulse 1s infinite' }}></span>Radar de Combate</span>
              <span className="ch-action">AO VIVO</span>
            </div>
            <div className="radar-list">
              {actionLogs.length === 0 && <p style={{ fontSize: '.82rem', color: 'var(--t3)', padding: '16px', textAlign: 'center' }}>Mapeando zona de guerra...</p>}
              {actionLogs.map(log => (
                <div key={log.id} className={`radar-item type-${log.action_type.toLowerCase()}`}>
                  <span className="radar-actor" onClick={() => openUserProfile(log.actor)}>@{log.actor}</span>{' '}
                  <span className="radar-detail">{log.details}</span>
                  <div className="radar-time">{new Date(log.created_at).toLocaleTimeString()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Arsenal */}
          <div className="card">
            <div className="ch"><span className="ch-title"><span className="dot-accent"></span>Arsenal Temático</span><span className="ch-action">{themedWeapons.find(w => w.id === selectedWeapon.id)?.name}</span></div>
            <div className="arsenal-grid">
              {themedWeapons.map(w => (
                <button key={w.id} className={`weapon-btn ${selectedWeapon.id === w.id ? 'selected' : ''}`} onClick={() => setSelectedWeapon(w)}>
                  <span className="weapon-icon">{w.icon}</span>
                  <div className="weapon-info"><div className="weapon-name">{w.name}</div><div className="weapon-stats">{w.desc}</div></div>
                  <span className="weapon-cost">{calculateCost(w.cost, w.special ? 'TACTICAL' : 'ATTACK')}⚡</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ranking */}
          <div className="card">
            <div className="ch"><span className="ch-title"><span className="dot-accent"></span>Ranking</span><span className="ch-action">Semanal</span></div>
            <div className="ranking-list">
              {MOCK_LEADERS.map((l, i) => (
                <div key={l.name} className="rank-item">
                  <span className={`rank-pos ${i === 0 ? 'gold-pos' : i === 1 ? 'silver-pos' : 'bronze-pos'}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <div className="rank-av" style={{ background: 'var(--surface)' }}>{l.icon}</div>
                  <div className="rank-info"><div className="rank-name">{l.name}</div><div className="rank-sub">{l.rank}</div></div>
                  <span className="rank-score">{l.points.toLocaleString()}</span>
                </div>
              ))}
              <div className="rank-item me">
                <span className="rank-pos normal-pos" style={{ color: 'var(--gold)', fontWeight: 900 }}>#7</span>
                <div className="rank-av" style={{ background: 'linear-gradient(135deg, var(--orange), var(--gold))' }}>{userName.charAt(0)}</div>
                <div className="rank-info"><div className="rank-name" style={{ color: 'var(--gold)' }}>{userName} (você)</div><div className="rank-sub">{RANKS[rankIndex]}</div></div>
                <span className="rank-score">{xp + rankIndex * 100}</span>
              </div>
            </div>
          </div>

          {/* Events */}
          <div className="card">
            <div className="ch"><span className="ch-title"><span className="dot-accent"></span>Próximos Eventos</span></div>
            <div className="event-list">
              <div className="event-item">
                <div><div className="ev-day">31</div><div className="ev-mon">Mar</div></div>
                <div className="event-info"><div className="ev-name">Assalto ao Nexus</div><div className="ev-sub">Raid · 25 heróis · 20h</div></div>
                <span className="ev-type" style={{ background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(231,76,60,.3)' }}>Raid</span>
              </div>
              <div className="event-item">
                <div><div className="ev-day">02</div><div className="ev-mon">Abr</div></div>
                <div className="event-info"><div className="ev-name">Torneio PvP</div><div className="ev-sub">Arena · Arma Épica</div></div>
                <span className="ev-type" style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid rgba(78,168,222,.3)' }}>PvP</span>
              </div>
              <div className="event-item">
                <div><div className="ev-day">05</div><div className="ev-mon">Abr</div></div>
                <div className="event-info"><div className="ev-name">Festival Tático</div><div className="ev-sub">Mundial · Recompensas Raras</div></div>
                <span className="ev-type" style={{ background: 'rgba(255,185,50,.1)', color: 'var(--gold)', border: '1px solid rgba(255,185,50,.3)' }}>World</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* 🕹️ MOBILE HUD (BOTTOM BAR) */}
      <nav className="mobile-nav">
        <div className="mod-stat" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--red)', fontSize: '1.2rem', fontWeight: 900 }}>{hp}%</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--t3)', textTransform: 'uppercase' }}>Vitalidade</div>
        </div>
        <div className="mod-stat" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--blue)', fontSize: '1.2rem', fontWeight: 900 }}>{energy}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--t3)', textTransform: 'uppercase' }}>Energia</div>
        </div>
        <div className="mod-stat" style={{ textAlign: 'center' }} onClick={() => setShowSkills(true)}>
          <div style={{ color: 'var(--gold)', fontSize: '1.2rem' }}>{selectedWeapon.icon}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--gold)', textTransform: 'uppercase', fontWeight: 700 }}>Arsenal</div>
        </div>
      </nav>

      {/* ── PROFILE MODAL ── */}
      {selectedUser && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelectedUser(null); }}>
          <div className="modal-panel" style={{ textAlign: 'center' }}>
            <div className="profile-av" style={{ width: 80, height: 80, fontSize: '2rem', margin: '0 auto 16px', border: '3px solid var(--gold)' }}>
              {selectedUser.charAt(0)}
            </div>
            <h2>@{selectedUser}</h2>
            <p className="modal-subtitle">MERCENÁRIO VETERANO</p>
            <div className="modal-stats">
              <div className="modal-stat"><div className="modal-stat-val" style={{ color: 'var(--red)' }}>{selectedUserStats.attacks}</div><div className="modal-stat-key">Ataques</div></div>
              <div className="modal-stat"><div className="modal-stat-val" style={{ color: 'var(--green)' }}>{selectedUserStats.defends}</div><div className="modal-stat-key">Defesas</div></div>
              <div className="modal-stat"><div className="modal-stat-val" style={{ color: 'var(--gold)' }}>{selectedUserStats.drops}</div><div className="modal-stat-key">Bunkers</div></div>
            </div>
            <h4 style={{ textAlign: 'left', marginBottom: 12, color: 'var(--t2)', fontSize: '.85rem' }}>🏅 Condecorações</h4>
            <div className="modal-medals">
              <div className={`modal-medal ${selectedUserStats.attacks >= 5 ? 'earned' : 'locked'}`}><div className="modal-medal-icon">💀</div><div className="modal-medal-name">Carrasco</div></div>
              <div className={`modal-medal ${selectedUserStats.defends >= 3 ? 'earned' : 'locked'}`}><div className="modal-medal-icon">🛡️</div><div className="modal-medal-name">Muralha</div></div>
              <div className={`modal-medal ${selectedUserStats.drops >= 2 ? 'earned' : 'locked'}`}><div className="modal-medal-icon">🏗️</div><div className="modal-medal-name">Engenheiro</div></div>
            </div>
            
            <h4 style={{ textAlign: 'left', marginBottom: 12, color: 'var(--t2)', fontSize: '.85rem' }}>🎭 Personalizar Skin (Temas)</h4>
            <div className="skin-selector">
              {[
                { id: 'default', name: 'Scifi', icon: '🚀' },
                { id: 'brasil', name: 'Brasil', icon: '🇧🇷' },
              ].map(skin => (
                <button 
                  key={skin.id} 
                  className={`skin-btn ${currentSkin === skin.id ? 'active' : ''}`}
                  onClick={() => setCurrentSkin(skin.id)}
                >
                  <span style={{ fontSize: '1.2rem' }}>{skin.icon}</span>
                  <span style={{ fontSize: '0.65rem' }}>{skin.name}</span>
                </button>
              ))}
            </div>

            <div className="modal-actions">
              <button className="modal-btn modal-btn-primary">🤝 Formar Aliança</button>
              <button className="modal-btn modal-btn-ghost" onClick={() => setSelectedUser(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SKILLS MODAL ── */}
      {showSkills && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowSkills(false); }}>
          <div className="modal-panel">
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h2>🧬 THE NEXUS</h2>
              <p className="modal-subtitle">Terminal de Implantes Neurais de Guerra</p>
              <div style={{ color: 'var(--gold)', fontFamily: "'Rajdhani', sans-serif", fontSize: '2.5rem', fontWeight: 900, margin: '16px 0 4px' }}>{sp}</div>
              <p style={{ color: 'var(--t3)', fontSize: '.8rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>Skill Points Disponíveis</p>
            </div>
            <div className="skill-grid">
              <div className={`skill-node ${unlockedSkills.includes('regen') ? 'unlocked' : ''}`} onClick={() => buySkill('regen', 1)}>
                <div className="skill-node-icon">⚡</div><div className="skill-node-name">Regen Rápido</div>
                <div className="skill-node-desc">Energia regenera 2x mais rápido</div>
                <div className="skill-node-cost">{unlockedSkills.includes('regen') ? '✅ Ativo' : '1 SP'}</div>
              </div>
              <div className={`skill-node ${unlockedSkills.includes('efficiency') ? 'unlocked' : ''}`} onClick={() => buySkill('efficiency', 1)}>
                <div className="skill-node-icon">🎯</div><div className="skill-node-name">Eficiência</div>
                <div className="skill-node-desc">Ataques custam -1 energia</div>
                <div className="skill-node-cost">{unlockedSkills.includes('efficiency') ? '✅ Ativo' : '1 SP'}</div>
              </div>
              <div className={`skill-node ${unlockedSkills.includes('aegis') ? 'unlocked' : ''}`} onClick={() => buySkill('aegis', 2)}>
                <div className="skill-node-icon">🛡️</div><div className="skill-node-name">Aegis</div>
                <div className="skill-node-desc">Bunkers nascem com 1 escudo</div>
                <div className="skill-node-cost">{unlockedSkills.includes('aegis') ? '✅ Ativo' : '2 SP'}</div>
              </div>
              <div className={`skill-node ${unlockedSkills.includes('firepower') ? 'unlocked' : ''}`} onClick={() => buySkill('firepower', 2)}>
                <div className="skill-node-icon">🔥</div><div className="skill-node-name">Firepower</div>
                <div className="skill-node-desc">+5 dano em todos os ataques</div>
                <div className="skill-node-cost">{unlockedSkills.includes('firepower') ? '✅ Ativo' : '2 SP'}</div>
              </div>
              <div className={`skill-node ${unlockedSkills.includes('nano') ? 'unlocked' : ''}`} onClick={() => buySkill('nano', 3)}>
                <div className="skill-node-icon">💚</div><div className="skill-node-name">Nano Heal</div>
                <div className="skill-node-desc">Defender cura 25 HP em vez de 10</div>
                <div className="skill-node-cost">{unlockedSkills.includes('nano') ? '✅ Ativo' : '3 SP'}</div>
              </div>
              <div className="skill-node" style={{ opacity: 0.3 }}>
                <div className="skill-node-icon">🔮</div><div className="skill-node-name">???</div>
                <div className="skill-node-desc">Desbloqueie no nível GENERAL</div>
                <div className="skill-node-cost">🔒</div>
              </div>
            </div>
            <button className="btn-outline" onClick={() => setShowSkills(false)} style={{ marginTop: 20 }}>Fechar Nexus</button>
          </div>
        </div>
      )}
      {/* ── SHOP MODAL ── */}
      {showShop && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowShop(false); }}>
          <div className="modal-panel shop-panel">
            <div className="shop-header">
              <div className="shop-badge">OFERTA LIMITADA</div>
              <h2>💎 PACOTE LENDÁRIO</h2>
              <p className="modal-subtitle">Evolua sua estética para o nível máximo</p>
            </div>

            <div className="package-card">
              <div className="package-preview">
                <div className="skin-orb gold-glow">
                  <span>⚔️</span>
                </div>
                <div className="package-content">
                  <h3>Skin Pack: Lorde Supremo</h3>
                  <ul>
                    <li>✨ Aura Dourada Exclusiva</li>
                    <li>🛡️ Escudo de Plasma Visual</li>
                    <li>💥 Efeito de Explosão "Supernova"</li>
                    <li>👑 Título: "O Magnata da Guerra"</li>
                  </ul>
                </div>
              </div>
              
              <div className="package-buy-zone">
                <div className="price-tag">
                  <span className="currency">R$</span>
                  <span className="amount">15</span>
                  <span className="cents">,00</span>
                </div>
                <button className="btn-buy-vip" onClick={() => alert('Integrando com Gateway de Pagamento...')}>
                  ADQUIRIR AGORA
                </button>
              </div>
            </div>

            <p className="shop-footer">Pagamento único. Benefícios visuais permanentes.</p>
            <button className="btn-outline" onClick={() => setShowShop(false)} style={{ marginTop: 20 }}>Voltar ao Bunker</button>
          </div>
        </div>
      )}
    </>
  );
}

