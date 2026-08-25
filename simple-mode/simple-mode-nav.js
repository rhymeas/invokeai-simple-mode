(() => {
  const SIMPLE_MODE_URL = 'http://127.0.0.1:9091';
  const NAV_ID = 'invoke-simple-mode-nav';

  const addSimpleModeNavigation = () => {
    if (document.getElementById(NAV_ID)) return;
    const workflowsButton = document.querySelector('button[data-testid="Workflows"]');
    const navigationGroup = workflowsButton?.parentElement;
    if (!workflowsButton || !navigationGroup) return;

    const button = document.createElement('button');
    button.id = NAV_ID;
    button.type = 'button';
    button.className = workflowsButton.className;
    button.setAttribute('data-theme', workflowsButton.getAttribute('data-theme') || 'dark');
    button.setAttribute('data-testid', 'SimpleMode');
    button.setAttribute('aria-label', 'Simple Mode');
    button.setAttribute('title', 'Simple Mode');
    button.setAttribute('data-selected', 'false');
    button.innerHTML = '<img src="http://127.0.0.1:9091/icon-source" alt="" aria-hidden="true">';
    button.addEventListener('click', () => {
      window.location.href = SIMPLE_MODE_URL;
    });

    workflowsButton.insertAdjacentElement('afterend', button);
  };

  const style = document.createElement('style');
  style.textContent = `
    #${NAV_ID} {
      width: 30px;
      min-width: 30px;
      height: 24px;
      min-height: 24px;
    }
    #${NAV_ID} img {
      width: 18px;
      height: 18px;
      display: block;
      border-radius: 4px;
      object-fit: cover;
    }
    #${NAV_ID}:hover { background: rgba(255, 255, 255, 0.08); }
  `;
  document.head.appendChild(style);

  addSimpleModeNavigation();
  new MutationObserver(addSimpleModeNavigation).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
