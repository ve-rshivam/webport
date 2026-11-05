import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiUrl } from '../lib/api';

const INITIAL_MESSAGES = [
  {
    sender: 'ai',
    text: "Ask me about Shivam's work, stack or availability. For the résumé and contact details, use the links on the page.",
  },
];

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

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
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="chat-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mb-3 flex h-[440px] w-[min(340px,calc(100vw-2rem))] flex-col border border-[var(--ink)] bg-[var(--paper)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--rule)] px-4 py-3">
              <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink)]">
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
                <p className="font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                  Typing…
                </p>
              )}
            </div>

            <form onSubmit={sendMessage} className="flex border-t border-[var(--rule)]">
              <label htmlFor="chat-input" className="sr-only">
                Your question
              </label>
              <input
                id="chat-input"
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask something…"
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
              />
              <button
                type="submit"
                className="border-l border-[var(--rule)] px-4 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
              >
                Send
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="chat-panel"
        className="flex items-center gap-2 border border-[var(--ink)] bg-[var(--paper)] px-4 py-2.5 font-mono-ui text-[10px] uppercase tracking-[0.16em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        {isOpen ? 'Close' : 'Ask'}
      </button>
    </div>
  );
};

export default Chatbot;
