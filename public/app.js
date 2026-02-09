document.getElementById('enhanceForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const calendarUrl = document.getElementById('calendarUrl').value;
    const resultDiv = document.getElementById('result');
    const errorDiv = document.getElementById('error');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    // Hide previous results
    resultDiv.style.display = 'none';
    errorDiv.style.display = 'none';

    // Show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Generating...';

    try {
        const response = await fetch(`/api/generate?url=${encodeURIComponent(calendarUrl)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate enhanced URL');
        }

        // Display enhanced URL
        document.getElementById('enhancedUrl').value = data.enhancedUrl;
        resultDiv.style.display = 'block';

        // Scroll to result
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
        document.getElementById('errorMessage').textContent = error.message;
        errorDiv.style.display = 'block';
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '✨ Enhance Calendar';
    }
});

// Copy to clipboard functionality
document.getElementById('copyBtn').addEventListener('click', async () => {
    const enhancedUrl = document.getElementById('enhancedUrl').value;
    const copyBtn = document.getElementById('copyBtn');

    try {
        await navigator.clipboard.writeText(enhancedUrl);

        // Visual feedback
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ Copied!';
        copyBtn.classList.add('copied');

        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.classList.remove('copied');
        }, 2000);

    } catch (error) {
        alert('Failed to copy. Please select and copy manually.');
    }
});
