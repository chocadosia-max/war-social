import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
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
  { id: 'guardians', name: 'GUARDIÕES', color: '#00ccff', bonus: 'DEFENSE' },
  { id: 'raiders', name: 'INVASORES', color: '#ff3b3f', bonus: 'ATTACK' },
  { id: 'ghosts', name: 'FANTASMAS', color: '#ffd600', bonus: 'TACTICAL' }
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

interface Leader {
  name: string;
  rank: string;
  points: number;
}

const RANKS = ['RECRUTA', 'SARGENTO', 'CAPITÃO', 'MAJOR', 'GENERAL'];
const WEAPONS: Weapon[] = [
  { id: 'missile', name: 'MÍSSIL', icon: '🚀', damage: 15, cost: 2, xpGain: 5 },
  { id: 'emp', name: 'EMP', icon: '⚡', damage: 10, cost: 8, xpGain: 15, special: 'REMOVE_SHIELDS' },
  { id: 'nuke', name: 'NUKE', icon: '💥', damage: 50, cost: 20, xpGain: 40 }
];

const MOCK_LEADERS: Leader[] = [
  { name: 'GENERAL_ZEUS', rank: 'GENERAL', points: 42903 },
  { name: 'MAJOR_VORTEX', rank: 'MAJOR', points: 31200 },
  { name: 'SRGT_GLITCH', rank: 'SARGENTO', points: 15900 }
];

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [energy, setEnergy] = useState(100);
  const [xp, setXp] = useState(24);
  const [rankIndex, setRankIndex] = useState(0);
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon>(WEAPONS[0]);
  const [userFaction, setUserFaction] = useState<Faction>(FACTIONS[0]);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [showStore, setShowStore] = useState(false);
  const [copyStatus, setCopyStatus] = useState(false);

  useEffect(() => {
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
  }, []);

  const fetchPosts = async () => {
    const { data } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
    if (data) setPosts(data);
  };

  useEffect(() => {
    const timer = setInterval(() => setEnergy(prev => Math.min(100, prev + 1)), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (xp >= 100 && rankIndex < RANKS.length - 1) {
      setXp(xp - 100);
      setRankIndex(prev => prev + 1);
    }
  }, [xp, rankIndex]);

  const calculateCost = (baseCost: number, type: 'ATTACK' | 'DEFENSE' | 'TACTICAL') => {
    if (userFaction.bonus === type) {
      if (type === 'ATTACK') return 1;
      if (type === 'DEFENSE') return 3;
      return baseCost - 2;
    }
    return baseCost;
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPostContent.trim() === '' || energy < 10) return;
    const { error } = await supabase.from('posts').insert([{
      author: 'VOCÊ', rank: RANKS[rankIndex], faction_id: userFaction.id, content: newPostContent, hp: 100, shields: 0
    }]);
    if (!error) {
      setNewPostContent('');
      setEnergy(prev => prev - 10);
      setXp(prev => prev + 20);
    }
  };

  const handleAttack = async (id: string, currentPost: Post) => {
    const cost = calculateCost(selectedWeapon.cost, selectedWeapon.special ? 'TACTICAL' : 'ATTACK');
    if (energy < cost || currentPost.hp === 0) return;
    let newHp = Math.max(0, currentPost.hp - selectedWeapon.damage);
    let newShields = currentPost.shields;
    if (selectedWeapon.special === 'REMOVE_SHIELDS') newShields = 0;
    const { error } = await supabase.from('posts').update({ hp: newHp, shields: newShields }).eq('id', id);
    if (!error) {
      setEnergy(prev => prev - cost);
      setXp(prev => prev + selectedWeapon.xpGain);
    }
  };

  const handleShield = async (id: string, currentPost: Post) => {
    const cost = calculateCost(5, 'DEFENSE');
    if (energy < cost || currentPost.hp === 0) return;
    const { error } = await supabase.from('posts')
      .update({ shields: currentPost.shields + 1, hp: Math.min(100, currentPost.hp + 10) })
      .eq('id', id);
    if (!error) {
      setEnergy(prev => prev - cost);
      setXp(prev => prev + 8);
    }
  };

  const copyRefLink = () => {
    navigator.clipboard.writeText('https://war-social.vercel.app/join/VOCE');
    setCopyStatus(true);
    setXp(prev => prev + 5);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  return (
    <main className="scanline">
      {/* HUD Header */}
      <header className="hud-border hud-glass" style={{ marginBottom: '20px', padding: '20px', position: 'sticky', top: '10px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="text-mono" style={{ fontSize: '1.2rem', color: 'var(--color-health)' }}>WAR_SOCIAL.v1.0</h1>
            <p className="text-small text-muted">LINHA_DE_COMANDO_ESTRATÉGICA</p>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={() => setShowStore(true)} style={{ background: 'var(--color-energy)', color: 'black', border: 'none', padding: '5px 12px', cursor: 'pointer', fontWeight: 'bold' }}>🛒 LOJA</button>
            <div style={{ textAlign: 'right' }}>
              <p className="text-mono text-small" style={{ color: 'var(--color-energy)' }}>⚡ {energy}/100</p>
              <p className="text-mono text-small" style={{ color: userFaction.color }}>🎖️ {RANKS[rankIndex]}</p>
            </div>
          </div>
        </div>

        {/* Faction & Weapon Selectors */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {FACTIONS.map(f => (
            <div key={f.id} onClick={() => setUserFaction(f)} style={{ flex: 1, padding: '8px', cursor: 'pointer', textAlign: 'center', border: `1px solid ${userFaction.id === f.id ? f.color : 'var(--bg-accent)'}`, background: userFaction.id === f.id ? f.color + '22' : 'transparent' }}>
              <p className="text-mono" style={{ fontSize: '0.6rem', color: f.color }}>{f.name}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '5px', padding: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--bg-accent)' }}>
          {WEAPONS.map(w => (
            <button key={w.id} onClick={() => setSelectedWeapon(w)} className="text-mono text-small" style={{ padding: '5px', flex: 1, background: selectedWeapon.id === w.id ? 'var(--color-attack)' : 'transparent', color: selectedWeapon.id === w.id ? 'black' : 'var(--text-primary)', border: 'none', cursor: 'pointer' }}>
              {w.icon} {calculateCost(w.cost, w.special ? 'TACTICAL' : 'ATTACK')}⚡
            </button>
          ))}
        </div>

        <div style={{ width: '100%', height: '3px', background: 'var(--bg-accent)' }}>
          <div style={{ width: `${xp}%`, height: '100%', background: userFaction.color, transition: 'width 0.3s ease', boxShadow: `0 0 10px ${userFaction.color}` }}></div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="layout-grid">
        <div>
          <section className="hud-border" style={{ padding: '20px', marginBottom: '30px', background: 'rgba(255,255,255,0.02)' }}>
            <form onSubmit={handleDeploy} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea value={newPostContent} onChange={(e) => setNewPostContent(e.target.value)} placeholder={`Declare seu bunker (${userFaction.name})...`} style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-accent)', padding: '12px', color: 'var(--text-primary)', outline: 'none', resize: 'none', minHeight: '80px' }} />
              <button type="submit" disabled={energy < 10} className="text-mono text-small" style={{ padding: '10px', background: energy < 10 ? 'var(--bg-accent)' : userFaction.color, color: 'black', fontWeight: 'bold' }}>🚀 LANÇAR (10⚡)</button>
            </form>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {posts.map(post => {
              const faction = FACTIONS.find(f => f.id === post.faction_id) || FACTIONS[0];
              return (
                <article key={post.id} className={`hud-border hud-glass ${shakeId === post.id ? 'shake-animation' : ''}`} style={{ padding: '20px', opacity: post.hp === 0 ? 0.3 : 1, borderLeft: `8px solid ${faction.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ color: faction.color, fontSize: '0.8rem' }}>[{faction.name}] {post.author}</span>
                    <span className="text-muted text-small">{post.shields > 0 ? '🛡️ ATIVA' : ''}</span>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'var(--bg-accent)', marginBottom: '15px' }}>
                    <div style={{ width: `${post.hp}%`, height: '100%', background: post.hp > 30 ? 'var(--color-health)' : 'var(--color-attack)', transition: 'width 0.4s ease' }}></div>
                  </div>
                  <p style={{ marginBottom: '15px', color: 'var(--text-primary)' }}>{post.hp === 0 ? '>>> ALVO DESTRUÍDO <<<' : post.content}</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => handleShield(post.id, post)} disabled={post.hp === 0} style={{ padding: '10px', flex: 1, background: 'none', border: `1px solid ${faction.color}`, color: faction.color, cursor: 'pointer' }}>🛡️ REFORÇAR</button>
                    <button onClick={() => handleAttack(post.id, post)} disabled={post.hp === 0} style={{ padding: '10px', flex: 1, background: 'none', border: '1px solid var(--color-attack)', color: 'var(--color-attack)', cursor: 'pointer' }}>{selectedWeapon.icon} ATACAR</button>
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        {/* Sidebar */}
        <aside>
          {/* Recruitment Panel */}
          <div className="hud-border hud-glass" style={{ padding: '20px', marginBottom: '20px' }}>
            <h3 className="text-mono text-small" style={{ color: 'var(--color-health)', marginBottom: '10px' }}>📢 RECRUTAMENTO</h3>
            <p className="text-small text-muted" style={{ fontSize: '0.65rem', marginBottom: '15px' }}>Convide aliados e ganhe +5 XP por convite!</p>
            <button onClick={copyRefLink} style={{ width: '100%', padding: '8px', background: 'var(--bg-accent)', border: '1px solid var(--text-muted)', color: 'white', cursor: 'pointer' }}>{copyStatus ? '✅ COPIADO!' : '🔗 COPIAR LINK'}</button>
          </div>

          <div className="hud-border hud-glass" style={{ padding: '20px' }}>
            <h2 className="text-mono text-small" style={{ color: 'var(--color-shield)', marginBottom: '15px' }}>🎖️ ALTO_COMANDO</h2>
            {MOCK_LEADERS.map((l, i) => (
              <div key={l.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.75rem' }}>
                <span>{i + 1}. {l.name}</span>
                <span style={{ color: 'var(--color-energy)' }}>{l.points.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Store Modal */}
      {showStore && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="text-mono" style={{ color: 'var(--color-energy)', marginBottom: '20px', textAlign: 'center' }}>🏪 WAR_SOCIAL_STORE</h2>
            <div className="shop-item pulse-energy">
              <div>
                <p className="text-mono">RECARGA TOTAL</p>
                <p className="text-small text-muted">Restaura 100 de Energia</p>
              </div>
              <button onClick={() => { setEnergy(100); setShowStore(false); }} style={{ padding: '8px 15px', background: 'var(--color-energy)', border: 'none', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}>$ 4.99</button>
            </div>
            <div className="shop-item">
              <div>
                <p className="text-mono">KIT DE ELITE</p>
                <p className="text-small text-muted">+500 XP Instantâneo</p>
              </div>
              <button style={{ padding: '8px 15px', background: 'var(--color-health)', border: 'none', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}>$ 9.99</button>
            </div>
            <button onClick={() => setShowStore(false)} style={{ width: '100%', marginTop: '20px', padding: '10px', background: 'none', border: '1px solid var(--color-attack)', color: 'var(--color-attack)', cursor: 'pointer' }}>FECHAR TERMINAL</button>
          </div>
        </div>
      )}
      <footer style={{ marginTop: '30px', padding: '20px', textAlign: 'center' }}>
        <p className="text-mono text-small text-muted">WAR_SOCIAL_NETWORK_v1.0_2026</p>
      </footer>
    </main>
  )
}
