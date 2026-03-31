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

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

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

  const userName = session?.user.email?.split('@')[0].toUpperCase() || 'SOLDADO';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoadingAuth(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => { setSession(session); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
      const channel = supabase.channel('war-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
        if (payload.eventType === 'INSERT') setPosts(prev => [payload.new as Post, ...prev]);
        else if (payload.eventType === 'UPDATE') { setPosts(prev => prev.map(p => p.id === payload.new.id ? payload.new as Post : p)); setShakeId(payload.new.id); setTimeout(() => setShakeId(null), 500); }
      }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, p => setComments(prev => [...prev, p.new as Comment]))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actions_log' }, p => setActionLogs(prev => [p.new as ActionLog, ...prev].slice(0, 50)))
      .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [session]);

  const fetchData = async () => {
    const { data: p } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (p) setPosts(p);
    const { data: c } = await supabase.from('comments').select('*').limit(300);
    if (c) setComments(c);
    const { data: l } = await supabase.from('actions_log').select('*').order('created_at', { ascending: false }).limit(50);
    if (l) setActionLogs(l);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError('');
    const { error } = isSignUp ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim() || energy < 10) return;
    const { error } = await supabase.from('posts').insert([{ author: userName, rank: RANKS[rankIndex], faction_id: userFaction.id, content: newPostContent, hp: 100, shields: 0 }]);
    if (!error) { 
      setNewPostContent(''); setEnergy(prev => prev - 10); setXp(prev => prev + 15);
      await supabase.from('actions_log').insert([{ actor: userName, action_type: 'DEPLOY', details: 'estabeleceu um bunker tático.' }]);
    }
  };

  const handleAttack = (e: React.MouseEvent, target: Post) => {
    if (energy < selectedWeapon.cost || target.hp === 0) return;
    setEnergy(prev => prev - selectedWeapon.cost);
    const startX = e.clientX; const startY = e.clientY;
    const targetEl = document.getElementById(`bunker-${target.id}`);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const projId = Date.now();
      setProjectiles(prev => [...prev, { id: projId, startX, startY, endX: rect.left + rect.width / 2, endY: rect.top + rect.height / 2 }]);
      setTimeout(async () => {
        setProjectiles(prev => prev.filter(p => p.id !== projId));
        setExplosions(prev => [...prev, { id: projId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }]);
        setTimeout(() => setExplosions(prev => prev.filter(ex => ex.id !== projId)), 500);
        await supabase.from('posts').update({ hp: Math.max(0, target.hp - selectedWeapon.damage) }).eq('id', target.id);
        await supabase.from('actions_log').insert([{ actor: userName, action_type: 'ATTACK', details: `usou ${selectedWeapon.name} contra @${target.author}` }]);
        setXp(prev => prev + 10);
      }, 400);
    }
  };

  const handleShield = async (target: Post) => {
    if (energy < 10) return;
    setEnergy(prev => prev - 10);
    await supabase.from('posts').update({ hp: Math.min(100, target.hp + 15) }).eq('id', target.id);
    await supabase.from('actions_log').insert([{ actor: userName, action_type: 'DEFEND', details: `reforçou as defesas de @${target.author}` }]);
    setXp(prev => prev + 5);
  };

  const openUserProfile = async (name: string) => {
    setSelectedUser(name);
    const { data } = await supabase.from('actions_log').select('action_type').eq('actor', name);
    if (data) setSelectedUserStats({ attacks: data.filter(d => d.action_type === 'ATTACK').length, defends: data.filter(d => d.action_type === 'DEFEND').length, drops: data.filter(d => d.action_type === 'DEPLOY').length });
  };

  if (loadingAuth) return <div className="loading-wrap" style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}><h2>INICIALIZANDO HUD...</h2></div>;

  if (!session) return (
    <div className="auth-overlay" style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ padding: 40, width: 400, textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: 20 }}>⚔️ WAR SOCIAL</h2>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input className="post-input" style={{ borderRadius: 8 }} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="post-input" style={{ borderRadius: 8 }} type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required />
          {authError && <p style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{authError}</p>}
          <button className="nav-center" style={{ width: '100%', border: 'none', cursor: 'pointer' }}>{isSignUp ? 'ALISTAR' : 'ACESSAR'}</button>
        </form>
        <p onClick={() => setIsSignUp(!isSignUp)} style={{ marginTop: 20, cursor: 'pointer', color: 'var(--t3)', fontSize: '0.8rem' }}>{isSignUp ? 'Já tem conta? Login' : 'Novo recruta? Registre-se'}</p>
      </div>
    </div>
  );

  return (
    <>
      <header className="top-bar">
        <div className="logo"><span className="logo-icon">⚔️</span><span className="logo-text">WarSocial</span></div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
           <div className="desktop-only" style={{ display: 'flex', gap: 16 }}>
              <span style={{ color: 'var(--gold)', fontWeight: 800 }}>⚡ {energy}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 800 }}>🛡️ {hp}%</span>
           </div>
           <button onClick={() => setShowShop(true)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer' }}>🛒</button>
           <button onClick={async () => await supabase.auth.signOut()} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer' }}>🚪</button>
        </div>
      </header>

      <div className="app-container" data-theme={currentSkin}>
        <aside className="left-col sidebar-sticky">
           <div className="card profile-card">
              <div className="profile-av-wrap"><div className="profile-av">{userName.charAt(0)}</div></div>
              <div className="profile-name">@{userName}</div>
              <div className="profile-rank">{RANK_TITLES[rankIndex]}</div>
              <div className="stats-grid">
                 <div className="stat-box"><span className="stat-val">{energy}</span><span className="stat-key">Energia</span></div>
                 <div className="stat-box"><span className="stat-val">{xp}</span><span className="stat-key">XP</span></div>
              </div>
              <div style={{ marginTop: 16, fontSize: '0.7rem', color: 'var(--t3)' }}>UNIT: {userFaction.name}</div>
              <button className="post-action" style={{ width: '100%', marginTop: 20, border: '1px solid var(--gold)', color: 'var(--gold)' }} onClick={() => setShowSkills(true)}>🧬 NEXUS TERMINAL</button>
           </div>

           <div className="card" style={{ padding: 20 }}>
             <h3 style={{ fontSize: '0.8rem', color: 'var(--t3)', marginBottom: 12 }}>SELECIONAR ARSENAL</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {WEAPONS.map(w => (
                  <button key={w.id} onClick={() => setSelectedWeapon(w)} className={`post-action ${selectedWeapon.id === w.id ? 'active' : ''}`} style={{ justifyContent: 'flex-start', padding: '12px' }}>
                    <span style={{ fontSize: '1.2rem' }}>{w.icon}</span> <span>{w.name}</span>
                  </button>
                ))}
             </div>
           </div>
        </aside>

        <main className="main-feed">
           <div className="stories-row">
              {MOCK_LEADERS.map(l => (
                <div key={l.name} className="story-item" onClick={() => openUserProfile(l.name)}>
                  <div className="story-ring"><div className="story-av" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{l.icon}</div></div>
                  <span className="story-name">{l.name.split('_')[1] || l.name}</span>
                </div>
              ))}
              {['TITAN', 'SQUAD', 'NEXUS', 'ALPHA', 'BRAVO'].map(n => (
                <div key={n} className="story-item" onClick={() => openUserProfile(n)}>
                   <div className="story-ring"><div className="story-av" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{n.charAt(0)}</div></div>
                   <span className="story-name">{n}</span>
                </div>
              ))}
           </div>

           <div className="card" style={{ padding: 16 }}>
              <form onSubmit={handleDeploy} style={{ display: 'flex', gap: 12 }}>
                <div className="post-av" style={{ width: 38, height: 38 }}>{userName.charAt(0)}</div>
                <input className="post-input" placeholder={`Briefing de guerra, ${userName}?`} value={newPostContent} onChange={e => setNewPostContent(e.target.value)} />
                <button className="nav-center" style={{ width: 42, height: 42, margin: 0, borderRadius: '50%', border: 'none', cursor: 'pointer' }}>⚔️</button>
              </form>
           </div>

           {posts.map(post => (
             <article key={post.id} className={`card post ${shakeId === post.id ? 'shake-hard' : ''}`} id={`bunker-${post.id}`}>
                <div className="post-head">
                   <div className="post-av" onClick={() => openUserProfile(post.author)}>{post.author.charAt(0)}</div>
                   <div className="post-meta">
                      <div className="post-author">@{post.author}</div>
                      <div className="post-time">{timeAgo(post.created_at)}</div>
                   </div>
                </div>
                <div className="post-body">{post.content}</div>
                <div className="hp-module">
                   <div className="hp-label"><span>Integridade do Bunker</span> <span>{post.hp}%</span></div>
                   <div className="hp-track">
                      <div className={`hp-fill ${post.hp > 60 ? 'hp-high' : post.hp > 30 ? 'hp-mid' : 'hp-low'}`} style={{ width: `${post.hp}%` }}></div>
                   </div>
                </div>
                <div className="post-actions">
                   <button className="post-action atk" onClick={e => handleAttack(e, post)}>⚔️ {selectedWeapon.damage} ATK</button>
                   <button className="post-action def" onClick={() => handleShield(post)}>🛡️ REFORÇAR</button>
                   <button className="post-action" style={{ border: 'none' }}>💬 {comments.filter(c => c.post_id === post.id).length || ''}</button>
                </div>
                {comments.filter(c => c.post_id === post.id).length > 0 && (
                  <div style={{ padding: '0 20px 16px', fontSize: '0.8rem', color: 'var(--t3)' }}>
                    <strong>@{comments.find(c => c.post_id === post.id)?.author}:</strong> {comments.find(c => c.post_id === post.id)?.content}
                  </div>
                )}
                <form onSubmit={e => {
                   e.preventDefault();
                   const txt = commentInputs[post.id];
                   if (txt) {
                     supabase.from('comments').insert([{ post_id: post.id, author: userName, content: txt }]).then(() => setCommentInputs(prev => ({ ...prev, [post.id]: '' })));
                   }
                }} style={{ padding: '0 20px 20px' }}>
                   <input className="post-input" style={{ background: 'transparent', height: 30, fontSize: '0.8rem' }} placeholder="Adicionar transmissão..." value={commentInputs[post.id] || ''} onChange={evt => setCommentInputs(p => ({ ...p, [post.id]: evt.target.value }))} />
                </form>
             </article>
           ))}
        </main>

        <aside className="right-col sidebar-sticky">
           <div className="card radar-card">
              <h3 style={{ fontSize: '0.9rem', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>📡 RADAR TÁTICO</h3>
              <div className="radar-list">
                 {actionLogs.map(log => (
                   <div key={log.id} className="radar-entry"><strong>@{log.actor}</strong> {log.details}</div>
                 ))}
                 {actionLogs.length === 0 && <div className="radar-entry" style={{ opacity: 0.5 }}>Silêncio no rádio...</div>}
              </div>
           </div>
           
           <div className="card" style={{ padding: 20, marginTop: 20 }}>
             <h3 style={{ fontSize: '0.9rem', marginBottom: 12 }}>🏆 ELITE COMANDO</h3>
             {MOCK_LEADERS.map((l, i) => (
               <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                  <span>#{i+1} @{l.name}</span>
                  <span style={{ color: 'var(--gold)', fontWeight: 800 }}>{l.points}</span>
               </div>
             ))}
           </div>
        </aside>
      </div>

      <nav className="mobile-nav">
         <div className="nav-btn active"><span className="icon">🏠</span><span className="label">Início</span></div>
         <div className="nav-btn" onClick={() => setShowSkills(true)}><span className="icon">📡</span><span className="label">Radar</span></div>
         <div className="nav-center" onClick={() => document.querySelector<HTMLInputElement>('.post-input')?.focus()}><span>+</span></div>
         <div className="nav-btn" onClick={() => setShowSkills(true)}><span className="icon">⚔️</span><span className="label">Arsenal</span></div>
         <div className="nav-btn" onClick={() => openUserProfile(userName)}><span className="icon">👤</span><span className="label">Perfil</span></div>
      </nav>

      {/* MODALS */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="profile-av" style={{ width: 80, height: 80, margin: '0 auto 16px', border: '3px solid var(--gold)' }}>{selectedUser.charAt(0)}</div>
            <h2 style={{ textAlign: 'center', marginBottom: 20 }}>@{selectedUser}</h2>
            <div className="stats-grid">
               <div className="stat-box"><span className="stat-val">{selectedUserStats.attacks}</span><span className="stat-key">Ataques</span></div>
               <div className="stat-box"><span className="stat-val">{selectedUserStats.defends}</span><span className="stat-key">Defesas</span></div>
            </div>
            {selectedUser === userName && (
              <div style={{ marginTop: 24 }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--t3)', marginBottom: 12, textAlign: 'center' }}>PERSONALIZAR HUD</h4>
                <div style={{ display: 'flex', gap: 12 }}>
                   <button className={`post-action ${currentSkin === 'default' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setCurrentSkin('default')}>SCIFI</button>
                   <button className={`post-action ${currentSkin === 'brasil' ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => setCurrentSkin('brasil')}>BRASIL</button>
                </div>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {FACTIONS.map(f => (
                    <button key={f.id} onClick={() => setUserFaction(f)} className={`skill-node ${userFaction.id === f.id ? 'active' : ''}`} style={{ padding: '6px', fontSize: '0.6rem', border: '1px solid var(--border)', background: 'transparent', borderRadius: 4 }}>{f.name}</button>
                  ))}
                </div>
              </div>
            )}
            <button className="post-action" style={{ width: '100%', marginTop: 24 }} onClick={() => setSelectedUser(null)}>FECHAR TERMINAL</button>
          </div>
        </div>
      )}

      {showSkills && (
        <div className="modal-overlay" onClick={() => setShowSkills(false)}>
           <div className="modal-panel" onClick={e => e.stopPropagation()}>
              <h2 style={{ textAlign: 'center', marginBottom: 12 }}>🧬 NEXUS SP: {sp}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                 <div className="card" style={{ padding: 12, textAlign: 'center', cursor: 'pointer' }} onClick={() => setSp(s => s+1)}>REGENERAÇÃO</div>
                 <div className="card" style={{ padding: 12, textAlign: 'center', opacity: 0.5 }}>FIREPOWER V2</div>
              </div>
              <div style={{ marginTop: 20, textAlign: 'center' }}>
                 <p style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>XP REQUERIDO PARA RANK UP: {100 - xp}</p>
                 <button onClick={() => setRankIndex(prev => Math.min(prev + 1, RANKS.length - 1))} style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--gold)', background: 'none', border: '1px solid var(--gold)', padding: '4px 8px', borderRadius: 4 }}>Manual Rank Test</button>
                 <button onClick={() => setHp(100)} style={{ marginLeft: 8, fontSize: '0.7rem', color: 'var(--red)', background: 'none', border: '1px solid var(--red)', padding: '4px 8px', borderRadius: 4 }}>Emergency Heal</button>
              </div>
              <button className="post-action" style={{ width: '100%', marginTop: 24 }} onClick={() => setShowSkills(false)}>FECHAR</button>
           </div>
        </div>
      )}

      {showShop && (
        <div className="modal-overlay" onClick={() => setShowShop(false)}>
          <div className="modal-panel" style={{ textAlign: 'center' }}>
            <h2 style={{ color: 'var(--gold)', marginBottom: 20 }}>💎 BLACK MARKET</h2>
            <div className="card" style={{ padding: 24, border: '1px solid var(--gold)' }}>
               <h3>SUPREME VIP PACK</h3>
               <p style={{ color: 'var(--t3)', fontSize: '0.85rem' }}>Skin Exclusiva Brasil + Status de Veterano</p>
               <button className="nav-center" style={{ width: '100%', border: 'none', marginTop: 20, cursor: 'pointer' }}>ADQUIRIR R$ 15,00</button>
            </div>
            <button className="post-action" style={{ width: '100%', marginTop: 20 }} onClick={() => setShowShop(false)}>VOLTAR</button>
          </div>
        </div>
      )}

      {explosions.map(ex => <div key={ex.id} className="explosion-ring" style={{ left: ex.x, top: ex.y }} />)}
      {projectiles.map(p => <div key={p.id} className="projectile" style={{ left: p.startX, top: p.startY }} />)}
    </>
  );
}
