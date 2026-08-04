import { db, initHeader } from "./utils.js";
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

let allNewsData = [];
let currentFilteredData = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 6;

function renderNews() {
    const container = document.getElementById('blog-list');
    const pagination = document.getElementById('blog-pagination');
    
    if (currentFilteredData.length === 0) {
        container.innerHTML = "<p style='text-align:center; grid-column:1/-1;'>Không tìm thấy bài viết nào phù hợp.</p>";
        if (pagination) pagination.innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(currentFilteredData.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedItems = currentFilteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    container.innerHTML = paginatedItems.map(n => {
        const date = n.createdAt ? new Date(n.createdAt.toDate()).toLocaleDateString('vi-VN') : 'Mới đây';
        return `
            <article class="blog-card">
                <img src="${n.imageUrl}" alt="${n.title}" class="blog-img">
                <div class="blog-info">
                    <span class="blog-date">${date}</span>
                    <h3>${n.title}</h3>
                    <p>${n.excerpt || ''}</p>
                    <a href="article.html?id=${n.id}" class="btn-outline" style="padding: 0.5rem 1.2rem; font-size: 0.8rem;">Đọc tiếp</a>
                </div>
            </article>`;
    }).join('');
    
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const pagination = document.getElementById('blog-pagination');
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    
    if (currentPage > 1) {
        html += `<button class="blog-page-btn" data-page="${currentPage - 1}">«</button>`;
    }
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            html += `<button class="blog-page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            html += `<span style="display:flex; align-items:center; padding: 0 5px;">...</span>`;
        }
    }

    if (currentPage < totalPages) {
        html += `<button class="blog-page-btn" data-page="${currentPage + 1}">»</button>`;
    }
    
    pagination.innerHTML = html;
    
    pagination.querySelectorAll('.blog-page-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentPage = parseInt(e.target.dataset.page);
            renderNews();
            // Scroll to top of list
            const controls = document.querySelector('.blog-header-controls');
            if (controls) {
                window.scrollTo({ top: controls.offsetTop - 100, behavior: 'smooth' });
            }
        });
    });
}

async function fetchNews() {
    const container = document.getElementById('blog-list');
    try {
        const q = query(
            collection(db, "news"), 
            where("status", "==", "published"),
            orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        
        if (snap.empty) {
            container.innerHTML = "<p style='text-align:center; grid-column:1/-1;'>Hiện chưa có bài viết nào.</p>";
            return;
        }

        allNewsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        currentFilteredData = [...allNewsData];
        renderNews();
    } catch (e) { console.error(e); }
}

function handleSearch() {
    const searchInput = document.getElementById('blog-search-input');
    if (!searchInput) return;
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    currentPage = 1; // reset to first page on search
    
    if (!searchTerm) {
        currentFilteredData = [...allNewsData];
        renderNews();
        return;
    }
    
    currentFilteredData = allNewsData.filter(n => {
        const titleMatch = n.title && n.title.toLowerCase().includes(searchTerm);
        const excerptMatch = n.excerpt && n.excerpt.toLowerCase().includes(searchTerm);
        let contentMatch = false;
        if (n.content && !excerptMatch) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = n.content;
            const textContent = tempDiv.textContent || tempDiv.innerText || '';
            contentMatch = textContent.toLowerCase().includes(searchTerm);
        }
        return titleMatch || excerptMatch || contentMatch;
    });
    
    renderNews();
}

document.addEventListener('DOMContentLoaded', () => {
    initHeader('../', () => fetchNews());
    
    const searchBtn = document.getElementById('blog-search-btn');
    const searchInput = document.getElementById('blog-search-input');
    
    if (searchBtn) searchBtn.addEventListener('click', handleSearch);
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') handleSearch();
        });
        searchInput.addEventListener('input', handleSearch);
    }
});

