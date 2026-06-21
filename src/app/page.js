'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert('Remplis tous les champs !');
    setLoading(true);

    if (isSignUp) {
      if (!username) {
        setLoading(false);
        return alert('Ajoute un nom d\'utilisateur (pseudo) !');
      }
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: username, avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}` } }
      });

      if (error) {
        alert(error.message);
      } else {
        // Ajouter le profil utilisateur dans la table publique
        await supabase.from('profiles').insert([
          { id: data.user.id, username, email, avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}`, status: 'online' }
        ]);
        alert('Compte créé ! Connecte-toi maintenant.');
        setIsSignUp(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        alert('Erreur: ' + error.message);
      } else {
        // Mettre à jour le statut en ligne
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').update({ status: 'online' }).eq('id', user.id);
        window.location.href = '/dashboard';
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 animate-fade-in">
      <div className="w-20 h-20 bg-gradient-to-tr from-purple-600 via-pink-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-purple-500/20 mb-4 rotate-6 hover:rotate-0 transition-all duration-300">
        <span className="text-3xl font-black text-white">V</span>
      </div>

      <h1 className="text-3xl font-black tracking-tight mb-1 bg-gradient-to-r from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">VibeNet</h1>
      <p className="text-gray-400 text-xs mb-6 text-center max-w-xs">L'application de messagerie privée haut de gamme.</p>

      <div className="glass-panel p-6 rounded-2xl w-full max-w-sm shadow-2xl animate-slide-up">
        <h2 className="text-lg font-bold mb-4 text-center">{isSignUp ? 'Créer un compte' : 'Bon retour parmi nous ✨'}</h2>
        
        <form onSubmit={handleAuth} className="space-y-3.5">
          {isSignUp && (
            <div>
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Pseudo</label>
              <input type="text" placeholder="Ton pseudo unique" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full glass-input rounded-xl px-3 py-2.5 text-xs" />
            </div>
          )}
          <div>
            <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Email</label>
            <input type="email" placeholder="exemple@domain.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full glass-input rounded-xl px-3 py-2.5 text-xs" />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Mot de passe</label>
            <input type="password" placeholder="••••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full glass-input rounded-xl px-3 py-2.5 text-xs" />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg mt-2 active:scale-95">
            {loading ? 'Chargement...' : isSignUp ? "S'inscrire" : 'Se connecter'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-xs text-purple-400 hover:underline">
            {isSignUp ? 'Déjà un compte ? Se connecter' : "Pas encore de compte ? S'inscrire"}
          </button>
        </div>
      </div>
    </div>
  );
}

