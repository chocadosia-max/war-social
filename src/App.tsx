import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import './index.css'

interface Post {
  id: string;
  author: string;
  rank: string;
  faction_id: string;
  content: string;
  hp: number;
  shields: number;
  created_at: string;
}

interface Faction {
  id: string;
  name: string;
  color: string;
  bonus: string;
}

const FACTIONS: Faction[] = [
  { id: 'guardians', name: 'GUARDIÕES', color: '#3b82f6', bonus: 'DEFENSE' },
  { id: 'raiders', name: 'INVASORES', color: '#e11d48', bonus: 'ATTACK' },
  { id: 'ghosts', name: 'FANTASMAS', color: '#8b5cf6', bonus: 'TACTICAL' }
];

interface Weapon {
  id: string;
  name: string;
  icon: string;
  damage: number;
  cost: number;
  xpGain: number;
  special?: string;
}

const RANKS = ['RECRUTA', 'SARGENTO', 'CAPITÃO', 'MAJOR', 'GENERAL'];
const WEAPONS: Weapon[] = [
  { id: 'missile', name: 'MÍSSIL', icon: '🚀', damage: 15, cost: 2, xpGain: 5 },
  { id: 'emp', name: 'EMP', icon: '⚡', damage: 10, cost: 8, xpGain: 15, special: 'REMOVE_SHIELDS' },
  { id: 'nuke', name: 'NUKE', icon: '💥', damage: 50, cost: 20, xpGain: 40 }
];

const MOCK_LEADERS = [
  { name: 'GENERAL_ZEUS', rank: 'GENERAL', points: 42903 },
  { name: 'MAJOR_VORTEX', rank: 'MAJOR', points: 31200 },
  { name: 'SRGT_GLITCH', rank: 'SARGENTO', points: 15900 }
];

interface Projectile { id: number; startX: number; startY: number; endX: number; endY: number; }
interface Explosion { id: number; x: number; y: number; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  
  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Gameplay State
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [energy, setEnergy] = useState(100);
  const [xp, setXp] = useState(0);
  const [sp, setSp] = useState(0);
  const [rankIndex, setRankIndex] = useState(0);
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon>(WEAPONS[0]);
  const [userFaction, setUserFaction] = useState<Faction>(FACTIONS[0]);
  
