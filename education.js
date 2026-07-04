/* ============================================================================
   education.js — EĞİTİM & SÖZLÜK EKRANI
   İçeriği Supabase'ten (edu_chapters / edu_lessons / edu_glossary) çeker ve
   #eduRoot içine bölüm haritası + ders okuyucu + sözlük olarak basar.
   İlerleme tarayıcıda (localStorage) saklanır. core.js'ten sonra yüklenir.
   ============================================================================ */
(function () {
    const root = document.getElementById('eduRoot');
    if (!root) return;

    const LS_KEY = 'epc_edu_completed';
    let chapters = [];      // [{...chapter, lessons:[...]}]
    let glossary = [];
    let view = 'lessons';   // 'lessons' | 'glossary'
    let currentId = null;
    let query = '';
    let loaded = false;

    const getDone = () => { try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); } catch (e) { return new Set(); } };
    const setDone = (s) => { try { localStorage.setItem(LS_KEY, JSON.stringify([...s])); } catch (e) {} };
    const allLessons = () => chapters.flatMap(c => c.lessons);
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const paras = (t) => esc(t).split(/\n+/).filter(Boolean).map(p => `<p class="text-slate-600 leading-relaxed mb-3">${p}</p>`).join('');

    async function load() {
        if (!supabaseClient) { root.innerHTML = '<p class="text-slate-500 text-sm">Veritabanı bağlantısı yok.</p>'; return; }
        root.innerHTML = '<p class="text-slate-400 text-sm">Eğitim içeriği yükleniyor...</p>';
        try {
            const [rc, rl, rg] = await Promise.all([
                supabaseClient.from('edu_chapters').select('*').order('sort_order'),
                supabaseClient.from('edu_lessons').select('*').order('sort_order'),
                supabaseClient.from('edu_glossary').select('*').order('sort_order')
            ]);
            if (rc.error) throw rc.error;
            const lessons = rl.data || [];
            chapters = (rc.data || []).map(c => ({ ...c, lessons: lessons.filter(l => l.chapter_id === c.id) }));
            glossary = rg.data || [];
        } catch (err) {
            root.innerHTML = `<p class="text-red-500 text-sm">Eğitim içeriği yüklenemedi: ${err.message}</p>`;
            return;
        }
        loaded = true;
        if (!currentId) { const f = allLessons()[0]; currentId = f ? f.id : null; }
        render();
    }

    function render() {
        if (!loaded) return;
        const done = getDone();
        const total = allLessons().length;
        const doneCount = allLessons().filter(l => done.has(l.id)).length;
        const pct = total ? Math.round(doneCount / total * 100) : 0;

        const tabBtn = (key, label) =>
            `<button data-tab="${key}" class="px-4 py-2 rounded-lg text-sm font-bold ${view === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${label}</button>`;

        const header = `
            <div class="flex items-center gap-2 mb-5 flex-wrap">
                ${tabBtn('lessons', '📚 Dersler')}
                ${tabBtn('glossary', '📖 Sözlük')}
                <div class="ml-auto flex items-center gap-2 text-xs text-slate-500">
                    <span>%${pct} tamamlandı</span>
                    <div class="w-24 h-2 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-amber-500" style="width:${pct}%"></div></div>
                </div>
            </div>`;

        root.innerHTML = header + (view === 'lessons' ? lessonsView(done) : glossaryView());
    }

    function lessonsView(done) {
        const roadmap = chapters.map(c => {
            const items = c.lessons.map(l => {
                const cur = l.id === currentId, fin = done.has(l.id);
                const mark = fin ? '✅' : (cur ? '▶️' : '<span class="text-slate-300">○</span>');
                return `<button data-lesson="${l.id}" class="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-[13px] ${cur ? 'bg-amber-50 text-amber-800 font-bold' : 'text-slate-600 hover:bg-white'}">${mark} <span>${esc(l.title)}</span></button>`;
            }).join('');
            return `<div class="mb-4">
                <div class="text-[11px] uppercase tracking-wider text-slate-400 font-bold px-2 mb-1">${esc(c.title)}</div>
                ${items}</div>`;
        }).join('');

        const lesson = allLessons().find(l => l.id === currentId);
        const content = lesson ? lessonCard(lesson, done) : '<p class="text-slate-400 text-sm">Henüz ders eklenmemiş.</p>';

        return `<div class="flex flex-col md:flex-row gap-6">
            <div class="md:w-56 md:shrink-0 bg-slate-50 rounded-xl p-3 border border-slate-100 h-fit">${roadmap || '<p class="text-slate-400 text-xs p-2">Bölüm yok.</p>'}</div>
            <div class="flex-1 min-w-0">${content}</div>
        </div>`;
    }

    function lessonCard(l, done) {
        const chapter = chapters.find(c => c.id === l.chapter_id);
        const list = allLessons();
        const i = list.findIndex(x => x.id === l.id);
        const prev = list[i - 1], next = list[i + 1];
        const fin = done.has(l.id);
        return `
            <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <div class="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <span class="bg-amber-50 text-amber-800 text-xs font-bold px-3 py-1 rounded-lg">${esc(chapter ? chapter.title : '')}</span>
                    ${l.read_minutes ? `<span class="text-xs text-slate-400">🕒 ${l.read_minutes} dk okuma</span>` : ''}
                </div>
                <h2 class="text-2xl font-black text-slate-800 mb-4">${esc(l.title)}</h2>
                ${paras(l.body)}
                ${l.analogy ? `<div class="flex gap-3 bg-amber-50 border border-amber-100 rounded-xl p-4 my-4"><span class="text-xl">💡</span><p class="text-sm text-amber-900 leading-relaxed m-0"><strong>Benzetme:</strong> ${esc(l.analogy)}</p></div>` : ''}
                ${l.summary ? `<div class="flex gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 my-4"><span class="text-emerald-600 text-lg">✔️</span><div><div class="text-[11px] text-slate-400 font-bold mb-0.5">ÖZET</div><p class="text-sm text-slate-700 m-0">${esc(l.summary)}</p></div></div>` : ''}
                <div class="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-slate-100 flex-wrap">
                    <button data-complete="${l.id}" class="text-sm font-bold px-4 py-2 rounded-lg ${fin ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">${fin ? '✅ Tamamlandı' : 'Bu dersi tamamladım'}</button>
                    <div class="flex gap-2">
                        ${prev ? `<button data-lesson="${prev.id}" class="text-sm font-bold px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">← Önceki</button>` : ''}
                        ${next
                            ? `<button data-lesson="${next.id}" class="text-sm font-bold px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600">Sonraki ders →</button>`
                            : `<button data-goto="apply" class="text-sm font-bold px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Ücretsiz keşif başvurusu →</button>`}
                    </div>
                </div>
            </div>`;
    }

    function glossaryView() {
        const q = query.trim().toLowerCase();
        const items = glossary.filter(g => !q || g.term.toLowerCase().includes(q) || (g.definition || '').toLowerCase().includes(q));
        const list = items.length
            ? items.map(g => `<div class="bg-white border border-slate-200 rounded-xl p-4">
                    <div class="font-black text-slate-800 mb-1">${esc(g.term)}</div>
                    <p class="text-sm text-slate-600 leading-relaxed m-0">${esc(g.definition)}</p>
                </div>`).join('')
            : '<p class="text-slate-400 text-sm">Eşleşen terim bulunamadı.</p>';
        return `<div>
            <input id="eduSearch" type="text" placeholder="🔎 Sözlükte ara..." value="${esc(query)}" class="w-full p-3 border border-slate-300 rounded-lg mb-4 outline-none focus:border-amber-500">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${list}</div>
        </div>`;
    }

    root.addEventListener('click', (e) => {
        const t = e.target.closest('[data-lesson],[data-tab],[data-complete],[data-goto]');
        if (!t) return;
        if (t.dataset.tab) { view = t.dataset.tab; render(); }
        else if (t.dataset.lesson) { currentId = t.dataset.lesson; view = 'lessons'; render(); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else if (t.dataset.complete) {
            const d = getDone();
            d.has(t.dataset.complete) ? d.delete(t.dataset.complete) : d.add(t.dataset.complete);
            setDone(d); render();
        }
        else if (t.dataset.goto === 'apply' && typeof openLeadModal === 'function') { openLeadModal('kurulum'); }
    });

    root.addEventListener('input', (e) => {
        if (e.target.id !== 'eduSearch') return;
        query = e.target.value;
        render();
        const s = document.getElementById('eduSearch');
        if (s) { s.focus(); const v = s.value; s.setSelectionRange(v.length, v.length); }
    });

    load();
})();
