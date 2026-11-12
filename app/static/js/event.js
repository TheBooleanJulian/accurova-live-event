const EVENT_SLUG = document.currentScript.dataset.slug;

function showStatus(el, msg, ok) {
  el.textContent = msg;
  el.classList.remove('ok', 'err');
  el.classList.add('show', ok ? 'ok' : 'err');
}

const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById('signup-status');
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const btn = signupForm.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch(`/e/${EVENT_SLUG}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (res.ok) {
        showStatus(statusEl, "You're on the list — we'll email you the moment photos are ready.", true);
        signupForm.reset();
      } else {
        showStatus(statusEl, data.detail || 'Something went wrong. Please try again.', false);
      }
    } catch (err) {
      showStatus(statusEl, 'Network error. Please try again.', false);
    } finally {
      btn.disabled = false;
    }
  });
}

document.getElementById('open-enquiry').addEventListener('click', () => {
  const card = document.getElementById('enquiry-card');
  card.style.display = card.style.display === 'none' ? 'block' : 'none';
  if (card.style.display === 'block') card.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

const enquiryForm = document.getElementById('enquiry-form');
enquiryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl = document.getElementById('enquiry-status');
  const btn = enquiryForm.querySelector('button');
  const formData = new FormData(enquiryForm);
  const payload = Object.fromEntries(formData.entries());
  btn.disabled = true;
  try {
    const res = await fetch(`/e/${EVENT_SLUG}/enquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      showStatus(statusEl, "Thanks — we'll be in touch shortly.", true);
      enquiryForm.reset();
    } else {
      showStatus(statusEl, data.detail || 'Something went wrong. Please try again.', false);
    }
  } catch (err) {
    showStatus(statusEl, 'Network error. Please try again.', false);
  } finally {
    btn.disabled = false;
  }
});

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

const copyPasswordBtn = document.getElementById('copy-password-btn');
if (copyPasswordBtn) {
  copyPasswordBtn.addEventListener('click', async () => {
    const password = document.getElementById('gallery-password-value').textContent;
    const originalLabel = copyPasswordBtn.textContent;
    try {
      await copyText(password);
      copyPasswordBtn.textContent = 'Copied!';
    } catch (err) {
      copyPasswordBtn.textContent = 'Copy failed';
    }
    setTimeout(() => { copyPasswordBtn.textContent = originalLabel; }, 2000);
  });
}

const viewGalleryLink = document.getElementById('view-gallery-link');
const passwordValueEl = document.getElementById('gallery-password-value');
if (viewGalleryLink && passwordValueEl) {
  viewGalleryLink.addEventListener('click', async () => {
    try {
      await copyText(passwordValueEl.textContent);
      document.getElementById('gallery-password-copied-note').style.display = 'block';
    } catch (err) {
      // Clipboard write failed silently — the password is still visible/copyable above.
    }
  });
}
