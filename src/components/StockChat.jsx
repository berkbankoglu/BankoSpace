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

export default function StockChat({ session }) {
  const [channel, setChannel] = useState('general');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [usernameSet, setUsernameSet] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const channelRef = useRef(channel);
  channelRef.current = channel;

  // Load saved username
  useEffect(() => {
    const saved = localStorage.getItem('chat_username');
    if (saved) { setUsername(saved); setUsernameSet(true); }
  }, []);

  // Fetch messages + realtime subscription
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
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      });

    const sub = supabase
      .channel(`chat:${channel}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel=eq.${channel}`,
      }, (payload) => {
        if (channelRef.current !== channel) return;
        setMessages(prev => [...prev.slice(-MAX_MSG + 1), payload.new]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channel, usernameSet]);

  const sendMessage = async (text) => {
    if (!text.trim() || !session) return;

    // /join <channel> command
    if (text.startsWith('/join ')) {
      const ch = text.slice(6).trim().toLowerCase();
      if (CHANNEL_REGEX.test(ch)) {
        setChannel(ch);
        setInput('');
      }
      return;
    }

    const { error } = await supabase.from('chat_messages').insert({
      channel,
      user_id: session.user.id,
      username,
      content: text.trim(),
    });
    if (!error) setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const saveUsername = () => {
    const u = usernameInput.trim();
    if (!u || u.length < 2 || u.length > 20) return;
    localStorage.setItem('chat_username', u);
    setUsername(u);
    setUsernameSet(true);
  };

  if (collapsed) {
    return (
      <div className="schat-collapsed" onClick={() => setCollapsed(false)}>
        <span className="schat-collapsed-icon">💬</span>
        <span className="schat-collapsed-label">#{channel}</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="schat-root">
        <div className="schat-header">
          <span className="schat-title">💬 Chat</span>
        </div>
        <div className="schat-no-session">Sohbet için giriş yapman gerekiyor</div>
      </div>
    );
  }

  if (!usernameSet) {
    return (
      <div className="schat-root">
        <div className="schat-header">
          <span className="schat-title">💬 Chat</span>
        </div>
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
      </div>
    );
  }

  return (
    <div className="schat-root">
      {/* Header */}
      <div className="schat-header">
        <div className="schat-header-left">
          <span className="schat-channel-hash">#</span>
          <span className="schat-title">{channel}</span>
        </div>
        <div className="schat-header-right">
          <span className="schat-me">@{username}</span>
          <button className="schat-collapse-btn" onClick={() => setCollapsed(true)} title="Küçült">‹</button>
        </div>
      </div>

      {/* Messages */}
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
                  <div
                    className="schat-avatar"
                    style={{ background: getAvatarColor(msg.username) }}
                  >
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

      {/* Input */}
      <div className="schat-input-area">
        <input
          ref={inputRef}
          className="schat-input"
          placeholder={`#${channel} — /join <kanal> ile geç`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
        />
        <button
          className="schat-send-btn"
          onClick={() => sendMessage(input)}
          disabled={!input.trim()}
        >↑</button>
      </div>
    </div>
  );
}
