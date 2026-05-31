function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const msg = browser.i18n.getMessage(key);
    if (msg) el.textContent = msg;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const msg = browser.i18n.getMessage(key);
    if (msg) el.placeholder = msg;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const msg = browser.i18n.getMessage(key);
    if (msg) el.title = msg;
  });
  const pageTitleKey = document.documentElement.getAttribute('data-i18n-page-title');
  if (pageTitleKey) {
    const msg = browser.i18n.getMessage(pageTitleKey);
    if (msg) document.title = msg;
  }
}
