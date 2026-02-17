let _supabase;
let me = null;
let posts = [];
let users = {};
let currentViewUser = "me";
let currentTab = "posts";
let authMode = "login";

/**
 * トースト通知表示
 */
function showError(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return console.error(msg);
    toast.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * アプリ初期化
 */
async function initApp() {
    try {
        const res = await fetch('/api/config');
        const config = await res.json();
        
        if (!config.supabaseUrl || !config.supabaseKey) {
            showError("接続設定が見つかりません。");
            return;
        }

        _supabase = supabase.createClient(config.supabaseUrl, config.supabaseKey);

        // ログイン・登録をスキップし、ゲストまたは既存ユーザーとして表示
        // meがnullの状態でもアプリ構造を維持するため、仮の情報をセット
        me = { id: "guest", handle: "guest", name: "ゲストユーザー", bio: "閲覧モード" };
        
        const { data: { user } } = await _supabase.auth.getUser();
        if (user) {
            const { data: profile } = await _supabase.from('profiles').select('*').eq('id', user.id).single();
            if (profile) {
                me = { ...profile, name: profile.display_name };
            }
        }
        
        showApp();
    } catch (e) {
        console.error(e);
        showError("初期化に失敗しました。");
    }
}

/**
 * 認証画面切り替え
 */
function switchAuthMode(mode) {
    authMode = mode;
    const nameField = document.getElementById('auth-name');
    const submitBtn = document.getElementById('auth-submit-btn');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');

    if (mode === 'signup') {
        nameField.classList.remove('hidden');
        submitBtn.innerText = "新規登録";
        tabSignup.className = "flex-1 py-2 font-bold active-tab text-center";
        tabLogin.className = "flex-1 py-2 font-bold text-[#71767b] text-center";
    } else {
        nameField.classList.add('hidden');
        submitBtn.innerText = "ログイン";
        tabLogin.className = "flex-1 py-2 font-bold active-tab text-center";
        tabSignup.className = "flex-1 py-2 font-bold text-[#71767b] text-center";
    }
}

/**
 * 認証実行 (登録・ログイン)
 */
async function handleAuth() {
    const handleInput = document.getElementById('auth-handle').value.toLowerCase().replace('@', '').trim();
    const pass = document.getElementById('auth-pass').value.trim();
    const name = document.getElementById('auth-name').value.trim();

    if (!handleInput || !pass) return showError("入力が不足しています");

    // バリデーションエラー回避のため実在しやすいドメインを使用
    const dummyEmail = `${handleInput}@gmail.com`;

    if (authMode === 'signup') {
        if (!name) return showError("名前を入力してください");
        
        // 1. ユーザー作成
        const { data, error: authError } = await _supabase.auth.signUp({
            email: dummyEmail,
            password: pass
        });

        if (authError) return alert("登録エラー: " + authError.message);

        // 2. プロフィール作成 (SQLポリシー "Anyone can insert profiles" により実行可能)
        const { error: profError } = await _supabase.from('profiles').insert([{
            id: data.user.id,
            handle: handleInput,
            display_name: name,
            bio: "よろしくお願いします。",
            following: [], 
            followers: [] 
        }]);

        if (profError) {
            console.error(profError);
            return alert("プロフィールの作成に失敗しました: " + profError.message);
        }

        alert("登録が完了しました！");
        location.reload();
    } else {
        // ログイン
        const { error: loginError } = await _supabase.auth.signInWithPassword({
            email: dummyEmail,
            password: pass
        });

        if (loginError) return showError("ユーザー名またはパスワードが違います");
        location.reload();
    }
}

function showApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main-content').classList.remove('hidden');
    document.getElementById('side-name').innerText = me.name;
    fetchData();
}

async function logout() {
    await _supabase.auth.signOut();
    location.reload();
}

/**
 * データ取得
 */
async function fetchData() {
    const { data: pData } = await _supabase.from('posts').select('*').order('created_at', { ascending: false });
    posts = pData || [];

    const { data: uData } = await _supabase.from('profiles').select('*');
    users = (uData || []).reduce((acc, u) => ({
        ...acc,
        [u.handle]: { ...u, name: u.display_name }
    }), {});

    refreshCurrentView();
    renderSuggestions();
}

/**
 * 投稿送信
 */
async function submitPost() {
    const input = document.getElementById('post-input');
    const content = input.value.trim();
    if (!content) return;

    const { error } = await _supabase.from('posts').insert([{
        user_id: me.id,
        handle: me.handle,
        name: me.name,
        content: content,
        likes: [],
        reposts: [],
        replies: []
    }]);

    if (error) {
        showError("送信に失敗しました");
    } else {
        input.value = "";
        togglePostBtn('post-btn', 'post-input');
        fetchData();
    }
}

/**
 * ポスト削除 (新規追加)
 */
