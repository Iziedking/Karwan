/// Runs in <head> before first paint, so it cannot import anything. It must
/// paint exactly what `themeForRoute` in useTheme.ts paints: the landing page is
/// always dark; elsewhere the stored preference applies, 'system' follows the
/// local clock and a first visit is dark. If the two disagree the page paints
/// one theme and swaps to the other. themePrepaintScript.test.ts runs both over
/// the same cases.
export const THEME_PREPAINT_SCRIPT =
  "(function(){try{var d=document.documentElement;if(location.pathname==='/'){d.setAttribute('data-theme','dark');return;}var t=localStorage.getItem('karwan-theme');if(t!=='light'&&t!=='dark'&&t!=='system'){t='dark';}if(t==='system'){var h=new Date().getHours();t=(h>=19||h<7)?'dark':'light';}if(t==='dark')d.setAttribute('data-theme','dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();";
