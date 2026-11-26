// Copy buttons on the tools landing page.
document.querySelectorAll('[data-copy]').forEach((button) => {
  const label = button.textContent;
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; }
    button.textContent = ok ? 'Copied' : 'Select and copy';
    button.classList.toggle('is-copied', ok);
    setTimeout(() => { button.textContent = label; button.classList.remove('is-copied'); }, 1800);
  });
});
