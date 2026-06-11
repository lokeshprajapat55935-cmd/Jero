export function ThemeScript() {
  const code = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = stored === 'dark' || (stored !== 'light' && prefersDark);
    var root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  } catch (e) {}

  try {
    window.addEventListener('error', function (event) {
      if (event.message && (event.message.indexOf('Loading chunk') !== -1 || event.message.indexOf('ChunkLoadError') !== -1)) {
        window.location.reload();
      }
    }, true);
  } catch (e) {}
})();
`;

  return (
    <script id="theme-init" dangerouslySetInnerHTML={{ __html: code }} />
  );
}