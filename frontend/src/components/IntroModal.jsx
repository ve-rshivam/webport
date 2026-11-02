import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';

const SCREENS = [
  {
    prompt: 'shivam@portfolio:~$',
    lines: [
      { type: 'command', text: 'whoami' },
      { type: 'output', text: 'Shivam Kumar' },
      { type: 'output', text: 'Full-Stack Web Developer' },
      { type: 'output', text: 'AI & ML Enthusiast' },
    ],
  },
  {
    prompt: 'shivam@portfolio:~$',
    lines: [
      { type: 'command', text: 'cat skills.txt' },
      { type: 'output', text: 'React · Node.js · Python · MongoDB' },
      { type: 'output', text: 'TypeScript · Tailwind · Express' },
      { type: 'output', text: 'Google Cloud · OpenAI API · Linux' },
    ],
  },
  {
    prompt: 'shivam@portfolio:~$',
    lines: [
      { type: 'command', text: 'cat mission.log' },
      { type: 'output', text: 'Building interfaces that work.' },
      { type: 'output', text: 'Shipping APIs that scale.' },
      { type: 'output', text: 'Contributing to open source.' },
    ],
  },
];

const TYPE_SPEED = 28;
const LINE_PAUSE = 600;
const SCREEN_PAUSE = 2200;
const START_DELAY = 500;
const CLOSE_DELAY = 900;

const countChars = (lines) => lines.reduce((sum, line) => sum + line.text.length, 0);
const TOTAL_CHARS = SCREENS.reduce((sum, screen) => sum + countChars(screen.lines), 0);

const IntroModal = () => {
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [screenIndex, setScreenIndex] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem('introSeen', 'true');
    } catch {
      // storage can be unavailable in private mode; dismissal still works
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    let seen = null;
    try {
      seen = localStorage.getItem('introSeen');
    } catch {
      seen = null;
    }
    if (seen) return undefined;
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible || started) return undefined;
    const t = setTimeout(() => setStarted(true), START_DELAY);
    return () => clearTimeout(t);
  }, [visible, started]);

  // One timer per state: every char, line and screen transition re-runs this
  // effect with fresh values, so the animation always advances and the progress
  // counter reaches exactly 100% on the final character.
  useEffect(() => {
    if (!visible || !started) return undefined;

    const screen = SCREENS[screenIndex];
    const line = screen?.lines[currentLine];

    if (!line) {
      if (screenIndex < SCREENS.length - 1) {
        const t = setTimeout(() => {
          setScreenIndex((i) => i + 1);
          setCurrentLine(0);
          setCurrentChar(0);
        }, SCREEN_PAUSE);
        return () => clearTimeout(t);
      }

      // Everything typed: progress is at 100%, close on its own.
      const t = setTimeout(dismiss, CLOSE_DELAY);
      return () => clearTimeout(t);
    }

    if (currentChar < line.text.length) {
      const t = setTimeout(() => setCurrentChar((c) => c + 1), TYPE_SPEED);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setCurrentLine((l) => l + 1);
      setCurrentChar(0);
    }, LINE_PAUSE);
    return () => clearTimeout(t);
  }, [visible, started, screenIndex, currentLine, currentChar, dismiss]);

  useEffect(() => {
    if (!visible) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible, dismiss]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) dismiss();
  };

  const currentScreen = SCREENS[screenIndex];
  const currentLineData = currentScreen?.lines[currentLine];
  const displayedText = currentLineData ? currentLineData.text.slice(0, currentChar) : '';
  const isCommand = currentLineData?.type === 'command';

  const charsBeforeScreen = SCREENS.slice(0, screenIndex).reduce(
    (sum, screen) => sum + countChars(screen.lines),
    0
  );
  const charsBeforeLine = currentScreen
    ? countChars(currentScreen.lines.slice(0, currentLine))
    : 0;
  const typedChars =
    charsBeforeScreen +
    charsBeforeLine +
    Math.min(currentChar, currentLineData ? currentLineData.text.length : 0);
  const progress =
    TOTAL_CHARS > 0 ? Math.min(100, Math.round((typedChars / TOTAL_CHARS) * 100)) : 0;

  return (
    <AnimatePresence>
      {visible && (
        <div
          className="intro-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={handleOverlayClick}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-lg border border-[var(--rule)] bg-[#0d0d0d] shadow-2xl">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-[var(--rule)] bg-[#1a1a1a] px-4 py-2.5">
              <span className="flex h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="flex h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="flex h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[10px] font-mono-ui text-[#888] uppercase tracking-wider">
                portfolio — zsh
              </span>
            </div>

            {/* Terminal body */}
            <div className="px-5 py-4 font-mono text-sm leading-7 text-[#c9c9c9]">
              {currentScreen.lines.slice(0, currentLine).map((line, i) => (
                <div key={i} className="text-[var(--ink-soft)]">
                  {line.type === 'command' ? (
                    <span className="text-[var(--signal)]">
                      {currentScreen.prompt} {line.text}
                    </span>
                  ) : (
                    line.text
                  )}
                </div>
              ))}

              {currentLineData && (
                <div className={isCommand ? 'text-[var(--signal)]' : 'text-[var(--ink-soft)]'}>
                  {isCommand && currentScreen.prompt} {displayedText}
                  <span className="inline-block h-4 w-2.5 bg-[var(--signal)] ml-1 animate-pulse" />
                </div>
              )}

              {currentScreen.lines.slice(currentLine + 1).map((line, i) => (
                <div
                  key={i}
                  className="text-[#c9c9c9]/20"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {line.type === 'command' ? (
                    <span className="text-[var(--signal)]/20">
                      {currentScreen.prompt} {line.text}
                    </span>
                  ) : (
                    line.text
                  )}
                </div>
              ))}
            </div>

            {/* Status bar */}
            <div className="border-t border-[var(--rule)] bg-[#1a1a1a] px-4 py-1.5 flex items-center justify-between text-[10px] font-mono-ui text-[#666]">
              <span className="text-[#c9c9c9]">{String.fromCharCode(125)}</span>
              <span className="text-[#888]">
                {progress >= 100 ? '100% — opening portfolio' : 'Typing... ' + progress + '%'}
              </span>
              <span className="text-[#c9c9c9]">00:00</span>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-[10px] font-mono-ui text-[#888] tracking-wider">
            <kbd className="pointer-events-auto mx-1 px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[var(--rule)] text-[#c9c9c9]">Esc</kbd>
            <span className="mx-1 text-[#666]">or</span>
            <kbd className="pointer-events-auto mx-1 px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[var(--rule)] text-[#c9c9c9]">Enter</kbd>
            <span className="mx-1 text-[#666]">to dismiss</span>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default IntroModal;
