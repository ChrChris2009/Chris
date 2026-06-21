'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('messages');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ username: '', bio: '', avatar_url: '', role: 'Membre', created_at: '' });
  
  // Listes et données
  const [usersList, setUsersList] = useState([]);
  const [groupsList, setGroupsList] = useState([]);
  const [storiesList, setStoriesList] = useState([]);
  const [messages, setMessages] = useState([]);
  
  // États de recherche et sélection
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [typedMessage, setTypedMessage] = useState('');
  
  // Modals de création
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  // Édition profil
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');

  // Statistiques simulées basées sur l'interface cible
  const [stats, setStats] = useState({ sent: 0, received: 0 });

  const messagesEndRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        fetchOrCreateProfile(data.user);
      } else {
        window.location.href = '/';
      }
    });

    // Écoute Realtime globale
    const dataChannel = supabase.channel('vibenet-pro')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
        // Ajuster les stats en temps réel
        if (payload.new.sender_id === user?.id) {
          setStats(s => ({ ...s, sent: s.sent + 1 }));
        } else {
          setStats(s => ({ ...s, received: s.received + 1 }));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => { supabase.removeChannel(dataChannel); };
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchUsers();
      fetchGroups();
      fetchStories();
    }
  }, [user]);

  useEffect(() => {
    if (selectedChat) loadMessages();
  }, [selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchOrCreateProfile = async (currentUser) => {
    let { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (!data) {
      const fallbackName = currentUser.email.split('@')[0];
      const newProf = { 
        id: currentUser.id, 
        username: fallbackName, 
        bio: '', 
        avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${fallbackName}`,
        role: 'Membre',
        status: 'online'
      };
      await supabase.from('profiles').insert([newProf]);
      data = newProf;
    }
    setProfile(data);
    setEditUsername(data.username || '');
    setEditBio(data.bio || '');
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('*');
    if (data) setUsersList(data);
  };

  const fetchGroups = async () => {
    const { data } = await supabase.from('groups').select('*');
    if (data) setGroupsList(data);
  };

  const fetchStories = async () => {
    const { data } = await supabase.from('stories').select('*').order('created_at', { ascending: false });
    if (data) setStoriesList(data);
  };

  const loadMessages = async () => {
    let query = supabase.from('messages').select('*');
    if (selectedChat.type === 'group') {
      query = query.eq('group_id', selectedChat.id);
    } else {
      query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.id}),and(sender_id.eq.${selectedChat.id},receiver_id.eq.${user.id})`);
    }
    const { data } = await query.order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!typedMessage.trim()) return;

    const msg = {
      content: typedMessage,
      sender_id: user.id,
      sender_name: profile.username,
      avatar_url: profile.avatar_url,
      group_id: selectedChat.type === 'group' ? selectedChat.id : null,
      receiver_id: selectedChat.type === 'private' ? selectedChat.id : null
    };

    await supabase.from('messages').insert([msg]);
    setTypedMessage('');
  };
  const handleCreateGroupSubmit = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const { data, error } = await supabase.from('groups').insert([
      { name: newGroupName, created_by: user.id }
    ]).select();

    if (data) {
      setGroupsList(prev => [...prev, data[0]]);
      setShowCreateGroup(false);
      setNewGroupName('');
    }
  };

  const handleSaveProfile = async () => {
    const { error } = await supabase.from('profiles')
      .update({ username: editUsername, bio: editBio, avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${editUsername}` })
      .eq('id', user.id);

    if (!error) {
      setProfile({ ...profile, username: editUsername, bio: editBio, avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${editUsername}` });
      setIsEditingProfile(false);
    }
  };

  // Filtrer la liste des suggestions selon la recherche du haut
  const filteredUsers = usersList.filter(u => 
    u.id !== user?.id && u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f0b26] text-white overflow-hidden font-sans">
      
      {/* HEADER PRINCIPAL AVEC URL STYLISÉE */}
      <div className="bg-[#8b5cf6] p-3 pt-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <button className="text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
          </button>
          <div>
            <h1 className="text-sm font-bold tracking-wide uppercase flex items-center gap-1">
              NETWORK MESSENGER <span className="text-xs">🥋🔴</span>
            </h1>
            <p className="text-[10px] text-purple-100 opacity-90">app-ceqvm262kxdt.appmedo.com</p>
          </div>
        </div>
        <button className="text-white">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s-.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s-.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </button>
      </div>

      {/* ZONE CENTRALE DYNAMIQUE (REMPLACE LES ANCIENNES VUES) */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-6">
        
        {/* ÉCRAN 1 : MESSAGES ET SUGGESTIONS */}
        {activeTab === 'messages' && !selectedChat && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black">Messages</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowCreateGroup(true)} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-gray-300">👥</button>
                <button className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-gray-300">((o))</button>
                <button onClick={() => setIsSearching(!isSearching)} className="w-9 h-9 rounded-full bg-[#7c3aed] flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-purple-500/20">+</button>
              </div>
            </div>

            {/* BARRE DE RECHERCHE DYNAMIQUE (IMAGE 1000055115.jpg) */}
            {isSearching && (
              <div className="relative animate-slide-up">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-xs">🔍</span>
                <input 
                  type="text" 
                  placeholder="Rechercher un utilisateur..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#1e1b4b]/60 border border-purple-500/30 rounded-xl py-2.5 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>
            )}

            {/* SECTIONS SUGGESTIONS (IMAGE 1000055115.jpg) */}
            {searchQuery.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Suggestions</span>
                <div className="bg-[#161233] border border-white/5 rounded-2xl p-2 space-y-1">
                  {filteredUsers.map(u => (
                    <div key={u.id} onClick={() => setSelectedChat({ id: u.id, name: u.username, type: 'private', avatar: u.avatar_url })} className="flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-xl cursor-pointer transition-all">
                      <img src={u.avatar_url} className="w-9 h-9 rounded-full bg-purple-900/40" alt="" />
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-1">{u.username}</h4>
                        <p className="text-[10px] text-gray-400 truncate">{u.bio || 'Développeur bla-bla-bla'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ETAT VIDE PAR DÉFAUT (IMAGE 1000055109.jpg) */}
            {groupsList.length === 0 && searchQuery.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center text-gray-400 text-xl">💬</div>
                <h3 className="text-sm font-bold">Aucune conversation</h3>
                <p className="text-xs text-gray-400 max-w-xs">Appuyez sur + pour démarrer une discussion ou créer un groupe</p>
              </div>
            )}

            {/* AFFICHAGE DES GROUPES EXISTANTS */}
            {groupsList.length > 0 && searchQuery.length === 0 && (
              <div className="grid grid-cols-2 gap-3">
                {groupsList.map(g => (
                  <div key={g.id} onClick={() => setSelectedChat({ id: g.id, name: g.name, type: 'group' })} className="bg-[#161233] border border-white/5 p-4 rounded-2xl flex flex-col items-center text-center space-y-2 cursor-pointer hover:border-purple-500/40 transition-all">
                    <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center font-bold text-xs">👥</div>
                    <span className="text-xs font-bold truncate w-full">{g.name}</span>
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-semibold">Rejoindre</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ÉCRAN 2 : STORIES (IMAGE 1000055111.jpg) */}
        {activeTab === 'stories' && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-2xl font-black">Stories</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              <div className="flex flex-col items-center space-y-1 min-w-[64px]">
                <div className="relative w-12 h-12 rounded-full border-2 border-dashed border-purple-500 flex items-center justify-center bg-white/5">
                  <span className="text-xs font-bold text-purple-400">+</span>
                </div>
                <span className="text-[10px] text-gray-400">Ajouter</span>
              </div>
            </div>
            <div className="bg-[#161233] border border-white/5 p-6 rounded-2xl text-center flex flex-col items-center justify-center space-y-3">
              <span className="text-2xl">✨</span>
              <h3 className="text-sm font-bold">Aucune story pour l'instant</h3>
              <p className="text-xs text-gray-400">Partagez votre moment avec vos contacts</p>
            </div>
          </div>
        )}

        {/* ÉCRAN 3 : MON PROFIL ET STATS COMPLETS (IMAGES 1000055112, 1000055113, 1000055114) */}
        {activeTab === 'profil' && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black">Mon Profil</h2>
              <button onClick={() => setIsEditingProfile(!isEditingProfile)} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs">✏️</button>
            </div>

            {/* AVATAR ET NOM */}
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="relative w-20 h-20">
                <img src={profile.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=CH`} className="w-full h-full rounded-full border-2 border-purple-500 bg-[#161233]" alt="" />
                <span className="absolute bottom-0 right-0 w-6 h-6 bg-purple-600 rounded-full border border-[#0f0b26] flex items-center justify-center text-[10px]">📷</span>
              </div>
              <h3 className="text-xl font-black tracking-tight">{profile.username || 'chrisst77'}</h3>
            </div>

            {/* FORMULAIRE DE MODIFICATION SI ACTIF (IMAGE 1000055113.jpg) */}
            {isEditingProfile ? (
              <div className="bg-[#161233] border border-white/5 p-4 rounded-2xl space-y-3 animate-slide-up">
                <div>
                  <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">Nom d'utilisateur</label>
                  <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-purple-500" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">Bio</label>
                  <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Parlez un peu de vous..." className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white h-20 resize-none focus:outline-none focus:border-purple-500" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 bg-white/5 py-2 rounded-xl text-xs font-bold">Annuler</button>
                  <button type="button" onClick={handleSaveProfile} className="flex-1 bg-purple-600 py-2 rounded-xl text-xs font-bold shadow-lg shadow-purple-500/20">Sauvegarder</button>
                </div>
              </div>
            ) : (
              <div className="bg-[#161233] border border-white/5 rounded-2xl p-4 space-y-3.5 text-xs">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-gray-400">Compte</span>
                  <span className="font-semibold">{user?.email || 'chrisst77@network.app'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-gray-400">Rôle</span>
                  <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold text-[10px]">✨ {profile.role || 'Membre'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Inscrit</span>
                  <span className="font-semibold text-gray-300">21 juin 2026</span>
                </div>
              </div>
            )}

            {/* GRILLE DES STATISTIQUES (IMAGE 1000055112.jpg) */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block pl-1">Statistiques</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#161233] border border-white/5 p-4 rounded-2xl text-center">
                  <span className="text-2xl font-black block">{stats.sent}</span>
                  <span className="text-[10px] text-gray-400">Messages envoyés</span>
                </div>
                <div className="bg-[#161233] border border-white/5 p-4 rounded-2xl text-center">
                  <span className="text-2xl font-black block">{stats.received}</span>
                  <span className="text-[10px] text-gray-400">Messages reçus</span>
                </div>
              </div>
            </div>

            {/* ZONE DES BADGES DE VALORISATION (IMAGE 1000055112.jpg) */}
            <div className="bg-[#161233] border border-white/5 p-4 rounded-2xl space-y-3">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Badges</span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 opacity-40"><span className="text-xl block">💬</span><span className="text-[8px] text-gray-400">Premier message</span></div>
                <div className="p-2 opacity-40"><span className="text-xl block">⚡</span><span className="text-[8px] text-gray-400">Membre actif</span></div>
                <div className="p-2 opacity-40"><span className="text-xl block">💯</span><span className="text-[8px] text-gray-400">100 messages</span></div>
              </div>
              <p className="text-[10px] text-purple-300 text-center italic">Envoie ton premier message pour débloquer des badges !</p>
            </div>

            {/* RESTE DES OPTIONS COMPLÈTES (IMAGE 1000055114.jpg) */}
            <div className="space-y-2">
              <div className="bg-[#161233] border border-white/5 rounded-2xl divide-y divide-white/5 text-xs">
                <div className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-white/5">
                  <span className="flex items-center gap-2">👤 Utilisateurs bloqués</span>
                  <span className="text-gray-500 text-[11px]">0 &gt;</span>
                </div>
                <div className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-white/5">
                  <span className="flex items-center gap-2">🔗 Partager mon profil</span>
                </div>
                <div className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-white/5">
                  <span className="flex items-center gap-2">🏅 Demander la certification</span>
                </div>
              </div>

              {/* INTEGRATION DE NETAI (IMAGE 1000055114.jpg) */}
              <div className="bg-gradient-to-r from-purple-950/40 to-indigo-950/40 border border-purple-500/20 p-3.5 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs">🤖</div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Activer Netai ✨</h4>
                    <p className="text-[9px] text-purple-300">Votre assistant IA sur Network</p>
                  </div>
                </div>
                <span className="bg-purple-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow">Autorisé</span>
              </div>
            </div>
          </div>
        )}

        {/* ZONE DE CHAT OUVERTE (PLEIN ÉCRAN MOBILE RESPONSIVE) */}
        {selectedChat && (
          <div className="fixed inset-0 bg-[#0f0b26] z-40 flex flex-col animate-fade-in">
            {/* Header du salon privé */}
            <div className="bg-[#8b5cf6] p-3 pt-4 flex items-center gap-3 shadow-md">
              <button onClick={() => setSelectedChat(null)} className="text-white font-bold text-sm">⬅️ En arrière</button>
              <div>
                <h3 className="text-xs font-bold text-white">{selectedChat.name}</h3>
                <p className="text-[9px] text-purple-200">Discussion chiffrée en direct</p>
              </div>
            </div>

            {/* Bulle de messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-black/10">
              {messages.map((m, i) => {
                const isMe = m.sender_id === user?.id;
                return (
                  <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[9px] text-gray-400 mb-0.5">{m.sender_name}</span>
                    <div className={`p-3 text-xs rounded-2xl max-w-xs ${isMe ? 'bg-[#7c3aed] text-white rounded-tr-none' : 'bg-white/10 text-gray-100 rounded-tl-none'}`}>
                      {m.content}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input d'envoi */}
            <form onSubmit={handleSendMessage} className="p-3 bg-[#161233] border-t border-white/5 flex gap-2">
              <input type="text" value={typedMessage} onChange={(e) => setTypedMessage(e.target.value)} placeholder="Écrire un message..." className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none" />
              <button type="submit" className="bg-[#7c3aed] text-white font-bold px-4 py-2 rounded-xl text-xs">Envoyer</button>
            </form>
          </div>
        )}
      </div>
      {/* POPUP SÉCURISÉ : CRÉATION DE GROUPE INTERFACTIF (IMAGE 1000055116.jpg) */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col animate-fade-in text-white">
          <div className="bg-[#8b5cf6] p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowCreateGroup(false)} className="text-sm">⬅️</button>
              <h2 className="text-sm font-bold">Nouveau groupe</h2>
            </div>
            <button onClick={handleCreateGroupSubmit} className="bg-white/20 text-white font-bold text-xs px-4 py-1.5 rounded-full">Créer</button>
          </div>

          <div className="p-4 space-y-6 flex-1 overflow-y-auto">
            <div className="flex items-center gap-4 border-b border-white/5 pb-4">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-purple-400 flex items-center justify-center bg-white/5 text-xl cursor-pointer">📷</div>
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">Nom du groupe</label>
                <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Ex: Les amis, Famille..." className="w-full bg-[#161233] border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Ajouter des membres</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-xs">🔍</span>
                <input type="text" placeholder="Rechercher un utilisateur..." className="w-full bg-[#161233] border border-white/10 rounded-xl py-2 pl-9 text-xs" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BARRE DE NAVIGATION INFÉRIEURE FIXE (PRÉSENTE SUR TOUTES LES IMAGES) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#f4f4f5] border-t border-gray-200 py-2.5 flex justify-around items-center z-30 rounded-t-3xl shadow-xl">
        <button onClick={() => { setActiveTab('messages'); setSelectedChat(null); }} className={`flex flex-col items-center gap-1 flex-1 text-center ${activeTab === 'messages' ? 'text-[#7c3aed]' : 'text-gray-400'}`}>
          <span className="text-lg">💬</span>
          <span className="text-[10px] font-bold">Messages</span>
        </button>
        <button onClick={() => { setActiveTab('stories'); setSelectedChat(null); }} className={`flex flex-col items-center gap-1 flex-1 text-center ${activeTab === 'stories' ? 'text-[#7c3aed]' : 'text-gray-400'}`}>
          <span className="text-lg">📺</span>
          <span className="text-[10px] font-bold">Stories</span>
        </button>
        <button onClick={() => { setActiveTab('profil'); setSelectedChat(null); }} className={`flex flex-col items-center gap-1 flex-1 text-center ${activeTab === 'profil' ? 'text-[#7c3aed]' : 'text-gray-400'}`}>
          <span className="text-lg">👤</span>
          <span className="text-[10px] font-bold">Profil</span>
        </button>
      </div>

    </div>
  );
              }
