export const THEME_KEY = "taskhub-theme";

/** Inline, runs before paint: applies the saved theme (default: system). */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=p;}catch(e){}})();`;
