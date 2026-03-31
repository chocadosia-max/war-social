import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import './index.css'

interface Post { id: string; author: string; rank: string; faction_id: string; content: string; hp: number; shields: number; created_at: string }
interface Comment { id: string; post_id: string; author: string; content: string; created_at: string }
interface ActionLog { id: string; actor: string; action_type: string; details: string; created_at: string }

const RANKS = ['RECRUTA', 'SARGENTO', 'CAPITÃO', 'MAJOR', 'GENERAL'];
const RANK_TITLES = ['Soldado da Frente', 'Guerreiro Tático', 'Comandante de Campo', 'Senhor da Guerra', 'Lenda Suprema'];

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
  const [isSignUp, setIsSignUp] = useState(false);

  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  const [energy, setEnergy] = useState(100);
  const [hp] = useState(100);
  const [mana] = useState(18200); // Mocked for UI depth
  const [xp, setXp] = useState(24800);   // Mocked for UI depth
  const [karma] = useState(2847);
  const [rankIndex] = useState(0);

  const [shakeId, setShakeId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{id: number, ico: string, title: string, sub: string}[]>([]);

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

  const addToast = (ico: string, title: string, sub: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, ico, title, sub }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = isSignUp ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      addToast('⚠️', 'Acesso Negado', error.message);
    } else {
      addToast('🔓', 'Autenticação', 'Acesso autorizado ao HUD Tático.');
    }
  };

  const handleDeploy = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newPostContent.trim() || energy < 10) return;
    const { error } = await supabase.from('posts').insert([{ author: userName, rank: RANKS[rankIndex], content: newPostContent, hp: 100, shields: 0 }]);
    if (!error) { 
      setNewPostContent(''); setEnergy(prev => prev - 10); setXp(prev => prev + 15);
      addToast('⚔️', 'Bunker Estabelecido!', 'Seu briefing foi transmitido via rede tática.');
      await supabase.from('actions_log').insert([{ actor: userName, action_type: 'DEPLOY', details: 'estabeleceu um novo bunker tático.' }]);
    }
  };

  const handleAttack = async (post: Post) => {
    if (energy < 15 || post.hp === 0) return;
    setEnergy(prev => prev - 15);
    setXp(prev => prev + 10);
    const newHp = Math.max(0, post.hp - 15);
    addToast('🚀', 'Ataque Confirmado!', `Você atingiu o bunker de @${post.author}`);
    await supabase.from('posts').update({ hp: newHp }).eq('id', post.id);
    await supabase.from('actions_log').insert([{ actor: userName, action_type: 'ATTACK', details: `iniciou ofensiva contra @${post.author}` }]);
  };

  const handleShield = async (post: Post) => {
    if (energy < 10) return;
    setEnergy(prev => prev - 10);
    setXp(prev => prev + 5);
    const newHp = Math.min(100, post.hp + 10);
    addToast('🛡️', 'Defesa Reforçada!', `Você regenerou a integridade de @${post.author}`);
    await supabase.from('posts').update({ hp: newHp }).eq('id', post.id);
    await supabase.from('actions_log').insert([{ actor: userName, action_type: 'DEFEND', details: `reforçou as defesas de @${post.author}` }]);
  };

  if (loadingAuth) return <div className="loading-wrap" style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}><h2>INICIALIZANDO HUD...</h2></div>;

  return (
    <>
      <div className="scanline"></div>
      <div className="toast-area">
        {toasts.map(t => (
          <div key={t.id} className="toast" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
            <div className="toast-ico">{t.ico}</div>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              <div className="toast-sub">{t.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {!session ? (
        <div className="landing-wrap">
          <div className="landing-content">
            
            <div className="landing-copy">
              <h1 className="l-title">O PRIMEIRO <span className="l-acc">FRONT<br/> DE BATALHA</span> SOCIAL.</h1>
              <p className="l-sub">No <strong>WarSocial</strong>, sua rede não é um mural de fotos, é um simulador de combate e estratégia. Crie sua guilda, utilize ataques para descer a integridade de rivais ou reforce aliados para ganhar Karma. Sobreviva, evolua e escreva sua história neste ecossistema gamificado.</p>
              
              <div className="l-features">
                <div className="l-feat">
                  <span className="l-feat-ico">⚔️</span>
                  <div>
                    <h3 className="l-feat-h">Combate Social em Tempo Real</h3>
                    <p className="l-feat-p">Todo post possui HP (Saúde) e pode ser atacado ou defendido pela comunidade. Escolha o seu lado do fogo cruzado.</p>
                  </div>
                </div>
                <div className="l-feat">
                  <span className="l-feat-ico">🏆</span>
                  <div>
                    <h3 className="l-feat-h">Karma & Gamificação</h3>
                    <p className="l-feat-p">Receba XP baseado em atos valiosos. Seja impiedoso ou curandeiro e veja seu status se solidificar nos Rankings.</p>
                  </div>
                </div>
                <div className="l-feat">
                  <span className="l-feat-ico">🛡️</span>
                  <div>
                    <h3 className="l-feat-h">Guerra de Guildas</h3>
                    <p className="l-feat-p">Uma guilda fragmentada cai rápido. Convide recrutas, coordene ataques no Radar Tático e monopolize o feed.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="landing-form-box">
              <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
                <div className="logo-emblem" style={{ margin: '0 auto 20px', width: 64, height: 64, fontSize: 32 }}>⚔️</div>
                <h2 className="logo-name" style={{ marginBottom: 30, fontSize: '3rem' }}>WarSocial</h2>
                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <input className="auth-input" placeholder="Endereço de E-mail" value={email} onChange={e => setEmail(e.target.value)} required />
                  <input className="auth-input" type="password" placeholder="Chave de Acesso" value={password} onChange={e => setPassword(e.target.value)} required />
                  <button className="btn-post" style={{ width: '100%', height: 48, justifyContent: 'center', fontSize: '1.2rem', marginTop: 8 }}>{isSignUp ? 'CONCLUIR ALISTAMENTO' : 'ACESSAR HUD TÁTICO'}</button>
                </form>
                <p onClick={() => setIsSignUp(!isSignUp)} style={{ marginTop: 28, cursor: 'pointer', color: 'var(--tx3)', fontSize: '0.9rem', fontWeight: 600 }}>{isSignUp ? 'Já tem conta? Retorne ao painel' : 'Novo recruta? Inicie seu Alistamento'}</p>
              </div>
            </div>

          </div>
        </div>
      ) : (
        <>


      <aside className="tactical-rail">
        <div className="rail-user">
          <div className="rail-av">{userName.charAt(0)}<div className="rail-av-on"></div></div>
          <div className="rail-uinfo">
            <div style={{color: 'var(--tx)', fontFamily:'Bebas Neue', fontSize:'1.2rem', letterSpacing:'1px'}}>{userName}</div>
            <div style={{color:'var(--gold)', fontFamily:'Barlow Condensed', fontSize:'0.75rem', fontWeight:800}}>⭐ LVL {Math.floor(xp/1000)} · {RANKS[rankIndex]}</div>
          </div>
        </div>

        <div className="rail-item active"><span className="rail-ico">🏠</span><span className="rail-lb">FEED TÁTICO</span></div>
        <div className="rail-item"><span className="rail-ico">👥</span><span className="rail-lb">GUILDAS</span></div>
        <div className="rail-item"><span className="rail-ico">⚔️</span><span className="rail-lb">BATALHAS</span></div>
        <div className="rail-item"><span className="rail-ico">🏆</span><span className="rail-lb">RANKING</span></div>

        <div style={{ marginTop: '20px', borderTop: '1px solid var(--rim)', paddingTop: '20px', width: '100%' }}>
          <div className="rail-item"><div className="rail-ico" style={{position:'relative'}}>✉️<span className="rail-badge">5</span></div><span className="rail-lb">MENSAGENS</span></div>
          <div className="rail-item"><div className="rail-ico" style={{position:'relative'}}>🔔<span className="rail-badge">12</span></div><span className="rail-lb">ALERTAS</span></div>
          <div className="rail-item"><div className="rail-ico" style={{color:'#ff4444', fontSize:'14px'}}>🔴</div><span className="rail-lb" style={{color:'#ff4444', fontWeight:800}}>TRANSMISSÃO LIVE</span></div>
        </div>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--rim)', width: '100%' }}>
          <div className="rail-item" onClick={async () => await supabase.auth.signOut()}>
            <span className="rail-ico">🚪</span><span className="rail-lb">LOGOUT</span>
          </div>
        </div>
      </aside>

      <header className="topnav">
        <div className="logo">
          <div className="logo-emblem">⚔️</div>
          <span className="logo-name">WarSocial</span>
          <span className="logo-tag">v2.0</span>
        </div>
        <div className="nav-search">
          <span className="sico">🔍</span>
          <input type="text" placeholder="Buscar heróis, guildas, batalhas..." />
        </div>
        <div className="nav-r">
          {/* TOPNAV Vazia no Desktop após transferência para o Rail */}
        </div>
      </header>

      <div className="wrap">
        <aside className="left sidebar-sticky">
          <div className="panel profile-panel">
            <div className="banner">
              <div className="banner-fx"></div>
              <div className="banner-lines"></div>
              <div className="banner-glyph">WS</div>
            </div>
            <div className="pav-row">
              <div className="pav">{userName.charAt(0)}<div className="pav-ring"></div></div>
              <span className="pfaction fac-a">⚔ Aliança</span>
            </div>
            <div className="pbody">
              <div className="pname">{userName}</div>
              <div className="ptitle">✦ {RANK_TITLES[rankIndex]}</div>
              <div className="pbio">"No campo de batalha, a única rede que importa é a de comando."</div>
              
              <div className="sbar-group">
                <div className="sbar-row"><span className="sbar-label">⭐ XP</span><span className="sbar-val">{xp} / 36K</span></div>
                <div className="sbar-track"><div className="sbar-fill sb-xp" style={{ width: `${(xp/36000)*100}%` }}></div></div>
                <div className="sbar-row"><span className="sbar-label">⚡ Energia</span><span className="sbar-val" style={{ color: 'var(--gold)' }}>{energy}%</span></div>
                <div className="sbar-track"><div className="sbar-fill sb-xp" style={{ width: `${energy}%`, background: 'var(--g-fire)' }}></div></div>
                <div className="sbar-row"><span className="sbar-label">❤️ Saúde (HP)</span><span className="sbar-val" style={{ color: 'var(--venom)' }}>{hp}%</span></div>
                <div className="sbar-track"><div className="sbar-fill sb-hp" style={{ width: `${hp}%` }}></div></div>
                <div className="sbar-row"><span className="sbar-label">💧 Mana</span><span className="sbar-val" style={{ color: 'var(--ice)' }}>{mana / 1000}K / 20K</span></div>
                <div className="sbar-track"><div className="sbar-fill sb-mp" style={{ width: `${(mana/20000)*100}%` }}></div></div>
              </div>

              <div className="mstats">
                <div className="ms"><span className="ms-v">1.4K</span><span className="ms-k">Seguidores</span></div>
                <div className="ms"><span className="ms-v">312</span><span className="ms-k">Seguindo</span></div>
                <div className="ms"><span className="ms-v">97</span><span className="ms-k">Conquistas</span></div>
              </div>

              <div className="karma">
                <span className="karma-ico">✨</span>
                <div className="karma-inf"><div className="karma-lbl">Karma Total</div><div className="karma-n">{karma} pts</div></div>
                <span className="karma-tier">🔥 Lendário</span>
              </div>
              <button className="btn-ghost">✏️ Editar Herói</button>
            </div>
          </div>

          <div className="panel">
            <div className="ph"><span className="ph-title"><span className="accent-bar"></span>Conquistas</span><span className="ph-action">Ver todas</span></div>
            <div className="ach-item">
              <div className="ach-ico ai-g">🐉</div>
              <div style={{ flex: 1 }}><div className="ach-nm">Matador de Dragões</div><div className="ach-ds">Kill no modo Épico</div></div>
              <span className="ach-xp">+500 XP</span>
            </div>
            <div className="ach-item">
              <div className="ach-ico ai-e">⚡</div>
              <div style={{ flex: 1 }}><div className="ach-nm">Feiticeiro Supremo</div><div className="ach-ds">100 kills em PvP</div></div>
              <span className="ach-xp">+350 XP</span>
            </div>
          </div>
        </aside>

        <main className="feed">
          <div className="composer">
            <div className="comp-row">
              <div className="comp-av">{userName.charAt(0)}</div>
              <textarea className="comp-ta" placeholder="O que está acontecendo no front? ⚔️" value={newPostContent} onChange={e => setNewPostContent(e.target.value)} />
            </div>
            <div className="comp-foot">
              <div className="comp-tools">
                <button className="ctool">📸 Mídia</button>
                <button className="ctool">🏆 Conquista</button>
                <button className="ctool">📍 Local</button>
              </div>
              <button className="btn-post" onClick={() => handleDeploy()}>⚔️ Postar</button>
            </div>
          </div>

          <div className="ftabs">
            <div className="ftab active">✨ Para Você</div>
            <div className="ftab">👥 Amigos</div>
            <div className="ftab">🏰 Guildas</div>
            <div className="ftab">🔥 Em Alta</div>
          </div>

          {posts.map(post => (
            <article key={post.id} className={`post ${shakeId === post.id ? 'shake-hard' : ''}`}>
              <div className="post-guild"><div className="pg-bar"></div>Guilda: <span className="pg-name">Lâminas do Crepúsculo</span></div>
              <div className="post-head">
                <div className="post-av alive" style={{ background: 'var(--ink3)' }}>🛡️</div>
                <div className="post-meta">
                  <div className="post-top">
                    <span className="post-name">@{post.author}</span>
                    <span className="tag t-fire">{post.rank}</span>
                    <span className="tag t-gold">VETERANO</span>
                  </div>
                  <div className="post-time-loc"><span className="ptime">⏱ há {timeAgo(post.created_at)}</span><span className="ploc">📍 Fronteira Norte</span></div>
                </div>
              </div>
              <div className="post-body">{post.content}</div>
              
              <div className="hp-module">
                <div className="hp-label"><span>Integridade do Bunker</span> <span>{post.hp}%</span></div>
                <div className="hp-track"><div className={`hp-fill ${post.hp > 60 ? 'hp-high' : post.hp > 30 ? 'hp-mid' : 'hp-low'}`} style={{ width: `${post.hp}%` }}></div></div>
              </div>

              <div className="post-acts">
                <button className="pact" onClick={() => handleAttack(post)}>⚔️ ATACAR</button>
                <button className="pact" onClick={() => handleShield(post)}>🛡️ REFORÇAR</button>
                <button className="pact">💬 <span className="pcnt">{comments.filter(c => c.post_id === post.id).length}</span></button>
                <button className="pact">↗️ Share</button>
              </div>
              
              <div className="post-reacts">
                <div className="react on"><span className="re">🔥</span><span className="rn">14</span></div>
                <div className="react"><span className="re">⚔️</span><span className="rn">8</span></div>
                <div className="react-add">＋</div>
              </div>

              <form onSubmit={e => {
                e.preventDefault();
                const txt = commentInputs[post.id];
                if (txt) {
                  supabase.from('comments').insert([{ post_id: post.id, author: userName, content: txt }]).then(() => setCommentInputs(prev => ({ ...prev, [post.id]: '' })));
                  addToast('💬', 'Comentário Enviado', 'Sua rede captou a mensagem.');
                }
              }} style={{ padding: '0 14px 14px' }}>
                <input className="comp-ta" style={{ height: 34, fontSize: '0.8rem', background: 'transparent' }} placeholder="Adicionar transmissão..." value={commentInputs[post.id] || ''} onChange={evt => setCommentInputs(p => ({ ...p, [post.id]: evt.target.value }))} />
              </form>
            </article>
          ))}
        </main>

        <aside className="right sidebar-sticky">
           <div className="panel">
              <div className="ph"><span className="ph-title"><span className="accent-bar"></span>Heróis Online</span><span className="ph-action">Ver todos</span></div>
              <div className="heroes-grid">
                {['Valdris', 'Lyralei', 'Elysia', 'Zugthar', 'Sylvanas', 'Magni'].map(h => (
                  <div key={h} className="hero">
                    <div className="hero-av" style={{ background: 'var(--ink3)' }}>👤<div className="hero-dot hd-on"></div></div>
                    <div className="hero-nm">{h}</div><div className="hero-cl">Classe</div>
                  </div>
                ))}
              </div>
           </div>

           <div className="panel">
             <div className="ph"><span className="ph-title"><span className="accent-bar"></span>Minhas Guildas</span><span className="ph-action">+ Criar</span></div>
             <div className="guild-item">
               <div className="guild-ico" style={{ background: 'rgba(255,77,28,.12)' }}>⚔️</div>
               <div style={{ flex: 1 }}><div className="guild-nm">Lâminas do Crepúsculo</div><div className="guild-sub">4.2K membros · Aliança</div></div>
               <span className="guild-onl">● 234</span>
             </div>
           </div>

           <div className="panel">
              <div className="ph"><span className="ph-title"><span className="accent-bar"></span>Ranking de Karma</span><span className="ph-action">Semana</span></div>
              {[ {n:'Lyralei', s:4291}, {n:'Valdris', s:3847}, {n:userName, s:karma, me:true} ].map((r, i) => (
                <div key={r.n} className={`rank-item ${r.me ? 'me' : ''}`}>
                  <span className="rpos gold">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span>
                  <div className="rank-av" style={{ background: r.me ? 'var(--g-fire)' : 'var(--ink3)' }}>👤</div>
                  <div style={{ flex: 1 }}><div className="rank-nm">{r.n} {r.me ? '(Você)' : ''}</div><div className="rank-sub">Rank {i+1}</div></div>
                  <span className="rank-sc">{r.s}</span>
                </div>
              ))}
           </div>

            <div className="panel">
               <div className="ph"><span className="ph-title"><span className="accent-bar"></span>Radar Tático</span></div>
               <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '0 14px 14px' }}>
                 {actionLogs.length === 0 ? (
                   <p style={{ fontSize: '0.7rem', color: 'var(--tx3)' }}>Aguardando sinal tático...</p>
                 ) : actionLogs.slice(0, 8).map(log => (
                   <div key={log.id} style={{ fontSize: '0.68rem', padding: '6px 0', borderBottom: '1px solid var(--rim)', color: 'var(--tx2)' }}>
                     <strong style={{ color: 'var(--gold)' }}>@{log.actor}</strong> {log.details}
                     <div style={{ fontSize: '0.55rem', color: 'var(--tx3)', marginTop: '2px' }}>⏱ {timeAgo(log.created_at)}</div>
                   </div>
                 ))}
               </div>
            </div>
         </aside>
      </div>

      <nav className="mobile-nav">
        <div className="mn-items">
          <div className="mn-item active"><div className="mn-ico">🏠</div>Feed</div>
          <div className="mn-item"><div className="mn-ico">👥</div>Guildas</div>
          <div className="mn-item"><div className="mn-ico">⚔️</div>Batalha</div>
          <div className="mn-item"><div className="mn-ico">🔔</div><span className="mn-badge">12</span>Alertas</div>
          <div className="mn-item" onClick={async () => await supabase.auth.signOut()}><div className="mn-ico">🚪</div>Sair</div>
        </div>
      </nav>
        </>
      )}
    </>
  );
}