async function deletePost(postId) {
    if (!confirm("ポストを削除しますか？")) return;
    const { error } = await _supabase.from('posts').delete().eq('id', postId);
    if (error) {
        showError("削除に失敗しました");
    } else {
        fetchData();
    }
}

/**
 * リアクション系
 */
async function toggleLike(id) {
    const p = posts.find(x => x.id === id);
    const likes = p.likes || [];
    const newLikes = likes.includes(me.handle) ? likes.filter(h => h !== me.handle) : [...likes, me.handle];
    await _supabase.from('posts').update({ likes: newLikes }).eq('id', id);
    fetchData();
}

async function toggleRepost(id) {
    const p = posts.find(x => x.id === id);
    const reps = p.reposts || [];
    const newReps = reps.includes(me.handle) ? reps.filter(h => h !== me.handle) : [...reps, me.handle];
    await _supabase.from('posts').update({ reposts: newReps }).eq('id', id);
    fetchData();
}

async function submitReply(postId) {
    const input = document.getElementById(`reply-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;

    const p = posts.find(x => x.id === postId);
    const newReply = { id: Date.now(), handle: me.handle, name: me.name, content: content };
    const updatedReplies = [...(p.replies || []), newReply];

    await _supabase.from('posts').update({ replies: updatedReplies }).eq('id', postId);
    fetchData();
}

/**
 * フォロー機能 (undefined対策)
 */
async function toggleFollow(targetHandle) {
    const target = users[targetHandle];
    if (!target || targetHandle === me.handle) return;

    let myFollowing = me.following || [];
    let targetFollowers = target.followers || [];

    if (myFollowing.includes(targetHandle)) {
        myFollowing = myFollowing.filter(h => h !== targetHandle);
        targetFollowers = targetFollowers.filter(h => h !== me.handle);
    } else {
        myFollowing.push(targetHandle);
        targetFollowers.push(me.handle);
    }

    await _supabase.from('profiles').update({ following: myFollowing }).eq('id', me.id);
    await _supabase.from('profiles').update({ followers: targetFollowers }).eq('id', target.id);
    
    me.following = myFollowing;
    fetchData();
}

async function saveProfile() {
    const newName = document.getElementById('edit-name').value.trim();
    const newBio = document.getElementById('edit-bio').value.trim();
    if (!newName) return showError("名前は必須です");

    const { error } = await _supabase.from('profiles').update({ 
        display_name: newName, bio: newBio 
    }).eq('id', me.id);

    if (error) showError("保存失敗");
    else { me.name = newName; me.bio = newBio; toggleEditModal(); fetchData(); }
}

/**
 * ナビゲーション
 */
function nav(v, handle = "me") {
    const views = ['view-home', 'view-explore', 'view-profile'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    document.getElementById('view-' + v).classList.remove('hidden');
    
    if (v === 'profile') { 
        currentViewUser = (handle === "me") ? me.handle : handle; 
        currentTab = 'posts'; 
        renderProfile(); 
    } else if (v === 'home') { 
        renderHome(); 
    } else if (v === 'explore') {
        renderSearch();
    }
    window.scrollTo(0, 0);
}

/**
 * HTML生成 (削除ボタンを追加)
 */
function createPostHTML(p) {
    const isLiked = (p.likes || []).includes(me.handle);
    const isReposted = (p.reposts || []).includes(me.handle);
    const isMyPost = p.handle === me.handle;
    const repliesCount = (p.replies || []).length;
    
    const repliesList = (p.replies || []).map(r => `
        <div class="pl-12 py-3 border-t x-border text-sm">
            <div class="font-bold">${r.name} <span class="font-normal text-[#71767b]">@${r.handle}</span></div>
            <div class="mt-1">${r.content}</div>
        </div>
    `).join('');

    return `
        <div class="border-b x-border">
            <div class="p-4 x-hover cursor-pointer" onclick="toggleReply(${p.id})">
                <div class="flex gap-3">
                    <div class="w-10 h-10 rounded-full bg-blue-600 shrink-0" onclick="event.stopPropagation(); nav('profile', '${p.handle}')"></div>
                    <div class="flex-1">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1 font-bold" onclick="event.stopPropagation(); nav('profile', '${p.handle}')">
                                ${p.name} <span class="font-normal text-[#71767b]">@${p.handle}</span>
                            </div>
                            ${isMyPost ? `
                                <button onclick="event.stopPropagation(); deletePost(${p.id})" class="text-[#71767b] hover:text-red-500 p-1">
                                    🗑️
                                </button>
                            ` : ''}
                        </div>
                        <p class="mt-1 text-[15px] leading-normal whitespace-pre-wrap">${p.content}</p>
                        <div class="flex justify-between mt-3 text-[#71767b] max-w-[425px]">
                            <span class="flex items-center gap-2 hover:text-blue-400">💬 ${repliesCount}</span>
                            <span onclick="event.stopPropagation(); toggleRepost(${p.id})" class="flex items-center gap-2 hover:text-green-500 ${isReposted ? 'text-green-500' : ''}">🔄 ${p.reposts.length}</span>
                            <span onclick="event.stopPropagation(); toggleLike(${p.id})" class="flex items-center gap-2 hover:text-pink-500 ${isLiked ? 'text-pink-500' : ''}">${isLiked ? '❤️' : '🖤'} ${p.likes.length}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div id="replies-${p.id}" class="hidden bg-[#0a0a0a]">
                <div class="px-4 py-3 flex gap-2 border-t x-border">
                    <input id="reply-input-${p.id}" type="text" placeholder="返信をポスト" class="flex-1 bg-transparent outline-none text-sm border-b x-border focus:border-blue-500">
                    <button onclick="submitReply(${p.id})" class="btn-blue text-white px-3 py-1 rounded-full text-xs font-bold">返信</button>
                </div>
                <div id="reply-list-${p.id}">${repliesList}</div>
            </div>
        </div>`;
}

function refreshCurrentView() {
    if (!document.getElementById('view-home').classList.contains('hidden')) renderHome();
    if (!document.getElementById('view-profile').classList.contains('hidden')) renderProfile();
    if (!document.getElementById('view-explore').classList.contains('hidden')) renderSearch();
}

function renderHome() { 
    document.getElementById('home-timeline').innerHTML = posts.map(createPostHTML).join(''); 
}

function renderSearch() {
    const q = document.getElementById('search-input').value.toLowerCase();
    const results = q ? posts.filter(p => p.content.toLowerCase().includes(q) || p.handle.includes(q)) : posts;
    document.getElementById('search-results').innerHTML = results.map(createPostHTML).join('');
}

function renderProfile() {
    const u = users[currentViewUser];
    if (!u) return;

    document.getElementById('prof-header-name').innerText = u.name;
    document.getElementById('prof-name').innerText = u.name;
    document.getElementById('prof-handle').innerText = "@" + u.handle;
    document.getElementById('prof-bio').innerText = u.bio || "";
    document.getElementById('count-following').innerText = (u.following || []).length;
    document.getElementById('count-followers').innerText = (u.followers || []).length;
    
    const myPosts = posts.filter(p => p.handle === u.handle);
    document.getElementById('prof-post-count').innerText = myPosts.length + ' ポスト';

    const actionArea = document.getElementById('prof-action-area');
    if (u.handle === me.handle) {
        actionArea.innerHTML = `<button onclick="toggleEditModal()" class="border x-border px-4 py-1.5 rounded-full font-bold hover:bg-white/10">プロフィールを編集</button>`;
    } else {
        const isF = (me.following || []).includes(u.handle);
        actionArea.innerHTML = `<button onclick="toggleFollow('${u.handle}')" class="${isF ? 'border x-border' : 'bg-white text-black'} px-4 py-1.5 rounded-full font-bold text-sm">${isF ? 'フォロー中' : 'フォロー'}</button>`;
    }

    const filtered = currentTab === 'posts' ? myPosts : posts.filter(p => (p.likes || []).includes(u.handle));
    document.getElementById('profile-timeline').innerHTML = filtered.map(createPostHTML).join('');
}

function renderSuggestions() {
    const list = Object.values(users).filter(u => u.handle !== me.handle).slice(0, 3);
    document.getElementById('suggestion-list').innerHTML = list.map(u => `
        <div class="flex items-center justify-between py-3 cursor-pointer" onclick="nav('profile', '${u.handle}')">
            <div class="flex gap-2">
                <div class="w-10 h-10 rounded-full bg-gray-700"></div>
                <div>
                    <p class="font-bold text-sm">${u.name}</p>
                    <p class="text-[#71767b] text-sm">@${u.handle}</p>
                </div>
            </div>
            <button onclick="event.stopPropagation(); toggleFollow('${u.handle}')" class="bg-white text-black px-4 py-1 rounded-full font-bold text-sm">
                ${(me.following || []).includes(u.handle) ? '中' : 'フォロー'}
            </button>
        </div>`).join('');
}

function setTab(t) {
    currentTab = t;
    ['posts', 'likes'].forEach(x => {
        const el = document.getElementById('tab-' + x);
        if (el) x === t ? el.classList.add('active-tab') : el.classList.remove('active-tab');
    });
    renderProfile();
}

function toggleEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.toggle('hidden');
    document.getElementById('edit-name').value = me.name;
    document.getElementById('edit-bio').value = me.bio || "";
}

function toggleReply(id) {
    const section = document.getElementById(`replies-${id}`);
    if (section) section.classList.toggle('hidden');
}

function togglePostBtn(btnId, inputId) {
    const el = document.getElementById(btnId);
    if (el) el.disabled = (document.getElementById(inputId).value.trim() === "");
}

initApp();
