'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('messages');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ username: '', avatar_url: '', email: '' });
  
  // États de l'application
  const [usersList, setUsersList] = useState([]);
  const [groupsList, setGroupsList] = useState([]);
  const [storiesList, setStoriesList] = useState([]);
  const [messages, setMessages] = useState([]);
  
  // Onglet Sélectionné Actuel
  const [selectedChat, setSelectedChat] = useState({ id: 'general', name: 'Groupe Général', type: 'group' });
  const [typedMessage, setTypedMessage] = useState('');
  
  // Modals & Créations
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newStoryContent, setNewStoryContent] = useState('');
  
  // Paramètres Profil Modifiables
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // 1. Authentification & Profil initial
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
        fetchAndSyncProfile(data.user.id);
      } else {
        window.location.href = '/';
      }
    });

    // 2. Écoutes des données en Temps Réel
    const msgSub = supabase.channel('realtime-data')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'groups' }, (payload) => {
        setGroupsList((prev) => [...prev, payload.new]);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories' }, () => {
        fetchStories();
      })
      .subscribe();

    return () => { supabase.removeChannel(msgSub); };
  }, []);

  useEffect(() => {
    if (user) {
      fetchUsers();
      fetchGroups();
      fetchStories();
      loadMessages();
    }
  }, [user, selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchAndSyncProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
      setEditUsername(data.username);
    }
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
    const chatColumn = selectedChat.type === 'group' ? 'group_id' : 'receiver_id';
    let query = supabase.from('messages').select('*');
    
    if (selectedChat.id === 'general') {
      query = query.eq('group_id', 'general');
    } else if (selectedChat.type === 'group') {
      query = query.eq('group_id', selectedChat.id);
    } else {
      // Chat privé un à un
      query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedChat.id}),and(sender_id.eq.${selectedChat.id},receiver_id.eq.${user.id})`);
    }
    
    const { data } = await query.order('created_at', { ascending: true });
    if (data) setMessages(data);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!typedMessage.trim() || !user) return;

    const msgObj = {
      content: typedMessage,
      sender_id: user.id,
      sender_name: profile.username || user.email.split('@')[0],
      avatar_url: profile.avatar_url,
      group_id: selectedChat.type === 'group' ? selectedChat.id : null,
      receiver_id: selectedChat.type === 'private' ? selectedChat.id : null
    };

    await supabase.from('messages').insert([msgObj]);
    setTypedMessage('');
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    await supabase.from('groups').insert([{ name: newGroupName, created_by: user.id }]);
    setNewGroupName('');
    setShowCreateGroup(false);
  };

  const handlePostStory = async (e) => {
    e.preventDefault();
    if (!newStoryContent.trim()) return;
    await supabase.from('stories').insert([{
      content: newStoryContent,
      user_id: user.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      views_count: 0,
      viewers: []
    }]);
    setNewStoryContent('');
    fetchStories();
  };

  const handleViewStory = async (story) => {
    if (story.user_id === user.id) return;
    if (story.viewers?.includes(user.id)) return;
    
    const updatedViewers = [...(story.viewers || []), user.id];
    await supabase.from('stories')
      .update({ viewers: updatedViewers, views_count: updatedViewers.length })
      .eq('id', story.id);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!editUsername.trim()) return alert('Le pseudo ne peut pas être vide');
    
    const { error } = await supabase.from('profiles')
      .update({ username: editUsername, avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${editUsername}` })
      .eq('id', user.id);

    if (error) alert(error.message);
    else {
      if (editPassword.trim()) {
        await supabase.auth.updateUser({ password: editPassword });
        setEditPassword('');
      }
      alert('Profil mis à jour avec succès !');
      fetchAndSyncProfile(user.id);
    }
  };

  const handleLogout = async () => {
    await supabase.from('profiles').update({ status: 'offline' }).eq('id', user.id);
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="flex h-screen w-screen p-2 md:p-4 gap-4 animate-fade-in text-white overflow-hidden">
      
      {/* BARRE LATÉRALE - LISTE DE NAVIGATION */}
      <div className="w-full md:w-80 glass-panel rounded-3xl flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/5 bg-black/10">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-xl font-black bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent tracking-tight">VibeNet Chat</h1>
            <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded-full border border-purple-500/30 animate-pulse-subtle">PRO Mode</span>
          </div>
          <div className="flex justify-around bg-white/5 p-1 rounded-xl text-xs font-semibold">
            <button onClick={() => setActiveTab('messages')} className={`flex-1 py-1.5 rounded-lg transition-all ${activeTab === 'messages' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Messages</button>
            <button onClick={() => setActiveTab('stories')} className={`flex-1 py-1.5 rounded-lg transition-all ${activeTab === 'stories' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Stories</button>
            <button onClick={() => setActiveTab('profil')} className={`flex-1 py-1.5 rounded-lg transition-all ${activeTab === 'profil' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}>Profil</button>
          </div>
        </div>

        {/* CONTENU NAVIGATION */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {activeTab === 'messages' && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <div className="flex justify-between items-center px-2 mb-1.5">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Groupes Salon</span>
                  <button onClick={() => setShowCreateGroup(true)} className="text-xs text-purple-400 hover:text-purple-300 font-bold bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">+ Créer</button>
                </div>
                <div className="space-y-1">
                  <div onClick={() => setSelectedChat({ id: 'general', name: 'Groupe Général', type: 'group' })} className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all ${selectedChat.id === 'general' ? 'bg-purple-600/30 border border-purple-500/40' : 'glass-card'}`}>
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">🌐</div>
                    <div className="flex-1 min-w-0"><h3 className="text-xs font-bold">Groupe Général</h3><p className="text-[10px] text-gray-400 truncate">Discussion en direct avec tout le monde</p></div>
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  </div>
                  {groupsList.map((g) => (
                    <div key={g.id} onClick={() => setSelectedChat({ id: g.id, name: g.name, type: 'group' })} className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all ${selectedChat.id === g.id ? 'bg-purple-600/30 border border-purple-500/40' : 'glass-card'}`}>
                      <div className="w-8 h-8 rounded-full bg-purple-800 flex items-center justify-center text-xs font-bold">👥</div>
                      <div className="flex-1 min-w-0"><h3 className="text-xs font-bold">{g.name}</h3><p className="text-[10px] text-gray-400 truncate">Salon privé</p></div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block px-2 mb-1.5">Amis de l'appli ({usersList.filter(u=>u.id!==user?.id).length})</span>
                <div className="space-y-1">
                  {usersList.filter(u => u.id !== user?.id).map((u) => (
                    <div key={u.id} onClick={() => setSelectedChat({ id: u.id, name: u.username, type: 'private', avatar: u.avatar_url })} className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all ${selectedChat.id === u.id ? 'bg-purple-600/30 border border-purple-500/40' : 'glass-card'}`}>
                      <div className="relative">
                        <img src={u.avatar_url || 'https://via.placeholder.com/150'} className="w-8 h-8 rounded-full bg-white/10" alt="" />
                        <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-black ${u.status === 'online' ? 'bg-green-500' : 'bg-gray-600'}`}></span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xs font-bold">{u.username}</h3>
                        <p className="text-[10px] text-gray-400 truncate">{u.status === 'online' ? 'Disponible' : 'Hors-ligne'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stories' && (
            <div className="space-y-4 p-2 animate-slide-up">
              <form onSubmit={handlePostStory} className="glass-card p-3 rounded-xl space-y-2">
                <span className="text-[11px] font-bold text-purple-300 block">Créer une Story</span>
                <input type="text" placeholder="Quoi de neuf aujourd'hui ?" value={newStoryContent} onChange={(e) => setNewStoryContent(e.target.value)} className="w-full glass-input rounded-lg p-2 text-xs" />
                <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-1.5 rounded-lg text-[11px] transition-colors">Poster</button>
              </form>

              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Flux des Stories</span>
                {storiesList.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-4">Aucune story disponible.</p>
                ) : (
                  storiesList.map((s) => (
                    <div key={s.id} onClick={() => handleViewStory(s)} className="glass-card p-3 rounded-xl space-y-1.5 border-l-2 border-purple-500">
                      <div className="flex items-center gap-2">
                        <img src={s.avatar_url} className="w-6 h-6 rounded-full" alt="" />
                        <span className="text-xs font-bold text-purple-200">{s.username}</span>
                        {s.user_id === user.id && <span className="ml-auto text-[10px] bg-purple-500/20 px-1.5 py-0.5 rounded-full text-purple-300 font-bold">Moi</span>}
                      </div>
                      <p className="text-xs text-white bg-black/20 p-2 rounded-lg leading-relaxed">{s.content}</p>
                      <div className="flex items-center justify-between text-[9px] text-gray-400">
                        <span>Posté récemment</span>
                        <span className="bg-white/5 px-2 py-0.5 rounded-md text-pink-300 font-bold">👁️ {s.views_count || 0} vues</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'profil' && user && (
            <div className="p-2 animate-slide-up space-y-4">
              <div className="text-center space-y-2">
                <div className="relative w-16 h-16 mx-auto">
                  <img src={profile.avatar_url || 'https://via.placeholder.com/150'} alt="Avatar" className="w-16 h-16 rounded-full border-2 border-purple-500 shadow-md bg-white/5" />
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-black"></span>
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight">{profile.username}</h3>
                  <p className="text-[10px] text-gray-500">{user.email}</p>
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} className="glass-card p-3 rounded-xl space-y-3">
                <span className="text-[11px] font-bold text-purple-300 block">Paramètres du compte</span>
                <div>
                  <label className="text-[9px] text-gray-400 block mb-0.5">Modifier Pseudo / Nom</label>
                  <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)} className="w-full glass-input rounded-lg p-2 text-xs" />
                </div>
                <div>
                  <label className="text-[9px] text-gray-400 block mb-0.5">Nouveau mot de passe</label>
                  <input type="password" placeholder="Remplir pour changer" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full glass-input rounded-lg p-2 text-xs" />
                </div>
                <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-lg text-xs transition-colors">Mettre à jour mon profil</button>
              </form>

              <button onClick={handleLogout} className="w-full bg-red-950/40 hover:bg-red-900/50 border border-red-500/20 text-red-400 font-bold py-2 rounded-xl text-xs transition-colors">Se déconnecter</button>
            </div>
          )}
        </div>
      </div>

      {/* ZONE DE DISCUSSION DROITE RESPONSIVE - DESIGN PREMIUM */}
      <div className="flex-1 glass-panel rounded-3xl flex flex-col overflow-hidden shadow-2xl">
        
        {/* En-tête de la Discussion */}
        <div className="p-4 border-b border-white/5 bg-black/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedChat.type === 'group' ? (
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-bold text-sm">🌐</div>
            ) : (
              <img src={selectedChat.avatar} className="w-9 h-9 rounded-full bg-white/10" alt="" />
            )}
            <div>
              <h2 className="text-xs font-bold text-white">{selectedChat.name}</h2>
              <p className="text-[9px] text-green-400 flex items-center gap-1">● salon sécurisé actif</p>
            </div>
          </div>
        </div>

        {/* Corps des Messages */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-black/10">
          {messages.map((msg, idx) => {
            const isMe = msg.sender_id === user?.id;
            return (
              <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-slide-up`}>
                <div className="flex items-center gap-1.5 mb-0.5 px-1">
                  {!isMe && <img src={msg.avatar_url} className="w-3.5 h-3.5 rounded-full" alt="" />}
                  <span className="text-[9px] text-gray-400 font-medium">{msg.sender_name}</span>
                </div>
                <div className={`max-w-xs p-3 text-xs rounded-2xl shadow-xl transition-all leading-relaxed ${isMe ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-tr-none' : 'bg-white/10 text-white rounded-tl-none border border-white/5'}`}>
                  {msg.content}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Formulaire d'envoi */}
        <form onSubmit={handleSendMessage} className="p-3 border-t border-white/5 bg-black/30 flex gap-2 items-center">
          <input type="text" value={typedMessage} onChange={(e) => setTypedMessage(e.target.value)} placeholder={`Écrire dans ${selectedChat.name}...`} className="flex-1 glass-input rounded-xl px-4 py-2.5 text-xs focus:outline-none" />
          <button type="submit" className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95">Envoyer</button>
        </form>
      </div>

      {/* POPUP MODAL CRÉATION DE GROUPE */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <form onSubmit={handleCreateGroup} className="glass-panel p-5 rounded-2xl w-full max-w-xs space-y-3 shadow-2xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">Créer un nouveau salon</h3>
            <input type="text" placeholder="Nom du groupe..." value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="w-full glass-input rounded-xl p-2.5 text-xs" required />
            <div className="flex gap-2 text-xs font-bold pt-1">
              <button type="button" onClick={() => setShowCreateGroup(false)} className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded-xl transition-colors">Annuler</button>
              <button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-500 py-2 rounded-xl transition-colors shadow-lg">Créer</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

