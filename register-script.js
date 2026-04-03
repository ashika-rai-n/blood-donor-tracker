document.addEventListener('DOMContentLoaded', () => {
    const typeRadios = Array.from(document.querySelectorAll('input[name="registration-type"]'));
    const donorFields = document.querySelector('.donor-specific-fields');

    if (!typeRadios.length || !donorFields) return;

    function updateVisibility() {
        const selected = document.querySelector('input[name="registration-type"]:checked');
        if (!selected) return;
        if (selected.value === 'recipient') {
            donorFields.style.display = 'none';
        } else {
            donorFields.style.display = '';
        }
    }

    // Attach change handlers
    typeRadios.forEach(r => r.addEventListener('change', updateVisibility));

    // Initialize visibility on load
    updateVisibility();
});
