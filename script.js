// DOM-элементы
const searchInput = document.getElementById("search");
const autocompleteList = document.getElementById("autocomplete-list");
const authorName = document.getElementById("author-name");
const authorImage = document.getElementById("author-image");
const authorBio = document.getElementById("author-bio");
const worksContainer = document.getElementById("works");
const langSwitch = document.getElementById("lang-switch");
const saveAuthorBtn = document.getElementById("save-author");
const favoritesContainer = document.getElementById("favorites");
const analyzeBtn = document.getElementById("analyze-btn");
const poemInput = document.getElementById("poem-input");
const poemAnalysis = document.getElementById("poem-analysis");

let currentLang = "ru";

// ===== Поиск с автозаполнением =====
searchInput.addEventListener("input", async () => {
    const query = searchInput.value.trim();
    if (!query) return (autocompleteList.innerHTML = "");

    const res = await fetch(
        `https://${currentLang}.wikipedia.org/w/api.php?action=opensearch&format=json&search=${query}&origin=*`
    );
    const data = await res.json();

    autocompleteList.innerHTML = "";
    data[1].forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        li.addEventListener("click", () => {
            searchInput.value = item;
            autocompleteList.innerHTML = "";
            fetchAuthorData(item);
        });
        autocompleteList.appendChild(li);
    });
});

// ===== Переключение языка =====
langSwitch.addEventListener("change", () => {
    currentLang = langSwitch.value;
    if (searchInput.value.trim()) {
        fetchAuthorData(searchInput.value.trim());
    }
});

// ===== Получение названия страницы Викитеки через Wikidata =====
async function getWikisourceTitleFromWikidata(wikidataId) {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
    const res = await fetch(url);
    const data = await res.json();
    const title = data.entities[wikidataId]?.sitelinks?.ruwikisource?.title;
    return title || null;
}

// ===== Загрузка информации о писателе =====
async function fetchAuthorData(name) {
    const url = `https://${currentLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Ошибка загрузки биографии.");
        const data = await res.json();

        authorName.textContent = data.title || name;
        authorBio.textContent = data.extract || "Биография недоступна.";
        authorImage.src = data.thumbnail?.source || "https://via.placeholder.com/150";
        worksContainer.innerHTML = "<p>Загрузка произведений...</p>";

        const wikidataId = data.wikibase_item;
        if (wikidataId) {
            const pageTitle = await getWikisourceTitleFromWikidata(wikidataId);
            if (pageTitle) {
                const success = await loadWorksFromWikisource(pageTitle);
                if (success) return;
            }
        }

        const alt = await tryLoadWorksFromPage(data.title);
        if (!alt) {
            worksContainer.innerHTML = "<p>Произведения не найдены.</p>";
            console.log(data);
        }
    } catch (err) {
        console.error(err);
        authorName.textContent = name;
        authorBio.textContent = "Информация не найдена.";
        authorImage.src = "https://via.placeholder.com/150";
        worksContainer.innerHTML = "<p>Произведения не найдены.</p>";
    }
}

// ===== Загрузка произведений с Викитеки =====
async function loadWorksFromWikisource(pageTitle) {
    const url = `https://ru.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&format=json&origin=*&redirects=1`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("Ошибка API:", data.error);
            return false;
        }

        const html = data.parse.text["*"];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const items = Array.from(doc.querySelectorAll("li a"))
            .map((a) => a.textContent.trim())
            .filter((t) => t.length > 5);

        if (items.length === 0) return false;

        worksContainer.innerHTML = "";
        items.slice(0, 10).forEach((text) => {
            const div = document.createElement("div");
            div.className = "slide";
            div.innerHTML = `<h3>${text}</h3>`;
            worksContainer.appendChild(div);
        });

        return true;
    } catch (err) {
        console.error("Ошибка запроса:", err);
        return false;
    }
}

// ===== Попытка загрузки произведений с Википедии =====
async function tryLoadWorksFromPage(pageTitle) {
    try {
        const url = `https://${currentLang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
            pageTitle
        )}&format=json&origin=*`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.parse) return false;

        const html = data.parse.text["*"];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const headings = Array.from(doc.querySelectorAll("h2, h3, h4"));
        const section = headings.find((h) =>
            /сочинения|творчество|библиография|произведения|литература/i.test(h.textContent)
        );

        let current = section ? section.nextElementSibling : doc.body.firstElementChild;
        const items = [];

        while (current && !/^H[2-4]$/i.test(current.tagName)) {
            if (["UL", "OL"].includes(current.tagName)) {
                const listItems = Array.from(current.querySelectorAll("li"));
                items.push(...listItems.map((li) => li.textContent.trim()));
            } else if (current.tagName === "TABLE") {
                const rows = current.querySelectorAll("tr");
                for (const row of rows) {
                    const cells = row.querySelectorAll("td, th");
                    if (cells.length) {
                        items.push(Array.from(cells).map((cell) => cell.textContent.trim()).join(" — "));
                    }
                }
            } else if (current.tagName === "P") {
                const text = current.textContent.trim();
                if (text.length > 30) items.push(text);
            }

            current = current.nextElementSibling;
        }

        if (items.length === 0) return false;

        worksContainer.innerHTML = "";
        items.slice(0, 10).forEach((text) => {
            const div = document.createElement("div");
            div.className = "slide";
            div.innerHTML = `<h3>${text.split(".")[0]}</h3><p>${text}</p>`;
            worksContainer.appendChild(div);
        });

        return true;
    } catch (err) {
        console.error("Ошибка при загрузке с Википедии:", err);
        return false;
    }
}

// ===== Сохранение избранного автора =====
saveAuthorBtn.addEventListener("click", () => {
    const name = authorName.textContent;
    if (!name || name === "Имя писателя") return;

    const saved = JSON.parse(localStorage.getItem("favorites")) || [];
    if (!saved.includes(name)) {
        saved.push(name);
        localStorage.setItem("favorites", JSON.stringify(saved));
        renderFavorites();
    }
});

function renderFavorites() {
    const saved = JSON.parse(localStorage.getItem("favorites")) || [];
    favoritesContainer.innerHTML =
        saved.length > 0
            ? saved.map((n) => `<p>${n}</p>`).join("")
            : "<p>Нет избранных авторов.</p>";
}

renderFavorites();

// ===== Анализ стихотворения =====
analyzeBtn.addEventListener("click", () => {
    const text = poemInput.value.trim();
    if (!text) return;

    const lines = text.split("\n").filter((l) => l.trim() !== "");
    const words = text.split(/\s+/).filter((w) => w !== "");
    const rhyme = lines.map((l) => l.split(" ").pop()).slice(-4).join(", ");

    poemAnalysis.innerHTML = `
    <h3>Результат анализа</h3>
    <p><strong>Строк:</strong> ${lines.length}</p>
    <p><strong>Слов:</strong> ${words.length}</p>
    <p><strong>Окончания последних строк:</strong> ${rhyme}</p>
  `;
});