  // Visual FX State
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [showSkills, setShowSkills] = useState(false);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [unlockedSkills, setUnlockedSkills] = useState<string[]>(['base']);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchPosts();
      const channel = supabase
        .channel('combat-feed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setPosts(prev => [payload.new as Post, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setPosts(prev => prev.map(p => p.id === payload.new.id ? payload.new as Post : p));
            if (payload.new.hp < payload.old?.hp) {
              setShakeId(payload.new.id);
              setTimeout(() => setShakeId(null), 500);
            }
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel) };
    }
  }, [session]);

  const fetchPosts = async () => {
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (data) setPosts(data);
  };

  useEffect(() => {
    if (!session) return;
    const energyRegen = unlockedSkills.includes('regen') ? 5000 : 10000;
    const timer = setInterval(() => setEnergy(prev => Math.min(100, prev + 1)), energyRegen);
    return () => clearInterval(timer);
  }, [unlockedSkills, session]);

  useEffect(() => {
    if (xp >= 100) {
      setXp(xp - 100);
      setSp(prev => prev + 1);
      if (rankIndex < RANKS.length - 1) setRankIndex(prev => prev + 1);
    }
  }, [xp, rankIndex]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else setAuthError('Registro concluído! Verifique seu e-mail ou faça login (se instantâneo).');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const calculateCost = (baseCost: number, type: 'ATTACK' | 'DEFENSE' | 'TACTICAL') => {
    let cost = baseCost;
    if (userFaction.bonus === type) {
      if (type === 'ATTACK') cost = 1;
      else if (type === 'DEFENSE') cost = 3;
      else cost = baseCost - 2;
    }
    if (unlockedSkills.includes('efficiency') && type === 'ATTACK') cost = Math.max(1, cost - 1);
    return cost;
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPostContent.trim() === '' || energy < 10 || !session) return;
    
    let initialShields = unlockedSkills.includes('aegis') ? 1 : 0;
    const authorName = session.user.email?.split('@')[0].toUpperCase() || 'SOLDADO';
    
    const { error } = await supabase.from('posts').insert([{
      author: authorName, rank: RANKS[rankIndex], faction_id: userFaction.id, content: newPostContent, hp: 100, shields: initialShields
    }]);
    
    if (!error) {
      setNewPostContent('');
      setEnergy(prev => prev - 10);
      setXp(prev => prev + 20);
    }
  };

  const fireProjectile = (e: React.MouseEvent, targetId: string, onHit: () => void) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const targetEl = document.getElementById(`bunker-${targetId}`);
    if (!targetEl) { onHit(); return; }
    
    const rect = targetEl.getBoundingClientRect();
    const endX = rect.left + rect.width / 2;
    const endY = rect.top + rect.height / 2;
    const projId = Date.now();
    
    setProjectiles(prev => [...prev, { id: projId, startX, startY, endX, endY }]);
    setTimeout(() => {
      setProjectiles(prev => prev.filter(p => p.id !== projId));
      setExplosions(prev => [...prev, { id: projId, x: endX, y: endY }]);
      setTimeout(() => setExplosions(prev => prev.filter(ex => ex.id !== projId)), 500); 
      onHit(); 
    }, 400);
  };

  const handleAttack = (e: React.MouseEvent, id: string, currentPost: Post) => {
    const cost = calculateCost(selectedWeapon.cost, selectedWeapon.special ? 'TACTICAL' : 'ATTACK');
    if (energy < cost || currentPost.hp === 0) return;
    
    setEnergy(prev => prev - cost);
    fireProjectile(e, id, async () => {
      let extraDmg = unlockedSkills.includes('firepower') ? 5 : 0;
      let newHp = Math.max(0, currentPost.hp - (selectedWeapon.damage + extraDmg));
      let newShields = currentPost.shields;
      if (selectedWeapon.special === 'REMOVE_SHIELDS') newShields = 0;
      
      const { error } = await supabase.from('posts').update({ hp: newHp, shields: newShields }).eq('id', id);
      if (!error) setXp(prev => prev + selectedWeapon.xpGain);
    });
  };

  const handleShield = async (id: string, currentPost: Post) => {
    const cost = calculateCost(5, 'DEFENSE');
    if (energy < cost || currentPost.hp === 0) return;
    
    let healAmount = unlockedSkills.includes('nano') ? 25 : 10;
    const { error } = await supabase.from('posts')
      .update({ shields: currentPost.shields + 1, hp: Math.min(100, currentPost.hp + healAmount) })
      .eq('id', id);
      
    if (!error) {
      setEnergy(prev => prev - cost);
      setXp(prev => prev + 10);
    }
  };

  const buySkill = (skillId: string, cost: number) => {
    if (sp >= cost && !unlockedSkills.includes(skillId)) {
      setSp(prev => prev - cost);
      setUnlockedSkills(prev => [...prev, skillId]);
    }
  };

  if (loadingAuth) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}><h2>REDE INICIANDO...</h2></div>;
  }

  /* -------------------------------
     AUTH SCREEN (PORTÃO DE ACESSO)
  -------------------------------- */
  if (!session) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        <div className="sci-fi-bg"></div>
        <div className="glass-panel" style={{ padding: '50px', width: '100%', maxWidth: '450px', textAlign: 'center' }}>
          <h1 style={{ color: 'var(--border-glow)', fontSize: '2.5rem', marginBottom: '10px' }}>WAR SOCIAL</h1>
          <p style={{ color: 'var(--rpg-text-muted)', marginBottom: '40px', fontWeight: 'bold', letterSpacing: '1px' }}>ACESSO RESTRITO ÀS TROPAS</p>
          
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <input 
              type="email" 
              placeholder="Identificação (E-mail)" 
              value={email} onChange={e => setEmail(e.target.value)}
              required
              style={{ padding: '15px', borderRadius: '15px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', fontSize: '1rem', outline: 'none', color: 'var(--rpg-text)', fontWeight: 'bold' }}
            />
            <input 
              type="password" 
              placeholder="Senha Criptografada" 
              value={password} onChange={e => setPassword(e.target.value)}
              required
              style={{ padding: '15px', borderRadius: '15px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)', fontSize: '1rem', outline: 'none', color: 'var(--rpg-text)', fontWeight: 'bold' }}
            />
            
            {authError && <p style={{ color: 'var(--rpg-accent)', fontSize: '0.9rem', fontWeight: 'bold' }}>{authError}</p>}
            
            <button type="submit" className="cyber-btn" style={{ background: 'var(--border-glow)', color: '#fff', borderColor: 'transparent', padding: '15px', fontSize: '1.1rem', marginTop: '10px' }}>
              {isSignUp ? 'ALISTAR-SE (CADASTRAR)' : 'ACESSAR BASE (LOGIN)'}
            </button>
          </form>
          
          <p style={{ marginTop: '30px', color: 'var(--rpg-text-muted)', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }} onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? 'Já pertence às tropas? Faça Login.' : 'Recruta novo? Aliste-se aqui.'}
          </p>
        </div>
      </div>
    );
  }

  /* -------------------------------
     MAIN GAME (O CAMPO DE BATALHA)
  -------------------------------- */
  return (
    <>
      <div className="sci-fi-bg"></div>
      
      {projectiles.map(p => {
        const angle = Math.atan2(p.endY - p.startY, p.endX - p.startX) * 180 / Math.PI;
        const dist = Math.hypot(p.endX - p.startX, p.endY - p.startY);
        return (
          <div key={p.id} className="projectile" style={{
            left: p.startX, top: p.startY,
            transform: `rotate(${angle}deg)`,
            transition: 'transform 0.4s cubic-bezier(0.1, 0.8, 0.1, 1)',
            color: 'var(--rpg-accent)'
          }}
          ref={(el) => {
            if (el) {
              setTimeout(() => {
                el.style.transform = `rotate(${angle}deg) translate(${dist}px, 0)`;
              }, 10);
            }
          }}
          />
        );
      })}
      
      {explosions.map(ex => (
        <div key={ex.id} className="explosion-ring" style={{ left: ex.x, top: ex.y }} />
      ))}

      <main className="app-container">
        <header className="rpg-header glass-panel" style={{ padding: '20px' }}>
          <div>
            <h1 style={{ color: 'var(--border-glow)' }}>WAR SOCIAL RPG</h1>
            <p style={{ color: 'var(--rpg-text-muted)', letterSpacing: '2px', fontWeight: 'bold' }}>COMANDO: @{session.user.email?.split('@')[0].toUpperCase()}</p>
          </div>
          
          <div style={{ display: 'flex', gap: '30px', alignItems: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: 'var(--rpg-text)', fontWeight: 'bold' }}>{xp} XP / 100</p>
              <div className="holo-bar-container" style={{ width: '150px', background: 'rgba(0,0,0,0.1)' }}>
                <div className="holo-bar-fill" style={{ width: `${xp}%`, background: 'var(--rpg-success)' }} />
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: 'var(--rpg-text)', fontWeight: 'bold' }}>{energy} ⚡ / 100</p>
              <div className="holo-bar-container" style={{ width: '150px', background: 'rgba(0,0,0,0.1)' }}>
                <div className="holo-bar-fill" style={{ width: `${energy}%`, background: 'var(--rpg-warning)' }} />
              </div>
            </div>
            <div>
              <button 
                className="cyber-btn" 
                style={{ borderColor: sp > 0 ? 'var(--rpg-accent)' : 'var(--border-muted)', color: sp > 0 ? 'var(--rpg-accent)' : 'inherit' }}
                onClick={() => setShowSkills(true)}
              >
                NEXUS SKILLS (SP: {sp})
              </button>
            </div>
            <div>
               <button className="cyber-btn" onClick={handleLogout} style={{ opacity: 0.7 }}>SAIR</button>
            </div>
          </div>
        </header>

        <div>
          <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', display: 'flex', gap: '20px' }}>
             <div style={{ flex: 1 }}>
               <h3 style={{ fontSize: '0.9rem', color: 'var(--rpg-text)', marginBottom: '10px' }}>ALINHAMENTO</h3>
               <div style={{ display: 'flex', gap: '10px' }}>
                 {FACTIONS.map(f => (
                   <button key={f.id} onClick={() => setUserFaction(f)} className="cyber-btn" 
                     style={{ flex: 1, padding: '8px', opacity: userFaction.id === f.id ? 1 : 0.5, borderColor: f.color, color: f.color }}>
                     {f.name}
                   </button>
                 ))}
               </div>
             </div>
             <div style={{ flex: 1 }}>
               <h3 style={{ fontSize: '0.9rem', color: 'var(--rpg-text)', marginBottom: '10px' }}>ARSENAL ATUAL</h3>
               <div style={{ display: 'flex', gap: '5px' }}>
                 {WEAPONS.map(w => (
                   <button key={w.id} onClick={() => setSelectedWeapon(w)} className="cyber-btn"
                     style={{ flex: 1, padding: '8px', opacity: selectedWeapon.id === w.id ? 1 : 0.4 }}>
                     {w.icon} {calculateCost(w.cost, w.special ? 'TACTICAL' : 'ATTACK')}⚡
                   </button>
                 ))}
               </div>
             </div>
          </div>

          <div className="glass-panel" style={{ padding: '20px', marginBottom: '30px' }}>
            <form onSubmit={handleDeploy} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <h3 style={{ color: userFaction.color, fontSize: '0.9rem' }}>// MOBILIZAR FORÇA-TAREFA [{userFaction.name}]</h3>
              <textarea value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)} 
                placeholder="Declare as coordenadas e intenções do seu bunker..." 
                style={{ background: 'rgba(255,255,255,0.5)', border: `2px solid ${userFaction.color}`, padding: '15px', color: 'var(--rpg-text)', outline: 'none', resize: 'vertical', minHeight: '100px', fontFamily: 'var(--font-main)', fontSize: '1.1rem', borderRadius: '20px' }} />
              <button type="submit" disabled={energy < 10} className="cyber-btn" style={{ background: userFaction.color, color: '#fff', borderColor: 'transparent', marginTop: '10px' }}>
                🚀 CONSTRUIR BUNKER (10⚡)
              </button>
            </form>
          </div>

          <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {posts.map(post => {
              const faction = FACTIONS.find(f => f.id === post.faction_id) || FACTIONS[0];
              const isDead = post.hp === 0;
              return (
                <article key={post.id} id={`bunker-${post.id}`} className={`glass-panel bunker-card ${shakeId === post.id ? 'shake-hard' : ''}`} style={{ color: faction.color, opacity: isDead ? 0.4 : 1 }}>
                  <div className="bunker-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div className="bunker-avatar" style={{ color: faction.color }}>{post.author.charAt(0)}</div>
                      <div>
                        <span style={{ color: faction.color, display: 'block', fontSize: '0.85rem', fontWeight: 'bold' }}>{faction.name} / {post.rank}</span>
                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--rpg-text)' }}>@{post.author}</span>
                      </div>
                    </div>
                    {post.shields > 0 && <span style={{ color: 'var(--rpg-success)', border: '1px solid currentColor', padding: '3px 8px', borderRadius: '15px', fontSize: '0.7rem' }}>🛡️ CAMPO DE FORÇA: {post.shields}</span>}
                  </div>
                  
                  <div style={{ margin: '20px 0' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '5px', color: 'var(--rpg-text)' }}>
                       <span>INTEGRIDADE ESTRUTURAL: {post.hp}%</span>
                     </div>
                     <div className="holo-bar-container">
                       <div className="holo-bar-fill" style={{ width: `${post.hp}%`, background: post.hp > 30 ? 'var(--rpg-success)' : 'var(--rpg-accent)' }} />
                     </div>
                  </div>
                  
                  <p className={isDead ? 'glitch-text' : ''} style={{ color: 'var(--rpg-text)', fontSize: '1.2rem', marginBottom: '25px', lineHeight: '1.5' }}>
                    {isDead ? 'SISTEMA COMPROMETIDO // CORRUPÇÃO DE DADOS LOCALIZADA' : post.content}
                  </p>
                  
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <button onClick={() => handleShield(post.id, post)} disabled={isDead} className="cyber-btn" style={{ flex: 1, color: '#fff', background: 'var(--rpg-success)', borderColor: 'transparent' }}>
                      🛡️ REFORÇAR {calculateCost(5, 'DEFENSE')}⚡
                    </button>
                    <button onClick={(e) => handleAttack(e, post.id, post)} disabled={isDead} className="cyber-btn" style={{ flex: 1, color: '#fff', background: 'var(--rpg-accent)', borderColor: 'transparent' }}>
                      {selectedWeapon.icon} ATACAR {calculateCost(selectedWeapon.cost, selectedWeapon.special ? 'TACTICAL' : 'ATTACK')}⚡
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        <aside>
          <div className="glass-panel" style={{ padding: '25px', position: 'sticky', top: '100px' }}>
            <h2 style={{ color: 'var(--border-glow)', marginBottom: '20px', borderBottom: '1px solid var(--border-muted)', paddingBottom: '10px' }}>
              📡 ALTO COMANDO
            </h2>
            {MOCK_LEADERS.map((l, i) => (
              <div key={l.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '15px', background: 'rgba(255,255,255,0.5)', borderRadius: '20px' }}>
                <div>
                  <span style={{ color: 'var(--rpg-text-muted)', marginRight: '10px', fontWeight: 'bold' }} >0{i + 1}</span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--rpg-text)' }}>{l.name}</span>
                </div>
                <span style={{ color: 'var(--rpg-warning)', fontWeight: 'bold' }}>{l.points.toLocaleString()} PT</span>
              </div>
            ))}
          </div>
        </aside>
      </main>

      {showSkills && (
        <div className="skill-modal-overlay">
          <div className="skill-tree-panel">
            <div style={{ padding: '40px', background: 'rgba(255,255,255,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
               <h2 style={{ color: 'var(--rpg-text)', marginBottom: '10px' }}>THE NEXUS</h2>
               <p style={{ color: 'var(--rpg-text-muted)', fontSize: '0.9rem', marginBottom: '30px' }}>Terminal de Implantes Neuraistáticos de Guerra.</p>
               
               <h1 style={{ color: 'var(--rpg-warning)', fontSize: '3rem', margin: '20px 0' }}>{sp}</h1>
               <p style={{ color: 'var(--rpg-warning)', fontSize: '0.9rem', letterSpacing: '2px', textTransform: 'uppercase' }}>Skill Points (SP) Disponíveis</p>
               
               <button onClick={() => setShowSkills(false)} className="cyber-btn" style={{ width: '100%', marginTop: '50px' }}>DESCONECTAR (SAIR)</button>
            </div>
            
            <div className="skill-nodes-container">
               <div className={`skill-node ${unlockedSkills.includes('regen') ? 'unlocked' : ''}`} 
                    style={{ left: '20%', top: '20%' }}
                    onClick={() => buySkill('regen', 1)} title="Reator Hyperion: Aumenta a velocidade de recarga de Energia (1 SP)">
                 ⚡
               </div>
               
               <div className={`skill-node ${unlockedSkills.includes('efficiency') ? 'unlocked' : ''}`} 
                    style={{ left: '50%', top: '50%' }}
                    onClick={() => buySkill('efficiency', 1)} title="Acelerador Balístico: Reduz o custo de todos os ataques em 1⚡ (1 SP)">
                 🎯
               </div>
               
               <div className={`skill-node ${unlockedSkills.includes('aegis') ? 'unlocked' : ''}`} 
                    style={{ left: '70%', top: '20%' }}
                    onClick={() => buySkill('aegis', 2)} title="Matriz Aegis: Todo bunker seu já é implantado com 1 Escudo Grátis (2 SP)">
                 🛡️
               </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
