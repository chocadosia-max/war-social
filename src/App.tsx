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
      setHp(prev => Math.min(100, prev + 5)); 
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

  if (loadingAuth) return <div className="loading-wrap"><h2>⚔️ WAR SOCIAL</h2><p style={{ color: '#5A6A82' }}>Iniciando rede...</p></div>;

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

  return (
    <>
      <header className="topnav">
        <div className="logo"><div className="logo-icon">⚔️</div><span className="logo-text">WarSocial</span></div>
        <nav className="nav-tabs">
          <button className="ntab active">🏠 Feed</button>
          <button className="ntab" onClick={() => setShowSkills(true)}>🏆 Ranking</button>
        </nav>
        <div className="nav-right">
           <div className="nav-user" onClick={() => openUserProfile(userName)}>
            <div className="nav-av">{userName.charAt(0)}</div>
            <div className="desktop-only" style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="nav-uname">{userName}</span>
              <span className="nav-ulevel" style={{ fontSize: '.7rem' }}>⭐ {RANKS[rankIndex]}</span>
            </div>
          </div>
          <button className="nav-ico" onClick={async () => { await supabase.auth.signOut(); }} title="Sair">🚪</button>
        </div>
      </header>

      <div className="page">
        <aside className="left-col">
          <div className="card profile-card">
            <div className="profile-banner"><div className="profile-banner-text">{userFaction.name} · ZONA DE GUERRA</div></div>
            <div className="profile-av-wrap">
              <div className="profile-av">{userName.charAt(0)}<div className="online-ring"></div></div>
            </div>
            <div className="profile-body">
              <div className="profile-name">{userName}</div>
              <div className="profile-title">✦ {RANK_TITLES[rankIndex]}</div>
              <div className="stats-grid">
                <div className="stat-box"><span className="stat-val">{energy}⚡</span><span className="stat-key">Energia</span></div>
                <div className="stat-box"><span className="stat-val">{hp}%❤️</span><span className="stat-key">HP</span></div>
                <div className="stat-box"><span className="stat-val">{xp}</span><span className="stat-key">XP</span></div>
                <div className="stat-box"><span className="stat-val">{sp}</span><span className="stat-key">SP</span></div>
              </div>
              <button className="btn-outline" onClick={() => setShowSkills(true)}>🧬 NEXUS SKILLS</button>
            </div>
          </div>
        </aside>

        <main className="main-col">
          {/* INSTA STORIES (COMPACT) */}
          <div className="stories-row mobile-only">
            {MOCK_LEADERS.map(l => (
              <div key={l.name} className="story-item" onClick={() => openUserProfile(l.name)}>
                <div className="story-ring"><div className="story-av" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{l.icon}</div></div>
                <span className="story-name">{l.name.replace('GENERAL_', '')}</span>
              </div>
            ))}
            {['TITAN', 'NEXUS', 'SQUAD', 'ALPHA', 'BRAVO'].map(name => (
              <div key={name} className="story-item" onClick={() => openUserProfile(name)}>
                <div className="story-ring"><div className="story-av" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{name.charAt(0)}</div></div>
                <span className="story-name">{name}</span>
              </div>
            ))}
          </div>

          <div className="mobile-composer mobile-only">
             <div className="profile-av" style={{ width: 34, height: 34, fontSize: '0.8rem' }}>{userName.charAt(0)}</div>
             <form onSubmit={handleDeploy} style={{ flex: 1, display: 'flex', gap: 8 }}>
                <input className="post-input" placeholder={`Status de combate, ${userName}?`} value={newPostContent} onChange={e => setNewPostContent(e.target.value)} />
                <button className="btn-post-round">⚔️</button>
             </form>
          </div>

          <div className="post-feed">
            {posts.map(post => (
              <article key={post.id} className={`card post ${shakeId === post.id ? 'shake-hard' : ''}`} id={`bunker-${post.id}`}>
                <div className="post-head">
                  <div className="post-av" style={{ width: 32, height: 32 }} onClick={() => openUserProfile(post.author)}>{post.author.charAt(0)}</div>
                  <div className="post-meta">
                    <span className="post-author">@{post.author}</span>
                    <span className="post-time">{timeAgo(post.created_at)}</span>
                  </div>
                </div>
                <div className="post-body" style={{ fontSize: '0.9rem', padding: '10px 0' }}>{post.content}</div>
                
                <div className="hp-bar-outer">
                   <div className="hp-bar-inner" style={{ 
                     width: `${post.hp}%`, 
                     background: post.hp > 60 ? 'var(--accent)' : post.hp > 30 ? 'var(--gold)' : 'var(--red)' 
                   }}></div>
                </div>

                <div className="post-actions">
                  <button className="post-action atk" onClick={e => handleAttack(e, post.id, post)}>{selectedWeapon.icon} {selectedWeapon.damage} ATK</button>
                  <button className="post-action def" onClick={() => handleShield(post.id, post)}>🛡️ DEF</button>
                </div>
                <div className="comments-section" style={{ borderTop: 'none', padding: '0 4px' }}>
                   {comments.filter(c => c.post_id === post.id).slice(-1).map(c => (
                     <div key={c.id} className="comment-item" style={{ fontSize: '0.75rem', color: 'var(--t3)' }}><strong>@{c.author}</strong> {c.content}</div>
                   ))}
                   <form onSubmit={e => handleComment(e, post.id)} className="comment-form" style={{ marginTop: 8 }}>
                     <input className="comment-input" style={{ background: 'transparent', height: 26, fontSize: '0.75rem' }} placeholder="Adicionar transissão..." value={commentInputs[post.id] || ''} onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))} />
                   </form>
                </div>
              </article>
            ))}
          </div>
        </main>

        <aside className="right-col">
          <div className="card">
            <div className="ch"><span className="ch-title">📡 Radar Combat</span></div>
            <div className="radar-list" style={{ maxHeight: 300, overflowY: 'auto' }}>
              {actionLogs.map(log => (
                <div key={log.id} style={{ fontSize: '.75rem', marginBottom: 8 }}>
                  <strong>@{log.actor}</strong> {log.details}
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="ch"><span className="ch-title">🏆 Ranking Elite</span></div>
            {MOCK_LEADERS.map((l, i) => (
              <div key={i} className="rank-item" style={{ padding: '8px 0' }}>
                <span>#{i+1}</span> <strong>@{l.name}</strong> <span style={{ marginLeft: 'auto', color: 'var(--gold)' }}>{l.points}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <nav className="mobile-nav">
        <div className="nav-icon-btn active"><span className="nav-icon">🏚️</span><span className="nav-label">Home</span></div>
        <div className="nav-icon-btn" onClick={() => setShowSkills(true)}><span className="nav-icon">📡</span><span className="nav-label">Radar</span></div>
        <div className="nav-compose" onClick={() => document.querySelector<HTMLInputElement>('.post-input')?.focus()}><span>+</span></div>
        <div className="nav-icon-btn" onClick={() => setShowSkills(true)}><span className="nav-icon">⚔️</span><span className="nav-label">Arsenal</span></div>
        <div className="nav-icon-btn" onClick={() => setSelectedUser(userName)}><span className="nav-icon">👤</span><span className="nav-label">Perfil</span></div>
      </nav>

      {/* MODALS */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="profile-av" style={{ width: 80, height: 80, margin: '0 auto 16px' }}>{selectedUser.charAt(0)}</div>
            <h2 style={{ textAlign: 'center' }}>@{selectedUser}</h2>
            
            {selectedUser === userName && (
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ color: 'var(--red)', fontWeight: 'bold' }}>HP: {hp}%</div>
                <div className="bar-track" style={{ height: 6, width: '100px', margin: '4px auto' }}><div className="bar-fill bar-hp" style={{ width: `${hp}%` }}></div></div>
                <button onClick={() => setHp(100)} className="modal-btn-ghost" style={{ fontSize: '.6rem', padding: '2px 8px' }}>Reset Vitality</button>
              </div>
            )}

            <div className="modal-stats">
               <div className="modal-stat"><div>{selectedUserStats.attacks}</div><span>Ataques</span></div>
               <div className="modal-stat"><div>{selectedUserStats.defends}</div><span>Defesas</span></div>
            </div>

            {selectedUser === userName && (
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: '.8rem', marginBottom: 8, color: 'var(--gold)' }}>ALINHAMENTO DE FACÇÃO</h4>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {FACTIONS.map(f => (
                    <button key={f.id} onClick={() => setUserFaction(f)} className={`skill-node ${userFaction.id === f.id ? 'active' : ''}`} style={{ padding: '4px 8px', fontSize: '.7rem' }}>{f.name}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="skin-selector" style={{ marginTop: 20 }}>
               <button className={`skin-btn ${currentSkin === 'default' ? 'active' : ''}`} onClick={() => setCurrentSkin('default')}>🚀 Scifi</button>
               <button className={`skin-btn ${currentSkin === 'brasil' ? 'active' : ''}`} onClick={() => setCurrentSkin('brasil')}>🇧🇷 Brasil</button>
            </div>
            <button className="modal-btn modal-btn-ghost" onClick={() => setSelectedUser(null)} style={{ width: '100%', marginTop: 20 }}>Fechar</button>
          </div>
        </div>
      )}

      {showSkills && (
        <div className="modal-overlay" onClick={() => setShowSkills(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <h2 style={{ textAlign: 'center' }}>🧬 NEXUS</h2>
            <p style={{ textAlign: 'center', color: 'var(--gold)', fontSize: '2rem', fontWeight: 900 }}>{sp} SP</p>
            
            <div className="card" style={{ padding: 12, marginBottom: 16 }}>
               <h4 style={{ fontSize: '.8rem', color: 'var(--gold)', marginBottom: 8 }}>MÓDULOS DE ARMA</h4>
               <div className="arsenal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {themedWeapons.map(w => (
                    <button key={w.id} className={`weapon-btn ${selectedWeapon.id === w.id ? 'selected' : ''}`} onClick={() => setSelectedWeapon(w)}>
                      <span style={{ fontSize: '1.2rem' }}>{w.icon}</span>
                    </button>
                  ))}
               </div>
            </div>

            <div className="skill-grid">
               <div className={`skill-node card ${unlockedSkills.includes('regen') ? 'active' : ''}`} onClick={() => buySkill('regen', 1)}>⚡ Regen</div>
               <div className={`skill-node card ${unlockedSkills.includes('firepower') ? 'active' : ''}`} onClick={() => buySkill('firepower', 2)}>🔥 Fúria</div>
            </div>
            <button className="modal-btn modal-btn-ghost" onClick={() => setShowSkills(false)} style={{ width: '100%', marginTop: 20 }}>Fechar</button>
          </div>
        </div>
      )}

      {showShop && (
        <div className="modal-overlay" onClick={() => setShowShop(false)}>
          <div className="modal-panel shop-panel" onClick={e => e.stopPropagation()}>
             <h2>💎 MERCADO NEGRO</h2>
             <div className="card" style={{ padding: 20, border: '1px solid var(--gold)', marginTop: 20 }}>
                <h3>PACK SUPREMO</h3>
                <p>Skin Brasil + 50 SP + Rank VIP</p>
                <button className="btn-buy-vip" style={{ width: '100%', marginTop: 12 }}>ADQUIRIR R$ 15,00</button>
             </div>
             <button className="modal-btn modal-btn-ghost" onClick={() => setShowShop(false)} style={{ width: '100%', marginTop: 20 }}>Fechar</button>
          </div>
        </div>
      )}

      {explosions.map(ex => <div key={ex.id} className="explosion-ring" style={{ left: ex.x, top: ex.y }} />)}
      {projectiles.map(p => <div key={p.id} className="projectile" style={{ left: p.startX, top: p.startY }} />)}
    </>
  );
}
