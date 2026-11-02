import { useEffect, useState, useRef } from 'react';
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

const IntroModal = () => {
  const [visible, setVisible] = useState(false);
  const [screenIndex, setScreenIndex] = useState(0);
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [done, setDone] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const seen = localStorage.getItem('introSeen');
    if (seen) return;
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  const schedule = (ms, fn) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(fn, ms);
  };

  const typeLine = (lineIdx) => {
    const screen = SCREENS[screenIndex];
    const line = screen.lines[lineIdx];
    if (!line) {
      schedule(LINE_PAUSE, () => {
        if (screenIndex < SCREENS.length - 1) {
          schedule(SCREEN_PAUSE, advanceScreen);
        } else {
          setDone(true);
        }
      });
      return;
    }

    if (currentChar < line.text.length) {
      setCurrentChar((prev) => prev + 1);
      schedule(TYPE_SPEED, () => typeLine(lineIdx));
    } else {
      schedule(LINE_PAUSE, () => {
        setCurrentLine((prev) => prev + 1);
        setCurrentChar(0);
        schedule(80, () => typeLine(lineIdx + 1));
      });
    }
  };

  const advanceScreen = () => {
    setScreenIndex((prev) => prev + 1);
    setCurrentLine(0);
    setCurrentChar(0);
    schedule(300, () => typeLine(0));
  };

  useEffect(() => {
    if (!visible) return;
    schedule(400, () => typeLine(0));
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        localStorage.setItem('introSeen', 'true');
        setVisible(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      localStorage.setItem('introSeen', 'true');
      setVisible(false);
    }
  };

  const currentScreen = SCREENS[screenIndex];
  const currentLineData = currentScreen?.lines[currentLine];
  const displayedText = currentLineData ? currentLineData.text.slice(0, currentChar) : '';
  const isCommand = currentLineData?.type === 'command';

  const typedChars = currentScreen.lines
    .slice(0, currentLine)
    .reduce((a, l) => a + (l.type === 'command' ? 0 : l.text.length), 0) + currentChar;
  const totalChars = currentScreen.lines.reduce((a, l) => a + l.text.length, 0);
  const progress = totalChars > 0 ? Math.round((typedChars / totalChars) * 100) : 0;

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

              <div className={isCommand ? 'text-[var(--signal)]' : 'text-[var(--ink-soft)]'}>
                {isCommand && currentScreen.prompt} {displayedText}
                {!isCommand && displayedText}
                <span className="inline-block h-4 w-2.5 bg-[var(--signal)] ml-1 animate-pulse" />
              </div>

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

              {done && (
                <div className="mt-1">
                  <span className="text-[var(--signal)]">{currentScreen.prompt}</span>
                  <span className="inline-block h-4 w-2.5 bg-[var(--signal)] ml-1 animate-pulse" />
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="border-t border-[var(--rule)] bg-[#1a1a1a] px-4 py-1.5 flex items-center justify-between text-[10px] font-mono-ui text-[#666]">
              <span className="text-[#c9c9c9]">{String.fromCharCode(125)}</span>
              <span className="text-[#888]">
                {done
                  ? 'Press any key to explore'
                  : 'Typing... ' + progress + '%'}
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
