// ==========================================================================
// SISTEMA CEPCI - SHOWCASE WEBSITE LOGIC
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    initNavbarScroll();
    initDemoTabs();
    initModuleFilter();
    initCounters();
    initSmoothScroll();
    initCopyButtons();
    initLightbox();
});

// 1. Navbar Glassmorphism on Scroll
function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

// 2. Interactive Live Demo Tabs
function initDemoTabs() {
    const tabButtons = document.querySelectorAll('.demo-tab-btn');
    const tabContents = document.querySelectorAll('.demo-tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');

            // Toggle active buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Toggle active contents
            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
        });
    });
}

// 3. Module Filter Bar
function initModuleFilter() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const moduleCards = document.querySelectorAll('.module-card');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const category = btn.getAttribute('data-category');

            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            moduleCards.forEach(card => {
                const cardCat = card.getAttribute('data-category');
                if (category === 'all' || cardCat === category) {
                    card.style.display = 'flex';
                    card.style.animation = 'fadeIn 0.4s ease';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// 4. Animated Counters on Scroll
function initCounters() {
    const counters = document.querySelectorAll('[data-counter]');
    let hasAnimated = false;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !hasAnimated) {
                hasAnimated = true;
                counters.forEach(counter => {
                    const target = parseInt(counter.getAttribute('data-counter'), 10);
                    let current = 0;
                    const duration = 1200;
                    const stepTime = 25;
                    const steps = duration / stepTime;
                    const increment = target / steps;

                    const timer = setInterval(() => {
                        current += increment;
                        if (current >= target) {
                            counter.textContent = target;
                            clearInterval(timer);
                        } else {
                            counter.textContent = Math.floor(current);
                        }
                    }, stepTime);
                });
            }
        });
    }, { threshold: 0.3 });

    const heroMetrics = document.querySelector('.hero-metrics-strip');
    if (heroMetrics) {
        observer.observe(heroMetrics);
    }
}

// 5. Smooth Scroll for Navigation Anchors
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// 6. Copy to Clipboard for Credentials
function initCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const textToCopy = btn.getAttribute('data-copy');
            if (!textToCopy) return;

            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    const tempInput = document.createElement('textarea');
                    tempInput.value = textToCopy;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                }

                const originalHTML = btn.innerHTML;
                btn.classList.add('copied');
                btn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Copiado!';

                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = originalHTML;
                }, 2000);
            } catch (err) {
                console.error('Error al copiar al portapapeles:', err);
            }
        });
    });
}

// 7. Lightbox Modal for Real Screenshots
function initLightbox() {
    const modal = document.getElementById('lightboxModal');
    const modalImg = document.getElementById('lightboxImg');
    const modalCaption = document.getElementById('lightboxCaption');
    const closeBtn = document.getElementById('lightboxClose');
    if (!modal || !modalImg) return;

    document.querySelectorAll('[data-lightbox]').forEach(el => {
        el.addEventListener('click', () => {
            const src = el.getAttribute('data-lightbox-src') || el.querySelector('img')?.src;
            const caption = el.getAttribute('data-lightbox-caption') || el.querySelector('img')?.alt || 'Captura de Pantalla Real del Sistema CEPCI';
            if (src) {
                modalImg.src = src;
                if (modalCaption) modalCaption.textContent = caption;
                modal.classList.add('active');
            }
        });
    });

    const closeModal = () => modal.classList.remove('active');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });
}

