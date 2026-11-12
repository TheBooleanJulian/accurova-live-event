function showStatus(el, msg, ok) {
  el.textContent = msg;
  el.classList.remove('ok', 'err');
  el.classList.add('show', ok ? 'ok' : 'err');
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
    const res = await fetch('/enquiry', {
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

const carousel = document.getElementById('event-carousel');
const carouselPrev = document.getElementById('carousel-prev');
const carouselNext = document.getElementById('carousel-next');
if (carousel && carouselPrev && carouselNext) {
  const cards = Array.from(carousel.children);
  const cardWidth = () => {
    const card = carousel.querySelector('.carousel-card');
    const gap = parseFloat(getComputedStyle(carousel).columnGap || getComputedStyle(carousel).gap || '0');
    return card.getBoundingClientRect().width + gap;
  };

  if (cards.length > 1) {
    // Loop the carousel by cloning the edge cards and silently snapping back
    // when scroll reaches a clone, so arrows/swipes never hit a hard stop.
    const firstClone = cards[0].cloneNode(true);
    const lastClone = cards[cards.length - 1].cloneNode(true);
    firstClone.setAttribute('aria-hidden', 'true');
    lastClone.setAttribute('aria-hidden', 'true');
    carousel.appendChild(firstClone);
    carousel.insertBefore(lastClone, cards[0]);
    carousel.scrollLeft = cardWidth();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { carousel.scrollLeft = cardWidth(); }, 150);
    });

    let scrollTimer;
    carousel.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const w = cardWidth();
        const maxScroll = carousel.scrollWidth - carousel.clientWidth;
        if (carousel.scrollLeft <= 2) {
          carousel.scrollLeft = maxScroll - w;
        } else if (carousel.scrollLeft >= maxScroll - 2) {
          carousel.scrollLeft = w;
        }
      }, 120);
    });

    let autoplay = setInterval(() => scrollByCard(1), 5000);
    carousel.addEventListener('pointerdown', () => clearInterval(autoplay));
  }

  function scrollByCard(dir) {
    carousel.scrollBy({ left: dir * cardWidth(), behavior: 'smooth' });
  }
  carouselPrev.addEventListener('click', () => scrollByCard(-1));
  carouselNext.addEventListener('click', () => scrollByCard(1));
}
