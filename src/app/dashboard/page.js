'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('messages');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ username: '', bio: '', avatar_url: '', role: 'Membre' });
  
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

  // États locaux d'édition isolés pour bloquer les réinitialisations sauvages
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');

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

    // Écoute en Temps Réel stable
    const dataChannel = supabase.channel('vibenet-pro-stable')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new]);
        if (payload.new.sender_id === user?.id) {
          setStats(s => ({ ...s, sent: s.sent + 1 }));
        } else {
          setStats(s => ({ ...s, received: s.received + 1 }));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        // Met à jour la liste globale mais n'écrase pas ton formulaire en cours d'édition
        fetchUsers();
        if (payload.new && user && payload.new.id === user.id && !isEditingProfile) {
          setProfile(payload.new);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(dataChannel); };
  }, [user, isEditingProfile]);

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
        bio: 'Hey ! J\'utilise VibeNet.', 
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

    const { data } = await supabase.from('groups').insert([
      { name: newGroupName, created_by: user.id }
    ]).select();

    if (data) {
      setGroupsList(prev => [...prev, data[0]]);
      setShowCreateGroup(false);
      setNewGroupName('');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editUsername.trim()) return alert('Le pseudo ne peut pas être vide');

    const updatedAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${editUsername}`;

    const { error } = await supabase.from('profiles')
      .update({ username: editUsername, bio: editBio, avatar_url: updatedAvatar })
      .eq('id', user.id);

    if (!error) {
      setProfile({ ...profile, username: editUsername, bio: editBio, avatar_url: updatedAvatar });
      setIsEditingProfile(false);
      alert('Profil enregistré avec succès !');
    } else {
      alert('Erreur lors de la sauvegarde : ' + error.message);
    }
  };

  const filteredUsers = usersList.filter(u => 
    u.id !== user?.id && u.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f0b26] text-white overflow-hidden font-sans">
      
      {/* HEADER NETWORKING MESSENGER */}
      <div className="bg-[#8b5cf6] p-3 pt-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
          <div>
            <h1 className="text-xs font-black tracking-wide uppercase">NETWORK MESSENGER</h1>
            <p className="text-[9px] text-purple-100 opacity-80">vibenet-premium</p>
          </div>
        </div>
      </div>

      {/* BLOC DE NAVIGATION INTERNE */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-6">
        
        {/* ONGLET MESSAGES */}
        {activeTab === 'messages' && !selectedChat && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black">Messages</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowCreateGroup(true)} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-xs">👥</button>
                <button onClick={() => setIsSearching(!isSearching)} className="w-9 h-9 rounded-full bg-[#7c3aed] flex items-center justify-center text-white text-lg font-bold">+</button>
              </div>
            </div>

            {isSearching && (
              <div className="relative animate-slide-up">
                <input 
                  type="text" 
                  placeholder="Rechercher un pseudo..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#161233] border border-purple-500/30 rounded-xl py-2 px-3 text-xs text-white focus:outline-none"
                />
              </div>
            )}

            {searchQuery.length > 0 && (
              <div className="space-y-1">
                {filteredUsers.map(u => (
                  <div key={u.id} onClick={() => setSelectedChat({ id: u.id, name: u.username, type: 'private', avatar: u.avatar_url })} className="flex items-center gap-3 p-2.5 bg-[#161233] rounded-xl cursor-pointer">
                    <img src={u.avatar_url} className="w-8 h-8 rounded-full" alt="" />
                    <div>
                      <h4 className="text-xs font-bold">{u.username}</h4>
                      <p className="text-[10px] text-gray-400 truncate">{u.bio}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {groupsList.map(g => (
              <div key={g.id} onClick={() => setSelectedChat({ id: g.id, name: g.name, type: 'group' })} className="bg-[#161233] p-4 rounded-xl flex justify-between items-center cursor-pointer border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-xs">👥</div>
                  <span className="text-xs font-bold">{g.name}</span>
                </div>
                <span className="text-[10px] text-purple-400">Ouvrir &gt;</span>
              </div>
            ))}
          </div>
        )}

        {/* ONGLET STORIES */}
        {activeTab === 'stories' && (
          <div className="space-y-4 animate-fade-in text-center py-12">
            <p className="text-xs text-gray-400">Aucune story disponible pour vos contacts actuellement.</p>
          </div>
        )}

        {/* ONGLET PROFIL - MODIFICATION SÉCURISÉE DU PSEUDO SANS SAUT DE TEXTE */}
        {activeTab === 'profil' && (
          <div className="space-y-5 animate-fade-in">
            <h2 className="text-2xl font-black">Mon Profil</h2>

            <div className="flex flex-col items-center text-center space-y-2">
              <img src={profile.avatar_url} className="w-16 h-16 rounded-full border-2 border-purple-500 bg-[#161233]" alt="" />
              <h3 className="text-lg font-bold">{profile.username}</h3>
              <p className="text-xs text-gray-400 italic">"{profile.bio || 'Aucune biographie rédigée.'}"</p>
            </div>

            {isEditingProfile ? (
              <form onSubmit={handleSaveProfile} className="bg-[#161233] border border-white/5 p-4 rounded-2xl space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">Changer le Pseudo</label>
                  <input 
                    type="text" 
                    value={editUsername} 
                    onChange={(e) => setEditUsername(e.target.value)} 
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none" 
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-purple-300 block mb-1">Changer la Biographie</label>
                  <input 
                    type="text" 
                    value={editBio} 
                    onChange={(e) => setEditBio(e.target.value)} 
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none" 
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 bg-white/5 py-2 rounded-xl text-xs">Annuler</button>
                  <button type="submit" className="flex-1 bg-purple-600 py-2 rounded-xl text-xs font-bold">Enregistrer</button>
                </div>
              </form>
            ) : (
              <button 
                onClick={() => {
                  setEditUsername(profile.username);
                  setEditBio(profile.bio);
                  setIsEditingProfile(true);
                }} 
                className="w-full bg-[#161233] border border-white/5 text-xs font-semibold py-3 rounded-xl text-purple-300"
              >
                ✏️ Modifier mes informations (Pseudo / Bio)
              </button>
            )}

            {/* STATISTIQUES IMMÉDIATES */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#161233] p-4 rounded-xl text-center">
                <span className="text-xl font-bold block">{stats.sent}</span>
                <span className="text-[9px] text-gray-400">Messages envoyés</span>
              </div>
              <div className="bg-[#161233] p-4 rounded-xl text-center">
                <span className="text-xl font-bold block">{stats.received}</span>
                <span className="text-[9px] text-gray-400">Messages reçus</span>
              </div>
            </div>
          </div>
        )}
        {/* CHAT PRIVÉ OU DE GROUPE */}
        {selectedChat && (
          <div className="fixed inset-0 bg-[#0f0b26] z-40 flex flex-col">
            <div className="bg-[#8b5cf6] p-3 pt-4 flex items-center gap-3">
              <button onClick={() => setSelectedChat(null)} className="text-white text-xs font-bold">⬅️ Retour</button>
              <h3 className="text-xs font-bold">{selectedChat.name}</h3>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-black/10">
              {messages.map((m, i) => (
                <div key={i} className={`flex flex-col ${m.sender_id === user?.id ? 'items-end' : 'items-start'}`}>
                  <span className="text-[9px] text-gray-500 mb-0.5">{m.sender_name}</span>
                  <div className={`p-2.5 text-xs rounded-xl max-w-xs ${m.sender_id === user?.id ? 'bg-[#7c3aed]' : 'bg-white/10'}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-3 bg-[#161233] flex gap-2">
              <input type="text" value={typedMessage} onChange={(e) => setTypedMessage(e.target.value)} placeholder="Votre message..." className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs" />
              <button type="submit" className="bg-[#7c3aed] px-4 rounded-xl text-xs font-bold">Envoi</button>
            </form>
          </div>
        )}
      </div>

      {/* POPUP SÉCURISÉ : CRÉATION DE GROUPE */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateGroupSubmit} className="bg-[#161233] border border-white/10 p-5 rounded-2xl w-full max-w-xs space-y-4">
            <h3 className="text-xs font-bold uppercase text-purple-300">Nouveau salon</h3>
            <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Nom du groupe..." className="w-full bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none" required />
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setShowCreateGroup(false)} className="flex-1 bg-white/5 py-2 rounded-xl">Annuler</button>
              <button type="submit" className="flex-1 bg-purple-600 py-2 rounded-xl font-bold">Créer</button>
            </div>
          </form>
        </div>
      )}

      {/* BARRE DE NAVIGATION INFÉRIEURE */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#f4f4f5] border-t border-gray-200 py-2.5 flex justify-around items-center z-30 rounded-t-2xl shadow-xl">
        <button onClick={() => { setActiveTab('messages'); setSelectedChat(null); }} className={`flex flex-col items-center gap-0.5 flex-1 ${activeTab === 'messages' ? 'text-[#7c3aed]' : 'text-gray-400'}`}>
          <span className="text-base">💬</span><span className="text-[9px] font-bold">Messages</span>
        </button>
        <button onClick={() => { setActiveTab('stories'); setSelectedChat(null); }} className={`flex flex-col items-center gap-0.5 flex-1 ${activeTab === 'stories' ? 'text-[#7c3aed]' : 'text-gray-400'}`}>
          <span className="text-base">📺</span><span className="text-[9px] font-bold">Stories</span>
        </button>
        <button onClick={() => { setActiveTab('profil'); setSelectedChat(null); }} className={`flex flex-col items-center gap-0.5 flex-1 ${activeTab === 'profil' ? 'text-[#7c3aed]' : 'text-gray-400'}`}>
          <span className="text-base">👤</span><span className="text-[9px] font-bold">Profil</span>
        </button>
      </div>

    </div>
  );
        }
