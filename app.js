/* ==========================================================================
   THE PLATFORM — CLIENT APPLICATION ARCHITECTURE
   ========================================================================== */

const API_BASE = window.location.origin;

// Application State
const STATE = {
  currentUser: null,       // Loaded from localStorage or defaults to Visitor
  activeHostId: 'usr-adam', // Current platform being visited (defaults to Adam Crawford)
  activeHostUser: null,    // Detailed user object of visited platform
  usersList: [],           // All cached users
  commonsItems: [],        // Mutual aid listings
  activeFeedTab: 'dispatches',
  audioPlaying: false,
  audioContext: null,
  audioOscillators: [],
  audioGainNode: null,
  activePlaylist: [],
  activePlaylistIndex: 0,
  composerMentionedPostId: null,
  composerMentionedUserIds: [],
  composerAttachment: null,
  dmAttachment: null,
  gifPickerTarget: 'composer',
  notifications: [],
  commonsFilter: 'all',
  activeBrandTitle: 'The Platform',
  regPassions: [
    "Music",
    "Movies",
    "Writing"
  ],
  editPassions: [],
  editSubtopics: [],
  editAvatars: [],
  editActiveAvatar: null,
  activePassionsTarget: 'reg',
  entropyCollector: {
    mouseMoves: 0,
    keyPresses: 0,
    startTime: Date.now(),
    lastCoord: { x: 0, y: 0 },
    jitterSum: 0
  }
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  initEntropyTracker();
  initNavigation();
  initBrandSwitcher();
  initThemeEngine();
  initComposer();
  initFeedTabs();
  initAudioDoorbell();
  initCommonsMarketplace();
  initRegistrationModal();
  initLoginModal();
  initUserDropdownMenu();
  initEditProfileModal();
  initPassionsSystem();
  initDirectBannerUpload();
  initAvatarReel();
  initCommonsVerificationModal();
  initSearch();
  initModals();
  initAvatarCropper();
  initFriendsSystem();
  initMessagingSystem();
  initGifPicker();
  initTopicsSection();
  initMottoCounters();
  initNotificationsSystem();
  initFeatureGuideModal();
  initAdminFlaggedQueue();
  initLanAccess();
  initCollectivesSystem();
  initHearthsSystem();
  initProximityRadar();
  initMindfulDisconnect();
  initPassportExport();
  initVideoTheater();
  initTopAudioDropdown();

  // Load current session from localStorage if exists
  loadUserSession();
  await initE2EE();

  // Fetch initial data from SQLite Backend
  await refreshUsers();
  await refreshCommons();
  await refreshFriends();
  updateUnreadMessagesBadge();
  fetchNotifications();

  // Pre-load default platform (Adam Crawford / "yours") in background
  const defaultHostId = STATE.currentUser?.id || 'usr-adam';
  loadPlatform(defaultHostId, false);

  // Set default Home view to Topics & Trending
  document.getElementById('navTabTopics')?.click();
  await fetchAndRenderTopics();
});

// --- ASTROLOGICAL ZODIAC CALCULATOR (NO GENDER) ---
function computeClientZodiac(dobStr) {
  if (!dobStr) return '';
  try {
    const parts = dobStr.split('-');
    if (parts.length !== 3) return '';
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '♈ Aries';
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '♉ Taurus';
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return '♊ Gemini';
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return '♋ Cancer';
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '♌ Leo';
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '♍ Virgo';
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return '♎ Libra';
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return '♏ Scorpio';
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return '♐ Sagittarius';
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '♑ Capricorn';
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '♒ Aquarius';
    if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return '♓ Pisces';
    return '';
  } catch {
    return '';
  }
}

// --- SESSION & AUTH ---
function loadUserSession() {
  const saved = localStorage.getItem('theplatform_user');
  if (saved) {
    try {
      STATE.currentUser = JSON.parse(saved);
    } catch {
      STATE.currentUser = null;
    }
  } else {
    STATE.currentUser = null;
  }

  // Self-heal stale sessions across DB resets:
  if (STATE.currentUser) {
    if (STATE.currentUser.email === 'mracrawford@gmail.com' || STATE.currentUser.handle === '@adam') {
      if (STATE.currentUser.id !== 'usr-adam') {
        STATE.currentUser.id = 'usr-adam';
        localStorage.setItem('theplatform_user', JSON.stringify(STATE.currentUser));
      }
    }
    fetch(`${API_BASE}/api/users/${STATE.currentUser.id}`)
      .then(res => {
        if (!res.ok && res.status === 404) {
          if (STATE.currentUser && (STATE.currentUser.email === 'mracrawford@gmail.com' || STATE.currentUser.handle === '@adam')) {
            fetch(`${API_BASE}/api/users/usr-adam`)
              .then(r => r.json())
              .then(d => {
                if (d.user) saveUserSession(d.user);
              }).catch(() => {});
          }
        } else if (res.ok) {
          res.json().then(data => {
            if (data.user) {
              STATE.currentUser = data.user;
              localStorage.setItem('theplatform_user', JSON.stringify(data.user));
              updateUserChipUI();
            }
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }

  updateUserChipUI();
}

function saveUserSession(user) {
  STATE.currentUser = user;
  try {
    localStorage.setItem('theplatform_user', JSON.stringify(user));
  } catch (err) {
    console.warn('LocalStorage error, storing safe session payload:', err);
    try {
      const safe = { ...user };
      if (safe.banner && safe.banner.length > 200000) {
        delete safe.banner;
      }
      localStorage.setItem('theplatform_user', JSON.stringify(safe));
    } catch {}
  }
  updateUserChipUI();
  initE2EE().catch(() => {});
}

function updateUserChipUI() {
  const chipAvatar = document.getElementById('userChipAvatar');
  const chipName = document.getElementById('userChipName');
  const chipRoleText = document.getElementById('userChipRoleText');
  const navLoginBtn = document.getElementById('navLoginBtn');
  const navRegisterBtn = document.getElementById('navRegisterBtn');
  const adminTab = document.getElementById('navTabAntiBot');
  const menuHandle = document.getElementById('menuUserHandle');
  const menuEmail = document.getElementById('menuUserEmail');

  if (STATE.currentUser) {
    chipAvatar.src = STATE.currentUser.avatar || 'assets/avatar-p-default.svg';
    chipName.textContent = STATE.currentUser.name;
    if (menuHandle) menuHandle.textContent = STATE.currentUser.handle;
    if (menuEmail) menuEmail.textContent = STATE.currentUser.email || 'Verified Human';
    
    if (STATE.currentUser.is_admin === 1) {
      chipRoleText.textContent = '🛡️ Root Admin';
      chipRoleText.style.color = '#c084fc';
      // REVEAL ADMIN-ONLY TAB
      if (adminTab) adminTab.classList.remove('hidden');
    } else {
      chipRoleText.textContent = 'Human Verified';
      chipRoleText.style.color = '#34d399';
      if (adminTab) adminTab.classList.add('hidden');
    }

    if (navLoginBtn) navLoginBtn.style.display = 'none';
    if (navRegisterBtn) navRegisterBtn.innerHTML = `<span>+ New Account</span>`;
  } else {
    chipAvatar.src = 'assets/avatar-p-default.svg';
    chipName.textContent = 'Visitor';
    chipRoleText.textContent = 'Not Logged In';
    chipRoleText.style.color = '#94a3b8';
    if (adminTab) adminTab.classList.add('hidden');
    if (navLoginBtn) navLoginBtn.style.display = 'inline-flex';
    if (navRegisterBtn) navRegisterBtn.innerHTML = `<span>✨ Create Your Platform</span>`;
    if (menuHandle) menuHandle.textContent = '@visitor';
    if (menuEmail) menuEmail.textContent = 'Please log in';
  }
}

// --- DATA FETCHING (REST API) ---
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (STATE.currentUser && STATE.currentUser.id) {
    headers['X-User-Id'] = STATE.currentUser.id;
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 403 && data.error === 'IP Banned') {
        alert(`SECURITY ALERT: Your IP address has been permanently blacklisted.\nReason: ${data.reason}`);
      }
      throw new Error(data.error || 'Server request failed');
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

async function refreshUsers() {
  try {
    const res = await apiRequest('/api/users');
    STATE.usersList = res.users || [];
    renderPlatformSwitcherPills();
  } catch (e) {
    console.warn('Could not fetch users from backend, will retry.');
  }
}

async function refreshCommons() {
  try {
    const res = await apiRequest('/api/commons');
    STATE.commonsItems = res.items || [];
    renderCommonsGrid();
  } catch (e) {
    console.warn('Could not fetch commons from backend.');
  }
}

// --- NAVIGATION & TABS ---
function switchToPlatformTab(hostId = null, triggerAudioPrompt = false) {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  const sections = document.querySelectorAll('.view-section');
  tabs.forEach(t => t.classList.remove('active'));
  document.getElementById('navTabPlatforms')?.classList.add('active');
  sections.forEach(sec => sec.classList.remove('active'));
  document.getElementById('platformSection')?.classList.add('active');

  const targetHostId = hostId || STATE.currentUser?.id || 'usr-adam';
  loadPlatform(targetHostId, triggerAudioPrompt);
}

function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  const sections = document.querySelectorAll('.view-section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Check admin permission if clicking antibot
      if (tab.dataset.tab === 'antibot') {
        if (!STATE.currentUser || STATE.currentUser.is_admin !== 1) {
          showToast('Access Denied: Only verified administrators can access the Anti-Bot Console.', 'danger');
          return;
        }
        loadAdminDashboardData();
        refreshAdminFlaggedQueue();
      }

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      sections.forEach(sec => sec.classList.remove('active'));

      if (target === 'platforms') {
        document.getElementById('platformSection').classList.add('active');
        // When clicking Platforms tab, automatically launch yours (current user or Adam)
        const targetHostId = STATE.currentUser?.id || 'usr-adam';
        loadPlatform(targetHostId, false);
      } else if (target === 'commons') {
        document.getElementById('commonsSection').classList.add('active');
        refreshCommons();
      } else if (target === 'topics') {
        document.getElementById('topicsSection').classList.add('active');
        fetchAndRenderTopics();
      } else if (target === 'antibot') {
        document.getElementById('antiBotSection').classList.add('active');
      } else if (target === 'collectives') {
        document.getElementById('collectivesSection')?.classList.add('active');
        loadCollectives();
      } else if (target === 'hearths') {
        document.getElementById('hearthsSection')?.classList.add('active');
        loadHearths();
      }
    });
  });

  // Nav Friends Button
  document.getElementById('navFriendsBtn')?.addEventListener('click', () => {
    openFriendsModal();
  });

  // Brand logo navigates to Home (Topics & Trending)
  document.getElementById('brandLogoBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('navTabTopics')?.click();
  });

  document.getElementById('currentUserChip')?.addEventListener('click', () => {
    if (STATE.currentUser) {
      // Jump to current user's own platform
      switchToPlatformTab(STATE.currentUser.id, false);
    } else {
      document.getElementById('registerModal')?.showModal();
    }
  });

  document.getElementById('refreshAdminDataBtn')?.addEventListener('click', () => {
    loadAdminDashboardData();
  });
}

function initBrandSwitcher() {
  const select = document.getElementById('brandNameSelector');
  const titleDisplay = document.getElementById('currentBrandTitle');
  if (!select || !titleDisplay) return;

  select.addEventListener('change', (e) => {
    STATE.activeBrandTitle = e.target.value;
    titleDisplay.textContent = STATE.activeBrandTitle;
    showToast(`Brand concept switched to "${STATE.activeBrandTitle}"`, 'info');
  });
}

// --- PLATFORM SWITCHER PILLS ---
function renderPlatformSwitcherPills() {
  const container = document.getElementById('platformPillsContainer');
  container.innerHTML = '';

  STATE.usersList.forEach(user => {
    const isYou = STATE.currentUser && user.id === STATE.currentUser.id;
    const isExample = user.is_example === 1;

    const pill = document.createElement('button');
    pill.className = `user-pill-btn ${user.id === STATE.activeHostId ? 'active' : ''}`;
    pill.id = `pill-${user.id}`;
    
    pill.innerHTML = `
      <img src="${user.avatar || 'assets/avatar-p-default.svg'}" alt="${user.name}" class="user-pill-avatar">
      <span>${isYou ? 'My Platform (You)' : user.name}</span>
      ${isExample ? '<span style="font-size:0.65rem; color:#fbbf24; font-weight:800;">[AI]</span>' : ''}
    `;

    pill.addEventListener('click', () => {
      switchToPlatformTab(user.id, true);
    });

    container.appendChild(pill);
  });
}

// --- LOAD A USER'S PLATFORM & DYNAMICALLY RE-THEME ---
async function loadPlatform(hostId, triggerAudioPrompt = false) {
  try {
    const data = await apiRequest(`/api/users/${hostId}`);
    const user = data.user;
    STATE.activeHostId = user.id;
    STATE.activeHostUser = user;

    // Update switcher pills active state
    document.querySelectorAll('.user-pill-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`pill-${user.id}`)?.classList.add('active');

    // Handle Example Account Labeling vs Real Human Member
    const exampleBanner = document.getElementById('exampleAccountBanner');
    const accountTypeBadge = document.getElementById('hostAccountTypeBadge');
    const humanSealBadge = document.getElementById('humanSealBadge');

    if (user.is_example === 1) {
      exampleBanner.classList.remove('hidden');
      accountTypeBadge.className = 'badge-account-type';
      accountTypeBadge.textContent = '🤖 Stand-in AI Account';
      humanSealBadge.textContent = '🤖 AI Model';
      humanSealBadge.style.background = '#d97706';
    } else {
      exampleBanner.classList.add('hidden');
      accountTypeBadge.className = 'badge-account-type real-human';
      accountTypeBadge.textContent = user.is_admin ? '🛡️ Platform Admin' : '✅ Verified Human';
      humanSealBadge.textContent = '✓ Hardware Verified Human';
      humanSealBadge.style.background = '#10b981';
    }

    // Populate Profile details
    const bannerUrl = (STATE.currentUser && STATE.currentUser.id === user.id && STATE.currentUser.banner)
      ? STATE.currentUser.banner
      : (user.banner || 'assets/maya-banner.jpg');
    document.getElementById('hostBannerImg').src = bannerUrl;
    document.getElementById('hostAvatarImg').src = user.avatar || 'assets/avatar-p-default.svg';
    document.getElementById('hostDisplayName').textContent = user.name;
    document.getElementById('hostHandle').textContent = user.handle;
    document.getElementById('hostBio').textContent = user.bio || 'Welcome to my space.';
    document.getElementById('hostLocation').textContent = user.location ? `📍 ${user.location}` : '📍 Planet Earth';
    document.getElementById('hostAestheticBadge').textContent = user.aesthetic_name || 'Dynamic';
    document.getElementById('hostMutualAidKarma').textContent = user.karma || 0;
    document.getElementById('hostDispatchesCount').textContent = data.dispatches.length;
    document.getElementById('hostGuestbookCount').textContent = data.guestbook.length;
    document.getElementById('dispatchesBadge').textContent = data.dispatches.length;
    document.getElementById('guestbookBadge').textContent = data.guestbook.length;

    // Privacy Badge
    const privBadge = document.getElementById('hostPrivacyBadge');
    privBadge.className = `privacy-pill ${user.privacy}`;
    privBadge.textContent = user.privacy === 'public' ? '🌐 Public Platform' : '🔒 Private Platform';

    // Zodiac Badge (Strictly no gender involved)
    const zodiacBadge = document.getElementById('hostZodiacBadge');
    if (zodiacBadge) {
      const showZodiac = user.show_zodiac !== 0 && user.show_zodiac !== '0';
      const sign = user.zodiac_sign || computeClientZodiac(user.dob);
      if (showZodiac && sign) {
        zodiacBadge.textContent = `✨ ${sign}`;
        zodiacBadge.classList.remove('hidden');
      } else {
        zodiacBadge.classList.add('hidden');
      }
    }

    // Commons Verified Badge
    const commonsBadge = document.getElementById('hostCommonsVerifiedBadge');
    if (commonsBadge) {
      if (user.commons_verified === 1 || user.is_admin === 1) {
        commonsBadge.classList.remove('hidden');
      } else {
        commonsBadge.classList.add('hidden');
      }
    }

    // Sidebar Music & Ambient 3-Track Playlist
    let playlist = [];
    try {
      playlist = typeof user.playlist === 'string' ? JSON.parse(user.playlist) : (user.playlist || []);
    } catch {
      playlist = [];
    }
    if (!Array.isArray(playlist) || playlist.length === 0) {
      if (user.youtube_url) {
        playlist = [{ title: user.music_title || 'Ambient Theme', url: user.youtube_url }];
      } else {
        playlist = [{ title: user.music_title || 'Ambient Theme', url: '' }];
      }
    }
    STATE.activePlaylist = playlist;
    STATE.activePlaylistIndex = 0;

    const playlistBadge = document.getElementById('sidebarPlaylistBadge');
    if (playlistBadge) {
      playlistBadge.textContent = `Track 1 of ${Math.max(1, playlist.length)}`;
    }
    document.getElementById('sidebarTrackTitle').textContent = playlist[0]?.title || user.music_title || 'Ambient Theme';
    
    // Also sync Top Audio Dropdown Bar
    const topTrackTitle = document.getElementById('topAudioTrackTitle');
    if (topTrackTitle) topTrackTitle.textContent = playlist[0]?.title || user.music_title || 'Ambient Theme';
    const topBadge = document.getElementById('topAudioTrackBadge');
    if (topBadge) topBadge.textContent = `Track 1 of ${Math.max(1, playlist.length)}`;
    renderTopAudioPlaylistChips();

    document.getElementById('sidebarKarmaScore').textContent = user.karma || 0;

    // Action buttons display
    const isSelf = STATE.currentUser && STATE.currentUser.id === user.id;
    document.getElementById('postToPlatformBtn').style.display = isSelf ? 'none' : 'inline-flex';
    document.getElementById('sendGratitudeTipBtn').style.display = isSelf ? 'none' : 'inline-flex';
    document.getElementById('editPlatformBtn').style.display = isSelf ? 'inline-flex' : 'none';
    const bannerOverlayBtn = document.getElementById('bannerEditOverlayBtn');
    if (bannerOverlayBtn) bannerOverlayBtn.style.display = isSelf ? 'inline-flex' : 'none';
    document.getElementById('composerTitle').textContent = isSelf ? 'Post a Thought to Your Platform' : `Post to ${user.name}'s Platform`;
    document.getElementById('postToPlatformBtnText').textContent = `Post to ${user.name}'s Platform`;

    // Motto Banner (Max 15 words)
    const mottoBanner = document.getElementById('hostMottoBanner');
    const mottoText = document.getElementById('hostMottoText');
    if (mottoBanner && mottoText) {
      if (user.motto && user.motto.trim()) {
        mottoText.textContent = user.motto.trim();
        mottoBanner.classList.remove('hidden');
      } else {
        mottoBanner.classList.add('hidden');
      }
    }

    // Host Community Friends in Sidebar
    renderHostSidebarFriends(user.id);

    // Host Friend Action Button in Profile Actions
    updateHostFriendActionBtn(user);

    // Render Top 3 Passions beside profile (Strictly zero meritocracy/jobs)
    renderTopPassions(user.passions);

    // Render Multi-Photo Reel
    renderAvatarReel(user.avatars, user.avatar, isSelf);

    // Dynamic Color Palette Extraction from Banner
    extractPaletteFromImage(bannerUrl, user.font_heading, user.font_body);

    // Render Stream
    renderPostsStream(data.dispatches, data.guestbook);

    // Audio Doorbell prompt
    if (triggerAudioPrompt && !isSelf && (user.music_title || user.youtube_url)) {
      showAudioDoorbellPrompt(user);
    } else {
      hideAudioDoorbellPrompt();
    }
  } catch (err) {
    showToast('Failed to load user platform: ' + err.message, 'danger');
  }
}

// --- THEME ENGINE & PLATFORM CONTROLS ---
function initThemeEngine() {
  const customUpload = document.getElementById('customBannerUpload');
  if (customUpload) {
    customUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const customImgUrl = event.target.result;
        document.getElementById('hostBannerImg').src = customImgUrl;
        extractPaletteFromImage(customImgUrl);
        showToast('Image loaded: Colors and font theme dynamically adapted!', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  const ytBtn = document.getElementById('youtubeThemeLinkBtn');
  if (ytBtn) {
    ytBtn.addEventListener('click', () => {
      const current = STATE.activeHostUser ? STATE.activeHostUser.music_title : 'Tycho — Awake';
      const newTrack = prompt("Enter a YouTube track title or ambient audio URL for this platform's theme music:", current);
      if (newTrack && newTrack.trim()) {
        document.getElementById('sidebarTrackTitle').textContent = newTrack.trim();
        showToast(`Updated theme music to: "${newTrack.trim()}"`, 'success');
      }
    });
  }

  const privBtn = document.getElementById('privacyToggleBtn');
  if (privBtn) {
    privBtn.addEventListener('click', () => {
      if (STATE.activeHostUser) {
        STATE.activeHostUser.privacy = STATE.activeHostUser.privacy === 'public' ? 'private' : 'public';
        const privBadge = document.getElementById('hostPrivacyBadge');
        if (privBadge) {
          privBadge.className = `privacy-pill ${STATE.activeHostUser.privacy}`;
          privBadge.textContent = STATE.activeHostUser.privacy === 'public' ? '🌐 Public Platform' : '🔒 Private Platform';
        }
        showToast(`Platform visibility set to ${STATE.activeHostUser.privacy.toUpperCase()}`, 'info');
      }
    });
  }

  const tipBtn = document.getElementById('sendGratitudeTipBtn');
  if (tipBtn) {
    tipBtn.addEventListener('click', () => {
      if (STATE.activeHostUser) openTipModal(STATE.activeHostUser);
    });
  }

  const postBtn = document.getElementById('postToPlatformBtn');
  if (postBtn) {
    postBtn.addEventListener('click', () => {
      document.getElementById('feedTabGuestbook')?.click();
      document.getElementById('composerTextarea')?.focus();
    });
  }
}

function extractPaletteFromImage(imageSrc, fontHeading, fontBody) {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.src = imageSrc;

  img.onload = () => {
    const canvas = document.getElementById('colorExtractionCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 100, 100);

    let imgData;
    try {
      imgData = ctx.getImageData(0, 0, 100, 100).data;
    } catch {
      applyDefaultTheme(STATE.activeHostId);
      return;
    }

    let maxSaturation = 0;
    let dominantColor = { r: 168, g: 85, b: 247 };

    for (let i = 0; i < imgData.length; i += 16) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];
      const hsl = rgbToHsl(r, g, b);
      if (hsl.s > maxSaturation && hsl.l > 0.25 && hsl.l < 0.8) {
        maxSaturation = hsl.s;
        dominantColor = { r, g, b };
      }
    }

    const domHsl = rgbToHsl(dominantColor.r, dominantColor.g, dominantColor.b);
    applyComputedTheme(domHsl, fontHeading, fontBody);
  };

  img.onerror = () => {
    applyDefaultTheme(STATE.activeHostId);
  };
}

function applyDefaultTheme(hostId) {
  const defaults = {
    maya: { h: 275, s: 85, l: 65, font: "'Plus Jakarta Sans', sans-serif" },
    julian: { h: 28, s: 78, l: 52, font: "'Playfair Display', serif" },
    elena: { h: 145, s: 62, l: 45, font: "'Outfit', sans-serif" }
  };
  const d = defaults[hostId] || defaults.maya;
  applyComputedTheme({ h: d.h / 360, s: d.s / 100, l: d.l / 100 }, d.font);
}

function applyComputedTheme(hsl, fontHeading, fontBody) {
  const hDeg = Math.round(hsl.h * 360);
  const primaryHex = hslToHex(hsl.h, Math.max(0.6, hsl.s), 0.62);
  const lightHex = hslToHex(hsl.h, hsl.s, 0.75);
  const darkHex = hslToHex(hsl.h, hsl.s, 0.45);
  const secHDeg = (hDeg + 160) % 360;
  const secondaryHex = hslToHex(secHDeg / 360, 0.8, 0.55);

  const root = document.documentElement;
  root.style.setProperty('--theme-primary', primaryHex);
  root.style.setProperty('--theme-primary-light', lightHex);
  root.style.setProperty('--theme-primary-dark', darkHex);
  root.style.setProperty('--theme-primary-glow', `hsla(${hDeg}, 85%, 60%, 0.4)`);
  root.style.setProperty('--theme-secondary', secondaryHex);
  root.style.setProperty('--theme-secondary-glow', `hsla(${secHDeg}, 80%, 55%, 0.3)`);

  root.style.setProperty('--theme-bg', `hsl(${hDeg}, 35%, 5%)`);
  root.style.setProperty(
    '--theme-bg-gradient',
    `radial-gradient(circle at 50% 0%, hsl(${hDeg}, 45%, 11%) 0%, hsl(${hDeg}, 30%, 4%) 70%)`
  );
  root.style.setProperty('--theme-surface', `hsla(${hDeg}, 25%, 11%, 0.8)`);
  root.style.setProperty('--theme-surface-card', `hsla(${hDeg}, 20%, 14%, 0.7)`);
  root.style.setProperty('--theme-surface-hover', `hsla(${hDeg}, 25%, 18%, 0.85)`);
  root.style.setProperty('--theme-card-border', `hsla(${hDeg}, 75%, 65%, 0.22)`);

  if (fontHeading) root.style.setProperty('--theme-font-heading', fontHeading);
  if (fontBody) root.style.setProperty('--theme-font-body', fontBody);

  const swatchesEl = document.getElementById('paletteSwatches');
  if (swatchesEl) {
    swatchesEl.innerHTML = `
      <span class="swatch-pill" style="background: ${primaryHex};" title="Accent: ${primaryHex}"></span>
      <span class="swatch-pill" style="background: ${lightHex};" title="Light: ${lightHex}"></span>
      <span class="swatch-pill" style="background: ${secondaryHex};" title="Secondary: ${secondaryHex}"></span>
      <span class="swatch-pill" style="background: hsl(${hDeg}, 35%, 11%);" title="Surface Base"></span>
    `;
  }

  const inspectorEl = document.getElementById('tokensInspector');
  if (inspectorEl) {
    inspectorEl.innerHTML = `
      <div class="token-pill"><span class="token-color-preview" style="background: ${primaryHex};"></span><span>Primary: ${primaryHex}</span></div>
      <div class="token-pill"><span class="token-color-preview" style="background: ${secondaryHex};"></span><span>Sec: ${secondaryHex}</span></div>
      <div class="token-pill"><span class="token-color-preview" style="background: ${lightHex};"></span><span>WCAG AA Pass</span></div>
      <div class="token-pill"><span class="token-color-preview" style="background: hsl(${hDeg}, 35%, 12%);"></span><span>Safe HSL Tokens</span></div>
    `;
  }
}

// --- AMBIENT AUDIO SYNTH & 3-TRACK PLAYLIST ENGINE ---
function unlockAudioContext() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!STATE.audioContext && AudioCtx) {
      STATE.audioContext = new AudioCtx();
    }
    if (STATE.audioContext && STATE.audioContext.state === 'suspended') {
      STATE.audioContext.resume();
    }
  } catch (e) {
    console.warn('AudioContext unlock failed:', e);
  }
}

function updateAudioPlayState(isPlaying, title, subtitle) {
  STATE.audioPlaying = isPlaying;
  const vinyl = document.getElementById('vinylDisc');
  const dockVinyl = document.getElementById('dockVinylDisc');
  const playIcon = document.getElementById('sidebarAudioPlayIcon');
  const playText = document.getElementById('sidebarAudioPlayText');
  const dockPlayIcon = document.getElementById('dockPlayPauseIcon');
  const miniWaveform = document.getElementById('miniWaveform');
  const dock = document.getElementById('floatingAudioDock');
  const dockTitle = document.getElementById('dockTrackTitle');
  const dockSubtitle = document.getElementById('dockTrackSubtitle');

  // Top Dropdown Audio Bar Elements
  const topVinyl = document.getElementById('topAudioVinylDisc');
  const topPlayIcon = document.getElementById('topAudioPlayPauseIcon');
  const topTitle = document.getElementById('topAudioTrackTitle');
  const topSubtitle = document.getElementById('topAudioTrackSubtitle');
  const navBtn = document.getElementById('navTopAudioToggleBtn');
  const wavePill = document.getElementById('navAudioWavePill');

  if (isPlaying) {
    vinyl?.classList.add('spin');
    dockVinyl?.classList.add('spin');
    topVinyl?.classList.add('spin');
    miniWaveform?.classList.add('playing');
    if (playIcon) playIcon.textContent = '⏸';
    if (playText) playText.textContent = 'Pause Audio';
    if (dockPlayIcon) dockPlayIcon.textContent = '⏸';
    if (topPlayIcon) topPlayIcon.textContent = '⏸';
    if (title && dockTitle) dockTitle.textContent = title;
    if (subtitle && dockSubtitle) dockSubtitle.textContent = subtitle;
    if (title && topTitle) topTitle.textContent = title;
    if (subtitle && topSubtitle) topSubtitle.textContent = subtitle;
    dock?.classList.remove('hidden');
    navBtn?.classList.add('is-playing');
    wavePill?.classList.remove('hidden');
  } else {
    vinyl?.classList.remove('spin');
    dockVinyl?.classList.remove('spin');
    topVinyl?.classList.remove('spin');
    miniWaveform?.classList.remove('playing');
    if (playIcon) playIcon.textContent = '▶';
    if (playText) playText.textContent = 'Play Audio';
    if (dockPlayIcon) dockPlayIcon.textContent = '▶';
    if (topPlayIcon) topPlayIcon.textContent = '▶';
    navBtn?.classList.remove('is-playing');
    wavePill?.classList.add('hidden');
  }

  // Update track badge if playlist exists
  if (STATE.activePlaylist && STATE.activePlaylist.length > 0) {
    const total = STATE.activePlaylist.length;
    const curIdx = STATE.activePlaylistIndex || 0;
    const topBadge = document.getElementById('topAudioTrackBadge');
    if (topBadge) topBadge.textContent = `Track ${curIdx + 1} of ${total}`;
    renderTopAudioPlaylistChips();
  }
}

function initAudioDoorbell() {
  const banner = document.getElementById('audioDoorbellBanner');
  const playBtn = document.getElementById('doorbellPlayBtn');
  const dismissBtn = document.getElementById('doorbellDismissBtn');
  const sidebarAudioBtn = document.getElementById('sidebarAudioToggleBtn');
  const prevBtn = document.getElementById('sidebarTrackPrevBtn');
  const nextBtn = document.getElementById('sidebarTrackNextBtn');

  // Floating dock controls
  const dockPlayPauseBtn = document.getElementById('dockPlayPauseBtn');
  const dockPrevBtn = document.getElementById('dockPrevBtn');
  const dockNextBtn = document.getElementById('dockNextBtn');
  const dockVideoToggleBtn = document.getElementById('dockVideoToggleBtn');
  const dockCloseBtn = document.getElementById('dockCloseBtn');
  const dockSynthToggleBtn = document.getElementById('dockSynthToggleBtn');

  // One-time touch unlock for mobile browsers
  document.addEventListener('touchstart', function onFirstTouch() {
    unlockAudioContext();
    document.removeEventListener('touchstart', onFirstTouch);
  }, { once: true, passive: true });

  playBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudioContext();
    const playLabel = document.getElementById('doorbellPlayLabel');
    if (playLabel) playLabel.textContent = 'Playing... 🎧';
    toggleThemeAudio(true);
    setTimeout(() => {
      banner?.classList.remove('visible');
      if (playLabel) playLabel.textContent = 'Play Music';
    }, 1200);
  });

  dismissBtn?.addEventListener('click', () => {
    banner?.classList.remove('visible');
    showToast('Theme music dismissed. You can play it anytime in the sidebar or bottom player.', 'info');
  });

  sidebarAudioBtn?.addEventListener('click', () => {
    unlockAudioContext();
    toggleThemeAudio(!STATE.audioPlaying);
  });

  prevBtn?.addEventListener('click', () => {
    unlockAudioContext();
    playPrevPlaylistTrack();
  });

  nextBtn?.addEventListener('click', () => {
    unlockAudioContext();
    playNextPlaylistTrack();
  });

  // Wire up floating audio dock controls
  dockPlayPauseBtn?.addEventListener('click', () => {
    unlockAudioContext();
    toggleThemeAudio(!STATE.audioPlaying);
  });

  dockPrevBtn?.addEventListener('click', () => {
    unlockAudioContext();
    playPrevPlaylistTrack();
  });

  dockNextBtn?.addEventListener('click', () => {
    unlockAudioContext();
    playNextPlaylistTrack();
  });

  dockVideoToggleBtn?.addEventListener('click', () => {
    const vContainer = document.getElementById('dockVideoContainer');
    vContainer?.classList.toggle('hidden');
  });

  dockCloseBtn?.addEventListener('click', () => {
    toggleThemeAudio(false);
    document.getElementById('floatingAudioDock')?.classList.add('hidden');
  });

  dockSynthToggleBtn?.addEventListener('click', () => {
    unlockAudioContext();
    stopYouTubeAudio();
    startAmbientSynth([261.63, 329.63, 392.00, 493.88]);
    updateAudioPlayState(true, 'Ambient Synth Theme', 'Synthesized Web Audio');
    showToast('Playing soothing ambient synthesized chords 🎵', 'success');
  });

  // Listen for YouTube iframe player state change (ended -> auto-play next track; onError -> auto-advance or fallback)
  window.addEventListener('message', (event) => {
    if (!event.data) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.event === 'onStateChange' && data.info === 0) {
        showToast('Track finished! Auto-playing next song in ambient playlist 🎵', 'info');
        playNextPlaylistTrack();
      } else if (data.event === 'onError' || (typeof data.info === 'number' && [2, 5, 100, 101, 150].includes(data.info))) {
        const track = STATE.activePlaylist && STATE.activePlaylist[STATE.activePlaylistIndex];
        const trackName = track?.title || 'This video';
        console.warn(`[YouTube Audio] Playback restriction error code ${data.info} for:`, trackName);
        
        if (STATE.activePlaylist && STATE.activePlaylist.length > 1) {
          showToast(`"${trackName}" has third-party embedding restricted by YouTube. Auto-playing next track... ⏭️`, 'warning');
          playNextPlaylistTrack();
        } else {
          showToast(`"${trackName}" is restricted by YouTube. Switching to soothing ambient synthesizer chords 🎵`, 'info');
          unlockAudioContext();
          stopYouTubeAudio();
          startAmbientSynth([261.63, 329.63, 392.00, 493.88]);
          updateAudioPlayState(true, 'Ambient Synthesizer', 'Synthesized Audio Fallback');
        }
      }
    } catch (e) {
      // Non-JSON message from external sources
    }
  });
}

function playNextPlaylistTrack() {
  if (!STATE.activePlaylist || STATE.activePlaylist.length === 0) return;
  STATE.activePlaylistIndex = (STATE.activePlaylistIndex + 1) % STATE.activePlaylist.length;
  playCurrentPlaylistTrack();
}

function playPrevPlaylistTrack() {
  if (!STATE.activePlaylist || STATE.activePlaylist.length === 0) return;
  STATE.activePlaylistIndex = (STATE.activePlaylistIndex - 1 + STATE.activePlaylist.length) % STATE.activePlaylist.length;
  playCurrentPlaylistTrack();
}

function playCurrentPlaylistTrack() {
  if (!STATE.activePlaylist || STATE.activePlaylist.length === 0) return;
  const track = STATE.activePlaylist[STATE.activePlaylistIndex];
  if (!track) return;

  const total = Math.max(1, STATE.activePlaylist.length);
  const badge = document.getElementById('sidebarPlaylistBadge');
  if (badge) badge.textContent = `Track ${STATE.activePlaylistIndex + 1} of ${total}`;

  const topBadge = document.getElementById('topAudioTrackBadge');
  if (topBadge) topBadge.textContent = `Track ${STATE.activePlaylistIndex + 1} of ${total}`;

  const titleEl = document.getElementById('sidebarTrackTitle');
  if (titleEl) titleEl.textContent = track.title || 'Ambient Theme';

  const topTitleEl = document.getElementById('topAudioTrackTitle');
  if (topTitleEl) topTitleEl.textContent = track.title || 'Ambient Theme';

  renderTopAudioPlaylistChips();

  const videoId = extractYouTubeVideoId(track.url);
  if (videoId) {
    playYouTubeAudio(videoId);
    updateAudioPlayState(true, track.title || 'Ambient Track', `Track ${STATE.activePlaylistIndex + 1} of ${total}`);
    showToast(`Streaming track ${STATE.activePlaylistIndex + 1}/${total}: "${track.title || 'Ambient Track'}" 🎧`, 'success');
  } else {
    toggleThemeAudio(true);
  }
}

function showAudioDoorbellPrompt(user) {
  const banner = document.getElementById('audioDoorbellBanner');
  document.getElementById('doorbellHostHandle').textContent = user.handle;
  document.getElementById('doorbellTrackTitle').textContent = user.music_title || 'Ambient Track';
  banner.classList.add('visible');
  setTimeout(() => banner.classList.remove('visible'), 12000);
}

function hideAudioDoorbellPrompt() {
  document.getElementById('audioDoorbellBanner').classList.remove('visible');
}

function extractYouTubeVideoId(url) {
  if (!url) return null;
  const str = url.trim();
  // Robust pattern supporting youtu.be, watch?v=, embed/, v/, shorts/, and query parameters (?si=, ?is=, etc.)
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|.*[?&]v=))([\w-]{11})/;
  const match = str.match(regExp);
  if (match && match[1]) {
    return match[1];
  }
  // Fallback for bare 11-character video IDs
  if (str.length === 11 && !str.includes('/') && !str.includes('.') && !str.includes('?')) {
    return str;
  }
  return null;
}

function playYouTubeAudio(videoId) {
  const isMobile = window.innerWidth <= 768;
  const isIpAddress = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(window.location.hostname);
  const origin = (!isIpAddress && window.location.origin && window.location.origin !== 'null') ? window.location.origin : '';
  const originParam = origin ? `&origin=${encodeURIComponent(origin)}` : '';
  const iframeHtml = `<iframe id="ytAudioIframe" width="100%" height="${isMobile ? '150' : '165'}" src="https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&enablejsapi=1&rel=0&modestbranding=1${originParam}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="no-referrer-when-downgrade" allowfullscreen loading="eager" title="YouTube Ambient Audio Player" style="border:0; border-radius:8px; display:block; width:100%;"></iframe>`;

  const topVideoDrawer = document.getElementById('topAudioVideoDrawer');
  const isTopVideoOpen = topVideoDrawer && !topVideoDrawer.classList.contains('hidden');
  const topHost = document.getElementById('topAudioPlayerHost');
  const dockHost = document.getElementById('youtubePlayerHost');
  const vContainer = document.getElementById('dockVideoContainer');

  if (isTopVideoOpen && topHost) {
    topHost.innerHTML = iframeHtml;
    if (dockHost) dockHost.innerHTML = '';
  } else if (dockHost) {
    dockHost.innerHTML = iframeHtml;
    if (topHost) topHost.innerHTML = '';
    if (vContainer) vContainer.classList.remove('hidden');
  }
}

function stopYouTubeAudio() {
  const host = document.getElementById('youtubePlayerHost');
  if (host) host.innerHTML = '';
  const topHost = document.getElementById('topAudioPlayerHost');
  if (topHost) topHost.innerHTML = '';
}

// --- TOP DROPDOWN THEME AUDIO BAR CONTROLS ---
function renderTopAudioPlaylistChips() {
  const chipsContainer = document.getElementById('topAudioPlaylistChips');
  if (!chipsContainer) return;
  if (!STATE.activePlaylist || STATE.activePlaylist.length === 0) {
    chipsContainer.innerHTML = '';
    return;
  }

  const chipsHtml = STATE.activePlaylist.map((t, idx) => {
    const isActive = idx === (STATE.activePlaylistIndex || 0);
    let shortTitle = t.title || `Track ${idx + 1}`;
    if (shortTitle.length > 24) shortTitle = shortTitle.substring(0, 22) + '...';
    return `<button type="button" class="top-audio-chip ${isActive ? 'active' : ''}" onclick="selectTopAudioTrack(${idx})" title="Play ${escapeForAttr(t.title || '')}" aria-selected="${isActive}">
      ${idx + 1}. ${escapeHtml(shortTitle)}
    </button>`;
  }).join('');

  chipsContainer.innerHTML = chipsHtml;
}

function selectTopAudioTrack(index) {
  unlockAudioContext();
  if (!STATE.activePlaylist || index >= STATE.activePlaylist.length) return;
  STATE.activePlaylistIndex = index;
  playCurrentPlaylistTrack();
}

function initTopAudioDropdown() {
  const navBtn = document.getElementById('navTopAudioToggleBtn');
  const bar = document.getElementById('topAudioDropdownBar');
  const closeBtn = document.getElementById('topAudioCloseBtn');
  const playPauseBtn = document.getElementById('topAudioPlayPauseBtn');
  const prevBtn = document.getElementById('topAudioPrevBtn');
  const nextBtn = document.getElementById('topAudioNextBtn');
  const synthBtn = document.getElementById('topAudioSynthBtn');
  const videoToggleBtn = document.getElementById('topAudioVideoToggleBtn');
  const videoDrawer = document.getElementById('topAudioVideoDrawer');
  const topNav = document.querySelector('.top-nav');

  if (!navBtn || !bar) return;

  function updateBarPosition() {
    if (topNav) {
      bar.style.top = topNav.offsetHeight + 'px';
    }
  }

  function toggleBar(forceOpen) {
    updateBarPosition();
    const shouldOpen = (typeof forceOpen === 'boolean') ? forceOpen : bar.classList.contains('hidden');
    if (shouldOpen) {
      bar.classList.remove('hidden');
      requestAnimationFrame(() => {
        bar.classList.add('is-open');
      });
      navBtn.setAttribute('aria-expanded', 'true');
      renderTopAudioPlaylistChips();
      
      const track = STATE.activePlaylist && STATE.activePlaylist[STATE.activePlaylistIndex];
      const titleEl = document.getElementById('topAudioTrackTitle');
      const subEl = document.getElementById('topAudioTrackSubtitle');
      const badgeEl = document.getElementById('topAudioTrackBadge');
      if (titleEl && track?.title) titleEl.textContent = track.title;
      if (subEl) subEl.textContent = STATE.audioPlaying ? 'Now Playing 🎧' : 'Tap ▶ to play theme audio';
      if (badgeEl && STATE.activePlaylist) {
        badgeEl.textContent = `Track ${(STATE.activePlaylistIndex || 0) + 1} of ${STATE.activePlaylist.length}`;
      }
    } else {
      bar.classList.remove('is-open');
      navBtn.setAttribute('aria-expanded', 'false');
      setTimeout(() => {
        if (!bar.classList.contains('is-open')) {
          bar.classList.add('hidden');
        }
      }, 350);
    }
  }

  navBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBar();
  });

  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBar(false);
  });

  playPauseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudioContext();
    if (STATE.audioPlaying) {
      toggleThemeAudio(false);
    } else {
      toggleThemeAudio(true);
    }
  });

  prevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudioContext();
    playPrevPlaylistTrack();
  });

  nextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudioContext();
    playNextPlaylistTrack();
  });

  synthBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    unlockAudioContext();
    stopYouTubeAudio();
    startAmbientSynth([261.63, 329.63, 392.00, 493.88]);
    updateAudioPlayState(true, 'Ambient Synthesizer', 'Calm Chords');
    showToast('Switched to ambient synthesizer mode 🎹', 'success');
  });

  videoToggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!videoDrawer) return;
    const isHidden = videoDrawer.classList.contains('hidden');
    const label = document.getElementById('topAudioVideoToggleLabel');
    const dockHost = document.getElementById('youtubePlayerHost');
    const topHost = document.getElementById('topAudioPlayerHost');
    
    if (isHidden) {
      videoDrawer.classList.remove('hidden');
      if (label) label.textContent = 'Hide Video';
      if (dockHost && dockHost.firstElementChild && topHost) {
        topHost.appendChild(dockHost.firstElementChild);
      } else {
        const track = STATE.activePlaylist && STATE.activePlaylist[STATE.activePlaylistIndex];
        const ytUrl = track ? track.url : (STATE.activeHostUser ? STATE.activeHostUser.youtube_url : '');
        const videoId = extractYouTubeVideoId(ytUrl);
        if (videoId && topHost && !topHost.firstElementChild) {
          playYouTubeAudio(videoId);
        }
      }
    } else {
      videoDrawer.classList.add('hidden');
      if (label) label.textContent = 'Video';
      if (topHost && topHost.firstElementChild && dockHost) {
        dockHost.appendChild(topHost.firstElementChild);
      }
    }
  });

  window.addEventListener('resize', updateBarPosition);
}

// --- COMMUNITY POST VIDEO THEATER (POPS OPEN WITH BLURRED PLATFORM BACKGROUND FOR POSTS) ---
function escapeForAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, ' ');
}

function handlePostVideoClick(btnEl) {
  if (!btnEl) return;
  const videoId = btnEl.getAttribute('data-video-id');
  const title = btnEl.getAttribute('data-video-title') || 'Community Video';
  const url = btnEl.getAttribute('data-video-url') || '';
  if (videoId) {
    openVideoTheater(videoId, title, url);
  }
}

function renderPostVideoCardHtml(videoId, title, originalUrl) {
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const safeTitle = escapeForAttr(title || 'Community Video');
  const safeUrl = escapeForAttr(originalUrl || `https://www.youtube.com/watch?v=${videoId}`);
  const safeVid = escapeForAttr(videoId);
  return `
    <div class="post-video-preview-card"
         data-video-id="${safeVid}"
         data-video-title="${safeTitle}"
         data-video-url="${safeUrl}"
         onclick="handlePostVideoClick(this)"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();handlePostVideoClick(this);}"
         role="button"
         tabindex="0"
         title="Click to watch in theater mode"
         aria-label="Play video: ${safeTitle}">
      <div class="video-preview-thumb-wrap">
        <img src="${thumbUrl}" alt="Video thumbnail" class="video-preview-thumb" loading="lazy" onerror="this.src='https://img.youtube.com/vi/${safeVid}/mqdefault.jpg'">
        <div class="video-preview-overlay">
          <div class="video-preview-play-btn" aria-hidden="true">
            <span class="play-icon">▶</span>
          </div>
          <span class="video-preview-pill">🎬 Watch in Theater</span>
        </div>
      </div>
    </div>
  `;
}

function openVideoTheater(videoId, title, originalUrl) {
  const modal = document.getElementById('videoTheaterModal');
  const titleEl = document.getElementById('theaterVideoTitle');
  const host = document.getElementById('theaterPlayerHost');
  const extLink = document.getElementById('theaterExternalLink');
  if (!modal || !host) return;

  if (titleEl) titleEl.textContent = title || 'Community Video';
  if (extLink) extLink.href = originalUrl || `https://www.youtube.com/watch?v=${videoId}`;

  // Embedded player inside blurred theater popup
  host.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="no-referrer-when-downgrade" allowfullscreen loading="eager" title="${escapeHtml(title || 'Community Video')}"></iframe>`;

  document.body.classList.add('theater-blur-active');
  modal.showModal();
}

function closeVideoTheater() {
  const modal = document.getElementById('videoTheaterModal');
  const host = document.getElementById('theaterPlayerHost');
  if (host) host.innerHTML = '';
  document.body.classList.remove('theater-blur-active');
  if (modal && modal.open) modal.close();
}

function initVideoTheater() {
  const modal = document.getElementById('videoTheaterModal');
  const closeBtn = document.getElementById('closeTheaterModalBtn');
  if (!modal) return;

  closeBtn?.addEventListener('click', () => closeVideoTheater());

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeVideoTheater();
    }
  });

  modal.addEventListener('close', () => {
    const host = document.getElementById('theaterPlayerHost');
    if (host) host.innerHTML = '';
    document.body.classList.remove('theater-blur-active');
  });
}

function toggleThemeAudio(play) {
  unlockAudioContext();

  if (play) {
    const track = STATE.activePlaylist && STATE.activePlaylist[STATE.activePlaylistIndex];
    const ytUrl = track ? track.url : (STATE.activeHostUser ? STATE.activeHostUser.youtube_url : '');
    const videoId = extractYouTubeVideoId(ytUrl);
    const trackTitle = track?.title || (STATE.activeHostUser?.music_title) || 'Ambient Track';

    if (videoId) {
      playYouTubeAudio(videoId);
      updateAudioPlayState(true, trackTitle, 'YouTube Audio');
      showToast(`Streaming ambient audio: "${trackTitle}" 🎧`, 'success');
    } else {
      try {
        startAmbientSynth([261.63, 329.63, 392.00, 493.88]);
        updateAudioPlayState(true, 'Ambient Synthesizer', 'Calm Chords');
        showToast('Ambient synthesized theme playing 🎧', 'success');
      } catch {
        showToast('Audio playback enabled.', 'info');
      }
    }
  } else {
    stopYouTubeAudio();
    stopAmbientSynth();
    updateAudioPlayState(false);
    showToast('Theme audio paused.', 'info');
  }
}

function startAmbientSynth(chordFreqs) {
  stopAmbientSynth();
  if (!STATE.audioContext) return;

  const now = STATE.audioContext.currentTime;
  const masterGain = STATE.audioContext.createGain();
  masterGain.gain.setValueAtTime(0.01, now);
  masterGain.gain.exponentialRampToValueAtTime(0.07, now + 1.2);
  masterGain.connect(STATE.audioContext.destination);
  STATE.audioGainNode = masterGain;

  const filter = STATE.audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(650, now);
  filter.connect(masterGain);

  chordFreqs.forEach((freq, idx) => {
    const osc = STATE.audioContext.createOscillator();
    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.setValueAtTime((idx - 1.5) * 6, now);
    osc.connect(filter);
    osc.start(now);
    STATE.audioOscillators.push(osc);
  });
}

function stopAmbientSynth() {
  if (STATE.audioGainNode && STATE.audioContext) {
    const now = STATE.audioContext.currentTime;
    STATE.audioGainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    setTimeout(() => {
      STATE.audioOscillators.forEach(osc => {
        try { osc.stop(); osc.disconnect(); } catch {}
      });
      STATE.audioOscillators = [];
    }, 600);
  }
}

// --- FEED & POSTS ---
function initFeedTabs() {
  const tabDispatches = document.getElementById('feedTabDispatches');
  const tabGuestbook = document.getElementById('feedTabGuestbook');

  tabDispatches.addEventListener('click', () => {
    tabDispatches.classList.add('active');
    tabGuestbook.classList.remove('active');
    STATE.activeFeedTab = 'dispatches';
    loadPlatform(STATE.activeHostId, false);
  });

  tabGuestbook.addEventListener('click', () => {
    tabGuestbook.classList.add('active');
    tabDispatches.classList.remove('active');
    STATE.activeFeedTab = 'guestbook';
    loadPlatform(STATE.activeHostId, false);
  });
}

function renderPostsStream(dispatches = [], guestbook = []) {
  const container = document.getElementById('postsStream');
  container.innerHTML = '';

  const posts = STATE.activeFeedTab === 'dispatches' ? dispatches : guestbook;

  if (posts.length === 0) {
    container.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--theme-text-dim);">
        <p>No notes published here yet. Leave a thought on this platform!</p>
      </div>
    `;
    return;
  }

  posts.forEach(post => {
    const isDispatch = STATE.activeFeedTab === 'dispatches';
    const card = document.createElement('article');
    card.className = 'post-card';
    card.id = `post-${post.id}`;

    // Render Topic Badge if interest or subtopic, or Open Thought
    let topicBadgeHtml = '';
    if (post.interest || post.subtopic) {
      topicBadgeHtml = `
        <div class="post-topic-badge">
          <span class="topic-interest-icon">🏷️</span>
          <span class="topic-interest-name">${escapeHtml(post.interest || 'Topic')}</span>
          ${post.subtopic ? `<span class="topic-separator">›</span><span class="topic-subtopic-name">${escapeHtml(post.subtopic)}</span>` : ''}
        </div>
      `;
    } else {
      topicBadgeHtml = `
        <div class="post-topic-badge" style="background: rgba(148, 163, 184, 0.12); border-color: rgba(148, 163, 184, 0.3);">
          <span class="topic-interest-icon">💭</span>
          <span class="topic-interest-name">Open Thought</span>
        </div>
      `;
    }

    // Visibility pill
    let visibilityHtml = '';
    if (post.visibility === 'friends') {
      visibilityHtml = '<span class="friends-only-badge" style="margin-left: 6px;">🔒 Friends Only</span>';
    }

    // Flagged for admin badge
    let flaggedBadgeHtml = '';
    if (post.flagged_for_admin === 1 || (post.flag_count && post.flag_count >= 3)) {
      flaggedBadgeHtml = `<span class="flagged-admin-badge" style="margin-left: 6px;">🚩 Under Moderation (${post.flag_count || 3} Flags)</span>`;
    }

    // Mentioned post reference chip
    let mentionedPostHtml = '';
    if (post.mentioned_post_id) {
      mentionedPostHtml = `
        <div class="tagged-post-chip-wrap" style="margin: 6px 0 10px 0;">
          <span class="tagged-chip-icon">#️⃣ Tagged Post:</span>
          <span class="tagged-chip-title">${escapeHtml(post.mentioned_post_id)}</span>
        </div>
      `;
    }

    let mediaHtml = '';
    const mediaUrl = post.media_url ? post.media_url.trim() : '';
    if (mediaUrl) {
      const ytMatch = mediaUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
      if (ytMatch && ytMatch[1]) {
        mediaHtml = renderPostVideoCardHtml(ytMatch[1], post.text || 'Community Dispatch', mediaUrl);
      } else if (post.media_type === 'image' || mediaUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i)) {
        mediaHtml = `<div class="post-media-attachment"><img src="${escapeHtml(mediaUrl)}" alt="Attachment"></div>`;
      } else {
        mediaHtml = `
          <a href="${escapeHtml(mediaUrl)}" target="_blank" rel="noopener noreferrer" class="post-link-embed">
            <span class="link-embed-icon">🔗</span>
            <span class="link-embed-url">${escapeHtml(mediaUrl)}</span>
          </a>
        `;
      }
    } else if (post.media_type === 'video') {
      mediaHtml = `
        <div class="short-video-container">
          <div class="mock-video-canvas">
            <span class="video-timer-badge">⏱️ ${post.video_duration || '0:45'} / 1:00 max</span>
            <div class="video-synth-waves">
              <span class="synth-wave-bar"></span><span class="synth-wave-bar"></span>
              <span class="synth-wave-bar"></span><span class="synth-wave-bar"></span>
              <span class="synth-wave-bar"></span><span class="synth-wave-bar"></span>
            </div>
            <div class="video-controls-overlay">
              <button class="btn-play-pause">▶</button>
              <div class="video-progress-bar"><div class="video-progress-fill"></div></div>
              <span class="video-time-text">${post.video_duration || '0:45'}</span>
            </div>
          </div>
        </div>
      `;
    }

    const authorAvatar = post.author_avatar || 'assets/avatar-p-default.svg';
    const authorName = post.author_name || 'Member';
    const authorHandle = post.author_handle || '@member';
    const timeFormatted = formatTimeAgo(post.created_at);

    // Permission checks for Edit, Delete, Flag, Change Topic
    const currentUserId = STATE.currentUser ? STATE.currentUser.id : null;
    const isAuthor = currentUserId && (post.author_id === currentUserId || post.user_id === currentUserId);
    const isPlatformHost = currentUserId && (post.host_id === currentUserId);
    const isAdmin = STATE.currentUser && STATE.currentUser.is_admin === 1;

    let actionButtonsHtml = '';
    if (isAuthor) {
      actionButtonsHtml += `
        <button class="post-action-btn" onclick="openEditPostModal('${post.id}', \`${escapeForAttr(post.text)}\`, '${escapeForAttr(post.interest || '')}', '${escapeForAttr(post.subtopic || '')}', '${post.visibility || 'public'}')">
          ✏️ Edit
        </button>
      `;
    }

    if (isAuthor || (isPlatformHost && !isDispatch) || isAdmin) {
      actionButtonsHtml += `
        <button class="post-action-btn danger" onclick="deletePost('${post.id}')">
          🗑️ Delete
        </button>
      `;
    }

    if (!isAuthor) {
      actionButtonsHtml += `
        <button class="post-action-btn flag-btn" onclick="flagPostOffTopic('${post.id}')" title="Flag post as off-topic">
          🚩 Flag Off-Topic (${post.flag_count || 0})
        </button>
      `;
    }

    if (isAuthor || isAdmin) {
      actionButtonsHtml += `
        <button class="post-action-btn" onclick="openChangeTopicModal('${post.id}', '${escapeForAttr(post.interest || '')}', '${escapeForAttr(post.subtopic || '')}')" title="Change Topic & Clear Flags">
          🏷️ Change Topic
        </button>
      `;
    }

    card.innerHTML = `
      <div class="post-header">
        <div class="post-author-box">
          <img src="${authorAvatar}" alt="${authorName}" class="post-avatar">
          <div class="post-author-info">
            <span class="post-author-name">${authorName}</span>
            <span class="post-author-handle">${authorHandle}</span>
          </div>
        </div>
        <div class="post-meta-right">
          ${visibilityHtml}
          ${flaggedBadgeHtml}
          ${!isDispatch ? '<span class="post-badge-visitor">Visitor Note</span>' : ''}
          <span class="post-time">${timeFormatted}</span>
        </div>
      </div>

      ${topicBadgeHtml}
      ${mentionedPostHtml}
      <div class="post-body-text">${escapeHtml(post.text)}</div>
      ${mediaHtml}

      <div class="post-footer-actions">
        <button class="post-action-btn" onclick="likePost('${post.id}')">
          <span>🤍</span> <span>${post.likes || 0}</span>
        </button>
        <button class="post-action-btn" onclick="openTipModal({name: '${authorName}'})">
          <span>💝</span> <span>Appreciate</span>
        </button>
      </div>

      <div class="post-action-bar">
        ${actionButtonsHtml}
      </div>
    `;

    container.appendChild(card);
  });

  if (posts.length > 0) {
    const milestoneCard = document.createElement('div');
    milestoneCard.className = 'feed-milestone-card';
    milestoneCard.innerHTML = `
      <div class="milestone-icon">🍃</div>
      <h3 class="milestone-heading">You're All Caught Up</h3>
      <p class="milestone-desc">
        You've explored all ${posts.length} sovereign dispatches in this cycle. The Platform respects your human attention without artificial infinite doomscroll loops.
      </p>
      <button type="button" class="milestone-zen-btn" onclick="openMindfulZenMode()">
        ✨ Mindful Disconnect &amp; Zen Sanctuary
      </button>
    `;
    container.appendChild(milestoneCard);
  }
}

// --- COMPOSER WITH AUTOCOMPLETE (# POSTS & @ FRIENDS) & AD HOMINEM DEFENSE ---
function initComposer() {
  const textarea = document.getElementById('composerTextarea');
  const publishBtn = document.getElementById('publishPostBtn');
  const modAlert = document.getElementById('composerModerationAlert');
  const modAlertText = document.getElementById('composerModAlertText');
  const postDropdown = document.getElementById('postMentionDropdown');
  const friendDropdown = document.getElementById('friendMentionDropdown');
  const taggedChipWrap = document.getElementById('taggedPostChipWrap');
  const taggedChipTitle = document.getElementById('taggedPostChipTitle');
  const removeTaggedBtn = document.getElementById('removeTaggedPostBtn');

  STATE.composerMentionedPostId = null;
  STATE.composerMentionedUserIds = [];

  removeTaggedBtn?.addEventListener('click', () => {
    STATE.composerMentionedPostId = null;
    taggedChipWrap?.classList.add('hidden');
    if (taggedChipTitle) taggedChipTitle.textContent = '';
  });

  let userRecentPostsCache = null;

  async function loadUserRecentPosts() {
    try {
      const res = await apiRequest('/api/posts/user-activity');
      userRecentPostsCache = res.posts || [];
    } catch {
      userRecentPostsCache = [];
    }
  }

  // Input listener for # and @ triggers
  textarea?.addEventListener('input', async () => {
    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord && lastWord.startsWith('#')) {
      const query = lastWord.slice(1).toLowerCase();
      if (!userRecentPostsCache) await loadUserRecentPosts();

      const filtered = (userRecentPostsCache || []).filter(p => {
        const title = (p.text || '').toLowerCase();
        const topic = (p.interest || '').toLowerCase();
        const subtopic = (p.subtopic || '').toLowerCase();
        return !query || title.includes(query) || topic.includes(query) || subtopic.includes(query);
      }).slice(0, 6);

      if (filtered.length > 0 && postDropdown) {
        postDropdown.innerHTML = filtered.map(p => `
          <div class="mention-item" data-post-id="${p.id}" data-post-text="${escapeHtml(p.text ? p.text.substring(0, 45) : 'Post')}">
            <span style="font-size:1.1rem;">#️⃣</span>
            <div class="mention-info">
              <span class="mention-title">${escapeHtml(p.interest ? `[${p.interest}] ` : '')}${escapeHtml(p.text ? p.text.substring(0, 50) + '...' : 'Post')}</span>
              <span class="mention-sub">${p.subtopic ? `Subtopic: ${escapeHtml(p.subtopic)} • ` : ''}${formatTimeAgo(p.created_at)}</span>
            </div>
          </div>
        `).join('');
        postDropdown.classList.remove('hidden');
        friendDropdown?.classList.add('hidden');
      } else {
        postDropdown?.classList.add('hidden');
      }
    } else if (lastWord && lastWord.startsWith('@')) {
      const query = lastWord.slice(1).toLowerCase();
      const friends = STATE.friendsData.accepted || [];
      const filtered = friends.filter(f => {
        return !query || f.name.toLowerCase().includes(query) || f.handle.toLowerCase().includes(query);
      }).slice(0, 6);

      if (filtered.length > 0 && friendDropdown) {
        friendDropdown.innerHTML = filtered.map(f => `
          <div class="mention-item" data-user-id="${f.id}" data-user-handle="${escapeHtml(f.handle)}">
            <img src="${f.avatar || 'assets/avatar-p-default.svg'}" class="mention-avatar" alt="${escapeHtml(f.name)}">
            <div class="mention-info">
              <span class="mention-title">${escapeHtml(f.name)}</span>
              <span class="mention-sub">${escapeHtml(f.handle)}</span>
            </div>
          </div>
        `).join('');
        friendDropdown.classList.remove('hidden');
        postDropdown?.classList.add('hidden');
      } else {
        friendDropdown?.classList.add('hidden');
      }
    } else {
      postDropdown?.classList.add('hidden');
      friendDropdown?.classList.add('hidden');
    }
  });

  // Select # item
  postDropdown?.addEventListener('click', (e) => {
    const item = e.target.closest('.mention-item');
    if (!item) return;
    const postId = item.dataset.postId;
    const postSnippet = item.dataset.postText;

    STATE.composerMentionedPostId = postId;
    if (taggedChipTitle) taggedChipTitle.textContent = postSnippet;
    taggedChipWrap?.classList.remove('hidden');

    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const textAfter = val.slice(cursorPos);
    const lastHashIdx = textBefore.lastIndexOf('#');
    if (lastHashIdx !== -1) {
      textarea.value = textBefore.slice(0, lastHashIdx) + textAfter;
    }
    postDropdown.classList.add('hidden');
    textarea.focus();
    showToast('Tagged post! It will receive a mention boost in trending.', 'success');
  });

  // Select @ item
  friendDropdown?.addEventListener('click', (e) => {
    const item = e.target.closest('.mention-item');
    if (!item) return;
    const userId = item.dataset.userId;
    const handle = item.dataset.userHandle;

    if (!STATE.composerMentionedUserIds.includes(userId)) {
      STATE.composerMentionedUserIds.push(userId);
    }

    const val = textarea.value;
    const cursorPos = textarea.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const textAfter = val.slice(cursorPos);
    const lastAtIdx = textBefore.lastIndexOf('@');
    if (lastAtIdx !== -1) {
      const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
      textarea.value = textBefore.slice(0, lastAtIdx) + cleanHandle + ' ' + textAfter;
    }
    friendDropdown.classList.add('hidden');
    textarea.focus();
    showToast(`Mentioned ${handle}! They will be notified in the top bar.`, 'success');
  });

  // Close dropdowns on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.composer-autocomplete-anchor')) {
      postDropdown?.classList.add('hidden');
      friendDropdown?.classList.add('hidden');
    }
  });

  // Media Attachment: Image Import & Preview
  const attachPhotoInput = document.getElementById('attachPhotoInput');
  const composerMediaPreview = document.getElementById('composerMediaPreview');
  const composerPreviewImg = document.getElementById('composerPreviewImg');
  const composerPreviewBadge = document.getElementById('composerPreviewTypeBadge');
  const composerPreviewFileName = document.getElementById('composerPreviewFileName');
  const removeMediaBtn = document.getElementById('composerRemoveMediaBtn');
  const composerGifBtn = document.getElementById('composerGifBtn');

  function showComposerPreview() {
    if (!STATE.composerAttachment || !composerMediaPreview) return;
    composerPreviewImg.src = STATE.composerAttachment.url;
    composerPreviewBadge.textContent = STATE.composerAttachment.type === 'gif' ? '👾 Animated GIF' : '📷 Image Attachment';
    composerPreviewFileName.textContent = STATE.composerAttachment.name || 'image.png';
    composerMediaPreview.classList.remove('hidden');
  }

  function clearComposerPreview() {
    STATE.composerAttachment = null;
    if (composerMediaPreview) composerMediaPreview.classList.add('hidden');
    if (composerPreviewImg) composerPreviewImg.src = '';
    if (attachPhotoInput) attachPhotoInput.value = '';
  }

  attachPhotoInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('Image file too large (max 10MB).', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      STATE.composerAttachment = {
        type: 'image',
        url: evt.target.result,
        name: file.name
      };
      showComposerPreview();
      showToast('Image attached to draft! 📷', 'success');
    };
    reader.readAsDataURL(file);
  });

  removeMediaBtn?.addEventListener('click', () => {
    clearComposerPreview();
    showToast('Attachment removed.', 'info');
  });

  composerGifBtn?.addEventListener('click', () => {
    openGifPicker('composer');
  });

  // Drag and drop image import onto composer
  const composerCard = document.getElementById('composerCard');
  composerCard?.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  composerCard?.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        STATE.composerAttachment = {
          type: 'image',
          url: evt.target.result,
          name: file.name
        };
        showComposerPreview();
        showToast('Image dropped and attached! 📷', 'success');
      };
      reader.readAsDataURL(file);
    }
  });

  // Clipboard paste image import
  textarea?.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            STATE.composerAttachment = {
              type: 'image',
              url: evt.target.result,
              name: 'pasted-image.png'
            };
            showComposerPreview();
            showToast('Image pasted into draft! 📋', 'success');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  });

  // Real-time Auto-Moderation: Detect targeted personal attacks while typing
  textarea?.addEventListener('input', () => {
    const val = textarea.value;
    const civility = evaluateContentCivility(val);
    if (civility.isPersonalAttack) {
      if (modAlert) modAlert.classList.remove('hidden');
      if (modAlertText) {
        modAlertText.textContent = `Auto-moderation active: Targeted attack detected ("${civility.flaggedSnippet}"). Critique ideas forcefully ("that's stupid, dumb idea"), but remove personal attacks to publish.`;
      }
      textarea.style.borderColor = 'rgba(239, 68, 68, 0.7)';
      textarea.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.25)';
    } else {
      if (modAlert) modAlert.classList.add('hidden');
      textarea.style.borderColor = '';
      textarea.style.boxShadow = '';
    }
  });

  publishBtn?.addEventListener('click', async () => {
    if (!STATE.currentUser) {
      showToast('Please create or select your profile first!', 'warning');
      document.getElementById('registerModal').showModal();
      return;
    }

    const text = textarea.value.trim();
    if (!text && !STATE.composerAttachment) {
      showToast('Please write something or attach an image before publishing.', 'warning');
      return;
    }

    const interestSelect = document.getElementById('composerInterestSelect');
    const subtopicInput = document.getElementById('composerSubtopicInput');
    const mediaUrlInput = document.getElementById('composerMediaUrlInput');
    const visibilitySelect = document.getElementById('composerVisibilitySelect');

    const interest = interestSelect ? interestSelect.value : '';
    const subtopic = subtopicInput ? subtopicInput.value.trim() : '';
    const linkMediaUrl = mediaUrlInput ? mediaUrlInput.value.trim() : '';
    const visibility = visibilitySelect ? visibilitySelect.value : 'public';

    let finalMediaUrl = linkMediaUrl;
    let finalMediaType = linkMediaUrl ? 'link' : null;
    if (STATE.composerAttachment) {
      finalMediaUrl = STATE.composerAttachment.url;
      finalMediaType = STATE.composerAttachment.type;
    }

    // Run Ad Hominem Defense Check
    if (text) {
      const evaluation = evaluateContentCivility(text);
      if (evaluation.isPersonalAttack) {
        triggerAdHominemShield(evaluation.flaggedSnippet, text);
        return;
      }
    }

    try {
      const res = await apiRequest('/api/posts', 'POST', {
        host_id: STATE.activeHostId,
        text: text,
        interest: interest,
        subtopic: subtopic,
        visibility: visibility,
        mentioned_post_id: STATE.composerMentionedPostId,
        mentioned_user_ids: STATE.composerMentionedUserIds,
        media_url: finalMediaUrl || null,
        media_type: finalMediaType
      });

      textarea.value = '';
      if (subtopicInput) subtopicInput.value = '';
      if (mediaUrlInput) mediaUrlInput.value = '';

      // Reset mentions & attachments state
      STATE.composerMentionedPostId = null;
      STATE.composerMentionedUserIds = [];
      taggedChipWrap?.classList.add('hidden');
      if (taggedChipTitle) taggedChipTitle.textContent = '';
      userRecentPostsCache = null; // Invalidate cache
      clearComposerPreview();

      if (res.subtopics && STATE.currentUser) {
        STATE.currentUser.subtopics = res.subtopics;
        saveUserSession(STATE.currentUser);
      }

      if (res.is_open_thought) {
        showToast('Published as an Open Thought! Kept off Trending until a topic is added. 💭', 'info');
      } else if (subtopic) {
        showToast(`Post published! Sub-topic "${subtopic}" was automatically added to your profile sub-list. 🏷️`, 'success');
      } else {
        showToast('Post published successfully to the platform!', 'success');
      }
      loadPlatform(STATE.activeHostId, false);
    } catch (err) {
      showToast('Failed to publish post: ' + err.message, 'danger');
    }
  });
}

function evaluateContentCivility(text) {
  if (!text) return { isPersonalAttack: false };
  const lower = text.trim();
  const personalAttackMarkers = [
    // 1. Targeted personal insults: you're / ur / your / you are + [fillers] + insult noun
    /\b(you\s*['’]?\s*re|you\s+are|you\s+r|u\s+r|u\s+are|ur|u['’]re|your)\s+(all\s+)?(such\s+an?|acting\s+like\s+an?|being\s+an?|just\s+an?|an?|the)?\s*(fucking|f\*{1,4}ing|fkn|damn|total|absolute|complete|literal|massive|huge|real|pure|dumb|stupid)?\s*(asshole|a[- ]?hole|dick|dickhead|dumbfuck|dumb\s*fuck|dumbf[\*#@%]+k?|bitch|b!tch|cunt|c\*nt|prick|douche|douchebag|jackass|dipshit|shithead|moron|idiot|bastard|scumbag|loser|clown|piece\s+of\s+shit|pos|waste\s+of\s+space|scum)(?=\b|[\s.,!?;:)"']|$)/i,
    // 2. Targeted trait attacks: you're / ur / your / you are + [fillers] + insult adjective
    /\b(you\s*['’]?\s*re|you\s+are|you\s+r|u\s+r|u\s+are|ur|u['’]re|your)\s+(fucking|f\*{1,4}ing|fkn|damn|so|totally|absolutely|completely|truly|always|just|simply)?\s*(stupid|dumb|moronic|idiotic|pathetic|retarded|r-tarded|ugly|disgusting|braindead|brain-dead|delusional|vile|toxic|worthless)\b/i,
    // 3. Direct hostile commands and harassment
    /\b(shut\s+the\s+fuck\s+up|stfu|kill\s+yourself|kys|die\s+in\s+a\s+fire|eat\s+shit|go\s+fuck\s+yourself|fuck\s+you|f\*{2,4}\s+you|fuck\s+u)\b/i,
    // 4. Zero brain cells / intelligence attacks
    /\b(you|u)\s+(have|got|has)\s+(no|zero|literal(ly)?\s+no|\d)\s+brain\s*(cells?)?\b/i
  ];

  for (let pattern of personalAttackMarkers) {
    const match = lower.match(pattern);
    if (match) {
      return { isPersonalAttack: true, flaggedSnippet: match[0] };
    }
  }
  return { isPersonalAttack: false };
}

function triggerAdHominemShield(flaggedSnippet) {
  const modal = document.getElementById('adHominemModal');
  document.getElementById('flaggedQuoteText').textContent = `"${flaggedSnippet}"`;
  modal.showModal();

  document.getElementById('modalReviseBtn').onclick = () => {
    modal.close();
    document.getElementById('composerTextarea').focus();
    showToast('Take a breath! You can edit the post to critique the idea forcefully without attacking the person.', 'info');
  };

  document.getElementById('modalDismissBtn').onclick = () => {
    modal.close();
    document.getElementById('composerTextarea').value = '';
    showToast('Draft cancelled.', 'info');
  };
}

// --- THE COMMONS (MUTUAL AID MARKETPLACE) ---
function initCommonsMarketplace() {
  const filterBtns = document.querySelectorAll('.filter-pill');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.commonsFilter = btn.dataset.filter;
      renderCommonsGrid();
    });
  });

  document.getElementById('commonsSearchInput').addEventListener('input', (e) => {
    renderCommonsGrid(e.target.value.toLowerCase());
  });

  document.getElementById('openNewAidModalBtn').addEventListener('click', () => {
    if (!STATE.currentUser) {
      showToast('Please create or log into your profile first!', 'warning');
      document.getElementById('registerModal').showModal();
      return;
    }
    openNewAidModal();
  });
}

function renderCommonsGrid(searchQuery = '') {
  const grid = document.getElementById('commonsGrid');
  grid.innerHTML = '';

  // Update active request count for user
  const activeReqEl = document.getElementById('activeRequestCount');
  if (STATE.currentUser) {
    const myActiveReqs = STATE.commonsItems.filter(i => i.author_id === STATE.currentUser.id && i.type === 'request' && i.status === 'active').length;
    activeReqEl.textContent = `${myActiveReqs} / 1 (${myActiveReqs >= 1 ? 'Max Reached' : 'Available'})`;
  } else {
    activeReqEl.textContent = '0 / 1 (Available)';
  }

  const filtered = STATE.commonsItems.filter(item => {
    const matchesFilter = 
      STATE.commonsFilter === 'all' ||
      (STATE.commonsFilter === 'offer' && item.type === 'offer') ||
      (STATE.commonsFilter === 'request' && item.type === 'request') ||
      (STATE.commonsFilter === item.category);

    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery) ||
      item.desc.toLowerCase().includes(searchQuery) ||
      (item.location && item.location.toLowerCase().includes(searchQuery));

    return matchesFilter && matchesSearch;
  });

  filtered.forEach(item => {
    const isExample = item.is_example === 1;
    const card = document.createElement('div');
    card.className = `aid-card ${isExample ? 'example-listing' : ''}`;

    let imgHtml = '';
    if (item.image_url) {
      imgHtml = `<div class="aid-image-attachment"><img src="${item.image_url}" alt="${item.title}"></div>`;
    }

    card.innerHTML = `
      <div class="aid-card-top">
        ${isExample ? `
          <div class="example-listing-banner">
            <span>⚠️ ARCHIVED EXAMPLE LISTING — DEMO ONLY</span>
          </div>
        ` : ''}

        <div class="aid-badge-row">
          <span class="aid-type-badge ${item.type}">${item.type === 'offer' ? '🎁 Free Offer' : '🆘 Community Need'}</span>
          <span class="aid-category-tag">🏷️ ${item.category.toUpperCase()} • 📍 ${item.location || 'Local'}</span>
        </div>
        <h3 class="aid-title">${escapeHtml(item.title)}</h3>
        <p class="aid-desc">${escapeHtml(item.desc)}</p>
        ${imgHtml}
      </div>

      <div class="aid-card-bottom">
        <div class="aid-giver-row">
          <img src="${item.author_avatar || 'assets/avatar-p-default.svg'}" alt="${item.author_name}" class="aid-giver-avatar">
          <div>
            <span class="aid-giver-name">${item.author_name}</span>
            <span class="aid-giver-karma"> ⭐ ${item.karma || 0} Karma</span>
          </div>
        </div>

        <div class="aid-actions-row">
          ${isExample ? `
            <button class="btn btn-sm btn-disabled-demo" disabled title="This is an archived example listing for demonstration.">
              🔒 Read-Only Demo Listing
            </button>
          ` : `
            <button class="btn btn-sm btn-primary" onclick="claimAidItem('${item.id}')">
              ${item.type === 'offer' ? 'Claim / Connect' : 'Offer to Help'}
            </button>
            <button class="btn btn-sm btn-outline" onclick="openTipModal({name: '${item.author_name}'})">
              💝 Send Gratitude Tip
            </button>
          `}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

window.claimAidItem = function(itemId) {
  const item = STATE.commonsItems.find(i => i.id === itemId);
  if (!item) return;

  if (item.type === 'offer') {
    showToast(`Connected with ${item.author_name} to coordinate free receipt of "${item.title}". No payments permitted!`, 'success');
  } else {
    showToast(`You offered assistance to ${item.author_name}. Mutual aid solidarity in action!`, 'success');
  }
};

function openNewAidModal() {
  if (!STATE.currentUser) {
    showToast('Please log in before posting mutual aid in The Commons.', 'warning');
    window.location.href = '/login.html';
    return;
  }

  // Enforce Commons ID + Selfie Verification
  if (STATE.currentUser.commons_verified !== 1 && STATE.currentUser.is_admin !== 1) {
    showToast('Community Verification Required: Please upload a picture of yourself and your ID before posting.', 'info');
    document.getElementById('commonsVerificationModal').showModal();
    return;
  }

  const modal = document.getElementById('newAidModal');
  const warning = document.getElementById('requestWarningNotice');
  const typeRadios = document.querySelectorAll('input[name="aidType"]');
  const submitBtn = document.getElementById('submitAidBtn');

  const userActiveRequests = STATE.currentUser ? 
    STATE.commonsItems.filter(i => i.author_id === STATE.currentUser.id && i.type === 'request' && i.status === 'active').length : 0;

  function updateNotice() {
    const selectedType = document.querySelector('input[name="aidType"]:checked').value;
    if (selectedType === 'request' && userActiveRequests >= 1) {
      warning.classList.remove('hidden');
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
    } else {
      warning.classList.add('hidden');
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    }
  }

  typeRadios.forEach(r => r.addEventListener('change', updateNotice));
  updateNotice();

  modal.showModal();

  submitBtn.onclick = async () => {
    const title = document.getElementById('aidItemTitle').value.trim();
    const cat = document.getElementById('aidItemCategory').value;
    const desc = document.getElementById('aidItemDesc').value.trim();
    const type = document.querySelector('input[name="aidType"]:checked').value;

    if (!title || !desc) {
      showToast('Please fill out all listing fields.', 'warning');
      return;
    }

    try {
      await apiRequest('/api/commons', 'POST', {
        type,
        category: cat,
        title,
        desc,
        location: STATE.currentUser.location || 'Local'
      });

      modal.close();
      showToast(`Mutual aid ${type} successfully published!`, 'success');
      await refreshCommons();
    } catch (err) {
      showToast('Listing failed: ' + err.message, 'danger');
    }
  };

  document.getElementById('cancelAidModalBtn').onclick = () => modal.close();
}

// --- TIP / GRATITUDE MODAL ---
function openTipModal(recipient) {
  const modal = document.getElementById('tipModal');
  document.getElementById('tipRecipientName').textContent = recipient.name || 'Member';

  let chosenAmount = 3;
  const tipBtns = modal.querySelectorAll('.tip-pill-btn');
  tipBtns.forEach(btn => {
    btn.onclick = () => {
      tipBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chosenAmount = btn.dataset.amount;
      document.getElementById('confirmTipBtn').textContent = `Send $${chosenAmount} Tip of Gratitude`;
    };
  });

  document.getElementById('confirmTipBtn').onclick = () => {
    modal.close();
    showToast(`Sent a $${chosenAmount} voluntary gift of gratitude to ${recipient.name}! 💝`, 'success');
  };

  document.getElementById('cancelTipBtn').onclick = () => modal.close();
  modal.showModal();
}

// --- REGISTRATION & PROOF OF HUMANITY ---
function initEntropyTracker() {
  document.addEventListener('mousemove', (e) => {
    const dx = e.clientX - STATE.entropyCollector.lastCoord.x;
    const dy = e.clientY - STATE.entropyCollector.lastCoord.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    STATE.entropyCollector.jitterSum += dist;
    STATE.entropyCollector.mouseMoves++;
    STATE.entropyCollector.lastCoord = { x: e.clientX, y: e.clientY };

    updateEntropyBar();
  });

  document.addEventListener('keydown', () => {
    STATE.entropyCollector.keyPresses++;
    updateEntropyBar();
  });
}

function updateEntropyBar() {
  const fill = document.getElementById('entropyBarFill');
  const label = document.getElementById('liveEntropyDisplay');
  if (!fill || !label) return;

  const moves = STATE.entropyCollector.mouseMoves;
  const score = Math.min(1.0, Math.max(0.2, (moves + STATE.entropyCollector.keyPresses * 2) / 60));
  const percent = Math.round(score * 100);

  fill.style.width = `${percent}%`;
  label.textContent = `${percent}% (Natural Human Jitter Detected)`;
}

function initRegistrationModal() {
  const modal = document.getElementById('registerModal');
  const openBtn = document.getElementById('navRegisterBtn');
  const cancelBtn = document.getElementById('cancelRegisterBtn');
  const submitBtn = document.getElementById('submitRegisterBtn');

  openBtn.addEventListener('click', () => {
    STATE.entropyCollector.startTime = Date.now();
    modal.showModal();
  });

  cancelBtn.addEventListener('click', () => modal.close());

  submitBtn.addEventListener('click', async () => {
    const name = document.getElementById('regName').value.trim();
    const handle = document.getElementById('regHandle').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword') ? document.getElementById('regPassword').value : '';
    const phone = document.getElementById('regPhone').value.trim();
    const bio = document.getElementById('regBio').value.trim();
    const location = document.getElementById('regLocation').value.trim();
    const dob = document.getElementById('regDob') ? document.getElementById('regDob').value : '';
    const showZodiac = document.getElementById('regShowZodiac') ? (document.getElementById('regShowZodiac').checked ? 1 : 0) : 1;
    const motto = document.getElementById('regMotto') ? document.getElementById('regMotto').value.trim() : '';
    const privacy = document.getElementById('regPrivacy').value;
    const youtube_url = document.getElementById('regYoutubeUrl') ? document.getElementById('regYoutubeUrl').value.trim() : '';
    const music_title = document.getElementById('regMusicTitle').value.trim() || 'Ambient Vibes';
    const aesthetic_name = document.getElementById('regAesthetic').value;

    const avatarRadio = document.querySelector('input[name="avatarChoice"]:checked');
    const avatar = avatarRadio ? avatarRadio.value : 'assets/avatar-p-default.svg';

    const bannerRadio = document.querySelector('input[name="bannerChoice"]:checked');
    const banner = bannerRadio ? bannerRadio.value : 'assets/maya-banner.jpg';

    if (!name || !handle || !email || !password) {
      showToast('Please provide your name, handle, email address, and a secure password.', 'warning');
      return;
    }

    const elapsed = Date.now() - STATE.entropyCollector.startTime;
    const entropyScore = Math.min(1.0, Math.max(0.4, (STATE.entropyCollector.mouseMoves + STATE.entropyCollector.keyPresses) / 80));

    try {
      const res = await apiRequest('/api/register', 'POST', {
        name,
        handle,
        email,
        password,
        phone,
        bio,
        location,
        dob,
        show_zodiac: showZodiac,
        motto,
        privacy,
        youtube_url,
        music_title,
        music_source: 'YouTube Audio Link',
        aesthetic_name,
        avatar,
        banner,
        passions: STATE.regPassions || [],
        avatars: [avatar],
        entropy: entropyScore,
        completionTimeMs: elapsed
      });

      modal.close();
      saveUserSession(res.user);

      showToast(`Welcome ${res.user.name}! Your Platform is live. ${res.is_admin ? 'You are the Root Admin 🛡️' : ''}`, 'success');

      await refreshUsers();
      switchToPlatformTab(res.user.id, false);
    } catch (err) {
      showToast('Registration failed: ' + err.message, 'danger');
    }
  });
}

// --- ADMIN COMMAND CENTER (ANTI-BOT & SYBIL DEFENSE) ---
async function loadAdminDashboardData() {
  try {
    const data = await apiRequest('/api/admin/bot-monitor');
    const signups = data.signups || [];
    const bannedIps = data.banned_ips || [];
    const logs = data.audit_logs || [];

    // Metrics
    document.getElementById('totalSignupsCount').textContent = signups.length;
    const bots = signups.filter(s => s.bot_score >= 0.70 || s.is_banned === 1);
    document.getElementById('flaggedBotsCount').textContent = bots.length;
    document.getElementById('bannedIpsCount').textContent = bannedIps.length;
    document.getElementById('verifiedHumansCount').textContent = signups.length - bots.length;

    // Render Table
    const tbody = document.getElementById('signupsTableBody');
    tbody.innerHTML = '';

    signups.forEach(u => {
      const tr = document.createElement('tr');
      const isBot = u.bot_score >= 0.70 || u.is_banned === 1;
      const flags = JSON.parse(u.bot_flags || '[]');

      tr.innerHTML = `
        <td>
          <div class="table-user-cell">
            <img src="${u.avatar || 'assets/avatar-p-default.svg'}" alt="${u.name}" class="table-user-avatar">
            <div>
              <span class="table-user-name">${u.name}</span>
              <span class="table-user-handle">${u.handle}</span>
            </div>
          </div>
        </td>
        <td><code>${u.registered_ip || '127.0.0.1'}</code></td>
        <td>
          <span class="bot-score-badge ${isBot ? 'high' : 'low'}">
            ${isBot ? '⚠️' : '✅'} ${(u.bot_score * 100).toFixed(0)}%
          </span>
        </td>
        <td>
          <div class="flag-tags">
            ${flags.length > 0 ? flags.map(f => `<span class="flag-pill danger">${f}</span>`).join('') : '<span class="flag-pill">Clean Human Telemetry</span>'}
          </div>
        </td>
        <td>${((u.entropy_score || 0.95) * 100).toFixed(0)}%</td>
        <td>
          <button class="btn-admin-toggle" onclick="toggleAdminPriv('${u.id}')">
            ${u.is_admin ? '⭐ Admin (Active)' : 'Grant Admin'}
          </button>
        </td>
        <td>
          ${u.is_banned ? `
            <span style="color:#f43f5e; font-weight:bold; font-size:0.8rem;">🚫 PERMA-BANNED</span>
          ` : `
            <button class="btn-instaban" onclick="instaBanTarget('${u.id}', '${u.registered_ip}')">
              🔴 Insta-Ban IP &amp; Perma-Ban
            </button>
          `}
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Render Banned IPs
    const ipContainer = document.getElementById('bannedIpsList');
    ipContainer.innerHTML = bannedIps.length === 0 ? '<p style="color:var(--theme-text-dim); padding:10px;">No IPs blacklisted.</p>' : '';
    bannedIps.forEach(b => {
      const div = document.createElement('div');
      div.className = 'banned-ip-item';
      div.innerHTML = `
        <div>
          <strong>${b.ip}</strong>
          <div style="font-size:0.72rem; color:var(--theme-text-dim);">${b.reason || 'Bot Swarm Signature'}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="unbanIpAddress('${b.ip}')">Unban IP</button>
      `;
      ipContainer.appendChild(div);
    });

    // Render Audit Logs
    const logContainer = document.getElementById('auditLogList');
    logContainer.innerHTML = '';
    logs.forEach(l => {
      const div = document.createElement('div');
      div.className = 'audit-log-item';
      div.innerHTML = `
        <span class="audit-time">${new Date(l.created_at * 1000).toLocaleTimeString()}</span>
        <strong>[${l.action}]</strong> ${escapeHtml(l.details || '')}
      `;
      logContainer.appendChild(div);
    });

  } catch (err) {
    showToast('Failed to load admin telemetry: ' + err.message, 'danger');
  }
}

window.instaBanTarget = async function(userId, ip) {
  if (!confirm(`Are you sure you want to permanently BAN user ${userId} and INSTA-BAN their IP address ${ip}?`)) {
    return;
  }

  try {
    await apiRequest('/api/admin/insta-ban', 'POST', {
      user_id: userId,
      ip: ip,
      reason: 'Confirmed Automated Bot Swarm Violation (Admin Action)'
    });
    showToast(`Insta-banned IP ${ip} and permanently terminated account.`, 'success');
    await loadAdminDashboardData();
    await refreshUsers();
  } catch (err) {
    showToast('Ban action failed: ' + err.message, 'danger');
  }
};

window.toggleAdminPriv = async function(userId) {
  try {
    const res = await apiRequest('/api/admin/toggle-admin', 'POST', { user_id: userId });
    showToast(res.message, 'success');
    await loadAdminDashboardData();
    await refreshUsers();
  } catch (err) {
    showToast('Admin update failed: ' + err.message, 'danger');
  }
};

window.unbanIpAddress = async function(ip) {
  try {
    await apiRequest('/api/admin/unban-ip', 'POST', { ip });
    showToast(`IP ${ip} unbanned.`, 'success');
    await loadAdminDashboardData();
  } catch (err) {
    showToast('Unban failed: ' + err.message, 'danger');
  }
};

// --- SEARCH ENGINE ---
function initSearch() {
  const input = document.getElementById('globalSearchInput');
  const dropdown = document.getElementById('searchResultsDropdown');

  input.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      dropdown.classList.add('hidden');
      return;
    }

    const matches = STATE.usersList.filter(u => {
      return (
        u.name.toLowerCase().includes(q) ||
        u.handle.toLowerCase().includes(q) ||
        (u.location && u.location.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q))
      );
    });

    if (matches.length === 0) {
      dropdown.innerHTML = `<div style="padding: 12px; font-size: 0.85rem; color: var(--theme-text-dim);">No human platforms found matching "${escapeHtml(q)}"</div>`;
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = matches.map(u => `
      <div class="search-item" onclick="selectSearchedUser('${u.id}')">
        <img src="${u.avatar || 'assets/avatar-p-default.svg'}" alt="${u.name}" class="search-item-avatar">
        <div class="search-item-info">
          <div class="search-item-name">
            ${u.name} 
            <span style="font-family: var(--theme-font-mono); font-size: 0.75rem; color: var(--theme-primary);">${u.handle}</span>
            ${u.is_example ? '<span style="font-size:0.65rem; color:#fbbf24;">[AI Example]</span>' : ''}
          </div>
          <div class="search-item-details">${u.location ? '📍 ' + u.location : ''} • ${u.email || ''}</div>
        </div>
      </div>
    `).join('');

    dropdown.classList.remove('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) dropdown.classList.add('hidden');
  });
}

window.selectSearchedUser = function(userId) {
  document.getElementById('searchResultsDropdown').classList.add('hidden');
  document.getElementById('globalSearchInput').value = '';
  switchToPlatformTab(userId, true);
};

// --- MODAL UTILITIES ---
function initModals() {
  document.querySelectorAll('dialog').forEach(modal => {
    modal.addEventListener('click', (e) => {
      const rect = modal.getBoundingClientRect();
      const inBox = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
      );
      if (!inBox) modal.close();
    });
  });
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'danger' ? '⛔' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- HELPERS ---
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Recently';
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1/3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1/3);
  }
  return "#" + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

// --- AUTHENTICATION & LOGIN MODAL ---
function initLoginModal() {
  const modal = document.getElementById('loginModal');
  const openBtn = document.getElementById('navLoginBtn');
  const cancelBtn = document.getElementById('cancelLoginBtn');
  const submitBtn = document.getElementById('submitLoginBtn');
  const switchLink = document.getElementById('switchFromLoginToRegisterLink');
  const errorMsg = document.getElementById('loginErrorMsg');

  if (openBtn && openBtn.tagName !== 'A') {
    openBtn.addEventListener('click', () => {
      errorMsg.classList.add('hidden');
      errorMsg.textContent = '';
      modal.showModal();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => modal.close());
  }

  if (switchLink) {
    switchLink.addEventListener('click', (e) => {
      e.preventDefault();
      modal.close();
      document.getElementById('registerModal').showModal();
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const emailOrHandle = document.getElementById('loginEmailOrHandle').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!emailOrHandle || !password) {
        errorMsg.textContent = 'Please enter both email/handle and password.';
        errorMsg.classList.remove('hidden');
        return;
      }

      errorMsg.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      try {
        const res = await apiRequest('/api/login', 'POST', {
          email: emailOrHandle,
          password: password
        });

        modal.close();
        saveUserSession(res.user);
        document.getElementById('loginPassword').value = '';

        showToast(`Welcome back, ${res.user.name}! 🌟 You are authenticated.`, 'success');
        await refreshUsers();
        switchToPlatformTab(res.user.id, false);
      } catch (err) {
        errorMsg.textContent = err.message || 'Login failed. Please check your credentials.';
        errorMsg.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🔑 Log In to Platform';
      }
    });
  }
}

// --- USER DROPDOWN & LOGOUT ---
function initUserDropdownMenu() {
  const chip = document.getElementById('currentUserChip');
  const menu = document.getElementById('userDropdownMenu');
  const myPlatformBtn = document.getElementById('menuMyPlatformBtn');
  const editProfileBtn = document.getElementById('menuEditProfileBtn');
  const logoutBtn = document.getElementById('menuLogoutBtn');

  if (chip && menu) {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!STATE.currentUser) {
        document.getElementById('loginModal').showModal();
      } else {
        menu.classList.toggle('hidden');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-chip-wrapper')) {
        menu.classList.add('hidden');
      }
    });
  }

  if (myPlatformBtn) {
    myPlatformBtn.addEventListener('click', () => {
      menu.classList.add('hidden');
      if (STATE.currentUser) {
        switchToPlatformTab(STATE.currentUser.id, false);
      }
    });
  }

  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
      menu.classList.add('hidden');
      openEditProfileModal();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      menu.classList.add('hidden');
      localStorage.removeItem('theplatform_user');
      STATE.currentUser = null;
      updateUserChipUI();
      showToast('Logged out of platform. You are now browsing as a visitor.', 'info');
      document.getElementById('navTabTopics')?.click();
    });
  }
}

// --- EDIT PROFILE MODAL ---
function initEditProfileModal() {
  const modal = document.getElementById('editProfileModal');
  const openBtn = document.getElementById('editPlatformBtn');
  const cancelBtn = document.getElementById('cancelEditProfileBtn');
  const saveBtn = document.getElementById('saveEditProfileBtn');
  const addSubtopicBtn = document.getElementById('addManualSubtopicBtn');
  const manualSubtopicInput = document.getElementById('manualSubtopicInput');

  if (openBtn) {
    openBtn.addEventListener('click', () => openEditProfileModal());
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => modal.close());
  }

  const addManualSubtopicAction = () => {
    if (!manualSubtopicInput) return;
    const val = manualSubtopicInput.value.trim();
    if (!val) return;
    if (!STATE.editSubtopics.includes(val)) {
      STATE.editSubtopics.push(val);
      renderEditSubtopicsList();
      showToast(`Added sub-topic "${val}"`, 'info');
    }
    manualSubtopicInput.value = '';
  };

  if (addSubtopicBtn) {
    addSubtopicBtn.addEventListener('click', addManualSubtopicAction);
  }

  if (manualSubtopicInput) {
    manualSubtopicInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addManualSubtopicAction();
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!STATE.currentUser) return;

      const name = document.getElementById('editName').value.trim();
      const bio = document.getElementById('editBio').value.trim();
      const location = document.getElementById('editLocation').value.trim();
      const dob = document.getElementById('editDob') ? document.getElementById('editDob').value : '';
      const showZodiac = document.getElementById('editShowZodiac') ? (document.getElementById('editShowZodiac').checked ? 1 : 0) : 1;
      const motto = document.getElementById('editMotto') ? document.getElementById('editMotto').value.trim() : '';
      const playlist = [];
      const t1Title = document.getElementById('editTrack1Title')?.value.trim();
      const t1Url = document.getElementById('editTrack1Url')?.value.trim();
      if (t1Url) playlist.push({ title: t1Title || 'Track 1', url: t1Url });

      const t2Title = document.getElementById('editTrack2Title')?.value.trim();
      const t2Url = document.getElementById('editTrack2Url')?.value.trim();
      if (t2Url) playlist.push({ title: t2Title || 'Track 2', url: t2Url });

      const t3Title = document.getElementById('editTrack3Title')?.value.trim();
      const t3Url = document.getElementById('editTrack3Url')?.value.trim();
      if (t3Url) playlist.push({ title: t3Title || 'Track 3', url: t3Url });

      const youtube_url = playlist[0]?.url || document.getElementById('editYoutubeUrl')?.value.trim() || '';
      const music_title = playlist[0]?.title || document.getElementById('editMusicTitle')?.value.trim() || 'Ambient Theme';
      const privacy = document.getElementById('editPrivacy').value;
      const aesthetic_name = document.getElementById('editAesthetic').value;
      const banner = document.getElementById('editBannerPreviewImg').src;
      const avatar = STATE.editActiveAvatar || STATE.currentUser.avatar || 'assets/avatar-p-default.svg';

      if (!name) {
        showToast('Display Name cannot be empty.', 'warning');
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const res = await apiRequest('/api/users/update', 'POST', {
          user_id: STATE.currentUser ? STATE.currentUser.id : 'usr-adam',
          handle: STATE.currentUser ? STATE.currentUser.handle : '@adam',
          email: STATE.currentUser ? STATE.currentUser.email : 'mracrawford@gmail.com',
          name,
          bio,
          location,
          dob,
          show_zodiac: showZodiac,
          motto,
          youtube_url,
          music_title: music_title || 'Ambient Theme',
          playlist: playlist,
          privacy,
          aesthetic_name,
          banner,
          avatar,
          avatars: STATE.editAvatars,
          passions: STATE.editPassions,
          subtopics: STATE.editSubtopics
        });

        modal.close();
        saveUserSession(res.user);
        showToast('Platform profile & aesthetics successfully updated! ✨', 'success');

        if (STATE.activeHostId === res.user.id) {
          const hostBanner = document.getElementById('hostBannerImg');
          if (hostBanner && res.user.banner) {
            hostBanner.src = res.user.banner;
          }
          extractPaletteFromImage(res.user.banner, res.user.font_heading, res.user.font_body);
        }

        await refreshUsers();
        await loadPlatform(res.user.id, false);
      } catch (err) {
        showToast('Profile update failed: ' + err.message, 'danger');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Profile & Re-Theme';
      }
    });
  }
}

function openEditProfileModal() {
  if (!STATE.currentUser) {
    document.getElementById('loginModal').showModal();
    return;
  }

  const u = STATE.currentUser;
  const modal = document.getElementById('editProfileModal');

  document.getElementById('editName').value = u.name || '';
  document.getElementById('editBio').value = u.bio || '';
  document.getElementById('editLocation').value = u.location || '';

  if (document.getElementById('editMotto')) {
    document.getElementById('editMotto').value = u.motto || '';
    updateMottoWordCount('editMotto', 'editMottoCounter');
  }

  const editDobInput = document.getElementById('editDob');
  if (editDobInput) {
    editDobInput.value = u.dob || '';
    const z = computeClientZodiac(u.dob);
    const prev = document.getElementById('editZodiacPreview');
    if (prev) prev.textContent = z ? `Zodiac: ${z}` : '';
  }
  const editShowZodiacCb = document.getElementById('editShowZodiac');
  if (editShowZodiacCb) {
    editShowZodiacCb.checked = (u.show_zodiac !== 0 && u.show_zodiac !== '0');
  }

  // Playlist tracks loading
  let playlist = [];
  try {
    playlist = typeof u.playlist === 'string' ? JSON.parse(u.playlist) : (u.playlist || []);
  } catch {
    playlist = [];
  }
  if (!Array.isArray(playlist) || playlist.length === 0) {
    if (u.youtube_url) {
      playlist = [{ title: u.music_title || 'Track 1', url: u.youtube_url }];
    }
  }
  if (document.getElementById('editTrack1Title')) document.getElementById('editTrack1Title').value = playlist[0]?.title || '';
  if (document.getElementById('editTrack1Url')) document.getElementById('editTrack1Url').value = playlist[0]?.url || '';
  if (document.getElementById('editTrack2Title')) document.getElementById('editTrack2Title').value = playlist[1]?.title || '';
  if (document.getElementById('editTrack2Url')) document.getElementById('editTrack2Url').value = playlist[1]?.url || '';
  if (document.getElementById('editTrack3Title')) document.getElementById('editTrack3Title').value = playlist[2]?.title || '';
  if (document.getElementById('editTrack3Url')) document.getElementById('editTrack3Url').value = playlist[2]?.url || '';

  document.getElementById('editYoutubeUrl').value = u.youtube_url || '';
  document.getElementById('editMusicTitle').value = u.music_title || '';
  document.getElementById('editPrivacy').value = u.privacy || 'public';
  document.getElementById('editAesthetic').value = u.aesthetic_name || 'Modernist';
  document.getElementById('editBannerPreviewImg').src = u.banner || 'assets/maya-banner.jpg';

  // Passions
  let passions = [];
  try {
    passions = typeof u.passions === 'string' ? JSON.parse(u.passions) : (u.passions || []);
  } catch {
    passions = [];
  }
  STATE.editPassions = Array.isArray(passions) ? [...passions] : [];
  renderPassionsChips('editPassionsChipsContainer', STATE.editPassions);

  // Sub-topics
  let subtopics = [];
  try {
    subtopics = typeof u.subtopics === 'string' ? JSON.parse(u.subtopics) : (u.subtopics || []);
  } catch {
    subtopics = [];
  }
  STATE.editSubtopics = (Array.isArray(subtopics) ? subtopics : []).map(st =>
    typeof st === 'object' && st !== null ? (st.subtopic || '') : String(st)
  ).filter(Boolean);
  renderEditSubtopicsList();

  // Avatars
  let avatars = [];
  try {
    avatars = typeof u.avatars === 'string' ? JSON.parse(u.avatars) : (u.avatars || [u.avatar]);
  } catch {
    avatars = [u.avatar];
  }
  if (!avatars || avatars.length === 0) avatars = [u.avatar || 'assets/avatar-p-default.svg'];
  STATE.editAvatars = [...avatars];
  STATE.editActiveAvatar = u.avatar || 'assets/avatar-p-default.svg';
  renderEditAvatarsGallery();

  modal.showModal();
}

function renderEditSubtopicsList() {
  const container = document.getElementById('editSubtopicsContainer');
  if (!container) return;

  if (!STATE.editSubtopics || STATE.editSubtopics.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No sub-topics scraped yet. Post on your platform with a sub-topic (e.g. "Hardcore" for Music) or add one manually below.</span>';
    return;
  }

  container.innerHTML = STATE.editSubtopics.map((st, idx) => `
    <span class="subtopic-chip">
      <span>🏷️ ${escapeHtml(st)}</span>
      <button type="button" class="subtopic-chip-del" onclick="window.removeSubtopic(${idx})" title="Remove sub-topic">&times;</button>
    </span>
  `).join('');
}

window.removeSubtopic = function(idx) {
  if (STATE.editSubtopics && STATE.editSubtopics[idx] !== undefined) {
    STATE.editSubtopics.splice(idx, 1);
    renderEditSubtopicsList();
  }
};

function renderEditAvatarsGallery() {
  const container = document.getElementById('editAvatarsGallery');
  if (!container) return;

  container.innerHTML = STATE.editAvatars.map(url => `
    <div class="edit-avatar-thumb ${url === STATE.editActiveAvatar ? 'active' : ''}" 
         onclick="selectEditActiveAvatar('${escapeHtml(url)}')">
      <img src="${escapeHtml(url)}" alt="Avatar">
    </div>
  `).join('');
}

window.selectEditActiveAvatar = function(url) {
  STATE.editActiveAvatar = url;
  renderEditAvatarsGallery();
};

// --- PASSIONS & PURSUITS SYSTEM ---
function initPassionsSystem() {
  // Render initial registration passions
  renderPassionsChips('regPassionsChipsContainer', STATE.regPassions);

  const regTrigger = document.getElementById('regPassionsTriggerBox');
  const editTrigger = document.getElementById('editPassionsTriggerBox');
  const modal = document.getElementById('passionsPopupModal');
  const confirmBtn = document.getElementById('confirmPassionsBtn');
  const cancelBtn = document.getElementById('cancelPassionsBtn');

  if (regTrigger) {
    regTrigger.addEventListener('click', () => openPassionsModal('reg'));
  }

  if (editTrigger) {
    editTrigger.addEventListener('click', () => openPassionsModal('edit'));
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => modal.close());
  }

  // Checkbox change listener across all categories + scraped subtopics
  if (modal) {
    modal.addEventListener('change', (e) => {
      if (e.target && e.target.type === 'checkbox') {
        const checked = modal.querySelectorAll('input[type="checkbox"]:checked');
        const countDisplay = document.getElementById('passionsSelectedCountDisplay');
        if (countDisplay) countDisplay.textContent = checked.length;
      }
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const checkedBoxes = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked'));
      const selected = checkedBoxes.map(cb => cb.value);

      if (STATE.activePassionsTarget === 'reg') {
        STATE.regPassions = selected;
        renderPassionsChips('regPassionsChipsContainer', STATE.regPassions);
      } else {
        STATE.editPassions = selected;
        renderPassionsChips('editPassionsChipsContainer', STATE.editPassions);
      }

      modal.close();
      showToast(`Selected ${selected.length} passions! The top three will be featured beside your platform header.`, 'success');
    });
  }
}

function openPassionsModal(target) {
  STATE.activePassionsTarget = target;
  const currentList = target === 'reg' ? STATE.regPassions : STATE.editPassions;
  const modal = document.getElementById('passionsPopupModal');

  // Populate scraped niches card
  const scrapedCard = document.getElementById('passionsScrapedCard');
  const scrapedList = document.getElementById('passionsScrapedList');
  if (scrapedCard && scrapedList) {
    let subtopics = [];
    if (target === 'edit' && STATE.currentUser) {
      subtopics = STATE.editSubtopics || [];
      if ((!subtopics || subtopics.length === 0) && STATE.currentUser.subtopics) {
        try {
          const parsed = typeof STATE.currentUser.subtopics === 'string'
            ? JSON.parse(STATE.currentUser.subtopics)
            : STATE.currentUser.subtopics;
          subtopics = (Array.isArray(parsed) ? parsed : []).map(st =>
            typeof st === 'object' && st !== null ? (st.subtopic || '') : String(st)
          ).filter(Boolean);
        } catch { subtopics = []; }
      }
    }

    if (subtopics && subtopics.length > 0) {
      scrapedCard.style.display = 'block';
      scrapedList.innerHTML = subtopics.map(st => `
        <label class="passion-checkbox-label">
          <input type="checkbox" value="${escapeHtml(st)}">
          <span>🏷️ ${escapeHtml(st)} <small style="color:var(--text-muted); font-size:0.75rem;">(Post Niche)</small></span>
        </label>
      `).join('');
    } else {
      scrapedCard.style.display = 'none';
      scrapedList.innerHTML = '';
    }
  }

  const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = currentList.includes(cb.value);
  });

  const checkedCount = modal.querySelectorAll('input[type="checkbox"]:checked').length;
  const countDisplay = document.getElementById('passionsSelectedCountDisplay');
  if (countDisplay) countDisplay.textContent = checkedCount;

  modal.showModal();
}

function renderPassionsChips(containerId, list) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<span class="passion-empty-placeholder">Click to select your passions & pursuits from pregenerated lists...</span>';
    return;
  }

  container.innerHTML = list.map((p, idx) => `
    <span class="passion-chip-tag ${idx < 3 ? 'top-three' : ''}">
      <span>${escapeHtml(p)}</span>
      ${idx < 3 ? '<span style="font-size:0.65rem; color:#fbbf24; font-weight:800;">[Top 3]</span>' : ''}
    </span>
  `).join('');
}

function renderTopPassions(passionsData) {
  const container = document.getElementById('profileTopPassions');
  if (!container) return;

  let list = [];
  try {
    list = typeof passionsData === 'string' ? JSON.parse(passionsData) : (passionsData || []);
  } catch {
    list = [];
  }

  const top3 = (Array.isArray(list) ? list : []).slice(0, 3);
  if (top3.length === 0) {
    container.innerHTML = '<span class="passion-empty-placeholder">Passions not yet declared</span>';
    return;
  }

  const PASSION_ICONS = {
    'Martial Arts': '🥋',
    'Working Out': '🏃',
    'Weightlifting': '🏋️',
    'Yoga & Meditation': '🧘',
    'Boxing & Combat': '🥊',
    'Running': '👟',
    'Cycling': '🚴',
    'Climbing & Bouldering': '🧗',
    'Swimming': '🏊',
    'Hiking & Outdoors': '🥾',
    'Reading': '📚',
    'Studying': '📖',
    'Philosophy': '💭',
    'Science & Math': '🔬',
    'History': '🏺',
    'Languages & Linguistics': '🗣️',
    'Technology': '💻',
    'Astronomy': '🔭',
    'Architecture': '🏛️',
    'Music': '🎵',
    'Movies': '🎬',
    'Art & Design': '🎨',
    'Writing': '✍️',
    'Poetry': '📜',
    'Photography': '📷',
    'Woodworking': '🪵',
    'Crafts': '🧶',
    'Gaming': '🎮',
    'Baking': '🍞',
    'Cooking': '🍳',
    'Gardening': '🌿',
    'Coffee & Tea': '☕'
  };
  const fallbackIcons = ['🎛️', '🌿', '🤝', '📚', '🎨', '✨'];

  container.innerHTML = top3.map((p, i) => {
    const icon = PASSION_ICONS[p] || fallbackIcons[i % fallbackIcons.length];
    return `
      <span class="passion-badge" title="Core Passion: ${escapeHtml(p)}">
        <span class="passion-badge-icon">${icon}</span>
        <span>${escapeHtml(p)}</span>
      </span>
    `;
  }).join('');
}

// --- PHOTO REEL & MULTIPLE AVATARS SWAPPING ---
function initAvatarReel() {
  const quickUpload = document.getElementById('reelUploadInput');
  const modalUpload = document.getElementById('editAvatarUploadInput');

  if (quickUpload) {
    quickUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !STATE.currentUser) return;
      quickUpload.value = '';

      launchAvatarCropper(file, async (croppedDataUrl) => {
        try {
          const res = await apiRequest('/api/users/add-avatar', 'POST', { avatar: croppedDataUrl });
          STATE.currentUser.avatar = res.avatar;
          STATE.currentUser.avatars = res.avatars;
          saveUserSession(STATE.currentUser);

          document.getElementById('hostAvatarImg').src = res.avatar;
          renderAvatarReel(res.avatars, res.avatar, true);
          showToast('Profile picture centered, cropped & set as active! 📸', 'success');
          await refreshUsers();
        } catch (err) {
          showToast('Failed to add photo: ' + err.message, 'danger');
        }
      });
    });
  }

  if (modalUpload) {
    modalUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      modalUpload.value = '';

      launchAvatarCropper(file, (croppedDataUrl) => {
        if (!STATE.editAvatars.includes(croppedDataUrl)) {
          STATE.editAvatars.push(croppedDataUrl);
        }
        STATE.editActiveAvatar = croppedDataUrl;
        renderEditAvatarsGallery();
        showToast('Photo cropped and added to gallery! Save profile to confirm. ✨', 'info');
      });
    });
  }
}

function renderAvatarReel(avatarsData, activeAvatar, isOwner) {
  const strip = document.getElementById('avatarReelStrip');
  const addBtn = document.getElementById('reelUploadBtn');
  if (!strip) return;

  if (addBtn) {
    addBtn.style.display = isOwner ? 'inline-flex' : 'none';
  }

  let list = [];
  try {
    list = typeof avatarsData === 'string' ? JSON.parse(avatarsData) : (avatarsData || []);
  } catch {
    list = [];
  }

  if (!list || list.length === 0) {
    list = [activeAvatar || 'assets/avatar-p-default.svg'];
  }
  if (activeAvatar && !list.includes(activeAvatar)) {
    list.unshift(activeAvatar);
  }

  strip.innerHTML = list.map(url => `
    <div class="avatar-reel-thumb ${url === activeAvatar ? 'active' : ''}" 
         title="${url === activeAvatar ? 'Active Profile Picture' : 'Click to swap active profile picture'}"
         onclick="handleAvatarSwap('${escapeHtml(url)}')">
      <img src="${escapeHtml(url)}" alt="Avatar Photo">
    </div>
  `).join('');
}

window.handleAvatarSwap = async function(avatarUrl) {
  const hostId = STATE.activeHostId;
  const isOwner = STATE.currentUser && STATE.currentUser.id === hostId;

  if (isOwner) {
    try {
      const res = await apiRequest('/api/users/swap-avatar', 'POST', { avatar: avatarUrl });
      STATE.currentUser.avatar = res.avatar;
      STATE.currentUser.avatars = res.avatars;
      saveUserSession(STATE.currentUser);

      document.getElementById('hostAvatarImg').src = res.avatar;
      renderAvatarReel(res.avatars, res.avatar, true);
      showToast('Swapped active profile picture! ✨', 'success');
      await refreshUsers();
    } catch (err) {
      showToast('Avatar swap failed: ' + err.message, 'danger');
    }
  } else {
    // Visitor previewing the creator's alternative photo
    document.getElementById('hostAvatarImg').src = avatarUrl;
    showToast('Previewing creator photo.', 'info');
  }
};

// --- IMAGE RESIZING UTILITY (PREVENTS OVERSIZED BASE64 AND QUOTA EXCEEDED) ---
function resizeImage(fileOrDataUrl, maxWidth, maxHeight, quality, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    let { width, height } = img;
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
    callback(compressedDataUrl);
  };
  img.onerror = () => {
    callback(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
  };

  if (typeof fileOrDataUrl === 'string') {
    img.src = fileOrDataUrl;
  } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
    const reader = new FileReader();
    reader.onload = (e) => { img.src = e.target.result; };
    reader.readAsDataURL(fileOrDataUrl);
  }
}

// --- BACKGROUND BANNER UPLOAD & RE-THEMING (PROFILE EDITOR ONLY) ---
function initDirectBannerUpload() {
  const editBannerInput = document.getElementById('editBannerFileInput');

  if (editBannerInput) {
    editBannerInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast('Optimizing background image for platform...', 'info');
      resizeImage(file, 1600, 900, 0.85, (compressedDataUrl) => {
        const preview = document.getElementById('editBannerPreviewImg');
        if (preview) {
          preview.src = compressedDataUrl;
        }
        showToast('Background image loaded into preview! Click "Save Profile & Re-Theme" below to confirm.', 'success');
      });
    });
  }
}

// --- COMMONS HUMAN VERIFICATION MODAL (ID + SELFIE) ---
let pendingSelfieDataUrl = null;
let pendingIdDataUrl = null;

function initCommonsVerificationModal() {
  const modal = document.getElementById('commonsVerificationModal');
  const selfieInput = document.getElementById('verifySelfieInput');
  const idInput = document.getElementById('verifyIdInput');
  const selfieDropzone = document.getElementById('selfieDropzone');
  const idDropzone = document.getElementById('idDropzone');
  const selfiePreview = document.getElementById('verifySelfiePreview');
  const idPreview = document.getElementById('verifyIdPreview');
  const selfiePlaceholder = document.getElementById('selfiePlaceholder');
  const idPlaceholder = document.getElementById('idPlaceholder');
  const cancelBtn = document.getElementById('cancelCommonsVerificationBtn');
  const form = document.getElementById('commonsVerificationForm');
  const submitBtn = document.getElementById('submitCommonsVerificationBtn');

  // Live DOB preview listeners
  const regDobInput = document.getElementById('regDob');
  const regZodiacPreview = document.getElementById('regZodiacPreview');
  if (regDobInput && regZodiacPreview) {
    regDobInput.addEventListener('input', () => {
      const z = computeClientZodiac(regDobInput.value);
      regZodiacPreview.textContent = z ? `Zodiac: ${z}` : '';
    });
  }

  const editDobInput = document.getElementById('editDob');
  const editZodiacPreview = document.getElementById('editZodiacPreview');
  if (editDobInput && editZodiacPreview) {
    editDobInput.addEventListener('input', () => {
      const z = computeClientZodiac(editDobInput.value);
      editZodiacPreview.textContent = z ? `Zodiac: ${z}` : '';
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => modal.close());
  }

  if (selfieDropzone && selfieInput) {
    selfieDropzone.addEventListener('click', () => selfieInput.click());
  }

  if (idDropzone && idInput) {
    idDropzone.addEventListener('click', () => idInput.click());
  }

  if (selfieInput) {
    selfieInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        pendingSelfieDataUrl = evt.target.result;
        selfiePreview.src = pendingSelfieDataUrl;
        selfiePreview.classList.remove('hidden');
        selfiePlaceholder.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });
  }

  if (idInput) {
    idInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        pendingIdDataUrl = evt.target.result;
        idPreview.src = pendingIdDataUrl;
        idPreview.classList.remove('hidden');
        idPlaceholder.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingSelfieDataUrl || !pendingIdDataUrl) {
        showToast('Please upload both a picture of yourself and a picture of your ID.', 'warning');
        return;
      }

      if (!STATE.currentUser) {
        showToast('Please log in before submitting verification.', 'warning');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳ Verifying Human Profile...</span>';

      try {
        const res = await apiRequest('/api/users/verify-commons', 'POST', {
          selfie: pendingSelfieDataUrl,
          id_card: pendingIdDataUrl
        });

        STATE.currentUser.commons_verified = 1;
        saveUserSession(STATE.currentUser);

        showToast('🛡️ Profile verified! You are now authorized to post in The Commons.', 'success');
        modal.close();

        // Clear file data
        pendingSelfieDataUrl = null;
        pendingIdDataUrl = null;
        selfiePreview.classList.add('hidden');
        selfiePlaceholder.classList.remove('hidden');
        idPreview.classList.add('hidden');
        idPlaceholder.classList.remove('hidden');

        // Proceed to open new aid modal
        openNewAidModal();

      } catch (err) {
        showToast('Verification failed: ' + err.message, 'danger');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🛡️ Submit ID &amp; Selfie Verification</span>';
      }
    });
  }
}

/* ==========================================================================
   PERSONAL MOTTO & WORD LIMIT COUNTER (STRICTLY MAX 15 WORDS)
   ========================================================================== */
function initMottoCounters() {
  bindMottoCounter('regMotto', 'regMottoCounter');
  bindMottoCounter('editMotto', 'editMottoCounter');
}

function countWords(str) {
  if (!str) return 0;
  const tokens = str.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

function updateMottoWordCount(inputId, counterId) {
  const input = document.getElementById(inputId);
  const counter = document.getElementById(counterId);
  if (!input || !counter) return;

  const words = countWords(input.value);
  counter.textContent = `${words} / 15 words`;
  if (words > 15) {
    counter.classList.add('limit-reached');
  } else {
    counter.classList.remove('limit-reached');
  }
}

function bindMottoCounter(inputId, counterId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('input', () => {
    const tokens = input.value.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 15) {
      input.value = tokens.slice(0, 15).join(' ');
      showToast('Personal motto is limited to a maximum of 15 words.', 'warning');
    }
    updateMottoWordCount(inputId, counterId);
  });
}

/* ==========================================================================
   AVATAR CENTERING, ZOOM & CIRCULAR CROPPER
   ========================================================================== */
const CROP_STATE = {
  img: null,
  canvas: null,
  ctx: null,
  scale: 1.0,
  minScale: 0.3,
  maxScale: 3.5,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  circleRadius: 150, // 300px diameter on 340x340 canvas
  centerX: 170,
  centerY: 170,
  onApply: null
};

function initAvatarCropper() {
  const modal = document.getElementById('avatarCropModal');
  const canvasBox = document.getElementById('cropperCanvasBox');
  const canvas = document.getElementById('cropCanvas');
  const slider = document.getElementById('cropZoomSlider');
  const centerBtn = document.getElementById('cropCenterBtn');
  const fitBtn = document.getElementById('cropFitBtn');
  const rotateBtn = document.getElementById('cropRotateBtn');
  const resetBtn = document.getElementById('cropResetBtn');
  const applyBtn = document.getElementById('applyAvatarCropBtn');
  const cancelBtn = document.getElementById('cancelAvatarCropBtn');

  if (!canvas) return;
  CROP_STATE.canvas = canvas;
  CROP_STATE.ctx = canvas.getContext('2d');

  // Dragging / Panning
  const onPointerDown = (clientX, clientY) => {
    CROP_STATE.isDragging = true;
    CROP_STATE.dragStartX = clientX - CROP_STATE.offsetX;
    CROP_STATE.dragStartY = clientY - CROP_STATE.offsetY;
  };

  const onPointerMove = (clientX, clientY) => {
    if (!CROP_STATE.isDragging) return;
    CROP_STATE.offsetX = clientX - CROP_STATE.dragStartX;
    CROP_STATE.offsetY = clientY - CROP_STATE.dragStartY;
    renderCropper();
  };

  const onPointerUp = () => {
    CROP_STATE.isDragging = false;
  };

  // Mouse events
  canvasBox?.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => {
    if (CROP_STATE.isDragging) onPointerMove(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', onPointerUp);

  // Touch events
  canvasBox?.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (CROP_STATE.isDragging && e.touches.length === 1) {
      onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  window.addEventListener('touchend', onPointerUp);

  // Wheel zoom
  canvasBox?.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setCropperZoom(CROP_STATE.scale + delta);
  }, { passive: false });

  // Slider zoom
  slider?.addEventListener('input', (e) => {
    setCropperZoom(parseFloat(e.target.value));
  });

  // Action Buttons
  centerBtn?.addEventListener('click', () => {
    CROP_STATE.offsetX = 0;
    CROP_STATE.offsetY = 0;
    renderCropper();
    showToast('Image centered 🎯', 'info');
  });

  fitBtn?.addEventListener('click', () => {
    if (!CROP_STATE.img) return;
    const targetSize = CROP_STATE.circleRadius * 2;
    const minDim = Math.min(CROP_STATE.img.width, CROP_STATE.img.height);
    const fitScale = targetSize / minDim;
    CROP_STATE.offsetX = 0;
    CROP_STATE.offsetY = 0;
    setCropperZoom(fitScale);
    showToast('Fitted to circular boundary 📐', 'info');
  });

  rotateBtn?.addEventListener('click', () => {
    CROP_STATE.rotation = (CROP_STATE.rotation + 90) % 360;
    renderCropper();
  });

  resetBtn?.addEventListener('click', () => {
    CROP_STATE.scale = 1.0;
    CROP_STATE.offsetX = 0;
    CROP_STATE.offsetY = 0;
    CROP_STATE.rotation = 0;
    setCropperZoom(1.0);
    renderCropper();
  });

  cancelBtn?.addEventListener('click', () => {
    modal?.close();
  });

  applyBtn?.addEventListener('click', () => {
    if (!CROP_STATE.img) return;

    // Render cropped circle output
    const outputCanvas = document.createElement('canvas');
    const outDim = 320;
    outputCanvas.width = outDim;
    outputCanvas.height = outDim;
    const outCtx = outputCanvas.getContext('2d');

    // Circular Clip Path
    outCtx.save();
    outCtx.beginPath();
    outCtx.arc(outDim / 2, outDim / 2, outDim / 2, 0, Math.PI * 2);
    outCtx.clip();

    // Map transform from 340x340 cropper stage to 320x320 export canvas
    const scaleRatio = (outDim / 2) / CROP_STATE.circleRadius;
    outCtx.translate(outDim / 2, outDim / 2);
    outCtx.rotate((CROP_STATE.rotation * Math.PI) / 180);
    outCtx.translate(CROP_STATE.offsetX * scaleRatio, CROP_STATE.offsetY * scaleRatio);
    outCtx.scale(CROP_STATE.scale * scaleRatio, CROP_STATE.scale * scaleRatio);
    outCtx.drawImage(CROP_STATE.img, -CROP_STATE.img.width / 2, -CROP_STATE.img.height / 2);
    outCtx.restore();

    const croppedDataUrl = outputCanvas.toDataURL('image/jpeg', 0.92);
    modal?.close();

    if (typeof CROP_STATE.onApply === 'function') {
      CROP_STATE.onApply(croppedDataUrl);
    }
  });
}

function setCropperZoom(val) {
  const clamped = Math.max(0.2, Math.min(3.5, val));
  CROP_STATE.scale = clamped;
  const slider = document.getElementById('cropZoomSlider');
  const valDisplay = document.getElementById('cropZoomValueDisplay');
  if (slider) slider.value = clamped.toFixed(2);
  if (valDisplay) valDisplay.textContent = `${Math.round(clamped * 100)}%`;
  renderCropper();
}

function renderCropper() {
  const { ctx, canvas, img, scale, offsetX, offsetY, rotation, centerX, centerY } = CROP_STATE;
  if (!ctx || !img) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();

  // Render Live Previews
  renderCropperPreview('cropPreviewCanvasLarge', 96);
  renderCropperPreview('cropPreviewCanvasSmall', 44);
}

function renderCropperPreview(canvasId, size) {
  const pCanvas = document.getElementById(canvasId);
  if (!pCanvas || !CROP_STATE.img) return;
  const pCtx = pCanvas.getContext('2d');
  pCtx.clearRect(0, 0, size, size);

  pCtx.save();
  pCtx.beginPath();
  pCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  pCtx.clip();

  const scaleRatio = (size / 2) / CROP_STATE.circleRadius;
  pCtx.translate(size / 2, size / 2);
  pCtx.rotate((CROP_STATE.rotation * Math.PI) / 180);
  pCtx.translate(CROP_STATE.offsetX * scaleRatio, CROP_STATE.offsetY * scaleRatio);
  pCtx.scale(CROP_STATE.scale * scaleRatio, CROP_STATE.scale * scaleRatio);
  pCtx.drawImage(CROP_STATE.img, -CROP_STATE.img.width / 2, -CROP_STATE.img.height / 2);
  pCtx.restore();
}

function launchAvatarCropper(fileOrDataUrl, onApplyCallback) {
  CROP_STATE.onApply = onApplyCallback;
  CROP_STATE.scale = 1.0;
  CROP_STATE.offsetX = 0;
  CROP_STATE.offsetY = 0;
  CROP_STATE.rotation = 0;

  const loadImgAndOpen = (src) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      CROP_STATE.img = img;

      // Auto-fit so image covers the circle guide initially
      const targetSize = CROP_STATE.circleRadius * 2;
      const minDim = Math.min(img.width, img.height);
      const initialFit = Math.max(1.0, targetSize / minDim);
      setCropperZoom(initialFit);

      const modal = document.getElementById('avatarCropModal');
      modal?.showModal();
      renderCropper();
    };
    img.src = src;
  };

  if (typeof fileOrDataUrl === 'string') {
    loadImgAndOpen(fileOrDataUrl);
  } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
    const reader = new FileReader();
    reader.onload = (e) => loadImgAndOpen(e.target.result);
    reader.readAsDataURL(fileOrDataUrl);
  }
}

/* ==========================================================================
   FRIENDS SYSTEM: LIST, REQUESTS, ACCEPT/DECLINE PROMPTS
   ========================================================================== */
STATE.friendsData = {
  accepted: [],
  incoming: [],
  outgoing: []
};

function initFriendsSystem() {
  const modal = document.getElementById('friendsModal');
  const closeBtn = document.getElementById('closeFriendsModalBtn');

  closeBtn?.addEventListener('click', () => modal?.close());

  // Tabs inside Friends Modal
  const ftabBtns = document.querySelectorAll('.friends-tab-btn');
  ftabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      ftabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.dataset.ftab;
      document.getElementById('paneFriends')?.classList.toggle('active', targetTab === 'friends');
      document.getElementById('paneIncoming')?.classList.toggle('active', targetTab === 'incoming');
      document.getElementById('paneOutgoing')?.classList.toggle('active', targetTab === 'outgoing');
    });
  });

  // Host Action Button in profile header
  const hostActionBtn = document.getElementById('hostFriendActionBtn');
  hostActionBtn?.addEventListener('click', handleHostFriendAction);
}

async function refreshFriends() {
  if (!STATE.currentUser) {
    STATE.friendsData = { accepted: [], incoming: [], outgoing: [] };
    updateFriendsBadges();
    return;
  }

  try {
    const data = await apiRequest('/api/friends');
    STATE.friendsData = {
      accepted: data.accepted || data.friends || [],
      incoming: data.incoming || [],
      outgoing: data.outgoing || []
    };
    updateFriendsBadges();
  } catch (err) {
    console.warn('Could not refresh friends:', err.message);
  }
}

function updateFriendsBadges() {
  const pendingCount = STATE.friendsData.incoming.length;
  const navBadge = document.getElementById('navFriendsPendingBadge');
  if (navBadge) {
    navBadge.textContent = pendingCount;
    navBadge.classList.toggle('hidden', pendingCount === 0);
  }

  const fBadge = document.getElementById('friendsTabCountBadge');
  if (fBadge) fBadge.textContent = STATE.friendsData.accepted.length;

  const inBadge = document.getElementById('incomingTabCountBadge');
  if (inBadge) {
    inBadge.textContent = pendingCount;
    inBadge.classList.toggle('hidden', pendingCount === 0);
  }

  const outBadge = document.getElementById('outgoingTabCountBadge');
  if (outBadge) outBadge.textContent = STATE.friendsData.outgoing.length;
}

function openFriendsModal() {
  if (!STATE.currentUser) {
    document.getElementById('loginModal')?.showModal();
    showToast('Please log in to view your friends list and connection requests.', 'info');
    return;
  }

  renderFriendsModalContent();
  document.getElementById('friendsModal')?.showModal();
}

function renderFriendsModalContent() {
  const { accepted, incoming, outgoing } = STATE.friendsData;

  // 1. My Friends Panel
  const friendsList = document.getElementById('myFriendsList');
  if (friendsList) {
    if (accepted.length === 0) {
      friendsList.innerHTML = `<div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--theme-text-muted);">
        <p style="font-size: 1.1rem; margin-bottom: 6px;">No friends connected yet.</p>
        <span style="font-size: 0.85rem;">Browse member platforms to send connection requests!</span>
      </div>`;
    } else {
      friendsList.innerHTML = accepted.map(f => `
        <div class="friend-card">
          <div class="friend-card-user" onclick="visitFriendPlatform('${f.id}')" style="cursor:pointer;" title="Visit ${escapeHtml(f.name)}'s Platform">
            <img src="${f.avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(f.name)}" class="friend-card-avatar">
            <div class="friend-card-details">
              <span class="friend-card-name">${escapeHtml(f.name)}</span>
              <span class="friend-card-handle">${escapeHtml(f.handle)}</span>
            </div>
          </div>
          <div class="friend-card-actions">
            <button class="btn btn-primary btn-sm" onclick="openDirectMessagesModal('${f.id}')" title="Send Private Message">
              💬 Message
            </button>
            <button class="btn btn-secondary btn-sm" onclick="visitFriendPlatform('${f.id}')" title="Visit Platform">
              🪐 Visit
            </button>
            <button class="btn btn-ghost btn-sm" onclick="removeFriendship('${f.id}', '${escapeHtml(f.name)}')" title="Remove Friend" style="color: #f43f5e;">
              ✕
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  // 2. Incoming Requests Panel (Prompt user to add or not)
  const incomingList = document.getElementById('incomingRequestsList');
  if (incomingList) {
    if (incoming.length === 0) {
      incomingList.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--theme-text-muted);">
        <p>No incoming friend requests.</p>
      </div>`;
    } else {
      incomingList.innerHTML = incoming.map(r => `
        <div class="friend-request-item">
          <div class="friend-request-info">
            <img src="${r.avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(r.name)}" class="friend-card-avatar">
            <div class="request-prompt-text">
              <strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.handle)}) wants to add you as a friend on The Platform.
            </div>
          </div>
          <div class="request-actions-row">
            <button class="btn btn-primary btn-sm" onclick="respondToFriendRequest('${r.request_id}', 'accepted')">
              ✅ Accept Friend
            </button>
            <button class="btn btn-ghost btn-sm" onclick="respondToFriendRequest('${r.request_id}', 'declined')">
              ❌ Decline
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  // 3. Sent Requests Panel
  const outgoingList = document.getElementById('outgoingRequestsList');
  if (outgoingList) {
    if (outgoing.length === 0) {
      outgoingList.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--theme-text-muted);">
        <p>No outgoing connection requests pending.</p>
      </div>`;
    } else {
      outgoingList.innerHTML = outgoing.map(r => `
        <div class="friend-request-item">
          <div class="friend-request-info">
            <img src="${r.avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(r.name)}" class="friend-card-avatar">
            <div class="request-prompt-text">
              Connection request sent to <strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.handle)}).
            </div>
          </div>
          <div class="request-actions-row">
            <button class="btn btn-secondary btn-sm" onclick="cancelOutgoingRequest('${r.target_id}')">
              Cancel Request
            </button>
          </div>
        </div>
      `).join('');
    }
  }
}

window.visitFriendPlatform = function(userId) {
  document.getElementById('friendsModal')?.close();
  switchToPlatformTab(userId, true);
};

window.respondToFriendRequest = async function(requestId, status) {
  try {
    await apiRequest('/api/friends/respond', 'POST', {
      request_id: requestId,
      status: status
    });
    showToast(status === 'accepted' ? 'Friend request accepted! 🎉' : 'Friend request declined.', 'info');
    await refreshFriends();
    renderFriendsModalContent();
    if (STATE.activeHostId) {
      renderHostSidebarFriends(STATE.activeHostId);
      if (STATE.activeHostUser) updateHostFriendActionBtn(STATE.activeHostUser);
    }
  } catch (err) {
    showToast('Action failed: ' + err.message, 'danger');
  }
};

window.removeFriendship = async function(friendId, friendName) {
  if (!confirm(`Are you sure you want to remove ${friendName} from your friends list?`)) return;

  try {
    await apiRequest('/api/friends/remove', 'POST', { friend_id: friendId });
    showToast(`Removed ${friendName} from friends.`, 'info');
    await refreshFriends();
    renderFriendsModalContent();
    if (STATE.activeHostId) {
      renderHostSidebarFriends(STATE.activeHostId);
      if (STATE.activeHostUser) updateHostFriendActionBtn(STATE.activeHostUser);
    }
  } catch (err) {
    showToast('Failed to remove friend: ' + err.message, 'danger');
  }
};

window.cancelOutgoingRequest = async function(targetId) {
  try {
    await apiRequest('/api/friends/remove', 'POST', { friend_id: targetId });
    showToast('Cancelled friend request.', 'info');
    await refreshFriends();
    renderFriendsModalContent();
    if (STATE.activeHostUser) updateHostFriendActionBtn(STATE.activeHostUser);
  } catch (err) {
    showToast('Action failed: ' + err.message, 'danger');
  }
};

// Render host's friends list in the platform sidebar
async function renderHostSidebarFriends(hostId) {
  const container = document.getElementById('sidebarFriendsList');
  const countBadge = document.getElementById('sidebarFriendsCountBadge');
  if (!container) return;

  try {
    const res = await apiRequest(`/api/friends/list/${hostId}`);
    const friends = res.friends || [];
    if (countBadge) countBadge.textContent = friends.length;

    if (friends.length === 0) {
      container.innerHTML = '<span class="sidebar-empty-friends">No public friends connected yet.</span>';
      return;
    }

    container.innerHTML = friends.map(f => `
      <div class="sidebar-friend-avatar-wrap" title="${escapeHtml(f.name)} (${escapeHtml(f.handle)})" onclick="visitFriendPlatform('${f.id}')">
        <img src="${f.avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(f.name)}" class="sidebar-friend-avatar-img">
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<span class="sidebar-empty-friends">Unable to load connections.</span>';
  }
}

// Update the profile header friend action button based on relationship
function updateHostFriendActionBtn(hostUser) {
  const btn = document.getElementById('hostFriendActionBtn');
  const icon = document.getElementById('hostFriendActionIcon');
  const text = document.getElementById('hostFriendActionText');
  const msgBtn = document.getElementById('hostMessageActionBtn');
  if (!btn || !icon || !text) return;

  const isSelf = STATE.currentUser && STATE.currentUser.id === hostUser.id;
  if (isSelf) {
    btn.style.display = 'none';
    if (msgBtn) {
      msgBtn.classList.add('hidden');
      msgBtn.style.display = 'none';
    }
    return;
  }

  btn.style.display = 'inline-flex';

  if (!STATE.currentUser) {
    icon.textContent = '➕';
    text.textContent = 'Add Friend';
    btn.className = 'btn btn-secondary';
    btn.title = 'Log in to add this creator as a friend';
    if (msgBtn) {
      msgBtn.classList.add('hidden');
      msgBtn.style.display = 'none';
    }
    return;
  }

  const isFriend = STATE.friendsData.accepted.some(f => f.id === hostUser.id);
  const isIncoming = STATE.friendsData.incoming.some(r => r.id === hostUser.id);
  const isOutgoing = STATE.friendsData.outgoing.some(r => r.id === hostUser.id);

  if (msgBtn) {
    if (isFriend && !isSelf) {
      msgBtn.classList.remove('hidden');
      msgBtn.style.display = 'inline-flex';
      msgBtn.onclick = () => openDirectMessagesModal(hostUser.id);
    } else {
      msgBtn.classList.add('hidden');
      msgBtn.style.display = 'none';
    }
  }

  if (isFriend) {
    icon.textContent = '✓';
    text.textContent = 'Friends';
    btn.className = 'btn btn-secondary';
    btn.title = 'You are friends on The Platform (Click to remove)';
  } else if (isIncoming) {
    icon.textContent = '🔔';
    text.textContent = 'Accept Request!';
    btn.className = 'btn btn-primary';
    btn.title = `${hostUser.name} sent you a friend request — click to accept`;
  } else if (isOutgoing) {
    icon.textContent = '⏳';
    text.textContent = 'Request Sent';
    btn.className = 'btn btn-ghost';
    btn.title = 'Friend request sent (Click to cancel)';
  } else {
    icon.textContent = '➕';
    text.textContent = 'Add Friend';
    btn.className = 'btn btn-secondary';
    btn.title = `Send friend request to ${hostUser.name}`;
  }
}

async function handleHostFriendAction() {
  if (!STATE.currentUser) {
    document.getElementById('loginModal')?.showModal();
    return;
  }

  const hostUser = STATE.activeHostUser;
  if (!hostUser || hostUser.id === STATE.currentUser.id) return;

  const isFriend = STATE.friendsData.accepted.some(f => f.id === hostUser.id);
  const incomingReq = STATE.friendsData.incoming.find(r => r.id === hostUser.id);
  const isOutgoing = STATE.friendsData.outgoing.some(r => r.id === hostUser.id);

  if (isFriend) {
    await removeFriendship(hostUser.id, hostUser.name);
  } else if (incomingReq) {
    await respondToFriendRequest(incomingReq.request_id, 'accepted');
  } else if (isOutgoing) {
    await cancelOutgoingRequest(hostUser.id);
  } else {
    try {
      const res = await apiRequest('/api/friends/request', 'POST', { target_id: hostUser.id });
      if (res.status === 'accepted') {
        showToast(`You and ${hostUser.name} are now friends! 🎉`, 'success');
      } else {
        showToast(`Friend request sent to ${hostUser.name}! ⏳`, 'info');
      }
      await refreshFriends();
      updateHostFriendActionBtn(hostUser);
      renderHostSidebarFriends(hostUser.id);
    } catch (err) {
      showToast('Friend request failed: ' + err.message, 'danger');
    }
  }
}

/* ==========================================================================
   TOPICS & PASSIONS FEED: CURATED LIST, ENGAGEMENT RANKING, COMMENTS & BOOKMARKS
   ========================================================================== */
STATE.topicsFilter = 'all';
STATE.topicsSubtopic = '';
STATE.topicsSort = 'trending';
STATE.topicsSavedOnly = false;
STATE.topicsExpandedPosts = new Set();
STATE.viewedPosts = new Set();

function initTopicsSection() {
  const container = document.getElementById('topicsSection');
  const savedToggleBtn = document.getElementById('topicsViewSavedToggleBtn');
  const refreshBtn = document.getElementById('topicsRefreshBtn');
  const sortSelect = document.getElementById('topicsSortSelect');
  const subtopicFilter = document.getElementById('topicsSubtopicFilter');
  const pillsContainer = document.getElementById('topicsInterestPills');

  if (!container) return;

  // Saved toggle
  savedToggleBtn?.addEventListener('click', () => {
    STATE.topicsSavedOnly = !STATE.topicsSavedOnly;
    savedToggleBtn.classList.toggle('active', STATE.topicsSavedOnly);
    const label = document.getElementById('savedToggleLabel');
    if (label) label.textContent = STATE.topicsSavedOnly ? 'Showing Saved 🔖' : 'Saved Posts';
    fetchAndRenderTopics();
  });

  // Refresh
  refreshBtn?.addEventListener('click', () => {
    fetchAndRenderTopics();
    showToast('Refreshed trending discussions feed', 'info');
  });

  // Sort
  sortSelect?.addEventListener('change', (e) => {
    STATE.topicsSort = e.target.value;
    fetchAndRenderTopics();
  });

  // Subtopic
  subtopicFilter?.addEventListener('change', (e) => {
    STATE.topicsSubtopic = e.target.value;
    fetchAndRenderTopics();
  });

  // Interest Pills
  pillsContainer?.addEventListener('click', (e) => {
    const pill = e.target.closest('.topic-pill');
    if (!pill) return;

    pillsContainer.querySelectorAll('.topic-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    STATE.topicsFilter = pill.dataset.interest;
    STATE.topicsSubtopic = '';
    fetchAndRenderTopics();
  });
}

async function fetchAndRenderTopics() {
  const feedList = document.getElementById('topicsFeedList');
  if (!feedList) return;

  feedList.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--theme-text-muted);">Loading trending discussions...</div>';

  try {
    let url = `/api/topics?sort=${encodeURIComponent(STATE.topicsSort)}`;
    if (STATE.topicsFilter && STATE.topicsFilter !== 'all') {
      url += `&interest=${encodeURIComponent(STATE.topicsFilter)}`;
    }
    if (STATE.topicsSubtopic) {
      url += `&subtopic=${encodeURIComponent(STATE.topicsSubtopic)}`;
    }
    if (STATE.topicsSavedOnly) {
      url += `&saved_only=1`;
    }

    const data = await apiRequest(url);
    const posts = data.posts || [];
    const subtopics = data.subtopics || [];

    // Populate subtopics dropdown
    const subtopicSelect = document.getElementById('topicsSubtopicFilter');
    if (subtopicSelect) {
      const currentVal = STATE.topicsSubtopic;
      subtopicSelect.innerHTML = '<option value="">All Sub-Topics</option>' + subtopics.map(st => `
        <option value="${escapeHtml(st)}" ${st === currentVal ? 'selected' : ''}>🏷️ ${escapeHtml(st)}</option>
      `).join('');
    }

    if (posts.length === 0) {
      feedList.innerHTML = `
        <div style="padding: 40px 20px; text-align: center; background: var(--theme-surface-card); border-radius: var(--radius-md); border: 1px solid var(--theme-card-border);">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🌱</div>
          <h3 style="font-size: 1.2rem; margin-bottom: 6px;">No discussions match this filter</h3>
          <p style="color: var(--theme-text-muted); font-size: 0.88rem;">
            ${STATE.topicsSavedOnly ? 'You haven’t saved any dispatches yet. Click the 🔖 Save button on any post to bookmark it!' : 'Be the first to post a dispatch under this passion on your platform!'}
          </p>
        </div>
      `;
      return;
    }

    feedList.innerHTML = posts.map(post => renderTopicCardHtml(post)).join('');
    attachTopicCardEventListeners();

  } catch (err) {
    feedList.innerHTML = `<div style="padding: 24px; color: #f43f5e; text-align: center;">Failed to load topics: ${escapeHtml(err.message)}</div>`;
  }
}

function renderTopicCardHtml(post) {
  const isExpanded = STATE.topicsExpandedPosts.has(post.id);
  const isSaved = post.is_saved === 1;
  const postText = (post.text || post.body || '').trim();
  const teaser = postText.length > 140 ? postText.substring(0, 140) + '...' : postText;

  const currentUserId = STATE.currentUser ? STATE.currentUser.id : null;
  const isAuthor = currentUserId && (post.author_id === currentUserId || post.user_id === currentUserId);
  const isAdmin = STATE.currentUser && STATE.currentUser.is_admin === 1;

  let topicActionsHtml = '';
  if (isAuthor) {
    topicActionsHtml += `
      <button class="post-action-btn" onclick="openEditPostModal('${post.id}', \`${escapeForAttr(postText)}\`, '${escapeForAttr(post.interest || '')}', '${escapeForAttr(post.subtopic || '')}', '${post.visibility || 'public'}')">
        ✏️ Edit
      </button>
    `;
  }
  if (isAuthor || isAdmin) {
    topicActionsHtml += `
      <button class="post-action-btn danger" onclick="deletePost('${post.id}')">
        🗑️ Delete
      </button>
    `;
  }
  if (!isAuthor) {
    topicActionsHtml += `
      <button class="post-action-btn flag-btn" onclick="flagPostOffTopic('${post.id}')" title="Flag post as off-topic">
        🚩 Flag Off-Topic (${post.flag_count || 0})
      </button>
    `;
  }
  if (isAuthor || isAdmin) {
    topicActionsHtml += `
      <button class="post-action-btn" onclick="openChangeTopicModal('${post.id}', '${escapeForAttr(post.interest || '')}', '${escapeForAttr(post.subtopic || '')}')" title="Change Topic & Clear Flags">
        🏷️ Change Topic
      </button>
    `;
  }

  let flaggedBadge = '';
  if (post.flagged_for_admin === 1 || (post.flag_count && post.flag_count >= 3)) {
    flaggedBadge = `<span class="flagged-admin-badge" style="margin-left: 8px;">🚩 Moderation Queue</span>`;
  }

  const mediaUrl = (post.media_url || post.image || '').trim();
  let mediaDrawerHtml = '';
  if (mediaUrl) {
    const ytMatch = mediaUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (ytMatch && ytMatch[1]) {
      mediaDrawerHtml = renderPostVideoCardHtml(ytMatch[1], post.text || 'Trending Discussion', mediaUrl);
    } else if (post.media_type === 'image' || mediaUrl.match(/\.(jpeg|jpg|gif|png|webp|svg)($|\?)/i)) {
      mediaDrawerHtml = `
        <div class="topic-media-preview-wrap">
          <img src="${escapeHtml(mediaUrl)}" alt="Attached media" class="topic-media-preview-img">
        </div>
      `;
    } else {
      mediaDrawerHtml = `
        <div style="margin: 10px 0;">
          <a href="${escapeHtml(mediaUrl)}" target="_blank" rel="noopener noreferrer" class="post-link-embed">
            <span class="link-embed-icon">🔗</span>
            <span class="link-embed-url">${escapeHtml(mediaUrl)}</span>
          </a>
        </div>
      `;
    }
  }

  return `
    <article class="topic-card ${isExpanded ? 'expanded' : ''}" id="topic-post-${post.id}" data-post-id="${post.id}">
      <!-- Top-Level Collapsed Summary View -->
      <div class="topic-card-summary" onclick="toggleExpandTopicCard('${post.id}')" title="Click to expand discussion & comments">
        <div class="topic-card-top-row">
          <div class="topic-interest-badge">
            <span>🏷️ ${escapeHtml(post.interest || 'General')}</span>
            ${post.subtopic ? `<span class="topic-subtopic-tag">› ${escapeHtml(post.subtopic)}</span>` : ''}
            ${flaggedBadge}
          </div>

          <div class="topic-card-author-info" onclick="event.stopPropagation(); visitFriendPlatform('${post.author_id}')" title="Visit creator's platform" style="cursor:pointer;">
            <img src="${post.author_avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(post.author_name || 'Creator')}" class="topic-author-avatar">
            <div>
              <div class="topic-author-name">${escapeHtml(post.author_name || 'Member')}</div>
              <div class="topic-author-handle">${escapeHtml(post.author_handle || '@member')} • ${formatTimeAgo(post.created_at || post.timestamp)}</div>
            </div>
          </div>
        </div>

        <p class="topic-card-teaser-text">
          ${escapeHtml(teaser)}
        </p>

        <div class="topic-card-footer-row">
          <div class="topic-stats-pills">
            <span class="topic-stat-metric" title="Views of this post">
              👀 <strong id="topic-views-${post.id}">${post.views || 0}</strong> views
            </span>
            <span class="topic-stat-metric" title="Community likes">
              ⭐ <strong id="topic-likes-${post.id}">${post.likes || 0}</strong> likes
            </span>
            <span class="topic-stat-metric" title="Discussion comments">
              💬 <strong id="topic-comments-count-${post.id}">${post.comments_count || 0}</strong> comments
            </span>
            <span class="topic-stat-metric" title="Post mentions and tags">
              🔗 <strong id="topic-mentions-${post.id}">${post.mentions_count || 0}</strong> mentions
            </span>
          </div>

          <div class="topic-summary-actions" onclick="event.stopPropagation();">
            <button class="topic-save-btn ${isSaved ? 'saved' : ''}" id="save-btn-${post.id}" onclick="toggleSaveTopicPost('${post.id}')" title="${isSaved ? 'Remove from Saved' : 'Save / Bookmark post'}">
              <span>${isSaved ? '★ Saved' : '🔖 Save'}</span>
            </button>
            <div class="topic-expand-indicator">
              <span>${isExpanded ? 'Collapse ▴' : 'Expand Topic &amp; Comments ▾'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Expanded Drawer Content (Visible only when expanded) -->
      <div class="topic-expanded-drawer">
        <div class="topic-full-body">${escapeHtml(postText)}</div>

        ${mediaDrawerHtml}

        ${post.audio_url ? `
          <div style="margin: 10px 0; padding: 10px 14px; background: rgba(56, 189, 248, 0.1); border-radius: var(--radius-sm); border: 1px solid rgba(56, 189, 248, 0.2); font-size: 0.82rem; color: #38bdf8;">
            🎵 Linked Audio: <a href="${escapeHtml(post.audio_url)}" target="_blank" rel="noopener" style="color:inherit; text-decoration:underline;">Listen on YouTube</a>
          </div>
        ` : ''}

        <div style="display:flex; align-items:center; gap:10px; margin: 12px 0 16px 0; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm" onclick="likeTopicPost('${post.id}')" title="Like this post">
            ⭐ Like (<span id="drawer-likes-${post.id}">${post.likes || 0}</span>)
          </button>
          <button class="btn btn-ghost btn-sm" onclick="visitFriendPlatform('${post.author_id}')">
            🪐 Visit Platform Wall
          </button>
          <div class="post-action-bar" style="margin-top:0; padding-top:0; border-top:none;">
            ${topicActionsHtml}
          </div>
        </div>

        <!-- Comments Thread & Discussion Box -->
        <div class="topic-comments-section" id="topic-comments-box-${post.id}">
          <div class="comments-header-row">
            <h4 class="comments-heading">
              <span>💬 Comments &amp; Exchange</span>
            </h4>
            <span style="font-size: 0.76rem; color: var(--theme-text-muted);">Ideas welcomed; Ad Hominem shield active</span>
          </div>

          <div class="topic-comments-list" id="topic-comments-list-${post.id}">
            <div style="padding: 10px; color: var(--theme-text-muted); font-size: 0.85rem;">Loading comments...</div>
          </div>

          <!-- Add Comment Box -->
          <div class="topic-add-comment-box">
            <input type="text" id="topic-comment-input-${post.id}" class="topic-comment-input" placeholder="Add a comment to this topic discussion..." onkeydown="handleCommentKey(event, '${post.id}')">
            <button class="btn btn-primary btn-sm" onclick="submitTopicComment('${post.id}')">
              Post Comment
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function attachTopicCardEventListeners() {
  STATE.topicsExpandedPosts.forEach(postId => {
    loadTopicComments(postId);
  });
}

window.toggleExpandTopicCard = async function(postId) {
  const card = document.getElementById(`topic-post-${postId}`);
  if (!card) return;

  const willExpand = !STATE.topicsExpandedPosts.has(postId);
  if (willExpand) {
    STATE.topicsExpandedPosts.add(postId);
    card.classList.add('expanded');
    const indicator = card.querySelector('.topic-expand-indicator span');
    if (indicator) indicator.textContent = 'Collapse ▴';

    // Increment view count via backend once per session
    if (!STATE.viewedPosts.has(postId)) {
      STATE.viewedPosts.add(postId);
      try {
        const res = await apiRequest('/api/posts/view', 'POST', { post_id: postId });
        const viewEl = document.getElementById(`topic-views-${postId}`);
        if (viewEl) viewEl.textContent = res.views;
      } catch (err) {
        console.warn('Could not record view:', err.message);
      }
    }

    // Load comments
    await loadTopicComments(postId);
  } else {
    STATE.topicsExpandedPosts.delete(postId);
    card.classList.remove('expanded');
    const indicator = card.querySelector('.topic-expand-indicator span');
    if (indicator) indicator.textContent = 'Expand Topic & Comments ▾';
  }
};

async function loadTopicComments(postId) {
  const container = document.getElementById(`topic-comments-list-${postId}`);
  if (!container) return;

  try {
    const data = await apiRequest(`/api/posts/${postId}/comments`);
    const comments = data.comments || [];

    const countEl = document.getElementById(`topic-comments-count-${postId}`);
    if (countEl) countEl.textContent = comments.length;

    if (comments.length === 0) {
      container.innerHTML = '<span style="color:var(--theme-text-muted); font-size:0.82rem; font-style:italic;">No comments yet. Join the conversation above!</span>';
      return;
    }

    const currentUserId = STATE.currentUser ? STATE.currentUser.id : null;

    container.innerHTML = comments.map(c => {
      const canDelete = currentUserId && (c.user_id === currentUserId || c.author_id === currentUserId);
      return `
        <div class="topic-comment-bubble" id="comment-${c.id}">
          <div class="comment-meta-row">
            <img src="${c.author_avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(c.author_name)}" class="comment-avatar">
            <span class="comment-author-name">${escapeHtml(c.author_name)}</span>
            <span class="comment-time">${formatTimeAgo(c.created_at)}</span>
            ${canDelete ? `<button class="comment-delete-btn" onclick="deleteComment('${c.id}', '${postId}')" title="Delete comment">✕ Delete</button>` : ''}
          </div>
          <p class="comment-body-text">${escapeHtml(c.text)}</p>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<span style="color:#f43f5e; font-size:0.82rem;">Could not load comments.</span>';
  }
}

window.handleCommentKey = function(event, postId) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitTopicComment(postId);
  }
};

window.submitTopicComment = async function(postId) {
  if (!STATE.currentUser) {
    document.getElementById('loginModal')?.showModal();
    showToast('Please log in to add comments to this topic.', 'info');
    return;
  }

  const input = document.getElementById(`topic-comment-input-${postId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  // Auto-Moderation: Targeted Personal Attacks vs Idea Debate
  const civility = evaluateContentCivility(text);
  if (civility.isPersonalAttack) {
    showToast(`Comment auto-moderated away: Targeted personal attack ("${civility.flaggedSnippet}"). Disagreements and debates on ideas ("that's stupid, dumb idea") are allowed, but personal attacks on members are moderated away.`, 'danger');
    input.focus();
    return;
  }

  try {
    await apiRequest('/api/posts/comments', 'POST', {
      post_id: postId,
      text: text
    });

    input.value = '';
    showToast('Comment posted! 💬', 'success');
    await loadTopicComments(postId);
  } catch (err) {
    showToast('Failed to post comment: ' + err.message, 'danger');
  }
};

window.likeTopicPost = async function(postId) {
  try {
    const res = await apiRequest('/api/posts/like', 'POST', { post_id: postId });
    const likesSummary = document.getElementById(`topic-likes-${postId}`);
    const likesDrawer = document.getElementById(`drawer-likes-${postId}`);
    if (likesSummary) likesSummary.textContent = res.likes;
    if (likesDrawer) likesDrawer.textContent = res.likes;
    showToast('Post liked! ⭐', 'success');
  } catch (err) {
    showToast('Failed to like post: ' + err.message, 'danger');
  }
};

window.toggleSaveTopicPost = async function(postId) {
  if (!STATE.currentUser) {
    document.getElementById('loginModal')?.showModal();
    showToast('Please log in to bookmark and save posts.', 'info');
    return;
  }

  try {
    const res = await apiRequest('/api/posts/save', 'POST', { post_id: postId });
    const btn = document.getElementById(`save-btn-${postId}`);
    if (btn) {
      if (res.saved) {
        btn.classList.add('saved');
        btn.innerHTML = '<span>★ Saved</span>';
        showToast('Post saved to your bookmarks! 🔖', 'success');
      } else {
        btn.classList.remove('saved');
        btn.innerHTML = '<span>🔖 Save</span>';
        showToast('Removed from saved posts.', 'info');
      }
    }

    if (STATE.topicsSavedOnly && !res.saved) {
      document.getElementById(`topic-post-${postId}`)?.remove();
    }
  } catch (err) {
    showToast('Bookmark action failed: ' + err.message, 'danger');
  }
};

/* ==========================================================================
   PRIVATE MESSAGING SYSTEM FOR MUTUAL FRIENDS
   ========================================================================== */
STATE.messaging = {
  activeFriendId: null,
  activeFriend: null,
  conversations: []
};

let dmPollInterval = null;

function initMessagingSystem() {
  const navBtn = document.getElementById('navMessagesBtn');
  const modal = document.getElementById('directMessagesModal');
  const closeBtn = document.getElementById('closeDmModalBtn');
  const sendForm = document.getElementById('dmInputBar');
  const searchInput = document.getElementById('dmFriendsSearchInput');
  const photoInput = document.getElementById('dmPhotoFileInput');
  const gifBtn = document.getElementById('dmGifBtn');
  const removeAttachmentBtn = document.getElementById('dmRemoveAttachmentBtn');
  const msgInput = document.getElementById('dmMessageInput');

  if (navBtn) {
    navBtn.addEventListener('click', () => {
      openDirectMessagesModal();
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.close();
      stopDmPolling();
    });
  }

  if (sendForm) {
    sendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await sendDirectMessage();
    });
  }

  // Send on Enter (Shift+Enter for new line)
  msgInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendDirectMessage();
    }
  });

  // Friend search filter
  searchInput?.addEventListener('input', (e) => {
    renderDmFriendsList(e.target.value.toLowerCase().trim());
  });

  // Photo attachment in DM
  photoInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showToast('Image file too large (max 8MB).', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      STATE.dmAttachment = {
        type: 'image',
        url: evt.target.result,
        name: file.name
      };
      showDmAttachmentPreview();
      showToast('Photo attached! Hit Send or add a caption.', 'success');
    };
    reader.readAsDataURL(file);
  });

  removeAttachmentBtn?.addEventListener('click', () => {
    STATE.dmAttachment = null;
    hideDmAttachmentPreview();
  });

  gifBtn?.addEventListener('click', () => {
    openGifPicker('dm');
  });

  // Voice Recording in Instant Messaging
  let dmMediaRecorder = null;
  let dmAudioChunks = [];
  let dmRecordingTimer = null;
  let dmRecordingSeconds = 0;

  const recordVoiceBtn = document.getElementById('dmRecordVoiceBtn');
  const cancelVoiceBtn = document.getElementById('dmCancelVoiceBtn');
  const sendVoiceBtn = document.getElementById('dmSendVoiceBtn');
  const recordingBar = document.getElementById('dmRecordingBar');
  const inputBar = document.getElementById('dmInputBar');
  const timerDisplay = document.getElementById('dmRecordingTimer');

  function cleanupVoiceRecording() {
    if (dmRecordingTimer) {
      clearInterval(dmRecordingTimer);
      dmRecordingTimer = null;
    }
    if (dmMediaRecorder && dmMediaRecorder.state !== 'inactive') {
      try {
        dmMediaRecorder.stop();
      } catch (e) {}
    }
    dmAudioChunks = [];
    recordingBar?.classList.add('hidden');
    inputBar?.classList.remove('hidden');
  }

  recordVoiceBtn?.addEventListener('click', async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Voice recording is not supported in this browser.', 'warning');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dmAudioChunks = [];
      dmRecordingSeconds = 0;
      if (timerDisplay) timerDisplay.textContent = '0:00';

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else mimeType = '';
      }

      dmMediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      dmMediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) dmAudioChunks.push(e.data);
      };

      dmMediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
      };

      dmMediaRecorder.start(250);
      inputBar?.classList.add('hidden');
      recordingBar?.classList.remove('hidden');

      dmRecordingTimer = setInterval(() => {
        dmRecordingSeconds++;
        const mins = Math.floor(dmRecordingSeconds / 60);
        const secs = dmRecordingSeconds % 60;
        if (timerDisplay) timerDisplay.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }, 1000);
    } catch (err) {
      showToast('Microphone access is needed for voice notes: ' + err.message, 'warning');
    }
  });

  cancelVoiceBtn?.addEventListener('click', () => {
    cleanupVoiceRecording();
    showToast('Voice note cancelled.', 'info');
  });

  sendVoiceBtn?.addEventListener('click', () => {
    if (!dmMediaRecorder) return;
    const friendId = STATE.messaging.activeFriendId;
    if (!friendId) return;

    if (dmRecordingTimer) {
      clearInterval(dmRecordingTimer);
      dmRecordingTimer = null;
    }

    dmMediaRecorder.onstop = () => {
      dmMediaRecorder.stream.getTracks().forEach(t => t.stop());
      const audioBlob = new Blob(dmAudioChunks, { type: dmMediaRecorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const voiceDataUrl = reader.result;
        try {
          const encPayload = await encryptDirectMessagePayload(friendId, '', voiceDataUrl);
          await apiRequest('/api/messages', 'POST', {
            recipient_id: friendId,
            text: encPayload.text,
            media_url: encPayload.media_url,
            media_type: 'audio',
            is_encrypted: encPayload.is_encrypted,
            iv: encPayload.iv,
            algo: encPayload.algo
          });
          showToast(`Voice note sent! 🎙️ ${encPayload.is_encrypted ? '(🔒 E2EE Encrypted)' : ''}`, 'success');
          await loadDirectMessages(friendId, true);
          await loadConversationsList(friendId);
        } catch (err) {
          showToast('Failed to send voice note: ' + err.message, 'danger');
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    try {
      dmMediaRecorder.stop();
    } catch (e) {}

    recordingBar?.classList.add('hidden');
    inputBar?.classList.remove('hidden');
  });

  // Periodic polling for new messages & unread badge
  setInterval(() => {
    if (STATE.currentUser) {
      updateUnreadMessagesBadge();
    }
  }, 12000);
}

function startDmPolling() {
  stopDmPolling();
  dmPollInterval = setInterval(() => {
    const modal = document.getElementById('directMessagesModal');
    if (modal && modal.open && STATE.messaging.activeFriendId) {
      loadDirectMessages(STATE.messaging.activeFriendId, false);
    }
  }, 4000);
}

function stopDmPolling() {
  if (dmPollInterval) {
    clearInterval(dmPollInterval);
    dmPollInterval = null;
  }
}

function showDmAttachmentPreview() {
  const wrap = document.getElementById('dmAttachmentPreview');
  const img = document.getElementById('dmPreviewImg');
  const badge = document.getElementById('dmPreviewBadge');
  const nameEl = document.getElementById('dmPreviewName');
  if (!wrap || !STATE.dmAttachment) return;
  img.src = STATE.dmAttachment.url;
  badge.textContent = STATE.dmAttachment.type === 'gif' ? '👾 Animated GIF' : '📷 Photo Attachment';
  nameEl.textContent = STATE.dmAttachment.name || 'attachment';
  wrap.classList.remove('hidden');
}

function hideDmAttachmentPreview() {
  const wrap = document.getElementById('dmAttachmentPreview');
  const img = document.getElementById('dmPreviewImg');
  if (wrap) wrap.classList.add('hidden');
  if (img) img.src = '';
  const photoInput = document.getElementById('dmPhotoFileInput');
  if (photoInput) photoInput.value = '';
}

async function updateUnreadMessagesBadge() {
  if (!STATE.currentUser) {
    const badge = document.getElementById('navMessagesBadge');
    if (badge) badge.classList.add('hidden');
    return;
  }

  try {
    const res = await apiRequest('/api/messages/unread-count');
    const badge = document.getElementById('navMessagesBadge');
    if (badge) {
      const count = res.unread_count || 0;
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.toggle('hidden', count === 0);
    }
  } catch (e) {
    // Non-blocking
  }
}

async function openDirectMessagesModal(targetFriendId = null) {
  if (!STATE.currentUser) {
    document.getElementById('loginModal')?.showModal();
    showToast('Please log in to message your friends.', 'info');
    return;
  }

  const modal = document.getElementById('directMessagesModal');
  if (!modal) return;
  modal.showModal();
  startDmPolling();

  await loadConversationsList(targetFriendId);

  if (targetFriendId) {
    await selectDmFriend(targetFriendId);
  }
}

function renderDmFriendsList(filterText = '') {
  const container = document.getElementById('dmFriendsList');
  if (!container) return;
  const convos = STATE.messaging.conversations || [];
  const filtered = filterText ? convos.filter(c => 
    c.name.toLowerCase().includes(filterText) || c.handle.toLowerCase().includes(filterText)
  ) : convos;

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:16px; text-align:center; color:var(--theme-text-muted); font-size:0.82rem;">No matching friends found.</div>`;
    return;
  }

  container.innerHTML = filtered.map(c => `
    <div class="dm-friend-item ${c.id === STATE.messaging.activeFriendId ? 'active' : ''}" 
         id="dmFriendItem-${c.id}" 
         onclick="selectDmFriend('${c.id}')">
      <div class="dm-friend-avatar-wrap">
        <img src="${c.avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(c.name)}" class="dm-friend-avatar">
        <span class="status-dot-green dm-dot"></span>
      </div>
      <div class="dm-friend-meta">
        <div class="dm-friend-name-row">
          <span class="dm-friend-name">${escapeHtml(c.name)}</span>
          <span class="dm-friend-time">${c.latest_time ? formatTimeAgo(c.latest_time) : ''}</span>
        </div>
        <div class="dm-friend-snippet-row">
          <span class="dm-friend-snippet">${escapeHtml(c.latest_message || 'Start conversation...')}</span>
          ${c.unread_count > 0 ? `<span class="dm-unread-badge">${c.unread_count}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

async function loadConversationsList(targetToSelect = null) {
  const container = document.getElementById('dmFriendsList');
  if (!container) return;

  container.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--theme-text-dim); font-size: 0.85rem;">Loading conversations...</div>`;

  try {
    const res = await apiRequest('/api/messages/conversations');
    const convos = res.conversations || [];
    STATE.messaging.conversations = convos;

    if (convos.length === 0) {
      container.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: var(--theme-text-dim); font-size: 0.82rem; line-height: 1.5;">
          <p style="margin-bottom: 8px; font-weight: 600; color: #f1f5f9;">No mutual friends yet.</p>
          <span>Private messaging is strictly between accepted friends. Connect with creators to start messaging!</span>
        </div>`;
      
      const stream = document.getElementById('dmMessagesStream');
      const inputBar = document.getElementById('dmInputBar');
      if (inputBar) inputBar.classList.add('hidden');
      if (stream) {
        stream.innerHTML = `
          <div class="dm-placeholder-state">
            <div class="dm-placeholder-icon">🤝</div>
            <h3>Connect with Friends</h3>
            <p>Once you and another member become mutual friends, your private direct messaging thread will activate here.</p>
          </div>`;
      }
      return;
    }

    renderDmFriendsList();

    if (targetToSelect) {
      selectDmFriend(targetToSelect);
    } else if (!STATE.messaging.activeFriendId && convos.length > 0) {
      selectDmFriend(convos[0].id);
    }

    updateUnreadMessagesBadge();
  } catch (err) {
    container.innerHTML = `<div style="padding: 16px; color: #f43f5e; font-size: 0.82rem;">Failed to load friends: ${escapeHtml(err.message)}</div>`;
  }
}

async function selectDmFriend(friendId) {
  STATE.messaging.activeFriendId = friendId;

  document.querySelectorAll('.dm-friend-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`dmFriendItem-${friendId}`)?.classList.add('active');

  await loadDirectMessages(friendId, true);
}

async function loadDirectMessages(friendId, shouldScroll = true) {
  if (!friendId) return;

  const stream = document.getElementById('dmMessagesStream');
  const inputBar = document.getElementById('dmInputBar');
  const msgInput = document.getElementById('dmMessageInput');

  try {
    const res = await apiRequest(`/api/messages?friend_id=${encodeURIComponent(friendId)}`);
    const friend = res.friend;
    const messages = res.messages || [];

    STATE.messaging.activeFriend = friend;

    document.getElementById('dmActiveFriendAvatar').src = friend.avatar || 'assets/avatar-p-default.svg';
    document.getElementById('dmActiveFriendName').textContent = friend.name;
    document.getElementById('dmActiveFriendHandle').textContent = friend.handle;
    document.getElementById('dmActiveFriendMotto').textContent = friend.motto || 'Mutual Friend';

    if (inputBar) inputBar.classList.remove('hidden');

    if (messages.length === 0) {
      stream.innerHTML = `
        <div class="dm-placeholder-state">
          <div class="dm-placeholder-icon">💬</div>
          <h3>Private Conversation with ${escapeHtml(friend.name)}</h3>
          <p>Send a message, voice note, photo, or GIF below to start your private thread.</p>
        </div>`;
    } else {
      const currentUserId = STATE.currentUser ? STATE.currentUser.id : null;
      const decryptedMessages = await Promise.all(messages.map(async m => {
        if (m.is_encrypted) {
          const dec = await decryptDirectMessagePayload(m, currentUserId);
          return {
            ...m,
            text: dec.text,
            media_url: dec.media_url,
            isDecrypted: dec.is_encrypted
          };
        }
        return { ...m, isDecrypted: false };
      }));

      stream.innerHTML = decryptedMessages.map(m => {
        const isMine = m.sender_id === currentUserId;
        const senderAvatar = m.sender_avatar || 'assets/avatar-p-default.svg';
        const senderName = m.sender_name || 'Member';
        const e2eeTag = m.isDecrypted ? `<span class="dm-msg-e2ee-tag" title="End-to-End Encrypted with ECDH + AES-GCM">🔒 E2EE</span>` : '';

        let mediaHtml = '';
        if (m.media_type === 'audio' || (m.media_url && m.media_url.startsWith('data:audio'))) {
          mediaHtml = `
            <div class="voice-message-player" id="voice-player-${m.id}">
              <button type="button" class="voice-play-btn" onclick="togglePlayVoice('${m.id}', '${m.media_url}')" title="Play voice note">▶</button>
              <div class="voice-wave-bars">
                <span class="vbar"></span><span class="vbar"></span><span class="vbar"></span><span class="vbar"></span>
                <span class="vbar"></span><span class="vbar"></span><span class="vbar"></span><span class="vbar"></span>
              </div>
              <span class="voice-time-text" id="voice-time-${m.id}">Voice Note 🎙️</span>
              <audio id="audio-${m.id}" src="${m.media_url}" preload="metadata"></audio>
            </div>
          `;
        } else if (m.media_url) {
          mediaHtml = `
            <div class="dm-media-wrap">
              <img src="${escapeHtml(m.media_url)}" alt="Shared attachment" class="dm-msg-media-img" onclick="window.open(this.src, '_blank')" title="Click to view full image">
            </div>
          `;
        }

        return `
          <div class="dm-msg-row ${isMine ? 'sent' : 'received'}" id="dm-msg-${m.id}">
            <img src="${senderAvatar}" 
                 alt="${escapeHtml(senderName)}" 
                 class="dm-msg-avatar" 
                 title="${escapeHtml(senderName)}">
            <div class="dm-msg-content-wrap">
              <span class="dm-msg-sender-name">${escapeHtml(senderName)}</span>
              <div class="dm-msg-bubble">
                ${m.text ? `<div class="dm-bubble-text">${escapeHtml(m.text)}</div>` : ''}
                ${mediaHtml}
                <div class="dm-msg-time">${formatTimeAgo(m.created_at)} ${e2eeTag}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    if (shouldScroll) {
      stream.scrollTop = stream.scrollHeight;
      msgInput?.focus();
    }

    updateUnreadMessagesBadge();
  } catch (err) {
    if (stream) {
      stream.innerHTML = `
        <div class="dm-placeholder-state">
          <div class="dm-placeholder-icon">⚠️</div>
          <h3>Unable to Load Messages</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>`;
    }
  }
}

async function sendDirectMessage() {
  const friendId = STATE.messaging.activeFriendId;
  const input = document.getElementById('dmMessageInput');
  const sendBtn = document.getElementById('dmSendMessageBtn');
  if (!friendId || !input) return;

  const text = input.value.trim();
  const attachment = STATE.dmAttachment;
  if (!text && !attachment) return;

  // Auto-Moderation: Targeted Personal Attacks vs Idea Debate
  if (text) {
    const civility = evaluateContentCivility(text);
    if (civility.isPersonalAttack) {
      showToast(`Message auto-moderated away: Targeted personal attack ("${civility.flaggedSnippet}"). Please communicate with civility.`, 'danger');
      return;
    }
  }

  sendBtn.disabled = true;

  try {
    const encPayload = await encryptDirectMessagePayload(friendId, text, attachment ? attachment.url : '');
    await apiRequest('/api/messages', 'POST', {
      recipient_id: friendId,
      text: encPayload.text,
      media_url: encPayload.media_url,
      media_type: encPayload.media_type,
      is_encrypted: encPayload.is_encrypted,
      iv: encPayload.iv,
      algo: encPayload.algo
    });

    input.value = '';
    STATE.dmAttachment = null;
    hideDmAttachmentPreview();

    await loadDirectMessages(friendId, true);
    await loadConversationsList(friendId);
  } catch (err) {
    showToast('Failed to send message: ' + err.message, 'danger');
  } finally {
    sendBtn.disabled = false;
  }
}

window.openDirectMessagesModal = openDirectMessagesModal;
window.selectDmFriend = selectDmFriend;

// Voice Note Audio Player Handler
window.togglePlayVoice = function(msgId, mediaUrl) {
  const player = document.getElementById(`voice-player-${msgId}`);
  const audio = document.getElementById(`audio-${msgId}`);
  const btn = player?.querySelector('.voice-play-btn');
  const timeEl = document.getElementById(`voice-time-${msgId}`);
  if (!audio) return;

  // Pause any other playing voice notes
  document.querySelectorAll('.voice-message-player.playing').forEach(p => {
    if (p !== player) {
      const a = p.querySelector('audio');
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      p.classList.remove('playing');
      const b = p.querySelector('.voice-play-btn');
      if (b) b.textContent = '▶';
    }
  });

  if (audio.paused) {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        player.classList.add('playing');
        if (btn) btn.textContent = '❚❚';
      }).catch(err => {
        console.warn('Voice playback prevented by mobile policy:', err);
        showToast('Tap play again to enable audio on mobile 🎙️', 'info');
      });
    } else {
      player.classList.add('playing');
      if (btn) btn.textContent = '❚❚';
    }

    audio.ontimeupdate = () => {
      const cur = Math.floor(audio.currentTime);
      const dur = Math.floor(audio.duration || 0);
      if (timeEl) timeEl.textContent = `${Math.floor(cur / 60)}:${(cur % 60).toString().padStart(2, '0')} / ${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, '0')}`;
    };

    audio.onended = () => {
      player.classList.remove('playing');
      if (btn) btn.textContent = '▶';
      if (timeEl) timeEl.textContent = 'Voice Note 🎙️';
    };
  } else {
    audio.pause();
    player.classList.remove('playing');
    if (btn) btn.textContent = '▶';
  }
};

/* ==========================================================================
   FACEBOOK-STYLE GIF PICKER SYSTEM
   ========================================================================== */

const GIF_CATALOG = [
  // === Category: LAUGH (25 GIFs) ===
  { id: "g_1", title: "a man is smiling and making a fu...", category: "laugh", tags: ["laugh", "man", "smiling", "and", "making", "fu..."], url: "https://media.tenor.com/rL4hulhuEIYAAAAM/funny-laughing.gif" },
  { id: "g_2", title: "spongebob is standing next to a ...", category: "laugh", tags: ["laugh", "spongebob", "standing", "next", "..."], url: "https://media.tenor.com/fmNyqECGKIwAAAAM/spongebob-laughing.gif" },
  { id: "g_3", title: "a cartoon character named sponge...", category: "laugh", tags: ["laugh", "cartoon", "character", "named", "sponge..."], url: "https://media.tenor.com/Qev-tOMFYwMAAAAM/spongebob-meme-laugh.gif" },
  { id: "g_4", title: "a baby is covering his mouth wit...", category: "laugh", tags: ["laugh", "baby", "covering", "his", "mouth", "wit..."], url: "https://media.tenor.com/u0jt7A4cniMAAAAM/funny.gif" },
  { id: "g_5", title: "a woman in a blue tank top is dr...", category: "laugh", tags: ["laugh", "woman", "blue", "tank", "top", "dr..."], url: "https://media.tenor.com/3YX1vx3m6OwAAAAM/laugh-spit.gif" },
  { id: "g_6", title: "a man is sitting at a table with...", category: "laugh", tags: ["laugh", "man", "sitting", "table", "with..."], url: "https://media.tenor.com/RyWAaP5mSwIAAAAM/table-mess-lmao.gif" },
  { id: "g_7", title: "a young boy with big eyes is wea...", category: "laugh", tags: ["laugh", "young", "boy", "with", "big", "eyes"], url: "https://media.tenor.com/gMcOX5g1sQkAAAAM/heh.gif" },
  { id: "g_8", title: "a woman with braids is making a ...", category: "laugh", tags: ["laugh", "woman", "with", "braids", "making", "..."], url: "https://media.tenor.com/oTB8x_wjaekAAAAM/cracking-up-laughing.gif" },
  { id: "g_9", title: "a man is screaming in front of a...", category: "laugh", tags: ["laugh", "man", "screaming", "front", "a..."], url: "https://media.tenor.com/SqcnSSG9bR8AAAAM/laughing-hysterically-laughing.gif" },
  { id: "g_10", title: "four images of a man with a must...", category: "laugh", tags: ["laugh", "four", "images", "man", "with", "must..."], url: "https://media.tenor.com/64sVYLv74VAAAAAM/smug-smirk.gif" },
  { id: "g_11", title: "a man wearing headphones is maki...", category: "laugh", tags: ["laugh", "man", "wearing", "headphones", "maki..."], url: "https://media.tenor.com/TKbQdqJ5tCAAAAAM/my-mom-is-kinda-homeless.gif" },
  { id: "g_12", title: "a video of a man laughing for 53...", category: "laugh", tags: ["laugh", "video", "man", "laughing", "for", "53..."], url: "https://media.tenor.com/RIjdkM6JiuQAAAAM/legit-laughing-legit-laugh.gif" },
  { id: "g_13", title: "a close up of a man covering his...", category: "laugh", tags: ["laugh", "close", "man", "covering", "his..."], url: "https://media.tenor.com/4DxaB9TliaoAAAAM/baby-laugh-elon-musk.gif" },
  { id: "g_14", title: "a little girl is smiling in a bl...", category: "laugh", tags: ["laugh", "little", "girl", "smiling", "bl..."], url: "https://media.tenor.com/4k2T2gAmHj8AAAAM/funny.gif" },
  { id: "g_15", title: "a smiley face with tears coming ...", category: "laugh", tags: ["laugh", "smiley", "face", "with", "tears", "coming"], url: "https://media.tenor.com/Rte3jcT5-AQAAAAM/laughing-laugh.gif" },
  { id: "g_16", title: "a young boy with a missing tooth...", category: "laugh", tags: ["laugh", "young", "boy", "with", "missing", "tooth..."], url: "https://media.tenor.com/HXHCV0LpqNAAAAAM/hilarious-so-funny.gif" },
  { id: "g_17", title: "two muppets in suits and ties ar...", category: "laugh", tags: ["laugh", "two", "muppets", "suits", "and", "ties"], url: "https://media.tenor.com/wIpRwpNqNxsAAAAM/muppets.gif" },
  { id: "g_18", title: "a cartoon of spongebob brushing ...", category: "laugh", tags: ["laugh", "cartoon", "spongebob", "brushing", "..."], url: "https://media.tenor.com/b_fyEAmO4oYAAAAM/laughing-laughing-hysterically.gif" },
  { id: "g_19", title: "a man in a suit and tie is makin...", category: "laugh", tags: ["laugh", "man", "suit", "and", "tie", "makin..."], url: "https://media.tenor.com/OHLuEtuWMTAAAAAM/%D1%81%D0%BB%D0%B0%D0%B2%D0%BD%D1%8B%D0%B5-%D0%BF%D0%B0%D1%80%D0%BD%D0%B8.gif" },
  { id: "g_20", title: "a laughing smiley face with tear...", category: "laugh", tags: ["laugh", "laughing", "smiley", "face", "with", "tear..."], url: "https://media.tenor.com/_Owm-I0jxAQAAAAM/lol-laugh-out-loud.gif" },
  { id: "g_21", title: "two women are laughing with thei...", category: "laugh", tags: ["laugh", "two", "women", "are", "laughing", "with"], url: "https://media.tenor.com/mgthtWbAg5QAAAAM/petty-ahhh.gif" },
  { id: "g_22", title: "a picture of a girl with the wor...", category: "laugh", tags: ["laugh", "picture", "girl", "with", "the", "wor..."], url: "https://media.tenor.com/aNui3Y1lWMcAAAAM/nagomi-yui-delicious-party-precure.gif" },
  { id: "g_23", title: "a man in a suit and tie is makin...", category: "laugh", tags: ["laugh", "man", "suit", "and", "tie", "makin..."], url: "https://media.tenor.com/wE0jylD_O4gAAAAM/goodfellas-laugh-liotta.gif" },
  { id: "g_24", title: "a close up of a cat with its mou...", category: "laugh", tags: ["laugh", "close", "cat", "with", "its", "mou..."], url: "https://media.tenor.com/M5eeMI-sp7gAAAAM/funny.gif" },
  { id: "g_25", title: "a cartoon character with pink ha...", category: "laugh", tags: ["laugh", "cartoon", "character", "with", "pink", "ha..."], url: "https://media.tenor.com/QCfjwHUkE1YAAAAM/diana-airlines-dianaairlinesvt.gif" },
  // === Category: LOVE (25 GIFs) ===
  { id: "g_26", title: "a teddy bear is blowing a kiss w...", category: "love", tags: ["love", "teddy", "bear", "blowing", "kiss", "w..."], url: "https://media.tenor.com/rKUSiVu2bB0AAAAM/kiss-blow-kiss.gif" },
  { id: "g_27", title: "a bunny is making a heart shape ...", category: "love", tags: ["love", "bunny", "making", "heart", "shape", "..."], url: "https://media.tenor.com/W_tWGmC2n_gAAAAM/i-love-you-too-i-love-you-more.gif" },
  { id: "g_28", title: "a stick figure holding a heart s...", category: "love", tags: ["love", "stick", "figure", "holding", "heart", "s..."], url: "https://media.tenor.com/OojIKHHp5FwAAAAM/i-love-you-love-you.gif" },
  { id: "g_29", title: "a cartoon of a cat holding a gav...", category: "love", tags: ["love", "cartoon", "cat", "holding", "gav..."], url: "https://media.tenor.com/1vG34iFTMscAAAAM/i-love-you-so-much-i-love-you.gif" },
  { id: "g_30", title: "no matter how much i say i love ...", category: "love", tags: ["love", "matter", "how", "much", "say", "love"], url: "https://media.tenor.com/-4hucvbn9bIAAAAM/i-love-you-love-you-more.gif" },
  { id: "g_31", title: "a red heart with the words i hav...", category: "love", tags: ["love", "red", "heart", "with", "the", "words"], url: "https://media.tenor.com/ffnUXpIHN0cAAAAM/i-love-you-i-love-you-so-much.gif" },
  { id: "g_32", title: "a cartoon illustration of a woma...", category: "love", tags: ["love", "cartoon", "illustration", "woma..."], url: "https://media.tenor.com/ZSckOIgn0OEAAAAM/my-love-happy-valentines-day.gif" },
  { id: "g_33", title: "hugs and kisses is written in re...", category: "love", tags: ["love", "hugs", "and", "kisses", "written", "re..."], url: "https://media.tenor.com/tbD6WGPKi40AAAAM/hugs-kiss.gif" },
  { id: "g_34", title: "a poster that says &quot; i love...", category: "love", tags: ["love", "poster", "that", "says", "&quot;", "love..."], url: "https://media.tenor.com/MXSD3XOEnuIAAAAM/tatis.gif" },
  { id: "g_35", title: "a picture of a full moon with a ...", category: "love", tags: ["love", "picture", "full", "moon", "with", "..."], url: "https://media.tenor.com/RPcbtw32OwUAAAAM/heart-my-heart.gif" },
  { id: "g_36", title: "a red background with the words ...", category: "love", tags: ["love", "red", "background", "with", "the", "words"], url: "https://media.tenor.com/pBWACdYjNxMAAAAM/i-love-you.gif" },
  { id: "g_37", title: "a colorful heart with a rainbow ...", category: "love", tags: ["love", "colorful", "heart", "with", "rainbow", "..."], url: "https://media.tenor.com/-l4QkFUk2-0AAAAM/pink-love-pink-love-heart.gif" },
  { id: "g_38", title: "a cartoon of a bear kissing anot...", category: "love", tags: ["love", "cartoon", "bear", "kissing", "anot..."], url: "https://media.tenor.com/c42IYe15VZQAAAAM/kiss-you-kiss-love.gif" },
  { id: "g_39", title: "snoopy and woodstock are sitting...", category: "love", tags: ["love", "snoopy", "and", "woodstock", "are", "sitting..."], url: "https://media.tenor.com/VNiYlvQtpBQAAAAM/happy-valentines-day-love-you-lots.gif" },
  { id: "g_40", title: "a pink penguin is looking out of...", category: "love", tags: ["love", "pink", "penguin", "looking", "out", "of..."], url: "https://media.tenor.com/cQK2tPw0MV0AAAAM/romeo-juliet.gif" },
  { id: "g_41", title: "patrick star from spongebob maki...", category: "love", tags: ["love", "patrick", "star", "from", "spongebob", "maki..."], url: "https://media.tenor.com/gbFipNTHIuMAAAAM/love-hand-heart.gif" },
  { id: "g_42", title: "a monkey is smiling and making a...", category: "love", tags: ["love", "monkey", "smiling", "and", "making", "a..."], url: "https://media.tenor.com/aQutvvck4h8AAAAM/love-i-love-you.gif" },
  { id: "g_43", title: "a cartoon of a panda and a brown...", category: "love", tags: ["love", "cartoon", "panda", "and", "brown..."], url: "https://media.tenor.com/RFmhzeK8E9oAAAAM/bubu-dudu.gif" },
  { id: "g_44", title: "a drawing of a cat with hearts a...", category: "love", tags: ["love", "drawing", "cat", "with", "hearts", "a..."], url: "https://media.tenor.com/hj8MT7SMfKgAAAAM/love-you.gif" },
  { id: "g_45", title: "a picture of a squirrel with the...", category: "love", tags: ["love", "picture", "squirrel", "with", "the..."], url: "https://media.tenor.com/_VGWSR2bdD8AAAAM/good-morning-good-morning-funny.gif" },
  { id: "g_46", title: "a white cat is surrounded by red...", category: "love", tags: ["love", "white", "cat", "surrounded", "red..."], url: "https://media.tenor.com/1nIDXbABxgsAAAAM/gif-gifkk.gif" },
  { id: "g_47", title: "a teddy bear holding a heart sha...", category: "love", tags: ["love", "teddy", "bear", "holding", "heart", "sha..."], url: "https://media.tenor.com/QkptQzEK30IAAAAM/good-morning.gif" },
  { id: "g_48", title: "a drawing of a stick figure hold...", category: "love", tags: ["love", "drawing", "stick", "figure", "hold..."], url: "https://media.tenor.com/M5QktrSsBPYAAAAM/i-love-you-love-you.gif" },
  { id: "g_49", title: "a greeting card with a pink hear...", category: "love", tags: ["love", "greeting", "card", "with", "pink", "hear..."], url: "https://media.tenor.com/Ekiok0vYJV4AAAAM/sending-love.gif" },
  { id: "g_50", title: "a goat is standing in the grass ...", category: "love", tags: ["love", "goat", "standing", "the", "grass", "..."], url: "https://media.tenor.com/vzTclbGYkVQAAAAM/funny-face-goats.gif" },
  // === Category: THUMBSUP (25 GIFs) ===
  { id: "g_51", title: "a young boy sits at a desk in fr...", category: "thumbsup", tags: ["thumbsup", "young", "boy", "sits", "desk", "fr..."], url: "https://media.tenor.com/t0gkGMRKmu0AAAAM/ok-nice-grafic.gif" },
  { id: "g_52", title: "a close up of a door with a blur...", category: "thumbsup", tags: ["thumbsup", "close", "door", "with", "blur..."], url: "https://media.tenor.com/wfAmmScM6sAAAAAM/awesome-ok.gif" },
  { id: "g_53", title: "a man in a car is giving a thumb...", category: "thumbsup", tags: ["thumbsup", "man", "car", "giving", "thumb..."], url: "https://media.tenor.com/TiTMT8ytep4AAAAM/good-job-thumbs-up.gif" },
  { id: "g_54", title: "a close up of a cartoon sheep wi...", category: "thumbsup", tags: ["thumbsup", "close", "cartoon", "sheep", "wi..."], url: "https://media.tenor.com/xjvmoEYtjwEAAAAM/thumbs-up-double-thumbs-up.gif" },
  { id: "g_55", title: "a man wearing a black hat that s...", category: "thumbsup", tags: ["thumbsup", "man", "wearing", "black", "hat", "that"], url: "https://media.tenor.com/2c1Qcz3Dl-QAAAAM/wayne%27s-world-wayne.gif" },
  { id: "g_56", title: "a man in a suit is laughing and ...", category: "thumbsup", tags: ["thumbsup", "man", "suit", "laughing", "and", "..."], url: "https://media.tenor.com/zuCQFYt64oEAAAAM/cat-insult.gif" },
  { id: "g_57", title: "a yellow smiley face is giving a...", category: "thumbsup", tags: ["thumbsup", "yellow", "smiley", "face", "giving", "a..."], url: "https://media.tenor.com/LpEzkHFtdgUAAAAM/gif-emoji.gif" },
  { id: "g_58", title: "a man is giving a thumbs up with...", category: "thumbsup", tags: ["thumbsup", "man", "giving", "thumbs", "with..."], url: "https://media.tenor.com/TpyM2Qaf9VsAAAAM/thumbs-up-funny.gif" },
  { id: "g_59", title: "a young man is giving a thumbs u...", category: "thumbsup", tags: ["thumbsup", "young", "man", "giving", "thumbs", "u..."], url: "https://media.tenor.com/c97-B3HdC4IAAAAM/starchxser1-thumbs-up.gif" },
  { id: "g_60", title: "a cat laying down giving a thumb...", category: "thumbsup", tags: ["thumbsup", "cat", "laying", "down", "giving", "thumb..."], url: "https://media.tenor.com/MpC76hQbFOkAAAAM/thumbsup.gif" },
  { id: "g_61", title: "a large furry gorilla is standin...", category: "thumbsup", tags: ["thumbsup", "large", "furry", "gorilla", "standin..."], url: "https://media.tenor.com/Da4GXD2bEO8AAAAM/gorilla-monkey-reaction-funny-rob-gorilla1.gif" },
  { id: "g_62", title: "a man is giving a thumbs up sign...", category: "thumbsup", tags: ["thumbsup", "man", "giving", "thumbs", "sign..."], url: "https://media.tenor.com/N4V6dSD-jKgAAAAM/funny-memes-funny-memes-2024.gif" },
  { id: "g_63", title: "a man in a blue suit and red tie...", category: "thumbsup", tags: ["thumbsup", "man", "blue", "suit", "and", "red"], url: "https://media.tenor.com/Ib_9V-VbREgAAAAM/point-at-you-point.gif" },
  { id: "g_64", title: "a cartoon cat is giving a thumbs...", category: "thumbsup", tags: ["thumbsup", "cartoon", "cat", "giving", "thumbs..."], url: "https://media.tenor.com/Y2m2cHSnr1QAAAAM/peach-goma.gif" },
  { id: "g_65", title: "a cat is giving a thumbs up sign...", category: "thumbsup", tags: ["thumbsup", "cat", "giving", "thumbs", "sign..."], url: "https://media.tenor.com/bDmyKRMnKMcAAAAM/like-cat.gif" },
  { id: "g_66", title: "a pink smiley face giving a thum...", category: "thumbsup", tags: ["thumbsup", "pink", "smiley", "face", "giving", "thum..."], url: "https://media.tenor.com/Ssh8xcUT4XUAAAAM/thumbs-up-ok.gif" },
  { id: "g_67", title: "a man is giving a thumbs up sign...", category: "thumbsup", tags: ["thumbsup", "man", "giving", "thumbs", "sign..."], url: "https://media.tenor.com/_Q5fyE8bATAAAAAM/yes-ball.gif" },
  { id: "g_68", title: "a man in a car is giving a thumb...", category: "thumbsup", tags: ["thumbsup", "man", "car", "giving", "thumb..."], url: "https://media.tenor.com/jsYmoMmKJxoAAAAM/good-job-thumbs-up.gif" },
  { id: "g_69", title: "a cat is giving a thumbs up sign", category: "thumbsup", tags: ["thumbsup", "cat", "giving", "thumbs", "sign"], url: "https://media.tenor.com/xLLfA5HW0-0AAAAM/cat.gif" },
  { id: "g_70", title: "a black and white photo of a cat...", category: "thumbsup", tags: ["thumbsup", "black", "and", "white", "photo", "cat..."], url: "https://media.tenor.com/5mz5YYozfcoAAAAM/cat-thumbs-up.gif" },
  { id: "g_71", title: "a video game called sonic the he...", category: "thumbsup", tags: ["thumbsup", "video", "game", "called", "sonic", "the"], url: "https://media.tenor.com/Zp70aW05nZYAAAAM/sonic-the-hedgehog-sonic.gif" },
  { id: "g_72", title: "a man in a striped shirt is givi...", category: "thumbsup", tags: ["thumbsup", "man", "striped", "shirt", "givi..."], url: "https://media.tenor.com/YXJb-GI93WYAAAAM/like.gif" },
  { id: "g_73", title: "a cartoon character named sponge...", category: "thumbsup", tags: ["thumbsup", "cartoon", "character", "named", "sponge..."], url: "https://media.tenor.com/Xw9iHP-mmE4AAAAM/bien.gif" },
  { id: "g_74", title: "arnold schwarzenegger is giving ...", category: "thumbsup", tags: ["thumbsup", "arnold", "schwarzenegger", "giving", "..."], url: "https://media.tenor.com/BAU04bTEsBoAAAAM/thumbs-up.gif" },
  { id: "g_75", title: "a man in a suit and tie is smili...", category: "thumbsup", tags: ["thumbsup", "man", "suit", "and", "tie", "smili..."], url: "https://media.tenor.com/vedf8zRRCYQAAAAM/mr-bean-thumbs-up.gif" },
  // === Category: CELEBRATE (25 GIFs) ===
  { id: "g_76", title: "a man in a suit and tie is danci...", category: "celebrate", tags: ["celebrate", "man", "suit", "and", "tie", "danci..."], url: "https://media.tenor.com/0Sh7u1lRsyEAAAAM/wedding-crasher-hro.gif" },
  { id: "g_77", title: "spongebob and patrick are dancin...", category: "celebrate", tags: ["celebrate", "spongebob", "and", "patrick", "are", "dancin..."], url: "https://media.tenor.com/fFCZieAsZ0kAAAAM/spongebob-patrick.gif" },
  { id: "g_78", title: "a boy wearing sunglasses and a b...", category: "celebrate", tags: ["celebrate", "boy", "wearing", "sunglasses", "and", "b..."], url: "https://media.tenor.com/OaQF-otweI8AAAAM/dadah.gif" },
  { id: "g_79", title: "a cartoon cat is playing with co...", category: "celebrate", tags: ["celebrate", "cartoon", "cat", "playing", "with", "co..."], url: "https://media.tenor.com/X4ovqUkrBD0AAAAM/cat-celebrate.gif" },
  { id: "g_80", title: "a woman stands in front of a cro...", category: "celebrate", tags: ["celebrate", "woman", "stands", "front", "cro..."], url: "https://media.tenor.com/FzfqOpPzinAAAAAM/happy-jumping.gif" },
  { id: "g_81", title: "a young boy wearing a yellow shi...", category: "celebrate", tags: ["celebrate", "young", "boy", "wearing", "yellow", "shi..."], url: "https://media.tenor.com/fB5v-iDC1qgAAAAM/dancing-dance.gif" },
  { id: "g_82", title: "a woman wearing a headset is lau...", category: "celebrate", tags: ["celebrate", "woman", "wearing", "headset", "lau..."], url: "https://media.tenor.com/WjMmHqwdhOMAAAAM/reaction-stan-tw.gif" },
  { id: "g_83", title: "a crowd of people watching a soc...", category: "celebrate", tags: ["celebrate", "crowd", "people", "watching", "soc..."], url: "https://media.tenor.com/v_rmWBcXrUgAAAAM/arsenal-arsenal-fan.gif" },
  { id: "g_84", title: "a woman in a purple dress is dan...", category: "celebrate", tags: ["celebrate", "woman", "purple", "dress", "dan..."], url: "https://media.tenor.com/-tVKq_zc-TEAAAAM/celebrate-celebrate-good-times.gif" },
  { id: "g_85", title: "a group of people in green unifo...", category: "celebrate", tags: ["celebrate", "group", "people", "green", "unifo..."], url: "https://media.tenor.com/gfdS5e_Fnl4AAAAM/let%27s-go.gif" },
  { id: "g_86", title: "a cartoon of a cat wearing a par...", category: "celebrate", tags: ["celebrate", "cartoon", "cat", "wearing", "par..."], url: "https://media.tenor.com/nCHz8iwNRGsAAAAM/woo-hoo.gif" },
  { id: "g_87", title: "two men in suits and ties are wa...", category: "celebrate", tags: ["celebrate", "two", "men", "suits", "and", "ties"], url: "https://media.tenor.com/X15e67QrANUAAAAM/the-office.gif" },
  { id: "g_88", title: "a little girl is dancing in fron...", category: "celebrate", tags: ["celebrate", "little", "girl", "dancing", "fron..."], url: "https://media.tenor.com/pC9d5PoRqYQAAAAM/party-time-yahoo.gif" },
  { id: "g_89", title: "a little girl wearing sunglasses...", category: "celebrate", tags: ["celebrate", "little", "girl", "wearing", "sunglasses..."], url: "https://media.tenor.com/E7j4VcIBUhsAAAAM/claire-dancing.gif" },
  { id: "g_90", title: "a black and white drawing of a d...", category: "celebrate", tags: ["celebrate", "black", "and", "white", "drawing", "d..."], url: "https://media.tenor.com/UjawZNn2UEgAAAAM/peanuts-snoopy-dancing-happy-dance-snoopy-dance-joy-charles-schulz-peanuts.gif" },
  { id: "g_91", title: "a black background with the word...", category: "celebrate", tags: ["celebrate", "black", "background", "with", "the", "word..."], url: "https://media.tenor.com/bafZbg7gl34AAAAM/little-pills.gif" },
  { id: "g_92", title: "a cartoon of snoopy , lucy and l...", category: "celebrate", tags: ["celebrate", "cartoon", "snoopy", "lucy", "and", "l..."], url: "https://media.tenor.com/_WDxMFAKbDYAAAAM/peanuts-lucy.gif" },
  { id: "g_93", title: "a man and a woman are jumping in...", category: "celebrate", tags: ["celebrate", "man", "and", "woman", "are", "jumping"], url: "https://media.tenor.com/z-oBTP1WqfgAAAAM/excited.gif" },
  { id: "g_94", title: "a man wearing a red shirt and a ...", category: "celebrate", tags: ["celebrate", "man", "wearing", "red", "shirt", "and"], url: "https://media.tenor.com/go1ejyzn45AAAAAM/let%27s-go-excited.gif" },
  { id: "g_95", title: "a group of people are sitting in...", category: "celebrate", tags: ["celebrate", "group", "people", "are", "sitting", "in..."], url: "https://media.tenor.com/BFCaHK42CxgAAAAM/squid-game-squid-game-3.gif" },
  { id: "g_96", title: "a man wearing a sweater with a h...", category: "celebrate", tags: ["celebrate", "man", "wearing", "sweater", "with", "h..."], url: "https://media.tenor.com/BfojNsJKhncAAAAM/christmas-eve-merry-christmas-eve.gif" },
  { id: "g_97", title: "a baby is sitting in a crowd wit...", category: "celebrate", tags: ["celebrate", "baby", "sitting", "crowd", "wit..."], url: "https://media.tenor.com/J8GV21cQO3QAAAAM/bb-baby.gif" },
  { id: "g_98", title: "two pink and blue penguins are d...", category: "celebrate", tags: ["celebrate", "two", "pink", "and", "blue", "penguins"], url: "https://media.tenor.com/4I0_QcQzZTUAAAAM/friday-weekend.gif" },
  { id: "g_99", title: "a man in a red suit is dancing o...", category: "celebrate", tags: ["celebrate", "man", "red", "suit", "dancing", "o..."], url: "https://media.tenor.com/7bOU9RFnddsAAAAM/dance-dancing.gif" },
  { id: "g_100", title: "two minions wearing goggles and ...", category: "celebrate", tags: ["celebrate", "two", "minions", "wearing", "goggles", "and"], url: "https://media.tenor.com/h4PqcTyMsL4AAAAM/cover3.gif" },
  // === Category: DANCING (25 GIFs) ===
  { id: "g_101", title: "a little girl wearing a black sw...", category: "dancing", tags: ["dancing", "little", "girl", "wearing", "black", "sw..."], url: "https://media.tenor.com/r2ZObFlQ5I4AAAAM/shoulder-roll-little-black-girl-dancing.gif" },
  { id: "g_102", title: "a young boy is dancing in a clas...", category: "dancing", tags: ["dancing", "young", "boy", "dancing", "clas..."], url: "https://media.tenor.com/g3T6Du7fTnoAAAAM/dance-moves.gif" },
  { id: "g_103", title: "a man in a blue shirt is dancing...", category: "dancing", tags: ["dancing", "man", "blue", "shirt", "dancing..."], url: "https://media.tenor.com/11tc7qIofU0AAAAM/clogging-blue-shirt.gif" },
  { id: "g_104", title: "a little girl is dancing in a ro...", category: "dancing", tags: ["dancing", "little", "girl", "dancing", "ro..."], url: "https://media.tenor.com/M1yP_xMGIJ8AAAAM/happy-food.gif" },
  { id: "g_105", title: "a little girl wearing sunglasses...", category: "dancing", tags: ["dancing", "little", "girl", "wearing", "sunglasses..."], url: "https://media.tenor.com/yzBV3-2bMyUAAAAM/dancing-happy-dance.gif" },
  { id: "g_106", title: "a man in a cowboy hat is dancing...", category: "dancing", tags: ["dancing", "man", "cowboy", "hat", "dancing..."], url: "https://media.tenor.com/YawokZurd2wAAAAM/cowboy-dancing.gif" },
  { id: "g_107", title: "a young boy in a car with the wo...", category: "dancing", tags: ["dancing", "young", "boy", "car", "with", "the"], url: "https://media.tenor.com/plo1QLlIg8UAAAAM/cuando-me-pagan-en-la-escuela.gif" },
  { id: "g_108", title: "a painting of a woman in a red d...", category: "dancing", tags: ["dancing", "painting", "woman", "red", "d..."], url: "https://media.tenor.com/qjS-oCn_xwwAAAAM/victorian-era-royalty.gif" },
  { id: "g_109", title: "a dog with arms and legs is stan...", category: "dancing", tags: ["dancing", "dog", "with", "arms", "and", "legs"], url: "https://media.tenor.com/KD0--RdfA18AAAAM/dance-ai-animal.gif" },
  { id: "g_110", title: "a man with a very large belly is...", category: "dancing", tags: ["dancing", "man", "with", "very", "large", "belly"], url: "https://media.tenor.com/t15dy-aBifAAAAAM/old-man.gif" },
  { id: "g_111", title: "a man with his eyes closed in a ...", category: "dancing", tags: ["dancing", "man", "with", "his", "eyes", "closed"], url: "https://media.tenor.com/QX2HXzcqB3oAAAAM/andrew-cooper-andrew-dance.gif" },
  { id: "g_112", title: "a man is dancing on a stage with...", category: "dancing", tags: ["dancing", "man", "dancing", "stage", "with..."], url: "https://media.tenor.com/yeH2tCarMXcAAAAM/dirty-dancing-movie-dirty-dancing.gif" },
  { id: "g_113", title: "a cartoon of bob &#039;s burgers...", category: "dancing", tags: ["dancing", "cartoon", "bob", "&#039;s", "burgers..."], url: "https://media.tenor.com/BvNnvfLh-JIAAAAM/bobs-burgers-tina-belcher.gif" },
  { id: "g_114", title: "a woman is dancing in front of a...", category: "dancing", tags: ["dancing", "woman", "dancing", "front", "a..."], url: "https://media.tenor.com/0HQyGtbuQ7YAAAAM/baumaclaud.gif" },
  { id: "g_115", title: "a man in a floral shirt and whit...", category: "dancing", tags: ["dancing", "man", "floral", "shirt", "and", "whit..."], url: "https://media.tenor.com/pvy9B-F9FGoAAAAM/dance-old-man-dancing.gif" },
  { id: "g_116", title: "a woman with curly hair is danci...", category: "dancing", tags: ["dancing", "woman", "with", "curly", "hair", "danci..."], url: "https://media.tenor.com/xY_rooBgVugAAAAM/serena-williams-c-walk.gif" },
  { id: "g_117", title: "a black and white cartoon dog is...", category: "dancing", tags: ["dancing", "black", "and", "white", "cartoon", "dog"], url: "https://media.tenor.com/hTCUTQ31ms0AAAAM/twerk-pochacco.gif" },
  { id: "g_118", title: "a dog is dancing in a living roo...", category: "dancing", tags: ["dancing", "dog", "dancing", "living", "roo..."], url: "https://media.tenor.com/yWHv9EE2mpcAAAAM/dance.gif" },
  { id: "g_119", title: "a man in a police uniform and a ...", category: "dancing", tags: ["dancing", "man", "police", "uniform", "and", "..."], url: "https://media.tenor.com/FW4mVtHssIsAAAAM/dabang-salman-khan.gif" },
  { id: "g_120", title: "a man in a blue shirt is holding...", category: "dancing", tags: ["dancing", "man", "blue", "shirt", "holding..."], url: "https://media.tenor.com/oBIWEcdk5gQAAAAM/yess.gif" },
  { id: "g_121", title: "a blurry picture of a man and a ...", category: "dancing", tags: ["dancing", "blurry", "picture", "man", "and", "..."], url: "https://media.tenor.com/leAEu72bILgAAAAM/ekoi-ekoi-dancekid.gif" },
  { id: "g_122", title: "bobs burgers bobs burgers bobs b...", category: "dancing", tags: ["dancing", "bobs", "burgers", "bobs", "burgers", "bobs"], url: "https://media.tenor.com/xKATJbrj5NsAAAAM/dance.gif" },
  { id: "g_123", title: "a man in a white shirt and black...", category: "dancing", tags: ["dancing", "man", "white", "shirt", "and", "black..."], url: "https://media.tenor.com/m5f0hwE-_1IAAAAM/michael-jackson-ghosts.gif" },
  { id: "g_124", title: "a man in a hat is dancing in fro...", category: "dancing", tags: ["dancing", "man", "hat", "dancing", "fro..."], url: "https://media.tenor.com/gNhX4xDDa5gAAAAM/dude-dancing-guy-dancing.gif" },
  { id: "g_125", title: "a group of people dancing in fro...", category: "dancing", tags: ["dancing", "group", "people", "dancing", "fro..."], url: "https://media.tenor.com/3M5fRlU74tkAAAAM/dancing.gif" },
  // === Category: MINDBLOWN (25 GIFs) ===
  { id: "g_126", title: "a man with glasses is surrounded...", category: "mindblown", tags: ["mindblown", "man", "with", "glasses", "surrounded..."], url: "https://media.tenor.com/3eIvVsG3yPYAAAAM/the-universe-tim-and-eric-mind-blown.gif" },
  { id: "g_127", title: "a cat is sitting on a couch with...", category: "mindblown", tags: ["mindblown", "cat", "sitting", "couch", "with..."], url: "https://media.tenor.com/IklKDJCAZHgAAAAM/confused-cat.gif" },
  { id: "g_128", title: "a cat with its mouth open and th...", category: "mindblown", tags: ["mindblown", "cat", "with", "its", "mouth", "open"], url: "https://media.tenor.com/t0b1HNNbtYQAAAAM/mindblown-omg.gif" },
  { id: "g_129", title: "a man with glasses is surrounded...", category: "mindblown", tags: ["mindblown", "man", "with", "glasses", "surrounded..."], url: "https://media.tenor.com/G0sYoHgm3dkAAAAM/mind-blown-woah.gif" },
  { id: "g_130", title: "a man sitting at a desk with his...", category: "mindblown", tags: ["mindblown", "man", "sitting", "desk", "with", "his..."], url: "https://media.tenor.com/roHqgq0UdmsAAAAM/chris-pratt-american-actor.gif" },
  { id: "g_131", title: "a man with a cloud coming out of...", category: "mindblown", tags: ["mindblown", "man", "with", "cloud", "coming", "out"], url: "https://media.tenor.com/3JiNIqvbCkkAAAAM/mind-blown.gif" },
  { id: "g_132", title: "a man wearing headphones and a b...", category: "mindblown", tags: ["mindblown", "man", "wearing", "headphones", "and", "b..."], url: "https://media.tenor.com/TQWT1dCBydEAAAAM/ishowspeed-reaction.gif" },
  { id: "g_133", title: "a close up of a man &#039;s face...", category: "mindblown", tags: ["mindblown", "close", "man", "&#039;s", "face..."], url: "https://media.tenor.com/xVDx_aPbtC0AAAAM/idk-mind.gif" },
  { id: "g_134", title: "a pixel art of a cat with an exp...", category: "mindblown", tags: ["mindblown", "pixel", "art", "cat", "with", "exp..."], url: "https://media.tenor.com/Ls8Q2U9ybd0AAAAM/meme.gif" },
  { id: "g_135", title: "a man in a blue shirt is sitting...", category: "mindblown", tags: ["mindblown", "man", "blue", "shirt", "sitting..."], url: "https://media.tenor.com/p7WjwdVwAToAAAAM/mind-blown-rick-devens.gif" },
  { id: "g_136", title: "a cartoon of a monkey with a lig...", category: "mindblown", tags: ["mindblown", "cartoon", "monkey", "with", "lig..."], url: "https://media.tenor.com/VIQV4KQcKPwAAAAM/ponke-ponkesol.gif" },
  { id: "g_137", title: "patrick star from spongebob squa...", category: "mindblown", tags: ["mindblown", "patrick", "star", "from", "spongebob", "squa..."], url: "https://media.tenor.com/3xoRK7hFE3gAAAAM/patrick-star-spongebob-squarepants.gif" },
  { id: "g_138", title: "a man in a suit and tie is danci...", category: "mindblown", tags: ["mindblown", "man", "suit", "and", "tie", "danci..."], url: "https://media.tenor.com/vlrr3uv6GgIAAAAM/100.gif" },
  { id: "g_139", title: "a yellow smiley face with a crac...", category: "mindblown", tags: ["mindblown", "yellow", "smiley", "face", "with", "crac..."], url: "https://media.tenor.com/SBY9UHMcfdAAAAAM/mind-blast-shocked.gif" },
  { id: "g_140", title: "a man in a suit is making a funn...", category: "mindblown", tags: ["mindblown", "man", "suit", "making", "funn..."], url: "https://media.tenor.com/OGVAmTtvE70AAAAM/wow-amazed.gif" },
  { id: "g_141", title: "a man is making a funny face wit...", category: "mindblown", tags: ["mindblown", "man", "making", "funny", "face", "wit..."], url: "https://media.tenor.com/KvE4Bcj1-r4AAAAM/woah-mind-blown.gif" },
  { id: "g_142", title: "Shock", category: "mindblown", tags: ["mindblown", "shock"], url: "https://media.tenor.com/EHsLT25nw5gAAAAM/shock.gif" },
  { id: "g_143", title: "a man in a suit is making a funn...", category: "mindblown", tags: ["mindblown", "man", "suit", "making", "funn..."], url: "https://media.tenor.com/I_WQeFXwbCsAAAAM/kramer-seinfeld.gif" },
  { id: "g_144", title: "a cat wearing a tin foil hat on ...", category: "mindblown", tags: ["mindblown", "cat", "wearing", "tin", "foil", "hat"], url: "https://media.tenor.com/pboO9uBNeYgAAAAM/cat-with-aluminum-hat-aluminum-foil-hat.gif" },
  { id: "g_145", title: "patrick star from spongebob squa...", category: "mindblown", tags: ["mindblown", "patrick", "star", "from", "spongebob", "squa..."], url: "https://media.tenor.com/yHnZU_JLCZsAAAAM/patrick-star-mind-blown.gif" },
  { id: "g_146", title: "a man with his hand on his chin ...", category: "mindblown", tags: ["mindblown", "man", "with", "his", "hand", "his"], url: "https://media.tenor.com/B7z_31m7pvoAAAAM/mind-blown-shocked-face.gif" },
  { id: "g_147", title: "a pikachu with an explosion on i...", category: "mindblown", tags: ["mindblown", "pikachu", "with", "explosion", "i..."], url: "https://media.tenor.com/IytURUAnGBkAAAAM/mind-blown-mind-blowing.gif" },
  { id: "g_148", title: "a cartoon of a frog with a sweat...", category: "mindblown", tags: ["mindblown", "cartoon", "frog", "with", "sweat..."], url: "https://media.tenor.com/P9GspU00sSQAAAAM/ada-blow-your-mind.gif" },
  { id: "g_149", title: "a man in a red uniform is sittin...", category: "mindblown", tags: ["mindblown", "man", "red", "uniform", "sittin..."], url: "https://media.tenor.com/oPeZQzi6ZnUAAAAM/mind-blown-mind-blowing.gif" },
  { id: "g_150", title: "a cartoon illustration of a boar...", category: "mindblown", tags: ["mindblown", "cartoon", "illustration", "boar..."], url: "https://media.tenor.com/iAZANpOh8uAAAAAM/boar-explosion.gif" },
  // === Category: APPLAUSE (25 GIFs) ===
  { id: "g_151", title: "a crowd of people are sitting in...", category: "applause", tags: ["applause", "crowd", "people", "are", "sitting", "in..."], url: "https://media.tenor.com/52m2xgRJeSgAAAAM/clapping-clap.gif" },
  { id: "g_152", title: "a man in a suit and tie is appla...", category: "applause", tags: ["applause", "man", "suit", "and", "tie", "appla..."], url: "https://media.tenor.com/GextgpxYonoAAAAM/clapping-leonardo-dicaprio.gif" },
  { id: "g_153", title: "a man in a tuxedo is sitting in ...", category: "applause", tags: ["applause", "man", "tuxedo", "sitting", "..."], url: "https://media.tenor.com/Tut-NCefoD0AAAAM/clapping-hands.gif" },
  { id: "g_154", title: "a man with a beard is clapping h...", category: "applause", tags: ["applause", "man", "with", "beard", "clapping", "h..."], url: "https://media.tenor.com/ldtenI69xG8AAAAM/bravo-clapping.gif" },
  { id: "g_155", title: "a man in a suit and tie is sitti...", category: "applause", tags: ["applause", "man", "suit", "and", "tie", "sitti..."], url: "https://media.tenor.com/DF9uYwsi6IIAAAAM/the-office-michael-scott.gif" },
  { id: "g_156", title: "a woman in a black strapless top...", category: "applause", tags: ["applause", "woman", "black", "strapless", "top..."], url: "https://media.tenor.com/P6S5gyUu_iwAAAAM/tea.gif" },
  { id: "g_157", title: "a group of people applauding wit...", category: "applause", tags: ["applause", "group", "people", "applauding", "wit..."], url: "https://media.tenor.com/paXQ0eZDvxIAAAAM/tcalk%C4%B1s1x-alk%C4%B1stc1x.gif" },
  { id: "g_158", title: "a group of minions are standing ...", category: "applause", tags: ["applause", "group", "minions", "are", "standing", "..."], url: "https://media.tenor.com/KuI6KsD1KwsAAAAM/oanhcute.gif" },
  { id: "g_159", title: "woody woodpecker is holding up a...", category: "applause", tags: ["applause", "woody", "woodpecker", "holding", "a..."], url: "https://media.tenor.com/e1chUJgy68UAAAAM/pica-pau-woody.gif" },
  { id: "g_160", title: "a crowd of people are applauding...", category: "applause", tags: ["applause", "crowd", "people", "are", "applauding..."], url: "https://media.tenor.com/boZzyOlvppcAAAAM/clapping-clap.gif" },
  { id: "g_161", title: "a man applauds with the #schitts...", category: "applause", tags: ["applause", "man", "applauds", "with", "the", "#schitts..."], url: "https://media.tenor.com/-DXhLQTX9hwAAAAM/im-proud-of-you-dan-levy.gif" },
  { id: "g_162", title: "a man in a tuxedo and bow tie is...", category: "applause", tags: ["applause", "man", "tuxedo", "and", "bow", "tie"], url: "https://media.tenor.com/4n-NpUjk0IAAAAAM/ryan-gosling-clap-gif---find-%26-share-on-giphy.gif" },
  { id: "g_163", title: "a man in a black shirt is crying...", category: "applause", tags: ["applause", "man", "black", "shirt", "crying..."], url: "https://media.tenor.com/GZjj0AvuUf4AAAAM/cry-happy.gif" },
  { id: "g_164", title: "a man wearing glasses and a blac...", category: "applause", tags: ["applause", "man", "wearing", "glasses", "and", "blac..."], url: "https://media.tenor.com/hg86IlUlq_IAAAAM/clapping-simon-cowell.gif" },
  { id: "g_165", title: "a woman in a white bra and pearl...", category: "applause", tags: ["applause", "woman", "white", "bra", "and", "pearl..."], url: "https://media.tenor.com/FaGbEdTjWWUAAAAM/gyulbibi-stan-twitter.gif" },
  { id: "g_166", title: "a woman is sitting in a crowd of...", category: "applause", tags: ["applause", "woman", "sitting", "crowd", "of..."], url: "https://media.tenor.com/cxLVoL4fS-MAAAAM/clapping-sass.gif" },
  { id: "g_167", title: "a woman in a blue dress is clapp...", category: "applause", tags: ["applause", "woman", "blue", "dress", "clapp..."], url: "https://media.tenor.com/dQUw6Z1XHeoAAAAM/stan-twitter-anne-hathaway.gif" },
  { id: "g_168", title: "a black and white drawing of a h...", category: "applause", tags: ["applause", "black", "and", "white", "drawing", "h..."], url: "https://media.tenor.com/bc42foh3-dIAAAAM/clap-clapping-emoji.gif" },
  { id: "g_169", title: "a woman wearing a green sweater ...", category: "applause", tags: ["applause", "woman", "wearing", "green", "sweater", "..."], url: "https://media.tenor.com/lq24-xhsTcMAAAAM/clapping-family-feud-canada.gif" },
  { id: "g_170", title: "a man in a suit and tie is clapp...", category: "applause", tags: ["applause", "man", "suit", "and", "tie", "clapp..."], url: "https://media.tenor.com/dMffAcRr3JIAAAAM/clapping-congrats.gif" },
  { id: "g_171", title: "three dogs standing next to each...", category: "applause", tags: ["applause", "three", "dogs", "standing", "next", "each..."], url: "https://media.tenor.com/ion-RFrrcrYAAAAM/dogs-dog.gif" },
  { id: "g_172", title: "a group of people are sitting in...", category: "applause", tags: ["applause", "group", "people", "are", "sitting", "in..."], url: "https://media.tenor.com/Sq7rY9NKKd4AAAAM/oscars-standing-ovation.gif" },
  { id: "g_173", title: "a man in a tuxedo and bow tie is...", category: "applause", tags: ["applause", "man", "tuxedo", "and", "bow", "tie"], url: "https://media.tenor.com/wVXSesI8ttEAAAAM/yes-clap.gif" },
  { id: "g_174", title: "a man in a suit and tie is clapp...", category: "applause", tags: ["applause", "man", "suit", "and", "tie", "clapp..."], url: "https://media.tenor.com/nnS2iivMglgAAAAM/very-good.gif" },
  { id: "g_175", title: "a woman says &quot; my girl &quo...", category: "applause", tags: ["applause", "woman", "says", "&quot;", "girl", "&quo..."], url: "https://media.tenor.com/d9PZBo-BAGsAAAAM/applause-applaud.gif" },
  // === Category: COFFEE (25 GIFs) ===
  { id: "g_176", title: "a dog standing next to a cup of ...", category: "coffee", tags: ["coffee", "dog", "standing", "next", "cup", "..."], url: "https://media.tenor.com/BTUOMeVn79gAAAAM/me-me-me-me-too.gif" },
  { id: "g_177", title: "a kitten is holding a cup that s...", category: "coffee", tags: ["coffee", "kitten", "holding", "cup", "that", "s..."], url: "https://media.tenor.com/QzzhKfWneeEAAAAM/kedi-cat.gif" },
  { id: "g_178", title: "a man with a surprised look on h...", category: "coffee", tags: ["coffee", "man", "with", "surprised", "look", "h..."], url: "https://media.tenor.com/k1390286nYAAAAAM/mr-bean-miss-you.gif" },
  { id: "g_179", title: "a poster that says good morning ...", category: "coffee", tags: ["coffee", "poster", "that", "says", "good", "morning"], url: "https://media.tenor.com/B2JQUZ8mxYsAAAAM/good-morning-coffee.gif" },
  { id: "g_180", title: "a cat is pouring coffee into a c...", category: "coffee", tags: ["coffee", "cat", "pouring", "coffee", "into", "c..."], url: "https://media.tenor.com/Ma8m_5z0G0YAAAAM/good-morning-morning-coffee.gif" },
  { id: "g_181", title: "a cup of coffee with the words c...", category: "coffee", tags: ["coffee", "cup", "coffee", "with", "the", "words"], url: "https://media.tenor.com/udM8gNJzvMYAAAAM/coffee-time-coffee-cup.gif" },
  { id: "g_182", title: "a rooster is pouring coffee into...", category: "coffee", tags: ["coffee", "rooster", "pouring", "coffee", "into..."], url: "https://media.tenor.com/Oz3EsJSbBJMAAAAM/coffee-morning.gif" },
  { id: "g_183", title: "a cup of coffee with the words &...", category: "coffee", tags: ["coffee", "cup", "coffee", "with", "the", "words"], url: "https://media.tenor.com/n1GV7nrGRjoAAAAM/welcome.gif" },
  { id: "g_184", title: "a cup of coffee on a saucer with...", category: "coffee", tags: ["coffee", "cup", "coffee", "saucer", "with..."], url: "https://media.tenor.com/84syjMN0fbQAAAAM/good-morning-goodmorning.gif" },
  { id: "g_185", title: "a cartoon of a zombie holding a ...", category: "coffee", tags: ["coffee", "cartoon", "zombie", "holding", "..."], url: "https://media.tenor.com/eWzAcgTFBdoAAAAM/raickan-rai.gif" },
  { id: "g_186", title: "a cat sits next to a cup of coff...", category: "coffee", tags: ["coffee", "cat", "sits", "next", "cup", "coff..."], url: "https://media.tenor.com/of4mNGRkITMAAAAM/morning-goodmorning.gif" },
  { id: "g_187", title: "a close up of a man drinking fro...", category: "coffee", tags: ["coffee", "close", "man", "drinking", "fro..."], url: "https://media.tenor.com/NREpc2K5ErUAAAAM/coffee-wide-awake.gif" },
  { id: "g_188", title: "a cup of coffee with the words m...", category: "coffee", tags: ["coffee", "cup", "coffee", "with", "the", "words"], url: "https://media.tenor.com/kiBSZliqzpwAAAAM/vibes-morning-vibes.gif" },
  { id: "g_189", title: "a cartoon of a girl holding a cu...", category: "coffee", tags: ["coffee", "cartoon", "girl", "holding", "cu..."], url: "https://media.tenor.com/g93HTKXUmaYAAAAM/coffee-persona.gif" },
  { id: "g_190", title: "a cup with a teddy bear on it is...", category: "coffee", tags: ["coffee", "cup", "with", "teddy", "bear", "is..."], url: "https://media.tenor.com/O2QH-K2fkrIAAAAM/chesus-bearish.gif" },
  { id: "g_191", title: "a cup of coffee with a heart sha...", category: "coffee", tags: ["coffee", "cup", "coffee", "with", "heart", "sha..."], url: "https://media.tenor.com/JDoVWuQwwk4AAAAM/coffee-cup-of-coffee.gif" },
  { id: "g_192", title: "a cup of coffee on a saucer with...", category: "coffee", tags: ["coffee", "cup", "coffee", "saucer", "with..."], url: "https://media.tenor.com/rPM3RCsvE3wAAAAM/mv99-natal.gif" },
  { id: "g_193", title: "a man in a striped suit pouring ...", category: "coffee", tags: ["coffee", "man", "striped", "suit", "pouring", "..."], url: "https://media.tenor.com/ruxwsQMTYcUAAAAM/coffee-need-coffee.gif" },
  { id: "g_194", title: "a black cat is holding a cup of ...", category: "coffee", tags: ["coffee", "black", "cat", "holding", "cup", "..."], url: "https://media.tenor.com/c2p_J-4XiOoAAAAM/nikkidascorpio.gif" },
  { id: "g_195", title: "elmo from sesame street is pouri...", category: "coffee", tags: ["coffee", "elmo", "from", "sesame", "street", "pouri..."], url: "https://media.tenor.com/up2ohrva--EAAAAM/coffee-elmo.gif" },
  { id: "g_196", title: "a fluffy cat sits next to a cup ...", category: "coffee", tags: ["coffee", "fluffy", "cat", "sits", "next", "cup"], url: "https://media.tenor.com/yvPktveG_7MAAAAM/sleepy-cat-morning-coffee.gif" },
  { id: "g_197", title: "a fluffy kitten is sitting next ...", category: "coffee", tags: ["coffee", "fluffy", "kitten", "sitting", "next", "..."], url: "https://media.tenor.com/FqywqTf3WDgAAAAM/cat-tired.gif" },
  { id: "g_198", title: "a cartoon character holding a cu...", category: "coffee", tags: ["coffee", "cartoon", "character", "holding", "cu..."], url: "https://media.tenor.com/V9cHL7x5cxEAAAAM/coffee-taz.gif" },
  { id: "g_199", title: "snow white from snow white and t...", category: "coffee", tags: ["coffee", "snow", "white", "from", "snow", "white"], url: "https://media.tenor.com/zlHI8-mmKk4AAAAM/coffee.gif" },
  { id: "g_200", title: "a little girl is sitting at a ta...", category: "coffee", tags: ["coffee", "little", "girl", "sitting", "ta..."], url: "https://media.tenor.com/raq08ldD8oEAAAAM/coffee-quotes.gif" },
  // === Category: SHOCKED (25 GIFs) ===
  { id: "g_201", title: "a young boy is covering his mout...", category: "shocked", tags: ["shocked", "young", "boy", "covering", "his", "mout..."], url: "https://media.tenor.com/TJPExKvCOkEAAAAM/shocked-im-shocked.gif" },
  { id: "g_202", title: "a woman with a nose ring and a b...", category: "shocked", tags: ["shocked", "woman", "with", "nose", "ring", "and"], url: "https://media.tenor.com/gcxzC12AGGgAAAAM/reaction-shocked.gif" },
  { id: "g_203", title: "a man is talking on a cell phone...", category: "shocked", tags: ["shocked", "man", "talking", "cell", "phone..."], url: "https://media.tenor.com/IadVxvU3Bu8AAAAM/wtf-i-jus-hear-phone-drop.gif" },
  { id: "g_204", title: "a man in a suit is holding a pie...", category: "shocked", tags: ["shocked", "man", "suit", "holding", "pie..."], url: "https://media.tenor.com/YLcvR8DBwvIAAAAM/wow.gif" },
  { id: "g_205", title: "a man in a suit and tie has his ...", category: "shocked", tags: ["shocked", "man", "suit", "and", "tie", "has"], url: "https://media.tenor.com/swYDigA0_sAAAAAM/reactions.gif" },
  { id: "g_206", title: "a man wearing a watch is coverin...", category: "shocked", tags: ["shocked", "man", "wearing", "watch", "coverin..."], url: "https://media.tenor.com/OBHElaSUCjQAAAAM/miss-jay-jay.gif" },
  { id: "g_207", title: "a man in a black shirt is standi...", category: "shocked", tags: ["shocked", "man", "black", "shirt", "standi..."], url: "https://media.tenor.com/YUgGUmKcBdwAAAAM/john-cena-surprised.gif" },
  { id: "g_208", title: "a close up of a cat with its mou...", category: "shocked", tags: ["shocked", "close", "cat", "with", "its", "mou..."], url: "https://media.tenor.com/aLoZNO7gRQoAAAAM/shocked-cat-shocked.gif" },
  { id: "g_209", title: "a baby is wearing a purple sweat...", category: "shocked", tags: ["shocked", "baby", "wearing", "purple", "sweat..."], url: "https://media.tenor.com/aZR7AHWkslgAAAAM/say-whaaat-whaa.gif" },
  { id: "g_210", title: "a man is making a surprised face...", category: "shocked", tags: ["shocked", "man", "making", "surprised", "face..."], url: "https://media.tenor.com/CbOdc8xkhNYAAAAM/joey.gif" },
  { id: "g_211", title: "a stuffed monkey is talking on a...", category: "shocked", tags: ["shocked", "stuffed", "monkey", "talking", "a..."], url: "https://media.tenor.com/cShrvV5PaikAAAAM/what-monkey.gif" },
  { id: "g_212", title: "a man wearing a white t-shirt an...", category: "shocked", tags: ["shocked", "man", "wearing", "white", "t-shirt", "an..."], url: "https://media.tenor.com/HnujPMCyYYQAAAAM/flight-shocked.gif" },
  { id: "g_213", title: "a close up of a yellow smiley fa...", category: "shocked", tags: ["shocked", "close", "yellow", "smiley", "fa..."], url: "https://media.tenor.com/jDAN3hrbrnAAAAAM/emoji-yellow-emoji.gif" },
  { id: "g_214", title: "a woman in a pink tank top is sm...", category: "shocked", tags: ["shocked", "woman", "pink", "tank", "top", "sm..."], url: "https://media.tenor.com/GTiAhgCgJNwAAAAM/omg-help.gif" },
  { id: "g_215", title: "a pug dog with a pink collar is ...", category: "shocked", tags: ["shocked", "pug", "dog", "with", "pink", "collar"], url: "https://media.tenor.com/uSoOPqCRNUMAAAAM/pug-pugs.gif" },
  { id: "g_216", title: "a woman is sticking her tongue o...", category: "shocked", tags: ["shocked", "woman", "sticking", "her", "tongue", "o..."], url: "https://media.tenor.com/IwRCYKcFjngAAAAM/shocked-shocked-face.gif" },
  { id: "g_217", title: "a man with a surprised look on h...", category: "shocked", tags: ["shocked", "man", "with", "surprised", "look", "h..."], url: "https://media.tenor.com/lrvqsWXk6DEAAAAM/shocked-face-surprised.gif" },
  { id: "g_218", title: "a woman is sitting in the back s...", category: "shocked", tags: ["shocked", "woman", "sitting", "the", "back", "s..."], url: "https://media.tenor.com/9gtJWTJMcNsAAAAM/dog-surprised.gif" },
  { id: "g_219", title: "a close up of a pikachu with its...", category: "shocked", tags: ["shocked", "close", "pikachu", "with", "its..."], url: "https://media.tenor.com/T2roC7X0sQsAAAAM/surprised-shocked.gif" },
  { id: "g_220", title: "a man in a white shirt is making...", category: "shocked", tags: ["shocked", "man", "white", "shirt", "making..."], url: "https://media.tenor.com/poBsRo7oVjkAAAAM/nguyengif.gif" },
  { id: "g_221", title: "a bald man in a white shirt and ...", category: "shocked", tags: ["shocked", "bald", "man", "white", "shirt", "and"], url: "https://media.tenor.com/31MJQhL6sM8AAAAM/joe-rogan-surprised.gif" },
  { id: "g_222", title: "a cat with a surprised look on i...", category: "shocked", tags: ["shocked", "cat", "with", "surprised", "look", "i..."], url: "https://media.tenor.com/ghxs0nHkCLAAAAAM/shocked-shock.gif" },
  { id: "g_223", title: "a young woman is making a surpri...", category: "shocked", tags: ["shocked", "young", "woman", "making", "surpri..."], url: "https://media.tenor.com/JEASOxMyWXsAAAAM/shut-up-omg.gif" },
  { id: "g_224", title: "a man with a beard wearing a bea...", category: "shocked", tags: ["shocked", "man", "with", "beard", "wearing", "bea..."], url: "https://media.tenor.com/e0o0NsjKz9IAAAAM/oh-yeah-oh-really.gif" },
  { id: "g_225", title: "a cartoon turtle with big eyes i...", category: "shocked", tags: ["shocked", "cartoon", "turtle", "with", "big", "eyes"], url: "https://media.tenor.com/ThLxxC0zE0YAAAAM/shocked-surprised.gif" },
  // === Category: CUTE (25 GIFs) ===
  { id: "g_226", title: "a close up of a puppy laying on ...", category: "cute", tags: ["cute", "close", "puppy", "laying", "..."], url: "https://media.tenor.com/zJHas6TO4aoAAAAM/auau.gif" },
  { id: "g_227", title: "a porcupine is eating corn on th...", category: "cute", tags: ["cute", "porcupine", "eating", "corn", "th..."], url: "https://media.tenor.com/xqCufRWfWrwAAAAM/porcupine-corn.gif" },
  { id: "g_228", title: "a husky puppy is hanging over a ...", category: "cute", tags: ["cute", "husky", "puppy", "hanging", "over", "..."], url: "https://media.tenor.com/OjPPSVQKiLAAAAAM/please-help.gif" },
  { id: "g_229", title: "a puppy is sleeping on the floor...", category: "cute", tags: ["cute", "puppy", "sleeping", "the", "floor..."], url: "https://media.tenor.com/5qK1FHU9Fr0AAAAM/puppy-dog.gif" },
  { id: "g_230", title: "a small brown dog standing next ...", category: "cute", tags: ["cute", "small", "brown", "dog", "standing", "next"], url: "https://media.tenor.com/zn3-YHtY4mEAAAAM/animals-hugs.gif" },
  { id: "g_231", title: "a giraffe with a wig on its head...", category: "cute", tags: ["cute", "giraffe", "with", "wig", "its", "head..."], url: "https://media.tenor.com/_kEbS7KpN6oAAAAM/lol-omg.gif" },
  { id: "g_232", title: "a brown and white corgi dog is s...", category: "cute", tags: ["cute", "brown", "and", "white", "corgi", "dog"], url: "https://media.tenor.com/PyNYnhL9hY8AAAAM/funny-animals-cute.gif" },
  { id: "g_233", title: "a small dog with a flower on its...", category: "cute", tags: ["cute", "small", "dog", "with", "flower", "its..."], url: "https://media.tenor.com/e-Dy8w3cz9cAAAAM/dog-sleepy.gif" },
  { id: "g_234", title: "a husky puppy is sitting on a be...", category: "cute", tags: ["cute", "husky", "puppy", "sitting", "be..."], url: "https://media.tenor.com/euGoTz8lC00AAAAM/puppy-cute.gif" },
  { id: "g_235", title: "a kitten is sleeping on a stuffe...", category: "cute", tags: ["cute", "kitten", "sleeping", "stuffe..."], url: "https://media.tenor.com/4kxsM7SBsm4AAAAM/cat-daun-sleep.gif" },
  { id: "g_236", title: "a close up of a sloth laying on ...", category: "cute", tags: ["cute", "close", "sloth", "laying", "..."], url: "https://media.tenor.com/xAgxhjvW-g8AAAAM/happy-animal-cute-animals.gif" },
  { id: "g_237", title: "a picture of a kitten with the w...", category: "cute", tags: ["cute", "picture", "kitten", "with", "the", "w..."], url: "https://media.tenor.com/wkPEjeXaRxQAAAAM/right-meow.gif" },
  { id: "g_238", title: "a black and white puppy is sitti...", category: "cute", tags: ["cute", "black", "and", "white", "puppy", "sitti..."], url: "https://media.tenor.com/yo6AfXgQI84AAAAM/fatdog-gif-funny.gif" },
  { id: "g_239", title: "a dog and a cat are standing nex...", category: "cute", tags: ["cute", "dog", "and", "cat", "are", "standing"], url: "https://media.tenor.com/07PuiYKCVPEAAAAM/cat-cat-and-dog.gif" },
  { id: "g_240", title: "a green lizard is sitting on a r...", category: "cute", tags: ["cute", "green", "lizard", "sitting", "r..."], url: "https://media.tenor.com/Y7cLO07ATqIAAAAM/waving-lizard.gif" },
  { id: "g_241", title: "a close up of a red panda eating...", category: "cute", tags: ["cute", "close", "red", "panda", "eating..."], url: "https://media.tenor.com/yW2bk8sRZcgAAAAM/redpandastri-thereal23b.gif" },
  { id: "g_242", title: "a dog with a blue collar is stan...", category: "cute", tags: ["cute", "dog", "with", "blue", "collar", "stan..."], url: "https://media.tenor.com/ZedOcUS3P8EAAAAM/dancing-pitbull.gif" },
  { id: "g_243", title: "two chinchillas are standing ins...", category: "cute", tags: ["cute", "two", "chinchillas", "are", "standing", "ins..."], url: "https://media.tenor.com/1uYH0YuVyTAAAAAM/damn.gif" },
  { id: "g_244", title: "a small hedgehog wearing a knitt...", category: "cute", tags: ["cute", "small", "hedgehog", "wearing", "knitt..."], url: "https://media.tenor.com/ltQv2f5aV7MAAAAM/funny-face.gif" },
  { id: "g_245", title: "a white cat is laying on its bac...", category: "cute", tags: ["cute", "white", "cat", "laying", "its", "bac..."], url: "https://media.tenor.com/SLGDejiUWOgAAAAM/kitty-highkitten.gif" },
  { id: "g_246", title: "a close up of a kitten looking a...", category: "cute", tags: ["cute", "close", "kitten", "looking", "a..."], url: "https://media.tenor.com/CpANPl5LdP8AAAAM/meowsuris-twitter.gif" },
  { id: "g_247", title: "a kitten is petting a small yell...", category: "cute", tags: ["cute", "kitten", "petting", "small", "yell..."], url: "https://media.tenor.com/Gdn4ti2PGTkAAAAM/tu-meri-batak-m-tera-billa.gif" },
  { id: "g_248", title: "a white dog wearing a blue hat i...", category: "cute", tags: ["cute", "white", "dog", "wearing", "blue", "hat"], url: "https://media.tenor.com/Vva_5MMUK7MAAAAM/white-shiba-eating-a-flower.gif" },
  { id: "g_249", title: "a stuffed animal is running down...", category: "cute", tags: ["cute", "stuffed", "animal", "running", "down..."], url: "https://media.tenor.com/yOfx2MeJar0AAAAM/dog-doggo.gif" },
  { id: "g_250", title: "a close up of a puppy &#039;s no...", category: "cute", tags: ["cute", "close", "puppy", "&#039;s", "no..."], url: "https://media.tenor.com/ak2burlNtmUAAAAM/sleepy-dog-sleepy.gif" },
  // === Category: COOL (25 GIFs) ===
  { id: "g_251", title: "a young man is giving a thumbs u...", category: "cool", tags: ["cool", "young", "man", "giving", "thumbs", "u..."], url: "https://media.tenor.com/psvzo0hhSO0AAAAM/cool.gif" },
  { id: "g_252", title: "a close up of a man making a fun...", category: "cool", tags: ["cool", "close", "man", "making", "fun..."], url: "https://media.tenor.com/iu-7DBLnPMEAAAAM/you-don%27t-say-uh-huh.gif" },
  { id: "g_253", title: "timmy the sheep from the cartoon...", category: "cool", tags: ["cool", "timmy", "the", "sheep", "from", "the"], url: "https://media.tenor.com/wMnLKfTXeCgAAAAM/thumbs-up-double-thumbs-up.gif" },
  { id: "g_254", title: "a cat wearing sunglasses and a s...", category: "cool", tags: ["cool", "cat", "wearing", "sunglasses", "and", "s..."], url: "https://media.tenor.com/AIk0e-e7pvIAAAAM/cat-cool.gif" },
  { id: "g_255", title: "a man wearing a red shirt is loo...", category: "cool", tags: ["cool", "man", "wearing", "red", "shirt", "loo..."], url: "https://media.tenor.com/xs9mlPFhV3YAAAAM/ken-reid-ken.gif" },
  { id: "g_256", title: "the word cool is written in a co...", category: "cool", tags: ["cool", "the", "word", "cool", "written", "co..."], url: "https://media.tenor.com/dYowrRrdIOcAAAAM/cool-cool-cool.gif" },
  { id: "g_257", title: "a cartoon drawing of snoopy givi...", category: "cool", tags: ["cool", "cartoon", "drawing", "snoopy", "givi..."], url: "https://media.tenor.com/8fWdhiMzWcUAAAAM/cool-cool-beans.gif" },
  { id: "g_258", title: "a dog wearing sunglasses and a c...", category: "cool", tags: ["cool", "dog", "wearing", "sunglasses", "and", "c..."], url: "https://media.tenor.com/Ofy3iyiFsoUAAAAM/what-dog.gif" },
  { id: "g_259", title: "a man in a grey jacket is smilin...", category: "cool", tags: ["cool", "man", "grey", "jacket", "smilin..."], url: "https://media.tenor.com/-x3tYAVOca8AAAAM/dumb-and-dumber-cool.gif" },
  { id: "g_260", title: "a man is smiling and saying `` v...", category: "cool", tags: ["cool", "man", "smiling", "and", "saying", "v..."], url: "https://media.tenor.com/p__4vHwws5AAAAAM/ace-ventura-thumbs-up.gif" },
  { id: "g_261", title: "a cartoon cat wearing sunglasses...", category: "cool", tags: ["cool", "cartoon", "cat", "wearing", "sunglasses..."], url: "https://media.tenor.com/VGesUtVjPhoAAAAM/peach-and-goma-goma.gif" },
  { id: "g_262", title: "a cartoon duck with the words co...", category: "cool", tags: ["cool", "cartoon", "duck", "with", "the", "words"], url: "https://media.tenor.com/4vWsFluT3_EAAAAM/cool.gif" },
  { id: "g_263", title: "a man in a leather jacket says t...", category: "cool", tags: ["cool", "man", "leather", "jacket", "says", "t..."], url: "https://media.tenor.com/EeUAu5SxfpYAAAAM/grease-john-travolta.gif" },
  { id: "g_264", title: "a penguin wearing sunglasses wit...", category: "cool", tags: ["cool", "penguin", "wearing", "sunglasses", "wit..."], url: "https://media.tenor.com/9BGFrDMeOfEAAAAM/cool-story-sugoi.gif" },
  { id: "g_265", title: "a cartoon of a panda eating wate...", category: "cool", tags: ["cool", "cartoon", "panda", "eating", "wate..."], url: "https://media.tenor.com/NxNq-5lER6QAAAAM/fan-heat.gif" },
  { id: "g_266", title: "a panda bear is making a funny f...", category: "cool", tags: ["cool", "panda", "bear", "making", "funny", "f..."], url: "https://media.tenor.com/oxhSBcii7IsAAAAM/panda-panda-love.gif" },
  { id: "g_267", title: "a man with a beard is sitting do...", category: "cool", tags: ["cool", "man", "with", "beard", "sitting", "do..."], url: "https://media.tenor.com/YIWOmfySJP8AAAAM/you-don%27t-say-uh-huh.gif" },
  { id: "g_268", title: "a cartoon heart with a face and ...", category: "cool", tags: ["cool", "cartoon", "heart", "with", "face", "and"], url: "https://media.tenor.com/s0GV2he5q08AAAAM/alright-alrighty.gif" },
  { id: "g_269", title: "a dog wearing sunglasses and a c...", category: "cool", tags: ["cool", "dog", "wearing", "sunglasses", "and", "c..."], url: "https://media.tenor.com/MMj6ZSgUbqQAAAAM/cool-kids-hang-out.gif" },
  { id: "g_270", title: "a young man wearing sunglasses i...", category: "cool", tags: ["cool", "young", "man", "wearing", "sunglasses", "i..."], url: "https://media.tenor.com/3ts91kJsRo0AAAAM/breakfast-club-sunglasses.gif" },
  { id: "g_271", title: "a pikachu wearing sunglasses say...", category: "cool", tags: ["cool", "pikachu", "wearing", "sunglasses", "say..."], url: "https://media.tenor.com/QYsR7RMrQ14AAAAM/pikachu-nodding.gif" },
  { id: "g_272", title: "a close up of a man &#039;s face...", category: "cool", tags: ["cool", "close", "man", "&#039;s", "face..."], url: "https://media.tenor.com/JASxnVwLwOEAAAAM/you-don%27t-say-uh-huh.gif" },
  { id: "g_273", title: "a man in a suit and tie is sitti...", category: "cool", tags: ["cool", "man", "suit", "and", "tie", "sitti..."], url: "https://media.tenor.com/E8ySaP67i_gAAAAM/the-office-clap-two-thumbs-up.gif" },
  { id: "g_274", title: "a person is holding a popsicle t...", category: "cool", tags: ["cool", "person", "holding", "popsicle", "t..."], url: "https://media.tenor.com/53yaXe_yrRIAAAAM/beans.gif" },
  { id: "g_275", title: "beavis and butthead from beavis ...", category: "cool", tags: ["cool", "beavis", "and", "butthead", "from", "beavis"], url: "https://media.tenor.com/gVaQyEPbmBcAAAAM/that%27s-cool-beavis.gif" },
  // === Category: CRY (25 GIFs) ===
  { id: "g_276", title: "a dog is crying while holding a ...", category: "cry", tags: ["cry", "dog", "crying", "while", "holding", "..."], url: "https://media.tenor.com/dUFSMab-AH4AAAAM/dog-meme-meme-dog.gif" },
  { id: "g_277", title: "a man is crying with a tear runn...", category: "cry", tags: ["cry", "man", "crying", "with", "tear", "runn..."], url: "https://media.tenor.com/5TsvyTdZ3GAAAAAM/pleurer-pleure.gif" },
  { id: "g_278", title: "a black and white drawing of a p...", category: "cry", tags: ["cry", "black", "and", "white", "drawing", "p..."], url: "https://media.tenor.com/1jB_HSGfPD4AAAAM/crying-happy.gif" },
  { id: "g_279", title: "a blue cartoon character is cryi...", category: "cry", tags: ["cry", "blue", "cartoon", "character", "cryi..."], url: "https://media.tenor.com/hT9gs16HPWUAAAAM/i-miss-you.gif" },
  { id: "g_280", title: "a young boy is crying and giving...", category: "cry", tags: ["cry", "young", "boy", "crying", "and", "giving..."], url: "https://media.tenor.com/E8FrzAojNrAAAAAM/crying-boy-crying.gif" },
  { id: "g_281", title: "a black and white photo of a man...", category: "cry", tags: ["cry", "black", "and", "white", "photo", "man..."], url: "https://media.tenor.com/RuZbDbWWBgUAAAAM/guy-cries-blud-crying.gif" },
  { id: "g_282", title: "jerry from tom and jerry is cryi...", category: "cry", tags: ["cry", "jerry", "from", "tom", "and", "jerry"], url: "https://media.tenor.com/kEJhxvqrUfIAAAAM/omfg-omg.gif" },
  { id: "g_283", title: "michael scott from the office is...", category: "cry", tags: ["cry", "michael", "scott", "from", "the", "office"], url: "https://media.tenor.com/s2b1rR2ynukAAAAM/crying-the-office.gif" },
  { id: "g_284", title: "a man in a plaid shirt is crying...", category: "cry", tags: ["cry", "man", "plaid", "shirt", "crying..."], url: "https://media.tenor.com/VT9ZWJ9b-5AAAAAM/i-love-you-binh.gif" },
  { id: "g_285", title: "a woman is crying while wearing ...", category: "cry", tags: ["cry", "woman", "crying", "while", "wearing", "..."], url: "https://media.tenor.com/4V9BEGtohZ0AAAAM/cry-hug.gif" },
  { id: "g_286", title: "a baby is crying while sitting a...", category: "cry", tags: ["cry", "baby", "crying", "while", "sitting", "a..."], url: "https://media.tenor.com/Zglq26WQbWEAAAAM/baby-cry-baby.gif" },
  { id: "g_287", title: "a white cat with a sad look on i...", category: "cry", tags: ["cry", "white", "cat", "with", "sad", "look"], url: "https://media.tenor.com/Jybgy6OTwfkAAAAM/crying-hug.gif" },
  { id: "g_288", title: "a cartoon of a person crying wit...", category: "cry", tags: ["cry", "cartoon", "person", "crying", "wit..."], url: "https://media.tenor.com/6eWJMB9ccCwAAAAM/crying.gif" },
  { id: "g_289", title: "a cartoon dog is crying with tea...", category: "cry", tags: ["cry", "cartoon", "dog", "crying", "with", "tea..."], url: "https://media.tenor.com/1W0yh-tTjNIAAAAM/do-bronx.gif" },
  { id: "g_290", title: "a man with a mustache is laying ...", category: "cry", tags: ["cry", "man", "with", "mustache", "laying", "..."], url: "https://media.tenor.com/5_yiAAy7MM0AAAAM/yee.gif" },
  { id: "g_291", title: "a woman sitting in a car with he...", category: "cry", tags: ["cry", "woman", "sitting", "car", "with", "he..."], url: "https://media.tenor.com/MgEEN1tXPlUAAAAM/crying-girl-crying-nails.gif" },
  { id: "g_292", title: "a cartoon of a man laying on a p...", category: "cry", tags: ["cry", "cartoon", "man", "laying", "p..."], url: "https://media.tenor.com/HN4FezDSgJcAAAAM/crying-face-up-crying.gif" },
  { id: "g_293", title: "a woman is crying while talking ...", category: "cry", tags: ["cry", "woman", "crying", "while", "talking", "..."], url: "https://media.tenor.com/NLVvbt6Swq0AAAAM/kim-kardashian-kim-k.gif" },
  { id: "g_294", title: "a man with a ring on his finger ...", category: "cry", tags: ["cry", "man", "with", "ring", "his", "finger"], url: "https://media.tenor.com/K_zZuiq4RYkAAAAM/interstellar-guyfromintersellarcrying.gif" },
  { id: "g_295", title: "a man wearing a cowboy hat and a...", category: "cry", tags: ["cry", "man", "wearing", "cowboy", "hat", "and"], url: "https://media.tenor.com/9PMP1BzGZXUAAAAM/crying-meme-crying.gif" },
  { id: "g_296", title: "a black and white photo of a man...", category: "cry", tags: ["cry", "black", "and", "white", "photo", "man..."], url: "https://media.tenor.com/iKtB0ojfBOEAAAAM/praying.gif" },
  { id: "g_297", title: "a man with a mustache is pouring...", category: "cry", tags: ["cry", "man", "with", "mustache", "pouring..."], url: "https://media.tenor.com/MLAsC8Sz1FsAAAAM/crying-meme.gif" },
  { id: "g_298", title: "a woman is crying with her mouth...", category: "cry", tags: ["cry", "woman", "crying", "with", "her", "mouth..."], url: "https://media.tenor.com/EkhLtT4_1pUAAAAM/cry-girl.gif" },
  { id: "g_299", title: "a baby is crying while wearing a...", category: "cry", tags: ["cry", "baby", "crying", "while", "wearing", "a..."], url: "https://media.tenor.com/t0HpVbgHoxgAAAAM/crying-girl-crying-baby.gif" },
  { id: "g_300", title: "a man is crying while laying on ...", category: "cry", tags: ["cry", "man", "crying", "while", "laying", "..."], url: "https://media.tenor.com/6Noh04TN-gIAAAAM/prempdr-fc-mobile.gif" },
  // === Category: THINKING (25 GIFs) ===
  { id: "g_301", title: "a close up of a baby &#039;s fac...", category: "thinking", tags: ["thinking", "close", "baby", "&#039;s", "fac..."], url: "https://media.tenor.com/o3Ng4AU7ZEkAAAAM/barless.gif" },
  { id: "g_302", title: "a man with a mustache is smiling...", category: "thinking", tags: ["thinking", "man", "with", "mustache", "smiling..."], url: "https://media.tenor.com/7HUogy7rXs4AAAAM/feel-me-think-about-it.gif" },
  { id: "g_303", title: "a man is looking at a mathematic...", category: "thinking", tags: ["thinking", "man", "looking", "mathematic..."], url: "https://media.tenor.com/cbG6dP8SWZgAAAAM/think-deep.gif" },
  { id: "g_304", title: "an elderly woman wearing pearls ...", category: "thinking", tags: ["thinking", "elderly", "woman", "wearing", "pearls", "..."], url: "https://media.tenor.com/o4Hzf7UHJA4AAAAM/reaction-meme-stan-twitter.gif" },
  { id: "g_305", title: "a black and white photo of a chi...", category: "thinking", tags: ["thinking", "black", "and", "white", "photo", "chi..."], url: "https://media.tenor.com/m_pf6jSz-MIAAAAM/monkey-girl-pondering.gif" },
  { id: "g_306", title: "spongebob is holding a pencil an...", category: "thinking", tags: ["thinking", "spongebob", "holding", "pencil", "an..."], url: "https://media.tenor.com/ReTJWddAaQwAAAAM/spongebob-spongebob-squarepants.gif" },
  { id: "g_307", title: "a close up of a woman &#039;s fa...", category: "thinking", tags: ["thinking", "close", "woman", "&#039;s", "fa..."], url: "https://media.tenor.com/99ovDICLZvsAAAAM/interesting-hmm.gif" },
  { id: "g_308", title: "a drawing of winnie the pooh wit...", category: "thinking", tags: ["thinking", "drawing", "winnie", "the", "pooh", "wit..."], url: "https://media.tenor.com/0clG-5flOIcAAAAM/pensando.gif" },
  { id: "g_309", title: "a green frog with a brown tongue...", category: "thinking", tags: ["thinking", "green", "frog", "with", "brown", "tongue..."], url: "https://media.tenor.com/4SGlUiQh7u0AAAAM/reaction-meme.gif" },
  { id: "g_310", title: "a black and white photo of a you...", category: "thinking", tags: ["thinking", "black", "and", "white", "photo", "you..."], url: "https://media.tenor.com/znTFfvB-KHUAAAAM/thinking-equations.gif" },
  { id: "g_311", title: "a young boy in a yellow shirt is...", category: "thinking", tags: ["thinking", "young", "boy", "yellow", "shirt", "is..."], url: "https://media.tenor.com/xuqqWpWnCC4AAAAM/african-kid-africa.gif" },
  { id: "g_312", title: "a statue of a man sitting on a r...", category: "thinking", tags: ["thinking", "statue", "man", "sitting", "r..."], url: "https://media.tenor.com/vXdiMFPK-b0AAAAM/thinking-think.gif" },
  { id: "g_313", title: "a man with long white hair and a...", category: "thinking", tags: ["thinking", "man", "with", "long", "white", "hair"], url: "https://media.tenor.com/UZ_XQphKLmsAAAAM/hmmm-wise-old-man.gif" },
  { id: "g_314", title: "a cute cartoon cat is thinking a...", category: "thinking", tags: ["thinking", "cute", "cartoon", "cat", "thinking", "a..."], url: "https://media.tenor.com/GdLuboKjsikAAAAM/bubu-dudu.gif" },
  { id: "g_315", title: "a close up of a woman &#039;s fa...", category: "thinking", tags: ["thinking", "close", "woman", "&#039;s", "fa..."], url: "https://media.tenor.com/vLmZ4lE-mxEAAAAM/thinking-think.gif" },
  { id: "g_316", title: "a statue of a man sitting on a r...", category: "thinking", tags: ["thinking", "statue", "man", "sitting", "r..."], url: "https://media.tenor.com/L6POoQAzpFUAAAAM/thinking-think.gif" },
  { id: "g_317", title: "a cartoon of winnie the pooh wit...", category: "thinking", tags: ["thinking", "cartoon", "winnie", "the", "pooh", "wit..."], url: "https://media.tenor.com/t6qUWKvxQqwAAAAM/pooh-think-gif.gif" },
  { id: "g_318", title: "a pixel art of a building with t...", category: "thinking", tags: ["thinking", "pixel", "art", "building", "with", "t..."], url: "https://media.tenor.com/KKUa--2kUskAAAAM/thinking-of-you-im-thinking-of-you.gif" },
  { id: "g_319", title: "a close up of a cat licking its ...", category: "thinking", tags: ["thinking", "close", "cat", "licking", "its", "..."], url: "https://media.tenor.com/zkA8ulopj0IAAAAM/rage.gif" },
  { id: "g_320", title: "spongebob is holding a pencil an...", category: "thinking", tags: ["thinking", "spongebob", "holding", "pencil", "an..."], url: "https://media.tenor.com/NTRcfx1HAHsAAAAM/spongebob-thinking.gif" },
  { id: "g_321", title: "a young boy is laying on a couch...", category: "thinking", tags: ["thinking", "young", "boy", "laying", "couch..."], url: "https://media.tenor.com/Qr-JcZEAOekAAAAM/jaggydohwhift.gif" },
  { id: "g_322", title: "a cartoon of batman wearing a bl...", category: "thinking", tags: ["thinking", "cartoon", "batman", "wearing", "bl..."], url: "https://media.tenor.com/-0sxz-2EfwcAAAAM/batman-thinking.gif" },
  { id: "g_323", title: "a cartoon smiley face with a que...", category: "thinking", tags: ["thinking", "cartoon", "smiley", "face", "with", "que..."], url: "https://media.tenor.com/LuZNTBKQ6dkAAAAM/thinking-think.gif" },
  { id: "g_324", title: "a black and white photo of a bab...", category: "thinking", tags: ["thinking", "black", "and", "white", "photo", "bab..."], url: "https://media.tenor.com/9LtB1x-AitcAAAAM/hmmm-baby-thinking.gif" },
  { id: "g_325", title: "a man with a beard is sitting wi...", category: "thinking", tags: ["thinking", "man", "with", "beard", "sitting", "wi..."], url: "https://media.tenor.com/xI1c0XjOYgMAAAAM/hmm-dr-iggy-frome.gif" },
  // === Category: TRENDING (25 GIFs) ===
  { id: "g_326", title: "a man in a red jacket is eating ...", category: "trending", tags: ["trending", "man", "red", "jacket", "eating", "..."], url: "https://media.tenor.com/hjC-gOl9LZMAAAAM/michael-jackson-comendo-picoca.gif" },
  { id: "g_327", title: "Bill Hader Eating Popcorn", category: "trending", tags: ["trending", "bill", "hader", "eating", "popcorn"], url: "https://media.tenor.com/n-HR8RFneYIAAAAM/bill-hader-eating-popcorn.gif" },
  { id: "g_328", title: "spongebob is sitting on a box ea...", category: "trending", tags: ["trending", "spongebob", "sitting", "box", "ea..."], url: "https://media.tenor.com/85bBeNRjl98AAAAM/reaction.gif" },
  { id: "g_329", title: "a man in a suit is eating popcor...", category: "trending", tags: ["trending", "man", "suit", "eating", "popcor..."], url: "https://media.tenor.com/N0gtoecBobUAAAAM/omg-popcorn.gif" },
  { id: "g_330", title: "a cartoon character is holding a...", category: "trending", tags: ["trending", "cartoon", "character", "holding", "a..."], url: "https://media.tenor.com/jDt9VJ_m5tsAAAAM/popcorn-eating.gif" },
  { id: "g_331", title: "a woman is eating a bag of crunc...", category: "trending", tags: ["trending", "woman", "eating", "bag", "crunc..."], url: "https://media.tenor.com/UkYLbIrQtBoAAAAM/popcorn-eating.gif" },
  { id: "g_332", title: "a man in a red jacket is eating ...", category: "trending", tags: ["trending", "man", "red", "jacket", "eating", "..."], url: "https://media.tenor.com/x0k3jHO41aoAAAAM/eating-popcorn-nom-nom.gif" },
  { id: "g_333", title: "a bucket of regal popcorn is bei...", category: "trending", tags: ["trending", "bucket", "regal", "popcorn", "bei..."], url: "https://media.tenor.com/rpMqJurncUYAAAAM/ladle-butter.gif" },
  { id: "g_334", title: "a close up of a person eating po...", category: "trending", tags: ["trending", "close", "person", "eating", "po..."], url: "https://media.tenor.com/24ixn0TLgYcAAAAM/perfect-popcorn.gif" },
  { id: "g_335", title: "a man in a green hoodie is eatin...", category: "trending", tags: ["trending", "man", "green", "hoodie", "eatin..."], url: "https://media.tenor.com/21YPzc4lDYIAAAAM/lil-duval-popcorn.gif" },
  { id: "g_336", title: "spongebob squarepants is sitting...", category: "trending", tags: ["trending", "spongebob", "squarepants", "sitting..."], url: "https://media.tenor.com/ZJ_vO2RAbaEAAAAM/spongebob-entertain.gif" },
  { id: "g_337", title: "a woman is sitting at a table an...", category: "trending", tags: ["trending", "woman", "sitting", "table", "an..."], url: "https://media.tenor.com/KlizV0HJaMgAAAAM/popcorn-eating.gif" },
  { id: "g_338", title: "plankton from spongebob is sitti...", category: "trending", tags: ["trending", "plankton", "from", "spongebob", "sitti..."], url: "https://media.tenor.com/_Ulo2nQqQ20AAAAM/plankton-eating-popcorn.gif" },
  { id: "g_339", title: "a green lizard is holding a piec...", category: "trending", tags: ["trending", "green", "lizard", "holding", "piec..."], url: "https://media.tenor.com/VxmM628YL_QAAAAM/hoppers-tom-the-lizzard.gif" },
  { id: "g_340", title: "a bowl of popcorn with stuffed a...", category: "trending", tags: ["trending", "bowl", "popcorn", "with", "stuffed", "a..."], url: "https://media.tenor.com/xPqQqqFa--kAAAAM/popcorn-eating-popcorn.gif" },
  { id: "g_341", title: "kermit the frog is sitting on a ...", category: "trending", tags: ["trending", "kermit", "the", "frog", "sitting", "..."], url: "https://media.tenor.com/MXTNcue1YVgAAAAM/kermit-eating.gif" },
  { id: "g_342", title: "a man with his tongue hanging ou...", category: "trending", tags: ["trending", "man", "with", "his", "tongue", "hanging"], url: "https://media.tenor.com/QBHsl3_zSRAAAAAM/you-should-cook-steak-with-popcorn-butter-steak.gif" },
  { id: "g_343", title: "a nun is holding a bucket of pop...", category: "trending", tags: ["trending", "nun", "holding", "bucket", "pop..."], url: "https://media.tenor.com/sm5qVTRdXE0AAAAM/nun-nuns.gif" },
  { id: "g_344", title: "a man in a white robe is eating ...", category: "trending", tags: ["trending", "man", "white", "robe", "eating", "..."], url: "https://media.tenor.com/BLzRZIS8CasAAAAM/fallout-on-prime-fallout.gif" },
  { id: "g_345", title: "a man in a red jacket is eating ...", category: "trending", tags: ["trending", "man", "red", "jacket", "eating", "..."], url: "https://media.tenor.com/ufjUs01HT-wAAAAM/popcorn-popcorn-eating.gif" },
  { id: "g_346", title: "a woman is eating popcorn while ...", category: "trending", tags: ["trending", "woman", "eating", "popcorn", "while", "..."], url: "https://media.tenor.com/KZkoA-nmv0wAAAAM/popcorn-entertained.gif" },
  { id: "g_347", title: "a man in a striped sweater is si...", category: "trending", tags: ["trending", "man", "striped", "sweater", "si..."], url: "https://media.tenor.com/T7oGpFmn3_YAAAAM/popcorn-guy-relaxing.gif" },
  { id: "g_348", title: "a gazelle is standing next to a ...", category: "trending", tags: ["trending", "gazelle", "standing", "next", "..."], url: "https://media.tenor.com/frMfHHLz05YAAAAM/atg-stucapa.gif" },
  { id: "g_349", title: "a man in a striped shirt is sitt...", category: "trending", tags: ["trending", "man", "striped", "shirt", "sitt..."], url: "https://media.tenor.com/-g0djNHxLpsAAAAM/popcorn.gif" },
  { id: "g_350", title: "a cartoon of a man eating a bowl...", category: "trending", tags: ["trending", "cartoon", "man", "eating", "bowl..."], url: "https://media.tenor.com/cpjNRGlZRlYAAAAM/popcorn-popcorn-eating.gif" },
];

let activeGifCategory = 'trending';

const GIF_CATEGORY_NAMES = {
  laugh: '😂 Laugh',
  love: '❤️ Love',
  thumbsup: '👍 Thumbs Up',
  celebrate: '🎉 Celebrate',
  dancing: '🕺 Dancing',
  mindblown: '🤯 Mind Blown',
  applause: '👏 Applause',
  coffee: '☕ Coffee',
  shocked: '😲 Shocked',
  cute: '😻 Cute',
  cool: '😎 Cool',
  cry: '😭 Cry',
  thinking: '🤔 Thinking',
  trending: '🔥 Trending'
};

function initGifPicker() {
  const modal = document.getElementById('gifPickerModal');
  const closeBtn = document.getElementById('closeGifPickerBtn');
  const searchInput = document.getElementById('gifSearchInput');
  const clearSearchBtn = document.getElementById('gifSearchClearBtn');
  const pillsWrap = document.getElementById('gifCategoryPills');
  const scrollLeftBtn = document.getElementById('gifScrollLeftBtn');
  const scrollRightBtn = document.getElementById('gifScrollRightBtn');
  const horizontalContainer = document.getElementById('gifHorizontalScrollContainer');

  closeBtn?.addEventListener('click', () => {
    modal?.close();
  });

  pillsWrap?.addEventListener('click', (e) => {
    const pill = e.target.closest('.gif-pill');
    if (!pill) return;
    pillsWrap.querySelectorAll('.gif-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeGifCategory = pill.dataset.cat;
    renderGifViews(searchInput?.value.trim() || '');
  });

  searchInput?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearSearchBtn?.classList.toggle('hidden', val.length === 0);
    renderGifViews(val);
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    renderGifViews('');
  });

  scrollLeftBtn?.addEventListener('click', () => {
    horizontalContainer?.scrollBy({ left: -340, behavior: 'smooth' });
  });

  scrollRightBtn?.addEventListener('click', () => {
    horizontalContainer?.scrollBy({ left: 340, behavior: 'smooth' });
  });

  // Enable mouse wheel horizontal scrolling over the reel
  horizontalContainer?.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      horizontalContainer.scrollLeft += e.deltaY;
    }
  }, { passive: false });
}

function openGifPicker(target = 'composer') {
  STATE.gifPickerTarget = target;
  const modal = document.getElementById('gifPickerModal');
  const searchInput = document.getElementById('gifSearchInput');
  if (!modal) return;
  if (searchInput) searchInput.value = '';
  document.getElementById('gifSearchClearBtn')?.classList.add('hidden');
  activeGifCategory = 'laugh';
  document.querySelectorAll('.gif-pill').forEach(p => p.classList.toggle('active', p.dataset.cat === 'laugh'));
  renderGifViews();
  modal.showModal();
}

function renderGifViews(searchQuery = '') {
  const track = document.getElementById('gifHorizontalTrack');
  const grid = document.getElementById('gifResultsGrid');
  const badge = document.getElementById('gifActiveCategoryBadge');
  const countEl = document.getElementById('gifHorizontalCount');
  if (!grid || !track) return;

  const q = searchQuery.toLowerCase().trim();
  let matches = GIF_CATALOG;

  if (q) {
    matches = GIF_CATALOG.filter(g => 
      g.title.toLowerCase().includes(q) || 
      g.category.toLowerCase().includes(q) ||
      g.tags.some(t => t.toLowerCase().includes(q))
    );
    if (badge) badge.textContent = `🔍 "${searchQuery}"`;
  } else if (activeGifCategory && activeGifCategory !== 'all') {
    matches = GIF_CATALOG.filter(g => g.category === activeGifCategory);
    const catName = GIF_CATEGORY_NAMES[activeGifCategory] || activeGifCategory.toUpperCase();
    if (badge) badge.textContent = `${catName} Reactions`;
  } else {
    if (badge) badge.textContent = '🌟 All Reactions';
  }

  if (countEl) countEl.textContent = `${matches.length} GIFs`;

  if (matches.length === 0) {
    track.innerHTML = `
      <div style="padding: 24px 16px; color: var(--theme-text-muted); font-size: 0.85rem;">
        No GIFs found matching "${escapeHtml(searchQuery)}". Try another reaction word!
      </div>
    `;
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 30px 20px; text-align: center; color: var(--theme-text-muted);">
        <div style="font-size: 2rem; margin-bottom: 8px;">👾</div>
        <p>No animated reaction GIFs matched "${escapeHtml(searchQuery)}".</p>
      </div>
    `;
    return;
  }

  // 1. Horizontal Scroll Reaction Reel (smooth horizontal swiping)
  track.innerHTML = matches.map(g => `
    <div class="gif-carousel-card" onclick="selectGif('${g.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectGif('${g.id}');}" role="button" tabindex="0" title="${escapeForAttr(g.title)}">
      <img src="${g.url}" alt="${escapeHtml(g.title)}" class="gif-carousel-img" loading="lazy">
      <span class="gif-carousel-label">${escapeHtml(g.title)}</span>
    </div>
  `).join('');

  // Reset scroll position to beginning on reaction category switch
  const container = document.getElementById('gifHorizontalScrollContainer');
  if (container) container.scrollLeft = 0;

  // 2. Full exploration grid below
  grid.innerHTML = matches.map(g => `
    <div class="gif-grid-item" onclick="selectGif('${g.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectGif('${g.id}');}" role="button" tabindex="0" title="${escapeForAttr(g.title)}">
      <img src="${g.url}" alt="${escapeHtml(g.title)}" class="gif-grid-img" loading="lazy">
      <span class="gif-grid-title">${escapeHtml(g.title)}</span>
    </div>
  `).join('');
}

window.selectGif = function(gifId) {
  const gif = GIF_CATALOG.find(g => g.id === gifId);
  if (!gif) return;

  const modal = document.getElementById('gifPickerModal');
  modal?.close();

  if (STATE.gifPickerTarget === 'composer') {
    STATE.composerAttachment = {
      type: 'gif',
      url: gif.url,
      name: gif.title
    };
    const wrap = document.getElementById('composerMediaPreview');
    const img = document.getElementById('composerPreviewImg');
    const badge = document.getElementById('composerPreviewTypeBadge');
    const nameEl = document.getElementById('composerPreviewFileName');
    if (wrap && img && badge && nameEl) {
      img.src = gif.url;
      badge.textContent = '👾 Animated GIF';
      nameEl.textContent = gif.title;
      wrap.classList.remove('hidden');
    }
    showToast(`Attached GIF: "${gif.title}"! 👾`, 'success');
  } else if (STATE.gifPickerTarget === 'dm') {
    STATE.dmAttachment = {
      type: 'gif',
      url: gif.url,
      name: gif.title
    };
    const wrap = document.getElementById('dmAttachmentPreview');
    const img = document.getElementById('dmPreviewImg');
    const badge = document.getElementById('dmPreviewBadge');
    const nameEl = document.getElementById('dmPreviewName');
    if (wrap && img && badge && nameEl) {
      img.src = gif.url;
      badge.textContent = '👾 Animated GIF';
      nameEl.textContent = gif.title;
      wrap.classList.remove('hidden');
    }
    showToast(`Attached GIF: "${gif.title}"! Hit Send to share with your friend. 👾`, 'success');
  }
};

window.openGifPicker = openGifPicker;

/* ==========================================================================
   POST EDITING, DELETION, FLAGGING & TOPIC MANAGEMENT
   ========================================================================== */

function escapeForAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}

window.likePost = async function(postId) {
  try {
    const res = await apiRequest('/api/posts/like', 'POST', { post_id: postId });
    showToast('Post liked! ⭐', 'success');
    if (STATE.activeHostId) loadPlatform(STATE.activeHostId, false);
    if (document.getElementById('topicsSection')?.classList.contains('active')) {
      fetchAndRenderTopics();
    }
  } catch (err) {
    showToast('Failed to like post: ' + err.message, 'danger');
  }
};

window.deletePost = async function(postId) {
  if (!confirm('Are you sure you want to permanently delete this post? This action cannot be undone.')) return;
  try {
    await apiRequest('/api/posts/delete', 'POST', { post_id: postId });
    showToast('Post deleted successfully.', 'info');
    document.getElementById(`post-${postId}`)?.remove();
    document.getElementById(`topic-post-${postId}`)?.remove();
    if (STATE.activeHostId) loadPlatform(STATE.activeHostId, false);
    if (document.getElementById('topicsSection')?.classList.contains('active')) {
      fetchAndRenderTopics();
    }
  } catch (err) {
    showToast('Failed to delete post: ' + err.message, 'danger');
  }
};

window.openEditPostModal = function(postId, currentText, currentTopic, currentSubtopic, currentVisibility) {
  const modal = document.getElementById('editPostModal');
  if (!modal) return;

  document.getElementById('editPostId').value = postId;
  document.getElementById('editPostContentTextarea').value = currentText || '';
  document.getElementById('editPostTopicSelect').value = currentTopic || '';
  document.getElementById('editPostSubtopicInput').value = currentSubtopic || '';
  document.getElementById('editPostVisibilitySelect').value = currentVisibility || 'public';

  modal.showModal();
};

window.flagPostOffTopic = async function(postId) {
  if (!STATE.currentUser) {
    document.getElementById('loginModal')?.showModal();
    showToast('Please log in to flag posts.', 'info');
    return;
  }

  try {
    const res = await apiRequest('/api/posts/flag', 'POST', {
      post_id: postId,
      reason: 'off-topic'
    });

    if (res.flagged_for_admin) {
      showToast('Post flagged as off-topic! 🚩 It has reached 3 flags and was escalated to Admin Moderation.', 'warning');
    } else {
      showToast(`Post flagged as off-topic (Flag ${res.flag_count}/3).`, 'info');
    }

    if (STATE.activeHostId) loadPlatform(STATE.activeHostId, false);
    if (document.getElementById('topicsSection')?.classList.contains('active')) {
      fetchAndRenderTopics();
    }
  } catch (err) {
    showToast(err.message, 'warning');
  }
};

window.openChangeTopicModal = function(postId, currentTopic, currentSubtopic) {
  const modal = document.getElementById('changeTopicModal');
  if (!modal) return;

  document.getElementById('changeTopicPostId').value = postId;
  document.getElementById('changeTopicSelect').value = currentTopic || '';
  document.getElementById('changeSubtopicInput').value = currentSubtopic || '';

  modal.showModal();
};

window.deleteComment = async function(commentId, postId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  try {
    await apiRequest('/api/posts/comments/delete', 'POST', { comment_id: commentId });
    showToast('Comment deleted.', 'info');
    if (postId) await loadTopicComments(postId);
  } catch (err) {
    showToast('Failed to delete comment: ' + err.message, 'danger');
  }
};

// Wire modal button listeners for edit and change topic
document.addEventListener('DOMContentLoaded', () => {
  const cancelEditPostBtn = document.getElementById('cancelEditPostBtn');
  const saveEditPostBtn = document.getElementById('saveEditPostBtn');
  const cancelChangeTopicBtn = document.getElementById('cancelChangeTopicBtn');
  const saveChangeTopicBtn = document.getElementById('saveChangeTopicBtn');

  cancelEditPostBtn?.addEventListener('click', () => {
    document.getElementById('editPostModal')?.close();
  });

  saveEditPostBtn?.addEventListener('click', async () => {
    const postId = document.getElementById('editPostId').value;
    const text = document.getElementById('editPostContentTextarea').value.trim();
    const topic = document.getElementById('editPostTopicSelect').value;
    const subtopic = document.getElementById('editPostSubtopicInput').value.trim();
    const visibility = document.getElementById('editPostVisibilitySelect').value;

    if (!text) {
      showToast('Post content cannot be empty.', 'warning');
      return;
    }

    try {
      await apiRequest('/api/posts/edit', 'POST', {
        post_id: postId,
        text,
        topic,
        subtopic,
        visibility
      });

      document.getElementById('editPostModal')?.close();
      showToast('Post updated successfully! ✨', 'success');
      if (STATE.activeHostId) loadPlatform(STATE.activeHostId, false);
      if (document.getElementById('topicsSection')?.classList.contains('active')) {
        fetchAndRenderTopics();
      }
    } catch (err) {
      showToast('Failed to update post: ' + err.message, 'danger');
    }
  });

  cancelChangeTopicBtn?.addEventListener('click', () => {
    document.getElementById('changeTopicModal')?.close();
  });

  saveChangeTopicBtn?.addEventListener('click', async () => {
    const postId = document.getElementById('changeTopicPostId').value;
    const topic = document.getElementById('changeTopicSelect').value;
    const subtopic = document.getElementById('changeSubtopicInput').value.trim();

    try {
      await apiRequest('/api/posts/change-topic', 'POST', {
        post_id: postId,
        topic,
        subtopic
      });

      document.getElementById('changeTopicModal')?.close();
      showToast('Topic updated! Off-topic flags cleared and normal standing restored. 🏷️', 'success');
      if (STATE.activeHostId) loadPlatform(STATE.activeHostId, false);
      if (document.getElementById('topicsSection')?.classList.contains('active')) {
        fetchAndRenderTopics();
      }
      refreshAdminFlaggedQueue();
    } catch (err) {
      showToast('Failed to change topic: ' + err.message, 'danger');
    }
  });
});

/* ==========================================================================
   TOP NAVBAR NOTIFICATIONS & MENTIONS SYSTEM
   ========================================================================== */

function initNotificationsSystem() {
  const btn = document.getElementById('navNotificationsBtn');
  const dropdown = document.getElementById('notificationsDropdown');
  const markAllBtn = document.getElementById('markAllNotificationsReadBtn');
  const closeBtn = document.getElementById('closeNotificationsBtn');

  function positionNotificationsDropdown() {
    if (!btn || !dropdown || dropdown.classList.contains('hidden')) return;

    if (window.innerWidth <= 768) {
      const btnRect = btn.getBoundingClientRect();
      const topPos = Math.max(10, Math.min(window.innerHeight - 200, Math.round(btnRect.bottom + 8)));
      dropdown.style.position = 'fixed';
      dropdown.style.top = `${topPos}px`;
      dropdown.style.left = '12px';
      dropdown.style.right = '12px';
      dropdown.style.width = 'auto';
      dropdown.style.maxWidth = 'calc(100vw - 24px)';
    } else {
      dropdown.style.position = 'absolute';
      dropdown.style.top = 'calc(100% + 10px)';
      dropdown.style.left = '';
      dropdown.style.right = '0';
      dropdown.style.width = '360px';
      dropdown.style.maxWidth = 'calc(100vw - 24px)';

      // Prevent left-edge overflow on smaller desktop screens
      requestAnimationFrame(() => {
        const rect = dropdown.getBoundingClientRect();
        if (rect.left < 12) {
          const shift = 12 - rect.left;
          dropdown.style.right = `${-shift}px`;
        }
      });
    }
  }

  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = dropdown?.classList.contains('hidden');
    dropdown?.classList.toggle('hidden');
    if (willOpen) {
      positionNotificationsDropdown();
      fetchNotifications();
    }
  });

  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.add('hidden');
  });

  markAllBtn?.addEventListener('click', async () => {
    try {
      await apiRequest('/api/notifications/read', 'POST', { all: true });
      fetchNotifications();
      showToast('All notifications marked as read.', 'info');
    } catch (err) {
      console.warn(err);
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.notifications-wrapper')) {
      dropdown?.classList.add('hidden');
    }
  });

  window.addEventListener('resize', () => {
    if (dropdown && !dropdown.classList.contains('hidden')) {
      positionNotificationsDropdown();
    }
  });

  window.addEventListener('scroll', () => {
    if (dropdown && !dropdown.classList.contains('hidden') && window.innerWidth <= 768) {
      positionNotificationsDropdown();
    }
  }, { passive: true });

  // Initial fetch and 15s poll
  fetchNotifications();
  setInterval(fetchNotifications, 15000);
}

async function fetchNotifications() {
  if (!STATE.currentUser) {
    const badge = document.getElementById('navNotificationsBadge');
    if (badge) badge.classList.add('hidden');
    return;
  }

  try {
    const res = await apiRequest('/api/notifications');
    STATE.notifications = res.notifications || [];
    const unreadCount = res.unread_count || 0;

    const badge = document.getElementById('navNotificationsBadge');
    if (badge) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.toggle('hidden', unreadCount === 0);
    }

    const list = document.getElementById('notificationsList');
    if (!list) return;

    if (STATE.notifications.length === 0) {
      list.innerHTML = `<div class="notifications-empty">No notifications yet.</div>`;
      return;
    }

    list.innerHTML = STATE.notifications.map(n => `
      <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.target_id || ''}')">
        <img src="${n.sender_avatar || 'assets/avatar-p-default.svg'}" class="notification-avatar" alt="Avatar">
        <div class="notification-body">
          <div class="notification-text">${escapeHtml(n.text)}</div>
          <div class="notification-time">${formatTimeAgo(n.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    // Non-blocking
  }
}

window.handleNotificationClick = async function(nid, targetId) {
  try {
    await apiRequest('/api/notifications/read', 'POST', { notification_id: nid });
  } catch (e) {}

  document.getElementById('notificationsDropdown')?.classList.add('hidden');
  fetchNotifications();

  if (targetId) {
    if (targetId.startsWith('usr-') || targetId === 'maya' || targetId === 'julian' || targetId === 'elena' || targetId === 'jordan') {
      switchToPlatformTab(targetId, true);
    } else {
      document.getElementById('navTabTopics')?.click();
      setTimeout(() => {
        const el = document.getElementById(`topic-post-${targetId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          if (!STATE.topicsExpandedPosts.has(targetId)) {
            toggleExpandTopicCard(targetId);
          }
        }
      }, 500);
    }
  }
};

/* ==========================================================================
   FEATURE GUIDE MODAL (WHAT'S NEW — ZERO PROFILE REVERSION)
   ========================================================================== */

function initFeatureGuideModal() {
  const modal = document.getElementById('featureGuideModal');
  const closeBtn = document.getElementById('closeFeatureGuideBtn');
  const menuBtn = document.getElementById('menuFeatureGuideBtn');

  closeBtn?.addEventListener('click', () => {
    modal?.close();
    localStorage.setItem('tp_seen_feature_guide_v2', 'true');
  });

  menuBtn?.addEventListener('click', () => {
    document.getElementById('userDropdownMenu')?.classList.add('hidden');
    modal?.showModal();
  });

  // Display on first arrival if user hasn't seen the guide yet
  const hasSeen = localStorage.getItem('tp_seen_feature_guide_v2');
  if (!hasSeen) {
    setTimeout(() => {
      modal?.showModal();
    }, 700);
  }
}

/* ==========================================================================
   ADMIN CONSOLE: OFF-TOPIC FLAGGED POSTS MODERATION QUEUE (3+ FLAGS)
   ========================================================================== */

function initAdminFlaggedQueue() {
  const refreshBtn = document.getElementById('refreshAdminFlaggedBtn');
  refreshBtn?.addEventListener('click', () => {
    refreshAdminFlaggedQueue();
    showToast('Refreshed off-topic flagged queue', 'info');
  });
}

async function refreshAdminFlaggedQueue() {
  const tbody = document.getElementById('adminFlaggedTableBody');
  if (!tbody) return;

  if (!STATE.currentUser || STATE.currentUser.is_admin !== 1) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--theme-text-muted);">Admin privileges required</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--theme-text-muted);">Loading flagged posts...</td></tr>`;

  try {
    const res = await apiRequest('/api/admin/flagged-posts');
    const posts = res.flagged_posts || [];

    if (posts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color: #34d399;">✅ Zero off-topic flagged posts in queue. Community standards are maintained!</td></tr>`;
      return;
    }

    tbody.innerHTML = posts.map(p => `
      <tr>
        <td>
          <strong>${escapeHtml(p.author_name || p.author_handle)}</strong>
          <div style="font-size:0.75rem; color:var(--theme-text-muted);">${escapeHtml(p.id)}</div>
        </td>
        <td>
          <span style="font-weight:600;">🏷️ ${escapeHtml(p.interest || 'No Topic')}</span>
          ${p.subtopic ? `<div style="font-size:0.75rem; color:var(--theme-text-muted);">› ${escapeHtml(p.subtopic)}</div>` : ''}
        </td>
        <td>
          <span class="badge-flag-count">🚩 ${p.flag_count} Flags</span>
        </td>
        <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escapeHtml(p.text || '')}
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-secondary" onclick="openChangeTopicModal('${p.id}', '${escapeForAttr(p.interest || '')}', '${escapeForAttr(p.subtopic || '')}')" title="Re-classify topic & clear flags">
              🏷️ Change Topic
            </button>
            <button class="btn btn-sm btn-ghost" onclick="deletePost('${p.id}')" title="Delete post" style="color:#f43f5e;">
              🗑️ Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#f43f5e;">Failed to load flagged queue: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// --- MOBILE LAN VIEW & NETWORK INFO ---
async function initLanAccess() {
  const mobileLink = document.getElementById('navLanMobileLink');
  const mobileText = document.getElementById('navLanMobileText');
  const lanModal = document.getElementById('lanMobileModal');
  const lanUrlInput = document.getElementById('lanUrlInput');
  const copyBtn = document.getElementById('copyLanUrlBtn');
  const closeBtn = document.getElementById('closeLanModalBtn');
  const qrImg = document.getElementById('lanQrCodeImg');

  let currentLanUrl = 'http://10.0.0.55:3000';

  try {
    const res = await apiRequest('/api/network-info');
    if (res && res.lan_url) {
      currentLanUrl = res.lan_url;
      if (mobileText) mobileText.textContent = `📱 Mobile: ${res.lan_ip}:${res.port}`;
      if (lanUrlInput) lanUrlInput.value = currentLanUrl;
      if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(currentLanUrl)}`;
    }
  } catch (err) {
    console.warn('Could not fetch network info:', err);
  }

  mobileLink?.addEventListener('click', (e) => {
    e.preventDefault();
    if (lanModal) lanModal.showModal();
  });

  closeBtn?.addEventListener('click', () => {
    if (lanModal) lanModal.close();
  });

  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentLanUrl);
      showToast('Mobile LAN URL copied to clipboard! 📋', 'success');
    } catch {
      if (lanUrlInput) {
        lanUrlInput.select();
        document.execCommand('copy');
        showToast('Mobile LAN URL copied to clipboard! 📋', 'success');
      }
    }
  });
}

/* ==========================================================================
   FEATURE 1: END-TO-END ENCRYPTED (E2EE) CRYPTO ENGINE
   ========================================================================== */

const E2EE_STATE = {
  sharedKeys: {},
  publicKeyBase64: null
};

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

async function initE2EE() {
  if (!window.crypto || !window.crypto.subtle) {
    console.warn('Web Crypto API not available in this environment.');
    return;
  }

  const userId = STATE.currentUser ? STATE.currentUser.id : null;
  if (!userId) return;

  try {
    const privStorageKey = `theplatform_e2ee_priv_${userId}`;
    const pubStorageKey = `theplatform_e2ee_pub_${userId}`;
    let privJwk = localStorage.getItem(privStorageKey);
    let pubBase64 = localStorage.getItem(pubStorageKey);

    if (privJwk && pubBase64) {
      E2EE_STATE.publicKeyBase64 = pubBase64;
    } else {
      const keyPair = await window.crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey", "deriveBits"]
      );

      const exportedPriv = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
      const exportedPub = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
      pubBase64 = arrayBufferToBase64(exportedPub);

      localStorage.setItem(privStorageKey, JSON.stringify(exportedPriv));
      localStorage.setItem(pubStorageKey, pubBase64);
      E2EE_STATE.publicKeyBase64 = pubBase64;
    }

    if (E2EE_STATE.publicKeyBase64) {
      await apiRequest('/api/crypto/public-key', 'POST', {
        public_key: E2EE_STATE.publicKeyBase64
      }).catch(err => console.warn('Could not publish public key:', err));
    }
  } catch (err) {
    console.warn('E2EE keypair generation error:', err);
  }
}

async function getOrDeriveSharedKey(peerUserId) {
  if (!peerUserId || !STATE.currentUser) return null;
  if (E2EE_STATE.sharedKeys[peerUserId]) {
    return E2EE_STATE.sharedKeys[peerUserId];
  }

  const myUserId = STATE.currentUser.id;
  const privStorageKey = `theplatform_e2ee_priv_${myUserId}`;
  const privJwkStr = localStorage.getItem(privStorageKey);
  if (!privJwkStr) return null;

  try {
    const res = await apiRequest(`/api/crypto/public-key/${encodeURIComponent(peerUserId)}`);
    if (!res || !res.public_key) return null;

    const peerPubBuf = base64ToArrayBuffer(res.public_key);
    const peerPubKey = await window.crypto.subtle.importKey(
      "spki",
      peerPubBuf,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    const privJwk = JSON.parse(privJwkStr);
    const myPrivKey = await window.crypto.subtle.importKey(
      "jwk",
      privJwk,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveKey"]
    );

    const derivedKey = await window.crypto.subtle.deriveKey(
      { name: "ECDH", public: peerPubKey },
      myPrivKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    E2EE_STATE.sharedKeys[peerUserId] = derivedKey;
    return derivedKey;
  } catch (err) {
    console.warn('Could not derive E2EE key for peer:', peerUserId, err);
    return null;
  }
}

async function encryptDirectMessagePayload(peerUserId, plainText, mediaUrl) {
  try {
    const sharedKey = await getOrDeriveSharedKey(peerUserId);
    if (!sharedKey) {
      return { is_encrypted: 0, text: plainText, media_url: mediaUrl, iv: '', algo: '' };
    }

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const payloadStr = JSON.stringify({ text: plainText || '', media_url: mediaUrl || '' });
    const encoded = new TextEncoder().encode(payloadStr);

    const encryptedBuf = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      sharedKey,
      encoded
    );

    return {
      is_encrypted: 1,
      text: arrayBufferToBase64(encryptedBuf),
      media_url: '',
      media_type: mediaUrl ? (mediaUrl.startsWith('data:audio') ? 'audio' : 'image') : 'text',
      iv: arrayBufferToBase64(iv),
      algo: 'ECDH-P256+AES-GCM-256'
    };
  } catch (err) {
    console.warn('Encryption failed, falling back to plaintext:', err);
    return { is_encrypted: 0, text: plainText, media_url: mediaUrl, iv: '', algo: '' };
  }
}

async function decryptDirectMessagePayload(msg, currentUserId) {
  if (!msg.is_encrypted || !msg.iv || !msg.text) {
    return { text: msg.text, media_url: msg.media_url, is_encrypted: false };
  }

  const peerId = msg.sender_id === currentUserId ? msg.recipient_id : msg.sender_id;
  try {
    const sharedKey = await getOrDeriveSharedKey(peerId);
    if (!sharedKey) {
      return { text: '[🔒 Encrypted Message: Key exchange in progress]', media_url: '', is_encrypted: true };
    }

    const ivBuf = base64ToArrayBuffer(msg.iv);
    const cipherBuf = base64ToArrayBuffer(msg.text);

    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuf },
      sharedKey,
      cipherBuf
    );

    const decryptedStr = new TextDecoder().decode(decryptedBuf);
    const parsed = JSON.parse(decryptedStr);
    return {
      text: parsed.text || '',
      media_url: parsed.media_url || msg.media_url || '',
      is_encrypted: true
    };
  } catch (err) {
    console.warn('Decryption failed for message ID:', msg.id, err);
    return { text: '[🔒 Encrypted Message: Decryption error]', media_url: '', is_encrypted: true };
  }
}

/* ==========================================================================
   FEATURE 2: MUTUAL AID PROXIMITY RADAR
   ========================================================================== */

let radarAnimationId = null;
let radarAngle = 0;
let radarBlips = [];
let radarRadiusKm = 5;
let radarSelectedBlip = null;

function initProximityRadar() {
  const openBtn = document.getElementById('openProximityRadarBtn');
  const modal = document.getElementById('proximityRadarModal');
  const closeBtn = document.getElementById('closeProximityRadarBtn');
  const pills = document.querySelectorAll('#radarRangePills .radar-pill');

  openBtn?.addEventListener('click', () => {
    openProximityRadarModal();
  });

  closeBtn?.addEventListener('click', () => {
    modal?.close();
    stopRadarAnimation();
  });

  pills.forEach(pill => {
    pill.addEventListener('click', async () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      radarRadiusKm = parseInt(pill.dataset.radius || '5', 10);
      await fetchRadarBlips();
    });
  });

  const canvas = document.getElementById('proximityRadarCanvas');
  canvas?.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const center = canvas.width / 2;
    let closest = null;
    let minDist = 22;

    radarBlips.forEach(b => {
      const bx = center + b.relX * (center - 24);
      const by = center + b.relY * (center - 24);
      const d = Math.hypot(clickX - bx, clickY - by);
      if (d < minDist) {
        minDist = d;
        closest = b;
      }
    });

    if (closest) {
      selectRadarBlip(closest);
    }
  });
}

async function openProximityRadarModal() {
  const modal = document.getElementById('proximityRadarModal');
  if (!modal) return;
  modal.showModal();
  await fetchRadarBlips();
  startRadarAnimation();
}
window.openProximityRadarModal = openProximityRadarModal;

async function fetchRadarBlips() {
  try {
    const userId = STATE.currentUser ? STATE.currentUser.id : '';
    const res = await apiRequest(`/api/commons/radar?radius_km=${radarRadiusKm}&user_id=${userId}`);
    const rawBlips = res.clusters || [];

    radarBlips = rawBlips.map((b, idx) => {
      const angle = (idx * 1.45) + (b.distance_km * 0.7);
      const normDist = Math.max(0.15, Math.min(0.92, b.distance_km / radarRadiusKm));
      return {
        ...b,
        relX: Math.cos(angle) * normDist,
        relY: Math.sin(angle) * normDist,
        angle: angle % (Math.PI * 2)
      };
    });

    renderRadarBlipsList();
    const countEl = document.getElementById('radarBlipCount');
    if (countEl) countEl.textContent = radarBlips.length;
  } catch (err) {
    console.warn('Failed to load radar data:', err);
  }
}

function renderRadarBlipsList() {
  const list = document.getElementById('radarBlipsList');
  if (!list) return;

  if (radarBlips.length === 0) {
    list.innerHTML = '<div style="color: var(--theme-text-dim); font-size: 0.82rem; padding: 14px 0;">No mutual aid blips within this range ring. Expand range above.</div>';
    return;
  }

  list.innerHTML = radarBlips.map(b => `
    <div class="radar-blip-item ${radarSelectedBlip && radarSelectedBlip.id === b.id ? 'selected' : ''}" onclick="selectRadarBlipById('${b.id}')">
      <div class="radar-blip-item-info">
        <span class="radar-blip-dot ${b.type || 'offer'}"></span>
        <span class="radar-blip-item-name">${escapeHtml(b.title)}</span>
      </div>
      <span class="radar-blip-item-dist">${b.distance_km.toFixed(1)} km</span>
    </div>
  `).join('');
}

function selectRadarBlip(blip) {
  radarSelectedBlip = blip;
  renderRadarBlipsList();

  const detailCard = document.getElementById('radarSelectedDetailCard');
  if (!detailCard) return;

  detailCard.classList.remove('hidden');
  document.getElementById('radarSelectedTypeBadge').textContent = blip.type === 'request' ? '🆘 COMMUNITY NEED' : '🎁 AID OFFER';
  document.getElementById('radarSelectedTitle').textContent = blip.title;
  document.getElementById('radarSelectedDesc').textContent = blip.description || 'Community resource offered under sovereign reciprocity.';
  document.getElementById('radarSelectedDist').textContent = `📍 ${blip.distance_km.toFixed(1)} km away (${blip.fuzzy_neighborhood || 'Local Mesh'})`;
  document.getElementById('radarSelectedAuthor').textContent = `by ${blip.author_name || 'Member'}`;
}

window.selectRadarBlipById = function(id) {
  const found = radarBlips.find(b => b.id === id);
  if (found) selectRadarBlip(found);
};

function startRadarAnimation() {
  stopRadarAnimation();
  const canvas = document.getElementById('proximityRadarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function loop() {
    drawRadar(ctx, canvas.width, canvas.height);
    radarAnimationId = requestAnimationFrame(loop);
  }
  radarAnimationId = requestAnimationFrame(loop);
}

function stopRadarAnimation() {
  if (radarAnimationId) {
    cancelAnimationFrame(radarAnimationId);
    radarAnimationId = null;
  }
}

function drawRadar(ctx, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = cx - 24;

  ctx.fillStyle = '#060b0e';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
  ctx.lineWidth = 1;

  [0.33, 0.66, 1.0].forEach((ratio) => {
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * ratio, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.font = '10px monospace';
    const distVal = ((radarRadiusKm * ratio)).toFixed(0) + ' km';
    ctx.fillText(distVal, cx + 6, cy - (maxR * ratio) + 12);
  });

  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(cx, 16); ctx.lineTo(cx, height - 16);
  ctx.moveTo(16, cy); ctx.lineTo(width - 16, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  radarAngle += 0.024;
  if (radarAngle > Math.PI * 2) radarAngle -= Math.PI * 2;

  const coneGradient = ctx.createConicGradient(radarAngle - Math.PI / 2, cx, cy);
  coneGradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
  coneGradient.addColorStop(0.12, 'transparent');
  coneGradient.addColorStop(1, 'transparent');

  ctx.fillStyle = coneGradient;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(radarAngle) * maxR, cy + Math.sin(radarAngle) * maxR);
  ctx.stroke();

  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  radarBlips.forEach(b => {
    const bx = cx + b.relX * maxR;
    const by = cy + b.relY * maxR;

    const blipAngle = Math.atan2(b.relY, b.relX);
    let angleDiff = Math.abs(radarAngle - blipAngle);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
    const pingIntensity = Math.max(0, 1 - angleDiff * 3);

    const isSelected = radarSelectedBlip && radarSelectedBlip.id === b.id;

    ctx.save();
    let blipColor = '#34d399';
    if (b.type === 'request') blipColor = '#f87171';
    else if (b.type === 'skills') blipColor = '#60a5fa';

    if (pingIntensity > 0 || isSelected) {
      ctx.strokeStyle = blipColor;
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(bx, by, (isSelected ? 10 : 7) + pingIntensity * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = isSelected ? '#ffffff' : blipColor;
    ctx.shadowColor = blipColor;
    ctx.shadowBlur = 8 + pingIntensity * 10;
    ctx.beginPath();
    ctx.arc(bx, by, isSelected ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '9px monospace';
    ctx.fillText(b.title.substring(0, 14), bx + 8, by + 3);

    ctx.restore();
  });
}

/* ==========================================================================
   FEATURE 3: FIRESIDE HEARTHS (EPHEMERAL AUDIO LOUNGES)
   ========================================================================== */

let hearthsPollInterval = null;
let hearthCrackleOscillator = null;
let isHearthSpeaking = false;
let isCracklePlaying = false;

async function loadHearths() {
  const browseGrid = document.getElementById('browseHearthsView');
  const activeStage = document.getElementById('activeHearthStage');
  if (!browseGrid || !activeStage) return;

  if (STATE.activeLoungeId) {
    browseGrid.classList.add('hidden');
    activeStage.classList.remove('hidden');
    await refreshActiveHearthRoom();
    return;
  }

  browseGrid.classList.remove('hidden');
  activeStage.classList.add('hidden');

  try {
    const res = await apiRequest('/api/lounges');
    const lounges = res.lounges || [];

    browseGrid.innerHTML = lounges.map(l => {
      const occupants = l.occupants || [];
      const avatarsHtml = occupants.slice(0, 4).map(o => `
        <img src="${o.avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(o.name)}" class="hearth-preview-avatar">
      `).join('');

      return `
        <div class="hearth-card" id="hearth-card-${l.id}">
          <div class="hearth-card-header">
            <span class="hearth-card-emoji">${escapeHtml(l.emoji || '🔥')}</span>
            <div>
              <h3 class="hearth-card-title">${escapeHtml(l.title)}</h3>
              <p class="hearth-card-topic">${escapeHtml(l.topic)}</p>
            </div>
          </div>

          <div class="hearth-occupants-preview">
            ${avatarsHtml}
            <span class="hearth-occupants-count-label">${occupants.length} Gathered</span>
          </div>

          <button type="button" class="btn btn-primary" onclick="joinHearthRoom('${l.id}')">
            🔥 Pull Up a Chair
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    browseGrid.innerHTML = `<div style="color: var(--sys-danger); text-align: center; padding: 40px;">Failed to load hearths: ${escapeHtml(err.message)}</div>`;
  }
}
window.loadHearths = loadHearths;

async function joinHearthRoom(loungeId) {
  if (!STATE.currentUser) {
    showToast('Please log in to enter a Fireside Hearth.', 'warning');
    return;
  }

  try {
    const res = await apiRequest('/api/lounges/join', 'POST', { lounge_id: loungeId });
    STATE.activeLoungeId = loungeId;
    STATE.activeLoungeData = res.lounge;
    showToast(`Entered ${res.lounge.title}! Warmth surrounds you. 🔥`, 'success');

    await loadHearths();
    startHearthsPolling();
  } catch (err) {
    showToast('Failed to join hearth: ' + err.message, 'danger');
  }
}
window.joinHearthRoom = joinHearthRoom;

async function leaveHearthRoom() {
  if (!STATE.activeLoungeId) return;

  try {
    await apiRequest('/api/lounges/leave', 'POST', { lounge_id: STATE.activeLoungeId });
  } catch {}

  STATE.activeLoungeId = null;
  STATE.activeLoungeData = null;
  isHearthSpeaking = false;
  stopHearthsPolling();
  stopFireplaceCrackle();

  const micText = document.getElementById('hearthMicText');
  const micIcon = document.getElementById('hearthMicIcon');
  if (micText) micText.textContent = 'Unmute Mic';
  if (micIcon) micIcon.textContent = '🎤';

  await loadHearths();
  showToast('You stepped away from the hearth. 🌿', 'info');
}

async function refreshActiveHearthRoom() {
  if (!STATE.activeLoungeId) return;

  try {
    const res = await apiRequest('/api/lounges');
    const lounge = (res.lounges || []).find(l => l.id === STATE.activeLoungeId);
    if (!lounge) {
      leaveHearthRoom();
      return;
    }

    STATE.activeLoungeData = lounge;

    document.getElementById('activeHearthEmoji').textContent = lounge.emoji || '🔥';
    document.getElementById('activeHearthName').textContent = lounge.title;
    document.getElementById('activeHearthTopic').textContent = lounge.topic;

    const circle = document.getElementById('hearthOccupantsCircle');
    if (!circle) return;

    const occupants = lounge.occupants || [];
    const currentUserId = STATE.currentUser ? STATE.currentUser.id : null;

    circle.innerHTML = occupants.map(o => {
      const isMe = o.user_id === currentUserId;
      const isSpeaking = o.is_speaking || (isMe && isHearthSpeaking);

      return `
        <div class="hearth-occupant-seat ${isSpeaking ? 'speaking' : ''}" id="hearth-seat-${o.user_id}">
          <div class="hearth-occupant-avatar-wrap">
            <div class="hearth-occupant-speaking-ring"></div>
            <img src="${o.avatar || 'assets/avatar-p-default.svg'}" alt="${escapeHtml(o.name)}" class="hearth-occupant-avatar">
          </div>
          <span class="hearth-occupant-name">${escapeHtml(o.name)}${isMe ? ' (You)' : ''} ${isSpeaking ? '🎙️' : ''}</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.warn('Error refreshing active hearth:', err);
  }
}

function startHearthsPolling() {
  stopHearthsPolling();
  hearthsPollInterval = setInterval(refreshActiveHearthRoom, 3500);
}

function stopHearthsPolling() {
  if (hearthsPollInterval) {
    clearInterval(hearthsPollInterval);
    hearthsPollInterval = null;
  }
}

function toggleFireplaceCrackle() {
  if (isCracklePlaying) {
    stopFireplaceCrackle();
    showToast('Fireplace crackle paused.', 'info');
  } else {
    startFireplaceCrackle();
    showToast('Fireplace ambient crackle active 🪵🔥', 'success');
  }
}

function startFireplaceCrackle() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!STATE.audioContext) STATE.audioContext = new AudioCtx();
    if (STATE.audioContext.state === 'suspended') STATE.audioContext.resume();

    const bufferSize = STATE.audioContext.sampleRate * 2;
    const noiseBuffer = STATE.audioContext.createBuffer(1, bufferSize, STATE.audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      const pop = Math.random() > 0.998 ? (Math.random() * 2 - 1) * 3 : 0;
      output[i] = white * 0.08 + pop * 0.15;
    }

    const whiteNoise = STATE.audioContext.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = STATE.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, STATE.audioContext.currentTime);

    const gainNode = STATE.audioContext.createGain();
    gainNode.gain.setValueAtTime(0.35, STATE.audioContext.currentTime);

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(STATE.audioContext.destination);

    whiteNoise.start(0);

    hearthCrackleOscillator = whiteNoise;
    isCracklePlaying = true;

    const btn = document.getElementById('hearthFireCrackleBtn');
    if (btn) btn.style.background = 'rgba(249, 115, 22, 0.25)';
  } catch (err) {
    console.warn('Could not start fireplace crackle audio:', err);
  }
}

function stopFireplaceCrackle() {
  if (hearthCrackleOscillator) {
    try {
      hearthCrackleOscillator.stop();
      hearthCrackleOscillator.disconnect();
    } catch {}
    hearthCrackleOscillator = null;
  }
  isCracklePlaying = false;
  const btn = document.getElementById('hearthFireCrackleBtn');
  if (btn) btn.style.background = '';
}

function triggerHearthReaction(emoji) {
  const container = document.querySelector('.hearth-campfire-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'hearth-floating-emoji';
  el.textContent = emoji;
  const randomDx = (Math.random() * 140 - 70) + 'px';
  el.style.setProperty('--dx', randomDx);

  container.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

function initHearthsSystem() {
  const leaveBtn = document.getElementById('leaveHearthBtn');
  const micBtn = document.getElementById('hearthMicToggleBtn');
  const crackleBtn = document.getElementById('hearthFireCrackleBtn');
  const reactionBtns = document.querySelectorAll('.btn-hearth-react');

  leaveBtn?.addEventListener('click', leaveHearthRoom);

  micBtn?.addEventListener('click', async () => {
    if (!STATE.activeLoungeId) return;
    isHearthSpeaking = !isHearthSpeaking;

    const micText = document.getElementById('hearthMicText');
    const micIcon = document.getElementById('hearthMicIcon');
    if (micText) micText.textContent = isHearthSpeaking ? 'Mute Mic' : 'Unmute Mic';
    if (micIcon) micIcon.textContent = isHearthSpeaking ? '🎙️' : '🎤';
    micBtn.className = isHearthSpeaking ? 'btn btn-primary' : 'btn btn-secondary';

    try {
      await apiRequest('/api/lounges/speak', 'POST', {
        lounge_id: STATE.activeLoungeId,
        is_speaking: isHearthSpeaking
      });
      refreshActiveHearthRoom();
    } catch {}
  });

  crackleBtn?.addEventListener('click', toggleFireplaceCrackle);

  reactionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.react || '🔥';
      triggerHearthReaction(emoji);
    });
  });
}

/* ==========================================================================
   FEATURE 4: COMMUNITY COLLECTIVES & GUILDS
   ========================================================================== */

let cachedCollectives = [];
let activeCollectiveFilter = 'all';

async function loadCollectives() {
  const grid = document.getElementById('collectivesGrid');
  if (!grid) return;
  grid.innerHTML = '<div style="color: var(--theme-text-dim); text-align: center; padding: 40px;">Loading sovereign collectives...</div>';

  try {
    const res = await apiRequest('/api/collectives');
    cachedCollectives = res.collectives || [];
    renderCollectives();
  } catch (err) {
    grid.innerHTML = `<div style="color: var(--sys-danger); text-align: center; padding: 40px;">Failed to load collectives: ${escapeHtml(err.message)}</div>`;
  }
}
window.loadCollectives = loadCollectives;

function renderCollectives() {
  const grid = document.getElementById('collectivesGrid');
  if (!grid) return;

  const currentUserId = STATE.currentUser ? STATE.currentUser.id : null;
  const filtered = activeCollectiveFilter === 'all'
    ? cachedCollectives
    : cachedCollectives.filter(c => c.category === activeCollectiveFilter);

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="color: var(--theme-text-dim); text-align: center; grid-column: 1/-1; padding: 40px;">No collectives found in this discipline. Be the first to found one!</div>';
    return;
  }

  grid.innerHTML = filtered.map(c => {
    const isMember = c.is_member || (c.members && c.members.includes(currentUserId));
    return `
      <div class="collective-card" id="collective-${c.id}">
        <div class="collective-card-header">
          <div class="collective-card-icon">${escapeHtml(c.icon || '🌱')}</div>
          <div class="collective-meta-info">
            <h3 class="collective-card-name">${escapeHtml(c.name)}</h3>
            <span class="collective-category-tag">${escapeHtml(c.category)}</span>
          </div>
        </div>

        <p class="collective-manifesto-text">${escapeHtml(c.manifesto)}</p>

        <div class="collective-treasury-bar">
          <div class="treasury-karma-col">
            <span>⭐</span> <span>${c.treasury_karma || 0} Pooled Karma</span>
          </div>
          <div class="treasury-members-col">
            <span>👥 ${c.member_count || 1} Members</span>
          </div>
        </div>

        <div class="collective-card-actions">
          <button type="button" class="btn ${isMember ? 'btn-ghost' : 'btn-primary'}" onclick="handleJoinCollective('${c.id}', ${isMember})">
            ${isMember ? '✓ Member (Leave)' : '+ Join Collective'}
          </button>
          <button type="button" class="btn btn-secondary" onclick="handleDonateKarma('${c.id}')" title="Contribute 5⭐ Karma to this collective's mutual aid treasury">
            ⭐ Donate 5 Karma
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function handleJoinCollective(collectiveId, isCurrentMember) {
  if (!STATE.currentUser) {
    showToast('Please log in to join collectives.', 'warning');
    return;
  }
  const action = isCurrentMember ? 'leave' : 'join';
  try {
    const res = await apiRequest('/api/collectives/join', 'POST', { collective_id: collectiveId, action });
    showToast(res.message || `Successfully ${action}ed collective!`, 'success');
    await loadCollectives();
  } catch (err) {
    showToast('Failed to update membership: ' + err.message, 'danger');
  }
}
window.handleJoinCollective = handleJoinCollective;

async function handleDonateKarma(collectiveId) {
  if (!STATE.currentUser) {
    showToast('Please log in to donate karma.', 'warning');
    return;
  }
  try {
    const res = await apiRequest('/api/collectives/donate-karma', 'POST', { collective_id: collectiveId, amount: 5 });
    showToast(`Donated 5⭐ Karma to the collective treasury! (New pool: ${res.treasury_karma}⭐)`, 'success');
    if (STATE.currentUser.mutual_aid_karma !== undefined) {
      STATE.currentUser.mutual_aid_karma = Math.max(0, STATE.currentUser.mutual_aid_karma - 5);
      saveUserSession(STATE.currentUser);
    }
    await loadCollectives();
  } catch (err) {
    showToast('Failed to donate karma: ' + err.message, 'danger');
  }
}
window.handleDonateKarma = handleDonateKarma;

function initCollectivesSystem() {
  const modal = document.getElementById('createCollectiveModal');
  const openBtn = document.getElementById('openCreateCollectiveModalBtn');
  const cancelBtn = document.getElementById('cancelCreateCollectiveBtn');
  const submitBtn = document.getElementById('createCollectiveSubmitBtn');
  const filterPills = document.querySelectorAll('#collectivesFilterPills .filter-pill');

  openBtn?.addEventListener('click', () => {
    if (!STATE.currentUser) {
      showToast('Please log in to found a collective.', 'warning');
      return;
    }
    modal?.showModal();
  });

  cancelBtn?.addEventListener('click', () => {
    modal?.close();
  });

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCollectiveFilter = pill.dataset.cat || 'all';
      renderCollectives();
    });
  });

  submitBtn?.addEventListener('click', async () => {
    const nameInput = document.getElementById('collectiveNameInput');
    const catSelect = document.getElementById('collectiveCategorySelect');
    const iconInput = document.getElementById('collectiveIconInput');
    const manifestoInput = document.getElementById('collectiveManifestoInput');

    const name = nameInput?.value.trim();
    const category = catSelect?.value;
    const icon = iconInput?.value.trim() || '🌱';
    const manifesto = manifestoInput?.value.trim();

    if (!name || !manifesto) {
      showToast('Please fill in the collective name and manifesto.', 'warning');
      return;
    }

    submitBtn.disabled = true;
    try {
      await apiRequest('/api/collectives', 'POST', { name, category, icon, manifesto });
      showToast(`Collective "${name}" successfully founded! 🏛️`, 'success');
      modal?.close();
      nameInput.value = '';
      manifestoInput.value = '';
      await loadCollectives();
    } catch (err) {
      showToast('Failed to found collective: ' + err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ==========================================================================
   FEATURE 5: MINDFUL DISCONNECT & ZEN SANCTUARY
   ========================================================================== */

let zenInterval = null;
let zenPhaseIndex = 0;
const ZEN_PHASES = [
  { label: 'Breathe In...', scale: 'scale(1.35)', color: '#38bdf8' },
  { label: 'Hold Gently...', scale: 'scale(1.35)', color: '#0ea5e9' },
  { label: 'Breathe Out...', scale: 'scale(0.95)', color: '#0284c7' },
  { label: 'Rest in Peace...', scale: 'scale(0.95)', color: '#0369a1' }
];

const sessionStartTime = Date.now();

function initMindfulDisconnect() {
  const modal = document.getElementById('mindfulDisconnectModal');
  const closeBtn = document.getElementById('closeMindfulBtn');
  const stepAwayBtn = document.getElementById('zenStepAwayBtn');

  closeBtn?.addEventListener('click', () => {
    modal?.close();
    stopZenCycle();
  });

  stepAwayBtn?.addEventListener('click', () => {
    modal?.close();
    stopZenCycle();
    showToast('🌿 Enjoy your offline time. The Platform will be here when you return!', 'success');
  });
}

function openMindfulZenMode() {
  const modal = document.getElementById('mindfulDisconnectModal');
  if (!modal) return;

  const sessionMinutes = Math.max(1, Math.round((Date.now() - sessionStartTime) / 60000));
  const timeEl = document.getElementById('zenSessionTime');
  if (timeEl) timeEl.textContent = `${sessionMinutes}m`;

  modal.showModal();
  startZenCycle();
}
window.openMindfulZenMode = openMindfulZenMode;

function startZenCycle() {
  stopZenCycle();
  const circle = document.getElementById('zenBreathingCircle');
  const label = document.getElementById('zenBreathingLabel');
  if (!circle || !label) return;

  zenPhaseIndex = 0;
  applyZenPhase();

  zenInterval = setInterval(() => {
    zenPhaseIndex = (zenPhaseIndex + 1) % ZEN_PHASES.length;
    applyZenPhase();
  }, 4000);
}

function applyZenPhase() {
  const circle = document.getElementById('zenBreathingCircle');
  const label = document.getElementById('zenBreathingLabel');
  if (!circle || !label) return;

  const phase = ZEN_PHASES[zenPhaseIndex];
  label.textContent = phase.label;
  circle.style.transform = phase.scale;
  circle.style.background = `radial-gradient(circle, ${phase.color} 0%, rgba(2, 132, 199, 0.4) 75%)`;
}

function stopZenCycle() {
  if (zenInterval) {
    clearInterval(zenInterval);
    zenInterval = null;
  }
}

/* ==========================================================================
   FEATURE 6: 1-CLICK PLATFORM PASSPORT DATA EXPORTER
   ========================================================================== */

function initPassportExport() {
  const exportBtn = document.getElementById('exportPassportBtn');
  exportBtn?.addEventListener('click', async () => {
    if (!STATE.currentUser) {
      showToast('Please log in to export your platform passport.', 'warning');
      return;
    }

    exportBtn.disabled = true;
    showToast('Compiling your sovereign platform passport...', 'info');

    try {
      const res = await apiRequest(`/api/users/export?user_id=${encodeURIComponent(STATE.currentUser.id)}`);
      const passportData = res.passport || res;

      const blob = new Blob([JSON.stringify(passportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeHandle = (STATE.currentUser.handle || 'user').replace('@', '');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `ThePlatform-Passport-${safeHandle}-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Platform Passport exported! Your sovereign data is yours forever. 🧳', 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'danger');
    } finally {
      exportBtn.disabled = false;
    }
  });
}
