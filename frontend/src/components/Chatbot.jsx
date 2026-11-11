import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiUrl } from '../lib/api';

const INITIAL_MESSAGES = [
  {
    sender: 'ai',
    text: "Ask me about Shivam's work, stack or availability. For the resume and contact details, use the links on the page.",
  },
];

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef(null);

  // Opened from the header / mobile menu trigger instead of a floating button.
  useEffect(() => {
    const openChat = () => setIsOpen(true);
    window.addEventListener('chat_open', openChat);
    return () => window.removeEventListener('chat_open', openChat);
  }, []);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const sendMessage = async (event) => {
    event.preventDefault();

    const text = input.trim();
    if (!text) return;

    setMessages((prev) => [...prev, { sender: 'user', text }]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) throw new Error(`Chat request failed with ${response.status}`);

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: data.reply || 'No answer came back.' },
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: 'Connection error. The backend might be sleeping.' },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-[max(1.5rem,calc((100vw_-_1440px)_/_2_+_2.5rem))] z-40 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="chat-panel"
            role="dialog"
            aria-labelledby="chat-title"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex h-[440px] w-[min(340px,calc(100vw-2rem))] flex-col border border-[var(--ink)] bg-[var(--paper)] shadow-[0_18px_40px_rgba(0,0,0,0.12)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-3">
              <p id="chat-title" className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink)]">
                Ask about my work
              </p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                className="font-mono-ui text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--signal)]"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`max-w-[85%] ${message.sender === 'user' ? 'ml-auto' : ''}`}
                >
                  <div
                    className={`px-3.5 py-2.5 text-sm leading-relaxed ${
                      message.sender === 'user'
                        ? 'bg-[var(--signal)] text-[var(--paper)]'
                        : 'border border-[var(--rule)] bg-[var(--paper-2)] text-[var(--ink)]'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}

              {isTyping && (
                <p className="font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                  Typing…
                </p>
              )}
            </div>

            <form onSubmit={sendMessage} className="flex border-t border-[var(--rule)]">
              <label htmlFor="chat-input" className="sr-only">
                Your question
              </label>
              <input
                ref={inputRef}
                id="chat-input"
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask something…"
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
              />
              <button
                type="submit"
                className="border-l border-[var(--rule)] px-4 font-mono-ui text-label uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
              >
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Chatbot;
