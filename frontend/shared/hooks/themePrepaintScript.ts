/// Runs in <head> before first paint, so it cannot import anything. The server
/// markup already carries data-theme="dark"; this removes it only when light was
/// chosen, off the landing page. It must paint exactly what `themeForRoute` and
/// `themeFromStored` in useTheme.ts paint; themePrepaintScript.test.ts runs both
/// over the same cases.
export const THEME_PREPAINT_SCRIPT =
  "(function(){var d=document.documentElement;try{if(location.pathname!=='/'&&localStorage.getItem('karwan-theme')==='light'){d.removeAttribute('data-theme');return;}}catch(e){}d.setAttribute('data-theme','dark');})();";
