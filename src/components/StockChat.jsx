import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import './StockChat.css';

const MAX_MSG = 200;
const CHANNEL_REGEX = /^[a-z0-9_-]{1,20}$/;

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString();
}

function getAvatarColor(username) {
  const colors = ['#4f86f7','#e3b341','#3fb950','#f85149','#a371f7','#39d353','#f0883e','#58a6ff'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function StockChat() {
  const [channel, setChannel] = useState('general');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameSet, setUsernameSet] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const bottomRef = useRef(null);
  const channelRef = useRef(channel);
  const myUserIdRef = useRef(null);
  channelRef.current = channel;

  // Load saved username + resolve user id once (no session prop dependency)
  useEffect(() => {
    const saved = localStorage.getItem('chat_username');
    if (saved) { setUsername(saved); setUsernameSet(true); }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        myUserIdRef.current = session.user.id;
        setLoggedIn(true);
      }
    });
  }, []);

  // Fetch + subscribe
  useEffect(() => {
    if (!usernameSet) return;
    setLoading(true);
    setMessages([]);

    supabase
      .from('chat_messages')
      .select('*')
      .eq('channel', channel)
      .order('created_at', { ascending: true })
      .limit(MAX_MSG)
      .then(({ data }) => {
        if (data) setMessages(data);
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      });

    const sub = supabase
      .channel(`chat-${channel}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel=eq.${channel}`,
      }, (payload) => {
        if (channelRef.current !== channel) return;
        if (payload.new.user_id === myUserIdRef.current) return;
        setMessages(prev => [...prev.slice(-(MAX_MSG - 1)), payload.new]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel, usernameSet]);

  const sendMessage = async (text) => {
    if (!text.trim() || !myUserIdRef.current) return;

    if (text.startsWith('/join ')) {
      const ch = text.slice(6).trim().toLowerCase();
      if (CHANNEL_REGEX.test(ch)) { setChannel(ch); setInput(''); }
      return;
    }

    const userId = myUserIdRef.current;
    const optimistic = {
      id: `opt-${Date.now()}`,
      channel,
      user_id: userId,
      username,
      content: text.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev.slice(-(MAX_MSG - 1)), optimistic]);
    setInput('');
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    const { data, error } = await supabase.from('chat_messages').insert({
      channel,
      user_id: userId,
      username,
      content: text.trim(),
    }).select().single();

    if (!error && data) {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? data : m));
    } else if (error) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    }
  };

  const saveUsername = () => {
    const u = usernameInput.trim();
    if (!u || u.length < 2 || u.length > 20) return;
    localStorage.setItem('chat_username', u);
    setUsername(u);
    setUsernameSet(true);
  };

  return (
    <div className="schat-wrapper">
      <div className="schat-root">

        {/* Header */}
        <div className="schat-header">
          <div className="schat-header-left">
            <span className="schat-channel-hash">#</span>
            <span className="schat-title">{channel}</span>
          </div>
          <div className="schat-header-right">
            {usernameSet && <span className="schat-me">@{username}</span>}
          </div>
        </div>

        {!loggedIn ? (
          <div className="schat-no-session">Sohbet için giriş yapman gerekiyor</div>
        ) : !usernameSet ? (
          <div className="schat-username-setup">
            <div className="schat-username-title">Kullanıcı adını seç</div>
            <div className="schat-username-sub">Diğer kullanıcılar bu ismi görecek</div>
            <input
              className="schat-username-input"
              placeholder="kullaniciadi"
              value={usernameInput}
              maxLength={20}
              onChange={e => setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && saveUsername()}
              autoFocus
            />
            <button className="schat-username-btn" onClick={saveUsername}>Devam</button>
          </div>
        ) : (
          <>
            <div className="schat-messages">
              {loading && <div className="schat-loading">Yükleniyor...</div>}
              {!loading && messages.length === 0 && (
                <div className="schat-empty">
                  <div className="schat-empty-icon">💬</div>
                  <div>#{channel} kanalında henüz mesaj yok</div>
                  <div className="schat-empty-sub">İlk mesajı sen gönder!</div>
                </div>
              )}
              {messages.map((msg, i) => {
                const prevMsg = messages[i - 1];
                const showHeader = !prevMsg || prevMsg.username !== msg.username ||
                  (new Date(msg.created_at) - new Date(prevMsg.created_at)) > 60000;
                return (
                  <div key={msg.id} className={`schat-msg ${!showHeader ? 'schat-msg-cont' : ''}`}>
                    {showHeader && (
                      <div className="schat-msg-header">
                        <div className="schat-avatar" style={{ background: getAvatarColor(msg.username) }}>
                          {msg.username[0].toUpperCase()}
                        </div>
                        <span className="schat-msg-user">{msg.username}</span>
                        <span className="schat-msg-time">{timeAgo(msg.created_at)}</span>
                      </div>
                    )}
                    <div className={`schat-msg-body ${!showHeader ? 'schat-msg-body-cont' : ''}`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="schat-input-area">
              <input
                className="schat-input"
                placeholder={`#${channel} — /join <kanal>`}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                maxLength={500}
              />
              <button
                className="schat-send-btn"
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
              >↑</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
