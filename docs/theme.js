// Light / dark / system switch for the Roj website. The choice is a per-browser
// convenience; the page works the same without storage.
(function () {
    const order = ['system', 'light', 'dark'];
    let theme = 'system';
    try {
        theme = localStorage.getItem('roj-theme') || 'system';
    } catch (e) { /* storage unavailable */ }

    function apply() {
        if (theme === 'system')
            document.documentElement.removeAttribute('data-theme');
        else
            document.documentElement.setAttribute('data-theme', theme);
        document.querySelectorAll('[data-theme-toggle]').forEach(b => {
            b.textContent = `Theme: ${theme}`;
        });
    }

    apply();
    document.addEventListener('DOMContentLoaded', () => {
        apply();
        document.querySelectorAll('[data-theme-toggle]').forEach(b => b.addEventListener('click', () => {
            theme = order[(order.indexOf(theme) + 1) % order.length];
            try {
                localStorage.setItem('roj-theme', theme);
            } catch (e) { /* storage unavailable */ }
            apply();
        }));
    });
})();
