import React, { useState } from 'react';

export default function LivePreviewTab({ previewUrl, projectTitle }) {
  const [viewport, setViewport] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const cleanUrl = (previewUrl || '').trim();

  if (!cleanUrl) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-[#0d1117] border border-gray-800 rounded-xl text-center my-4">
        <div className="text-4xl mb-3">🚀</div>
        <h3 className="text-lg font-semibold text-white mb-1">
          Live Staging Preview Not Available Yet
        </h3>
        <p className="text-sm text-gray-400 max-w-md">
          Once the initial build for <span className="text-cyan-400">{projectTitle || 'your project'}</span> is deployed to the staging server, you will be able to interact with the live preview right here.
        </p>
      </div>
    );
  }

  const viewportStyles = {
    desktop: 'w-full h-[650px]',
    tablet: 'w-[768px] max-w-full h-[650px]',
    mobile: 'w-[375px] max-w-full h-[650px]',
  };

  return (
    <div className="flex flex-col bg-[#0d1117] border border-gray-800 rounded-xl overflow-hidden my-4 shadow-xl">
      {/* Top Preview Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#161b22] border-b border-gray-800">
        {/* Browser Dots & URL Bar */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
          <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
          <div className="ml-2 px-3 py-1 bg-[#0d1117] border border-gray-700 rounded text-xs text-gray-300 truncate max-w-sm">
            🔒 {cleanUrl}
          </div>
        </div>

        {/* Viewport Switcher Buttons */}
        <div className="flex items-center gap-1 bg-[#0d1117] p-1 rounded-lg border border-gray-800">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              viewport === 'desktop'
                ? 'bg-cyan-500 text-black font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            💻 Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              viewport === 'tablet'
                ? 'bg-cyan-500 text-black font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📱 Tablet
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`px-3 py-1 rounded text-xs font-medium transition ${
              viewport === 'mobile'
                ? 'bg-cyan-500 text-black font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📲 Mobile
          </button>
        </div>

        {/* Reload & Open External Tab */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadKey((prev) => prev + 1);
            }}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-medium transition"
            title="Reload Preview"
          >
            ↻ Reload
          </button>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-xs font-medium transition"
          >
            Open New Tab ↗
          </a>
        </div>
      </div>

      {/* Responsive Iframe Container */}
      <div className="relative flex justify-center bg-[#090c10] p-4 overflow-x-auto">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]/80 z-10">
            <div className="text-sm text-cyan-400 animate-pulse font-medium">
              Loading live preview...
            </div>
          </div>
        )}
        <iframe
          key={reloadKey}
          src={cleanUrl}
          title={projectTitle || 'Live Project Preview'}
          onLoad={() => setLoading(false)}
          className={`${viewportStyles[viewport]} bg-white rounded-lg border border-gray-700 shadow-2xl transition-all duration-300`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}