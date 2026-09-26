"""
The Platform — Production-Grade Local Backend Server
Handles SQLite persistence, REST API, bot heuristics, IP banning, and static asset serving.
"""

import os
import json
import sqlite3
import time
import uuid
import re
import hashlib
import secrets
import socket
import sys
import math
import urllib.request
import urllib.parse

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

DB_PATH = os.path.join(os.path.dirname(__file__), 'theplatform.db')
STATIC_DIR = os.path.dirname(__file__)

def get_lan_ip():
    """Detect LAN IP address for mobile and local network access."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'

# Auto-Moderation Engine: Targeted Personal Attacks vs Idea Debate
# Disagreements/heated debates ('that\'s stupid', 'dumb idea', 'terrible argument') are permitted.
# Targeted personal attacks ('you\'re an asshole', 'ur a dick', 'your a dumbfuck', 'you are a dumbf***') are moderated away.
PERSONAL_ATTACK_PATTERNS = [
    re.compile(
        r"\b(you\s*['’]?\s*re|you\s+are|you\s+r|u\s+r|u\s+are|ur|u['’]re|your)\s+"
        r"(all\s+)?(such\s+an?|acting\s+like\s+an?|being\s+an?|just\s+an?|an?|the)?\s*"
        r"(fucking|f\*{1,4}ing|fkn|damn|total|absolute|complete|literal|massive|huge|real|pure|dumb|stupid)?\s*"
        r"(asshole|a[- ]?hole|dick|dickhead|dumbfuck|dumb\s*fuck|dumbf[\*#@%]+k?|bitch|b!tch|cunt|c\*nt|prick|douche|douchebag|jackass|dipshit|shithead|moron|idiot|bastard|scumbag|loser|clown|piece\s+of\s+shit|pos|waste\s+of\s+space|scum)(?=\b|[\s.,!?;:)\"']|$)",
        re.IGNORECASE
    ),
    re.compile(
        r"\b(you\s*['’]?\s*re|you\s+are|you\s+r|u\s+r|u\s+are|ur|u['’]re|your)\s+"
        r"(fucking|f\*{1,4}ing|fkn|damn|so|totally|absolutely|completely|truly|always|just|simply)?\s*"
        r"(stupid|dumb|moronic|idiotic|pathetic|retarded|r-tarded|ugly|disgusting|braindead|brain-dead|delusional|vile|toxic|worthless)\b",
        re.IGNORECASE
    ),
    re.compile(
        r"\b(shut\s+the\s+fuck\s+up|stfu|kill\s+yourself|kys|die\s+in\s+a\s+fire|eat\s+shit|go\s+fuck\s+yourself|fuck\s+you|f\*{2,4}\s+you|fuck\s+u)\b",
        re.IGNORECASE
    ),
    re.compile(
        r"\b(you|u)\s+(have|got|has)\s+(no|zero|literal(ly)?\s+no|\d)\s+brain\s*(cells?)?\b",
        re.IGNORECASE
    )
]

def check_civility(text):
    """
    Evaluates text for targeted personal attacks.
    Returns (True, None) if clean or idea debate, (False, flagged_snippet) if targeted personal attack.
    """
    if not text:
        return True, None
    clean = text.strip()
    for pat in PERSONAL_ATTACK_PATTERNS:
        m = pat.search(clean)
        if m:
            return False, m.group(0)
    return True, None

# In-memory brute force protection for /api/login: {ip: [timestamps]}
LOGIN_ATTEMPTS = {}
MAX_LOGIN_ATTEMPTS = 6
LOGIN_LOCKOUT_WINDOW = 300  # 5 minutes

# Ephemeral Fireside Hearths (In-memory real-time live rooms)
FIRESIDE_HEARTHS = {
    "hearth-solidarity": {
        "id": "hearth-solidarity",
        "name": "Solidarity & Open Commons",
        "topic": "Human-first technology, mutual aid & ethics",
        "emoji": "🔥",
        "occupants": {}
    },
    "hearth-acoustic": {
        "id": "hearth-acoustic",
        "name": "Acoustic Ambient Corner",
        "topic": "Late night music shares, vinyl vibes & chill discussion",
        "emoji": "🎸",
        "occupants": {}
    },
    "hearth-garden": {
        "id": "hearth-garden",
        "name": "Community Roots & Garden Guild",
        "topic": "Heirloom seeds, neighborhood projects & food autonomy",
        "emoji": "🌱",
        "occupants": {}
    }
}


def hash_password(password, salt=None):
    if not salt:
        salt = uuid.uuid4().hex
    pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000).hex()
    return pwd_hash, salt

def verify_password(password, salt, expected_hash):
    pwd_hash, _ = hash_password(password, salt)
    return pwd_hash == expected_hash

# ==============================================================================
# TRUE GEOCODING & DISTANCE CALCULATION ENGINE (ZERO GPS TRACKING)
# ==============================================================================
KNOWN_LOCATIONS = {
    "los banos, ca": (37.0592, -120.8505, "Los Banos, Merced County, California, United States"),
    "los banos": (37.0592, -120.8505, "Los Banos, Merced County, California, United States"),
    "pacheco blvd, los banos, ca": (37.0566, -120.8487, "Pacheco Boulevard, Los Banos, California, United States"),
    "645 pacheco blvd, los banos, ca": (37.0566, -120.8487, "645 Pacheco Blvd, Los Banos, California, United States"),
    "san francisco, ca": (37.7749, -122.4194, "San Francisco, California, United States"),
    "san francisco": (37.7749, -122.4194, "San Francisco, California, United States"),
    "north beach, san francisco, ca": (37.8012, -122.4090, "North Beach, San Francisco, California, United States"),
    "north beach, sf": (37.8012, -122.4090, "North Beach, San Francisco, California, United States"),
    "san francisco, ca (mission)": (37.7599, -122.4148, "Mission District, San Francisco, California, United States"),
    "mission district, san francisco, ca": (37.7599, -122.4148, "Mission District, San Francisco, California, United States"),
    "portland, or": (45.5152, -122.6784, "Portland, Multnomah County, Oregon, United States"),
    "portland, or (hawthorne)": (45.5121, -122.6231, "Hawthorne, Portland, Oregon, United States"),
    "portland": (45.5152, -122.6784, "Portland, Multnomah County, Oregon, United States"),
    "seattle, wa": (47.6062, -122.3321, "Seattle, King County, Washington, United States"),
    "seattle, wa (capitol hill)": (47.6253, -122.3222, "Capitol Hill, Seattle, Washington, United States"),
    "seattle": (47.6062, -122.3321, "Seattle, King County, Washington, United States"),
    "oakland, ca": (37.8044, -122.2712, "Oakland, Alameda County, California, United States"),
    "berkeley, ca": (37.8715, -122.2730, "Berkeley, Alameda County, California, United States"),
    "san jose, ca": (37.3382, -121.8863, "San Jose, Santa Clara County, California, United States"),
    "sacramento, ca": (38.5816, -121.4944, "Sacramento, California, United States"),
    "fresno, ca": (36.7468, -119.7726, "Fresno, California, United States")
}

def geocode_location(query, conn=None):
    """
    True geocoding from user text input (address, city, or zip). Zero GPS tracking.
    Checks in-memory fast dict, then SQLite geocache table, then OpenStreetMap Nominatim.
    Returns (lat, lon, formatted_address) or None.
    """
    if not query or not isinstance(query, str) or not query.strip():
        return None
    
    clean_query = query.strip()
    norm_key = clean_query.lower()
    
    # 1. Fast built-in lookup
    if norm_key in KNOWN_LOCATIONS:
        return KNOWN_LOCATIONS[norm_key]
    
    # 2. Check SQLite geocache table
    close_conn = False
    if conn is None:
        conn = get_db()
        close_conn = True
    
    try:
        cur = conn.cursor()
        cur.execute("SELECT latitude, longitude, formatted_address FROM geocache WHERE LOWER(query) = LOWER(?)", (clean_query,))
        row = cur.fetchone()
        if row and row['latitude'] is not None and row['longitude'] is not None:
            if close_conn:
                conn.close()
            return (float(row['latitude']), float(row['longitude']), row['formatted_address'])
    except Exception:
        pass
    
    # 3. Query OpenStreetMap Nominatim with retry
    try:
        clean_search = re.sub(r'\s*\([^)]*\)', '', clean_query).strip()
        url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({
            'q': clean_search if clean_search else clean_query,
            'format': 'json',
            'limit': 1
        })
        req = urllib.request.Request(url, headers={'User-Agent': 'ThePlatform/2.0 (mracrawford@gmail.com)'})
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data and len(data) > 0:
                lat = float(data[0]['lat'])
                lon = float(data[0]['lon'])
                addr = data[0].get('display_name', clean_query)
                try:
                    cur = conn.cursor()
                    cur.execute(
                        "INSERT OR REPLACE INTO geocache (query, latitude, longitude, formatted_address, created_at) VALUES (?, ?, ?, ?, ?)",
                        (clean_query, lat, lon, addr, int(time.time()))
                    )
                    conn.commit()
                except Exception:
                    pass
                if close_conn:
                    conn.close()
                return (lat, lon, addr)
    except Exception:
        pass
    
    if close_conn:
        conn.close()
    return None

def calculate_distance_and_bearing(lat1, lon1, lat2, lon2):
    """
    Computes true Haversine distance in miles and km, compass bearing angle (0-360 deg),
    and 8-point compass cardinal direction.
    """
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return {
            "distance_miles": 0.0,
            "distance_km": 0.0,
            "bearing_deg": 0.0,
            "compass_dir": "Local"
        }
    
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    dist_miles = round(R * c, 1)
    dist_km = round(dist_miles * 1.60934, 1)
    
    # Bearing in degrees (0 to 360, 0=North, 90=East, 180=South, 270=West)
    y = math.sin(dlon) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon)
    bearing = round((math.degrees(math.atan2(y, x)) + 360) % 360, 1)
    
    cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    cardinal = cardinals[round(bearing / 45) % 8]
    
    return {
        "distance_miles": dist_miles,
        "distance_km": dist_km,
        "bearing_deg": bearing,
        "compass_dir": cardinal
    }

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except:
        pass
    cursor = conn.cursor()

    # Users Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        handle TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        bio TEXT,
        avatar TEXT,
        banner TEXT,
        music_title TEXT,
        music_source TEXT,
        privacy TEXT DEFAULT 'public',
        is_admin INTEGER DEFAULT 0,
        is_example INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        registered_ip TEXT,
        bot_score REAL DEFAULT 0.0,
        bot_flags TEXT,
        entropy_score REAL DEFAULT 1.0,
        karma INTEGER DEFAULT 0,
        aesthetic_name TEXT DEFAULT 'Modernist',
        font_heading TEXT DEFAULT "'Plus Jakarta Sans', sans-serif",
        font_body TEXT DEFAULT "'Inter', sans-serif",
        created_at INTEGER
    )
    ''')

    # Dynamically ensure all modern columns exist in users table
    cursor.execute("PRAGMA table_info(users)")
    existing_cols = [row['name'] for row in cursor.fetchall()]
    if 'password_hash' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    if 'password_salt' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN password_salt TEXT")
    if 'passions' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN passions TEXT DEFAULT '[]'")
    if 'subtopics' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN subtopics TEXT DEFAULT '[]'")
    if 'avatars' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN avatars TEXT DEFAULT '[]'")
    if 'youtube_url' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN youtube_url TEXT")
    if 'location' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN location TEXT DEFAULT ''")
    if 'dob' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN dob TEXT")
    if 'show_zodiac' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN show_zodiac INTEGER DEFAULT 1")
    if 'zodiac_sign' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN zodiac_sign TEXT")
    if 'commons_verified' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN commons_verified INTEGER DEFAULT 0")
    if 'verification_selfie' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN verification_selfie TEXT")
    if 'verification_id_card' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN verification_id_card TEXT")
    if 'verified_at' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN verified_at INTEGER")
    if 'motto' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN motto TEXT DEFAULT ''")
    if 'playlist' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN playlist TEXT DEFAULT '[]'")
    if 'latitude' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN latitude REAL DEFAULT NULL")
    if 'longitude' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN longitude REAL DEFAULT NULL")
    if 'formatted_address' not in existing_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN formatted_address TEXT DEFAULT NULL")

    # Ensure Adam account has full admin and commons verification, and true Los Banos location coordinates
    cursor.execute("""
    UPDATE users SET 
        is_admin = 1, 
        commons_verified = 1,
        location = CASE WHEN location = '' OR location IS NULL THEN 'Los Banos, CA' ELSE location END,
        latitude = COALESCE(latitude, 37.0592),
        longitude = COALESCE(longitude, -120.8505),
        formatted_address = COALESCE(formatted_address, 'Los Banos, Merced County, California, United States')
    WHERE id = 'usr-adam' OR LOWER(handle) = '@adam' OR LOWER(email) = 'mracrawford@gmail.com'
    """)

    # Banned IPs Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS banned_ips (
        ip TEXT PRIMARY KEY,
        reason TEXT,
        banned_by TEXT,
        banned_at INTEGER
    )
    ''')

    # Posts Table (Dispatches & Guestbook Notes)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        text TEXT NOT NULL,
        interest TEXT,
        subtopic TEXT,
        media_url TEXT,
        media_type TEXT,
        video_duration TEXT,
        is_guestbook INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        flag_count INTEGER DEFAULT 0,
        flagged_for_admin INTEGER DEFAULT 0,
        visibility TEXT DEFAULT 'public',
        mentioned_post_id TEXT,
        mentions_count INTEGER DEFAULT 0,
        created_at INTEGER,
        FOREIGN KEY(host_id) REFERENCES users(id),
        FOREIGN KEY(author_id) REFERENCES users(id)
    )
    ''')

    # Ensure interest, subtopic, views, flags, visibility columns exist on posts table
    cursor.execute("PRAGMA table_info(posts)")
    existing_post_cols = [row['name'] for row in cursor.fetchall()]
    if 'interest' not in existing_post_cols:
        cursor.execute("ALTER TABLE posts ADD COLUMN interest TEXT")
    if 'subtopic' not in existing_post_cols:
        cursor.execute("ALTER TABLE posts ADD COLUMN subtopic TEXT")
    if 'views' not in existing_post_cols:
        cursor.execute("ALTER TABLE posts ADD COLUMN views INTEGER DEFAULT 0")
    if 'flag_count' not in existing_post_cols:
        cursor.execute("ALTER TABLE posts ADD COLUMN flag_count INTEGER DEFAULT 0")
    if 'flagged_for_admin' not in existing_post_cols:
        cursor.execute("ALTER TABLE posts ADD COLUMN flagged_for_admin INTEGER DEFAULT 0")
    if 'visibility' not in existing_post_cols:
        cursor.execute("ALTER TABLE posts ADD COLUMN visibility TEXT DEFAULT 'public'")
    if 'mentioned_post_id' not in existing_post_cols:
        cursor.execute("ALTER TABLE posts ADD COLUMN mentioned_post_id TEXT")
    if 'mentions_count' not in existing_post_cols:
        cursor.execute("ALTER TABLE posts ADD COLUMN mentions_count INTEGER DEFAULT 0")

    # Friendships Table (Friend Requests & Status)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,       /* requester */
        friend_id TEXT NOT NULL,     /* addressee */
        status TEXT NOT NULL,        /* 'pending', 'accepted', 'declined' */
        created_at INTEGER,
        updated_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(friend_id) REFERENCES users(id)
    )
    ''')

    # Saved Posts Table (Bookmarks)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS saved_posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        created_at INTEGER,
        UNIQUE(user_id, post_id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(post_id) REFERENCES posts(id)
    )
    ''')

    # Post Comments Table (Expandable Discussions on Topic Posts)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS post_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER,
        FOREIGN KEY(post_id) REFERENCES posts(id),
        FOREIGN KEY(author_id) REFERENCES users(id)
    )
    ''')

    # Password Resets Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    # System Emails Table (Audit & In-App Email Delivery Simulator)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS system_emails (
        id TEXT PRIMARY KEY,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        body_html TEXT NOT NULL,
        action_url TEXT,
        created_at INTEGER NOT NULL,
        read INTEGER DEFAULT 0
    )
    ''')

    # Direct Messages Table (Private Messaging for Mutual Friends)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        text TEXT NOT NULL,
        media_url TEXT,
        media_type TEXT,
        created_at INTEGER NOT NULL,
        read INTEGER DEFAULT 0,
        FOREIGN KEY(sender_id) REFERENCES users(id),
        FOREIGN KEY(recipient_id) REFERENCES users(id)
    )
    ''')

    cursor.execute("PRAGMA table_info(direct_messages)")
    existing_dm_cols = [row['name'] for row in cursor.fetchall()]
    if 'media_url' not in existing_dm_cols:
        cursor.execute("ALTER TABLE direct_messages ADD COLUMN media_url TEXT")
    if 'media_type' not in existing_dm_cols:
        cursor.execute("ALTER TABLE direct_messages ADD COLUMN media_type TEXT")

    # The Commons Mutual Aid Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS commons_items (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        type TEXT NOT NULL, /* 'offer' or 'request' */
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        desc TEXT NOT NULL,
        image_url TEXT,
        location TEXT,
        latitude REAL DEFAULT NULL,
        longitude REAL DEFAULT NULL,
        formatted_address TEXT DEFAULT NULL,
        status TEXT DEFAULT 'active',
        is_example INTEGER DEFAULT 0,
        created_at INTEGER,
        FOREIGN KEY(author_id) REFERENCES users(id)
    )
    ''')

    cursor.execute("PRAGMA table_info(commons_items)")
    existing_ci_cols = [row['name'] for row in cursor.fetchall()]
    if 'latitude' not in existing_ci_cols:
        cursor.execute("ALTER TABLE commons_items ADD COLUMN latitude REAL DEFAULT NULL")
    if 'longitude' not in existing_ci_cols:
        cursor.execute("ALTER TABLE commons_items ADD COLUMN longitude REAL DEFAULT NULL")
    if 'formatted_address' not in existing_ci_cols:
        cursor.execute("ALTER TABLE commons_items ADD COLUMN formatted_address TEXT DEFAULT NULL")

    # Geocache Table for Instant, Zero-Latency Coordinates (Zero GPS)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS geocache (
        query TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        formatted_address TEXT NOT NULL,
        created_at INTEGER
    )
    ''')

    # Audit Logs Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        admin_id TEXT,
        action TEXT NOT NULL,
        target_id TEXT,
        target_ip TEXT,
        details TEXT,
        created_at INTEGER
    )
    ''')

    # Post Flags Table (Off-Topic Community Moderation - 3 flags escalates to admin)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS post_flags (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(post_id, user_id),
        FOREIGN KEY(post_id) REFERENCES posts(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    # Notifications Table (Mentions, Post Tags, Friend Requests)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        target_id TEXT,
        read INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(sender_id) REFERENCES users(id)
    )
    ''')

    # E2EE Public Keys Table (Client-Side Key Exchange)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS user_public_keys (
        user_id TEXT PRIMARY KEY,
        public_key_spki TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    # Ensure encryption columns on direct_messages
    cursor.execute("PRAGMA table_info(direct_messages)")
    existing_dm_cols = [row['name'] for row in cursor.fetchall()]
    if 'is_encrypted' not in existing_dm_cols:
        cursor.execute("ALTER TABLE direct_messages ADD COLUMN is_encrypted INTEGER DEFAULT 0")
    if 'iv' not in existing_dm_cols:
        cursor.execute("ALTER TABLE direct_messages ADD COLUMN iv TEXT")
    if 'algo' not in existing_dm_cols:
        cursor.execute("ALTER TABLE direct_messages ADD COLUMN algo TEXT DEFAULT 'AES-GCM'")

    # Collectives & Guilds Tables (Democratic Self-Governing Associations)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS collectives (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        manifesto TEXT,
        category TEXT DEFAULT 'Mutual Aid',
        creator_id TEXT NOT NULL,
        karma_pool INTEGER DEFAULT 0,
        members_count INTEGER DEFAULT 1,
        avatar_emoji TEXT DEFAULT '🏛️',
        created_at INTEGER NOT NULL,
        FOREIGN KEY(creator_id) REFERENCES users(id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS collective_members (
        collective_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT DEFAULT 'Member',
        karma_contributed INTEGER DEFAULT 0,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY(collective_id, user_id),
        FOREIGN KEY(collective_id) REFERENCES collectives(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    conn.commit()

    # Seed AI / Example Stand-In Accounts if not existing
    seed_example_data(cursor, conn)
    conn.close()

def seed_example_data(cursor, conn):
    now = int(time.time())

    # Maya Lin (AI / Example Account)
    cursor.execute('''
    INSERT OR REPLACE INTO users (
        id, handle, name, email, phone, bio, avatar, banner,
        music_title, music_source, privacy, is_admin, is_example,
        registered_ip, bot_score, bot_flags, entropy_score, karma,
        aesthetic_name, font_heading, font_body, created_at,
        passions, subtopics, avatars, youtube_url, motto
    ) VALUES (
        'maya', '@maya', 'Maya Lin', 'maya.lin@soundcommons.net', '415-555-0142',
        'Algorithmic audio designer & visual artist. Building human-first digital commons. Modular synths, 35mm film, open protocol enthusiast.',
        'assets/avatar-p-cyber.svg', 'assets/maya-banner.jpg',
        'Tycho — Awake (Lo-fi Cyber Ambient)', 'YouTube Music Link', 'public',
        0, 1, '127.0.0.1', 0.0, '[]', 0.99, 34,
        'Cyber Neon', "'Plus Jakarta Sans', sans-serif", "'Inter', sans-serif", ?,
        ?, ?, ?, ?, 'Harmonic frequencies and open protocols for free minds 🎛️✨'
    )
    ''', (
        now - 86400 * 3,
        json.dumps(["Music", "Photography", "Art & Design"]),
        json.dumps([{"interest": "Music", "subtopic": "Modular Synthesizers"}, {"interest": "Photography", "subtopic": "35mm Film"}]),
        json.dumps(["assets/avatar-p-cyber.svg"]),
        "https://www.youtube.com/watch?v=VZBrZV3nHAA"
    ))

    # Julian Vance (AI / Example Account)
    cursor.execute('''
    INSERT OR REPLACE INTO users (
        id, handle, name, email, phone, bio, avatar, banner,
        music_title, music_source, privacy, is_admin, is_example,
        registered_ip, bot_score, bot_flags, entropy_score, karma,
        aesthetic_name, font_heading, font_body, created_at,
        passions, subtopics, avatars, youtube_url, motto
    ) VALUES (
        'julian', '@julian', 'Julian Vance', 'julian.vance@craftworks.org', '503-555-0188',
        'Cabinetmaker, woodcarver & vinyl archivist. Believing in repair culture over replacement culture. Coffee, cedar, and warm analog sound.',
        'assets/avatar-p-amber.svg', 'assets/julian-banner.jpg',
        'Khruangbin — Texas Sun (Acoustic Vinyl Ambient)', 'YouTube Music Link', 'public',
        0, 1, '127.0.0.1', 0.0, '[]', 0.98, 52,
        'Warm Analog Vintage', "'Playfair Display', serif", "'Inter', sans-serif", ?,
        ?, ?, ?, ?, 'Honoring the grain: repair, restore, and listen closely 🪵☕'
    )
    ''', (
        now - 86400 * 2,
        json.dumps(["Woodworking", "Music", "Crafts"]),
        json.dumps([{"interest": "Woodworking", "subtopic": "Cabinetmaking"}, {"interest": "Music", "subtopic": "Vinyl Archiving"}]),
        json.dumps(["assets/avatar-p-amber.svg"]),
        "https://www.youtube.com/watch?v=TT7EOIIthow"
    ))

    # Elena Rostova (AI / Example Account)
    cursor.execute('''
    INSERT OR REPLACE INTO users (
        id, handle, name, email, phone, bio, avatar, banner,
        music_title, music_source, privacy, is_admin, is_example,
        registered_ip, bot_score, bot_flags, entropy_score, karma,
        aesthetic_name, font_heading, font_body, created_at,
        passions, subtopics, avatars, youtube_url, motto
    ) VALUES (
        'elena', '@elena', 'Elena Rostova', 'elena.green@botanical.community', '206-555-0199',
        'Urban ecologist, seed saver & heritage grain baker. Steward of the Eastside Greenhouse Collective. Cultivating mutual aid & soil biology.',
        'assets/avatar-p-emerald.svg', 'assets/elena-banner.jpg',
        'C418 — Subwoofer Lullaby (Greenhouse Ambient)', 'YouTube Music Link', 'public',
        0, 1, '127.0.0.1', 0.0, '[]', 0.99, 61,
        'Lush Botanical Greenhouse', "'Outfit', sans-serif", "'Inter', sans-serif", ?,
        ?, ?, ?, ?, 'Cultivating soil biology, sourdough cultures, and mutual care 🌾🥖'
    )
    ''', (
        now - 86400,
        json.dumps(["Baking", "Gardening", "Cooking"]),
        json.dumps([{"interest": "Baking", "subtopic": "Heritage Sourdough"}, {"interest": "Gardening", "subtopic": "Urban Agroecology"}]),
        json.dumps(["assets/avatar-p-emerald.svg"]),
        "https://www.youtube.com/watch?v=d9j-rEWa96Y"
    ))

    # Seed / Update Root Super Admin Account (Adam) with securely hashed password and Solidarity Forever motto
    adam_salt = uuid.uuid4().hex
    adam_hash = hashlib.pbkdf2_hmac('sha256', b'Jocelyn&Me2026', adam_salt.encode('utf-8'), 100000).hex()
    
    cursor.execute("SELECT id FROM users WHERE id = 'usr-adam' OR email = 'mracrawford@gmail.com'")
    existing_adam = cursor.fetchone()
    if not existing_adam:
        cursor.execute('''
        INSERT INTO users (
            id, handle, name, email, phone, bio, avatar, banner,
            music_title, music_source, privacy, is_admin, is_example,
            registered_ip, bot_score, bot_flags, entropy_score, karma,
            aesthetic_name, font_heading, font_body, created_at,
            password_hash, password_salt, passions, subtopics, avatars, youtube_url, location,
            dob, show_zodiac, zodiac_sign, commons_verified, motto
        ) VALUES (
            'usr-adam', '@adam', 'Adam', 'mracrawford@gmail.com', '555-012-3456',
            'Creator of The Platform. Advocating for human-first digital spaces, zero bots, safe dynamic aesthetics, and mutual aid.',
            'assets/avatar-p-default.svg', 'assets/maya-banner.jpg',
            'Lofi Ambient Chillhop', 'YouTube Audio Link', 'public', 1, 0,
            '127.0.0.1', 0.0, '[]', 0.99, 45,
            'Modernist', "'Plus Jakarta Sans', sans-serif", "'Inter', sans-serif", ?,
            ?, ?, ?, ?, ?, ?, 'San Francisco, CA',
            '1988-08-14', 1, '♌ Leo', 1, 'Solidarity Forever ✊🌹'
        )
        ''', (
            now,
            adam_hash,
            adam_salt,
            json.dumps(["Music", "Technology", "Cycling"]),
            json.dumps([{"interest": "Music", "subtopic": "Ambient Chillhop"}, {"interest": "Technology", "subtopic": "Decentralized Protocols"}]),
            json.dumps(["assets/avatar-p-default.svg"]),
            "https://www.youtube.com/watch?v=VZBrZV3nHAA"
        ))
    else:
        # Existing account: keep custom banner, avatar, passions, dob, motto completely intact!
        cursor.execute('''
        UPDATE users SET
            is_admin = 1,
            commons_verified = 1
        WHERE id = 'usr-adam' OR email = 'mracrawford@gmail.com'
        ''')

    # Seed Posts with Interest, Subtopic, Views, and Likes
    cursor.execute('''
    INSERT OR REPLACE INTO posts (id, host_id, author_id, text, interest, subtopic, media_url, media_type, is_guestbook, likes, views, created_at)
    VALUES ('post-m1', 'maya', 'maya', 'Just restored a 1974 mechanical SLR camera. In an era where AI can synthesize any image in milliseconds, there is immense grounding in waiting for light to hit silver halide crystals.', 'Photography', '35mm Film Restoration', 'assets/vintage-camera.jpg', 'image', 0, 28, 142, ?)
    ''', (now - 3600 * 3,))

    cursor.execute('''
    INSERT OR REPLACE INTO posts (id, host_id, author_id, text, interest, subtopic, media_url, media_type, video_duration, is_guestbook, likes, views, created_at)
    VALUES ('post-m2', 'maya', 'maya', '45-second live patch on the modular synth. Tuning frequency modulation on the low pass filter. Enjoy the ambient frequencies! 🎧', 'Music', 'Modular Synthesizers', NULL, 'video', '0:45', 0, 42, 310, ?)
    ''', (now - 3600 * 8,))

    cursor.execute('''
    INSERT OR REPLACE INTO posts (id, host_id, author_id, text, interest, subtopic, is_guestbook, likes, views, created_at)
    VALUES ('post-mg1', 'maya', 'julian', 'Maya, that patch sounds incredible through tube monitors. Reminds me of late 90s ambient Detroit techno.', 'Music', 'Ambient Detroit Techno', 1, 9, 45, ?)
    ''', (now - 3600 * 5,))

    cursor.execute('''
    INSERT OR REPLACE INTO posts (id, host_id, author_id, text, interest, subtopic, is_guestbook, likes, views, created_at)
    VALUES ('post-j1', 'julian', 'julian', 'Finished hand-carving a quarter-sawn Sitka spruce soundboard for a parlor acoustic guitar. Traditional hot hide glue joinery. Analog vibration is pure medicine.', 'Woodworking', 'Acoustic Lutherie', 0, 34, 188, ?)
    ''', (now - 3600 * 14,))

    cursor.execute('''
    INSERT OR REPLACE INTO posts (id, host_id, author_id, text, interest, subtopic, media_url, media_type, is_guestbook, likes, views, created_at)
    VALUES ('post-e1', 'elena', 'elena', '36-hour cold fermented heritage sourdough baked with heirloom Red Fife wheat from the Skagit Valley. Wild yeasts alive and active!', 'Baking', 'Heritage Sourdough', 'assets/sourdough.jpg', 'image', 0, 58, 412, ?)
    ''', (now - 3600 * 20,))

    # Seed Sample Comments on Posts
    cursor.execute('''
    INSERT OR REPLACE INTO post_comments (id, post_id, author_id, text, created_at)
    VALUES 
    ('comment-1', 'post-m1', 'julian', 'The mechanical feel of those 70s shutters is unmatched. Great restoration!', ?),
    ('comment-2', 'post-m1', 'elena', 'Would love to see some darkroom prints from it in the greenhouse!', ?),
    ('comment-3', 'post-m2', 'julian', 'That low-pass filter sweep at the 30s mark gave me goosebumps 🎧', ?),
    ('comment-4', 'post-e1', 'maya', 'The ear on that boule is gorgeous! Wild yeast fermentation for the win.', ?)
    ''', (now - 3600 * 2, now - 3600, now - 3600 * 6, now - 3600 * 18))

    # Seed Sample Friendships
    cursor.execute('''
    INSERT OR REPLACE INTO friendships (id, user_id, friend_id, status, created_at, updated_at)
    VALUES 
    ('friend-julian-maya', 'julian', 'maya', 'accepted', ?, ?),
    ('friend-adam-maya', 'usr-adam', 'maya', 'accepted', ?, ?),
    ('friend-elena-adam', 'elena', 'usr-adam', 'pending', ?, ?)
    ''', (now - 86400 * 2, now - 86400 * 2, now - 86400, now - 86400, now - 3600, now - 3600))

    # Seed an Initial Direct Message between Maya and Adam
    cursor.execute('''
    INSERT OR IGNORE INTO direct_messages (id, sender_id, recipient_id, text, created_at, read)
    VALUES ('msg-seed-1', 'maya', 'usr-adam', 'Hey Adam! Loving the new verified human platform updates. No bots allowed! 🚀', ?, 0)
    ''', (now - 1800,))

    # Seed Commons items marked clearly as EXAMPLES
    cursor.execute('''
    INSERT OR REPLACE INTO commons_items (id, author_id, type, category, title, desc, image_url, location, latitude, longitude, formatted_address, is_example, status, created_at)
    VALUES ('aid-ex-1', 'elena', 'offer', 'food', 'Fresh Artisan Sourdough Boule', '36-hour cold fermented sourdough baked this morning. Crisp crust, open crumb. [ARCHIVED EXAMPLE LISTING]', 'assets/sourdough.jpg', 'Seattle, WA (Capitol Hill)', 47.6253, -122.3222, 'Capitol Hill, Seattle, Washington, United States', 1, 'archived_example', ?)
    ''', (now - 3600 * 12,))

    cursor.execute('''
    INSERT OR REPLACE INTO commons_items (id, author_id, type, category, title, desc, image_url, location, latitude, longitude, formatted_address, is_example, status, created_at)
    VALUES ('aid-ex-2', 'maya', 'offer', 'skills', '35mm Film Camera Loan & Darkroom Coaching', 'Loan of mechanical film body with 50mm f/1.8 lens, plus darkroom coaching session. [ARCHIVED EXAMPLE LISTING]', 'assets/vintage-camera.jpg', 'San Francisco, CA (Mission)', 37.7599, -122.4148, 'Mission District, San Francisco, California, United States', 1, 'archived_example', ?)
    ''', (now - 3600 * 18,))

    cursor.execute('''
    INSERT OR REPLACE INTO commons_items (id, author_id, type, category, title, desc, image_url, location, latitude, longitude, formatted_address, is_example, status, created_at)
    VALUES ('aid-ex-3', 'julian', 'offer', 'skills', 'Woodworking & Tool Sharpening Aid', 'Bring dull chisels or broken wooden joinery for repair assistance. [ARCHIVED EXAMPLE LISTING]', NULL, 'Portland, OR (Hawthorne)', 45.5121, -122.6231, 'Hawthorne, Portland, Oregon, United States', 1, 'archived_example', ?)
    ''', (now - 3600 * 24,))

    # Seed 2 Hyper-Local Active Mutual Aid Listings in Los Banos, CA
    cursor.execute('''
    INSERT OR REPLACE INTO commons_items (id, author_id, type, category, title, desc, image_url, location, latitude, longitude, formatted_address, is_example, status, created_at)
    VALUES ('aid-lb-lemons', 'usr-adam', 'offer', 'food', 'Fresh Backyard Meyer Lemons & Fragrant Rosemary', 'Freshly picked from the backyard lemon tree in Los Banos. Sweet, juicy, and pesticide-free. Come take a basket!', NULL, 'Los Banos, CA', 37.0592, -120.8505, 'Los Banos, Merced County, California, United States', 0, 'active', ?)
    ''', (now - 3600 * 2,))

    cursor.execute('''
    INSERT OR REPLACE INTO commons_items (id, author_id, type, category, title, desc, image_url, location, latitude, longitude, formatted_address, is_example, status, created_at)
    VALUES ('aid-lb-bikepump', 'usr-adam', 'offer', 'tools', 'Heavy-Duty Bicycle Floor Pump & Repair Stand Loan', 'Professional-grade Topeak floor pump with pressure gauge and Park Tool portable stand. Available for community loan.', NULL, 'Pacheco Blvd, Los Banos, CA', 37.0566, -120.8487, 'Pacheco Blvd, Los Banos, California, United States', 0, 'active', ?)
    ''', (now - 3600 * 4,))

    # Seed one simulated suspicious Bot account for the Admin console demonstration
    cursor.execute('''
    INSERT OR REPLACE INTO users (
        id, handle, name, email, phone, bio, avatar, banner,
        music_title, music_source, privacy, is_admin, is_example,
        is_banned, registered_ip, bot_score, bot_flags, entropy_score, karma,
        aesthetic_name, font_heading, font_body, created_at,
        passions, subtopics, avatars, motto
    ) VALUES (
        'bot-suspicious-881', '@cryptopump99', 'Crypto Arbitrage AI', 'spam9921@temp-burner-mail.xyz', '+1-800-555-0199',
        'Automated guaranteed returns crypto trading bot! Click my link for free tokens now!!!',
        'assets/avatar-p-cyber.svg', 'assets/maya-banner.jpg',
        'None', '', 'public',
        0, 0, 0, '194.26.29.112', 0.94, '["Headless browser UA", "Burner disposable email domain", "0ms typing entropy", "Data center VPN IP subnet"]', 0.05, 0,
        'Cyber Neon', "'Plus Jakarta Sans', sans-serif", "'Inter', sans-serif", ?,
        '[]', '[]', '["assets/avatar-p-cyber.svg"]', 'Free crypto tokens 100x pump'
    )
    ''', (now - 600,))

    # Seed initial community collectives if empty
    cursor.execute("SELECT COUNT(*) as cnt FROM collectives")
    if cursor.fetchone()['cnt'] == 0:
        cursor.execute('''
        INSERT INTO collectives (id, name, description, manifesto, category, creator_id, karma_pool, members_count, avatar_emoji, created_at)
        VALUES
        ('col-bay-aid', 'Bay Area Mutual Aid Collective', 'Local grassroots network distributing mutual aid, food sovereignty, and emergency assistance without red tape.', 'We believe that solidarity, not charity, is the true engine of human dignity. We pool skills, tools, and emergency karma to support neighbors directly.', 'Mutual Aid', 'usr-adam', 180, 24, '🤝', ?),
        ('col-open-tech', 'Open Web & Decentralized Guild', 'Advocating for self-hosted technology, zero surveillance, open protocols, and human-first digital commons.', 'Code is infrastructure. We build algorithms that serve people, not advertising monopolies. Zero corporate trackers, zero bots, 100% human autonomy.', 'Technology', 'usr-adam', 125, 18, '⚡', ?),
        ('col-solarpunk', 'Solarpunk Community Gardeners', 'Heirloom seed sharing, guerrilla gardening, permaculture workshops, and neighborhood tool libraries.', 'Transforming concrete spaces into productive urban gardens. Growing resilience, sharing harvest freely, and preserving heirloom biodiversity.', 'Ecology & Food', 'usr-adam', 95, 14, '🌿', ?),
        ('col-audio', 'Acoustic Musicians & Vinyl Guild', 'A collective of analog synth lovers, acoustic songwriters, and vinyl preservationists creating uncompressed sound.', 'Music is a sacred human bond. We gather in Fireside Hearths to share acoustic jams, critique analog mixes, and keep live sound authentic.', 'Art & Music', 'usr-adam', 60, 9, '🎸', ?)
        ''', (now - 86400 * 5, now - 86400 * 4, now - 86400 * 3, now - 86400 * 2))

        for cid in ['col-bay-aid', 'col-open-tech', 'col-solarpunk', 'col-audio']:
            cursor.execute('''
            INSERT OR IGNORE INTO collective_members (collective_id, user_id, role, karma_contributed, joined_at)
            VALUES (?, 'usr-adam', 'Founder', 25, ?)
            ''', (cid, now - 86400 * 2))

    conn.commit()

def are_friends(cur, u1_id, u2_id):
    """
    Checks if two users have an accepted mutual friendship.
    """
    if not u1_id or not u2_id or u1_id == u2_id:
        return False
    cur.execute("""
    SELECT id FROM friendships
    WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
      AND status = 'accepted'
    """, (u1_id, u2_id, u2_id, u1_id))
    return bool(cur.fetchone())

def sanitize_motto(motto_str):
    """
    Sanitizes personal motto / statement.
    Strictly limited to a maximum of 15 words. Preserves emojis and spaces.
    """
    if not motto_str:
        return ""
    words = str(motto_str).strip().split()
    if len(words) > 15:
        return " ".join(words[:15])
    return " ".join(words)

def compute_zodiac_sign(dob_str):
    """
    Computes astrological Zodiac sign based on birth date (YYYY-MM-DD).
    Zero gender involved — purely astronomical / zodiac calendar.
    """
    if not dob_str:
        return ""
    try:
        parts = dob_str.split('-')
        if len(parts) != 3:
            return ""
        month = int(parts[1])
        day = int(parts[2])
        if (month == 3 and day >= 21) or (month == 4 and day <= 19):
            return "♈ Aries"
        elif (month == 4 and day >= 20) or (month == 5 and day <= 20):
            return "♉ Taurus"
        elif (month == 5 and day >= 21) or (month == 6 and day <= 20):
            return "♊ Gemini"
        elif (month == 6 and day >= 21) or (month == 7 and day <= 22):
            return "♋ Cancer"
        elif (month == 7 and day >= 23) or (month == 8 and day <= 22):
            return "♌ Leo"
        elif (month == 8 and day >= 23) or (month == 9 and day <= 22):
            return "♍ Virgo"
        elif (month == 9 and day >= 23) or (month == 10 and day <= 22):
            return "♎ Libra"
        elif (month == 10 and day >= 23) or (month == 11 and day <= 21):
            return "♏ Scorpio"
        elif (month == 11 and day >= 22) or (month == 12 and day <= 21):
            return "♐ Sagittarius"
        elif (month == 12 and day >= 22) or (month == 1 and day <= 19):
            return "♑ Capricorn"
        elif (month == 1 and day >= 20) or (month == 2 and day <= 18):
            return "♒ Aquarius"
        elif (month == 2 and day >= 19) or (month == 3 and day <= 20):
            return "♓ Pisces"
        return ""
    except:
        return ""

def resolve_user(cur, *identifiers):
    """
    Robustly resolves a user record by testing candidate identifiers in sequence.
    Handles exact ID, @handle, handle without @, email, and legacy stale session IDs.
    """
    for identifier in identifiers:
        if not identifier:
            continue
        ident = str(identifier).strip()
        if not ident:
            continue
        handle_with_at = ident if ident.startswith('@') else f"@{ident}"
        handle_without_at = ident[1:] if ident.startswith('@') else ident

        cur.execute("""
        SELECT * FROM users
        WHERE id = ? 
           OR LOWER(id) = LOWER(?)
           OR LOWER(handle) = LOWER(?) 
           OR LOWER(handle) = LOWER(?)
           OR LOWER(email) = LOWER(?)
           OR id = ?
        """, (ident, ident, handle_with_at, handle_without_at, ident, f"usr-{ident}"))
        row = cur.fetchone()
        if row:
            return row

    # Legacy session recovery fallback:
    # If any identifier was the previous Adam session UUID or matches Adam
    for identifier in identifiers:
        if identifier and any(k in str(identifier).lower() for k in ['e78b019029', 'adam', 'crawford']):
            cur.execute("SELECT * FROM users WHERE id = 'usr-adam' OR email = 'mracrawford@gmail.com' OR handle = '@adam'")
            res = cur.fetchone()
            if res:
                return res

    return None

# --- BOT DETECTION ENGINE ---
DISPOSABLE_EMAIL_DOMAINS = {
    'tempmail.com', 'temp-burner-mail.xyz', 'mailinator.com', 'guerrillamail.com',
    '10minutemail.com', 'throwaway.email', 'sharklasers.com', 'dispostable.com'
}

SUSPICIOUS_IP_SUBNETS = [
    '194.26.', '45.154.', '185.220.', '193.176.'
]

def analyze_bot_risk(client_ip, user_agent, data):
    score = 0.0
    flags = []

    # 1. Check IP Blacklist
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT reason FROM banned_ips WHERE ip = ?", (client_ip,))
    row = cur.fetchone()
    conn.close()
    if row:
        return 1.0, [f"IP Already Blacklisted: {row['reason']}"]

    # 2. Check for known data center / proxy IP patterns
    for subnet in SUSPICIOUS_IP_SUBNETS:
        if client_ip.startswith(subnet):
            score += 0.45
            flags.append("Suspicious Proxy / Data Center Subnet")
            break

    # 3. Check User Agent
    ua = user_agent.lower()
    if any(bot in ua for bot in ['headlesschrome', 'phantomjs', 'selenium', 'puppeteer', 'python-requests', 'curl', 'wget']):
        score += 0.50
        flags.append("Automated / Headless Browser User-Agent")

    # 4. Check email domain
    email = data.get('email', '').lower()
    domain = email.split('@')[-1] if '@' in email else ''
    if domain in DISPOSABLE_EMAIL_DOMAINS or 'burner' in domain or 'temp' in domain:
        score += 0.40
        flags.append("Burner / Disposable Email Domain")

    # 5. Check Human Entropy Score reported by front-end
    entropy = float(data.get('entropy', 1.0))
    if entropy < 0.25:
        score += 0.40
        flags.append(f"Abnormally Low Human Entropy ({entropy:.2f})")

    # 6. Check submission completion time
    time_taken_ms = float(data.get('completionTimeMs', 10000))
    if time_taken_ms < 1500:
        score += 0.35
        flags.append(f"Superhuman Form Fill Speed ({int(time_taken_ms)}ms)")

    # 7. Check for spam keywords in bio
    bio = data.get('bio', '').lower()
    if any(k in bio for k in ['crypto', 'arbitrage', 'guaranteed returns', 'whatsapp me', 'telegram:', 'free tokens']):
        score += 0.35
        flags.append("Spam Commercial Keywords in Bio")

    normalized_score = min(1.0, score)
    return normalized_score, flags


# --- REQUEST HANDLER ---
class PlatformServerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id')
        self.end_headers()

    def get_client_ip(self):
        # Prefer X-Forwarded-For if behind reverse proxy, else client_address
        xff = self.headers.get('X-Forwarded-For')
        if xff:
            return xff.split(',')[0].strip()
        return self.client_address[0]

    def get_current_user_id(self):
        return self.headers.get('X-User-Id')

    def is_current_user_admin(self, user_id):
        if not user_id:
            return False
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT is_admin FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        conn.close()
        return bool(row and row['is_admin'] == 1)

    def end_headers(self):
        # Universal defensive security headers on all responses (static and API)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        super().end_headers()

    def send_json(self, status_code, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Defensive hardening: prevent direct download of database, server code, environment, or hidden files
        clean_path = path.lower().split('?')[0]
        if any(clean_path.endswith(ext) for ext in ['.db', '.sqlite', '.sqlite3', '.py', '.env', '.log', '.bak', '.git']) or '/.' in clean_path:
            self.send_error(403, "Access Forbidden: Protected resource.")
            return

        try:
            if path in ['/login', '/login/']:
                self.path = '/login.html'
                super().do_GET()
            elif path in ['/reset-password', '/reset-password/']:
                self.path = '/reset-password.html'
                super().do_GET()
            elif path.startswith('/api/'):
                self.handle_api_get(path, parse_qs(parsed.query))
            else:
                super().do_GET()
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json(500, {"error": str(e)})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            content_length = int(self.headers.get('Content-Length', 0))
        except (ValueError, TypeError):
            content_length = 0

        # Protect against memory exhaustion DoS (max 15MB for voice notes & image attachments)
        if content_length > 15 * 1024 * 1024:
            self.send_json(413, {"error": "Payload exceeds maximum allowed size of 15MB."})
            return

        post_body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        
        try:
            data = json.loads(post_body.decode('utf-8'))
        except:
            data = {}

        try:
            if path.startswith('/api/'):
                self.handle_api_post(path, data)
            else:
                self.send_json(404, {"error": "Not Found"})
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json(500, {"error": str(e)})

    def handle_api_get(self, path, query):
        conn = get_db()
        cur = conn.cursor()

        # Check if caller IP is banned
        client_ip = self.get_client_ip()
        cur.execute("SELECT reason FROM banned_ips WHERE ip = ?", (client_ip,))
        banned = cur.fetchone()
        if banned and not path.startswith('/api/auth/status'):
            conn.close()
            self.send_json(403, {"error": "IP Banned", "reason": banned['reason']})
            return
        # 0. GET /api/network-info - Retrieve LAN IP and port for mobile viewing
        if path == '/api/network-info':
            conn.close()
            lan_ip = get_lan_ip()
            self.send_json(200, {
                "lan_ip": lan_ip,
                "port": 3000,
                "lan_url": f"http://{lan_ip}:3000"
            })
            return

        # 0a. GET /api/crypto/public-key/:user_id - Retrieve E2EE Public Key
        pk_match = re.match(r'^/api/crypto/public-key/([^/]+)$', path)
        if pk_match:
            target_uid = pk_match.group(1)
            target = resolve_user(cur, target_uid)
            if not target:
                conn.close()
                self.send_json(404, {"error": "User not found."})
                return
            cur.execute("SELECT public_key_spki, updated_at FROM user_public_keys WHERE user_id = ?", (target['id'],))
            pk_row = cur.fetchone()
            conn.close()
            if pk_row:
                self.send_json(200, {"user_id": target['id'], "public_key": pk_row['public_key_spki'], "updated_at": pk_row['updated_at']})
            else:
                self.send_json(404, {"error": "User has not published an E2EE public key yet."})
            return

        # 0b. GET /api/collectives - List All Democratic Collectives & Guilds
        if path == '/api/collectives':
            viewer_id = self.get_current_user_id()
            viewer = resolve_user(cur, viewer_id) if viewer_id else None
            cur_uid = viewer['id'] if viewer else None
            cur.execute("""
            SELECT c.*, u.name as creator_name, u.handle as creator_handle
            FROM collectives c
            LEFT JOIN users u ON c.creator_id = u.id
            ORDER BY c.karma_pool DESC, c.members_count DESC
            """)
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                if cur_uid:
                    cur.execute("SELECT role, karma_contributed FROM collective_members WHERE collective_id = ? AND user_id = ?", (r['id'], cur_uid))
                    mem = cur.fetchone()
                    r['is_member'] = bool(mem)
                    r['my_role'] = mem['role'] if mem else None
                else:
                    r['is_member'] = False
                    r['my_role'] = None
            conn.close()
            self.send_json(200, {"collectives": rows})
            return

        # 0c. GET /api/lounges - List Active Fireside Hearth Rooms
        if path == '/api/lounges':
            conn.close()
            rooms = []
            for k, v in FIRESIDE_HEARTHS.items():
                rooms.append({
                    "id": v['id'],
                    "name": v['name'],
                    "topic": v['topic'],
                    "emoji": v['emoji'],
                    "occupants": list(v['occupants'].values()),
                    "occupant_count": len(v['occupants'])
                })
            self.send_json(200, {"lounges": rooms})
            return

        # 0d. GET /api/commons/radar - Mutual Aid Proximity Radar Clusters (True Geocoding & Distances)
        if path == '/api/commons/radar':
            viewer_id = (query.get('user_id') and query.get('user_id')[0]) or self.get_current_user_id()
            viewer_row = resolve_user(cur, viewer_id) if viewer_id else None
            viewer = dict(viewer_row) if viewer_row else None
            
            # Determine viewer coordinates
            viewer_lat = None
            viewer_lon = None
            viewer_addr = "Los Banos, CA"
            
            # Check query params for explicit coordinates
            if query.get('lat') and query.get('lon'):
                try:
                    viewer_lat = float(query['lat'][0])
                    viewer_lon = float(query['lon'][0])
                    viewer_addr = "Custom Coordinates"
                except:
                    pass

            if viewer_lat is None and viewer:
                if viewer.get('latitude') is not None and viewer.get('longitude') is not None:
                    viewer_lat = float(viewer['latitude'])
                    viewer_lon = float(viewer['longitude'])
                    viewer_addr = viewer.get('location') or viewer.get('formatted_address') or "Home Location"
                elif viewer.get('location'):
                    g = geocode_location(viewer['location'], conn=conn)
                    if g:
                        viewer_lat, viewer_lon, viewer_addr = g
                        cur.execute("UPDATE users SET latitude = ?, longitude = ?, formatted_address = ? WHERE id = ?", (viewer_lat, viewer_lon, viewer_addr, viewer['id']))
                        conn.commit()

            # Fallback to Adam / Los Banos, CA if not logged in or viewer has no coordinates
            if viewer_lat is None:
                cur.execute("SELECT latitude, longitude, location, formatted_address FROM users WHERE id = 'usr-adam' OR handle = '@adam'")
                adam_row = cur.fetchone()
                adam = dict(adam_row) if adam_row else None
                if adam and adam.get('latitude') is not None:
                    viewer_lat = float(adam['latitude'])
                    viewer_lon = float(adam['longitude'])
                    viewer_addr = adam.get('location') or "Los Banos, CA"
                else:
                    viewer_lat = 37.0592
                    viewer_lon = -120.8505
                    viewer_addr = "Los Banos, CA"

            radius_km = 50.0
            if query.get('radius_km'):
                try:
                    radius_km = float(query['radius_km'][0])
                except:
                    radius_km = 50.0

            cur.execute("""
            SELECT ci.*, u.name as author_name, u.handle as author_handle, u.avatar as author_avatar
            FROM commons_items ci
            JOIN users u ON ci.author_id = u.id
            WHERE ci.status = 'active' OR ci.status = 'archived_example'
            ORDER BY ci.created_at DESC
            """)
            raw_items = [dict(r) for r in cur.fetchall()]

            radar_points = []
            for it in raw_items:
                item_lat = it.get('latitude')
                item_lon = it.get('longitude')
                # Geocode on the fly if coordinates missing
                if (item_lat is None or item_lon is None) and it.get('location'):
                    g = geocode_location(it['location'], conn=conn)
                    if g:
                        item_lat, item_lon, it_addr = g
                        it['latitude'] = item_lat
                        it['longitude'] = item_lon
                        it['formatted_address'] = it_addr
                        cur.execute("UPDATE commons_items SET latitude = ?, longitude = ?, formatted_address = ? WHERE id = ?", (item_lat, item_lon, it_addr, it['id']))
                        conn.commit()
                
                # Calculate real distance and bearing if coordinates exist
                if item_lat is not None and item_lon is not None:
                    geo_info = calculate_distance_and_bearing(viewer_lat, viewer_lon, item_lat, item_lon)
                    dist_m = geo_info['distance_miles']
                    dist_k = geo_info['distance_km']
                    bearing = geo_info['bearing_deg']
                    cardinal = geo_info['compass_dir']
                else:
                    dist_m = 999.0
                    dist_k = 999.0
                    bearing = 0.0
                    cardinal = 'Local'
                
                # Determine radar ring
                if dist_k <= 5.0:
                    ring = 1  # Walking / Local
                elif dist_k <= 25.0:
                    ring = 2  # Neighborhood / Community
                elif dist_k <= 100.0:
                    ring = 3  # Regional Metro
                else:
                    ring = 4  # Extended Network
                
                loc_name = it.get('location') or 'Local Mesh'
                
                radar_points.append({
                    **it,
                    "ring": ring,
                    "angle_deg": bearing,
                    "bearing_deg": bearing,
                    "compass_dir": cardinal,
                    "distance_miles": dist_m,
                    "distance_km": dist_k,
                    "fuzzy_neighborhood": loc_name,
                    "urgency": "high" if it['type'] == 'request' else "standard"
                })

            conn.close()

            # Sort radar points by true distance
            radar_points.sort(key=lambda x: x['distance_km'])

            self.send_json(200, {
                "viewer": {
                    "latitude": viewer_lat,
                    "longitude": viewer_lon,
                    "location": viewer_addr
                },
                "radar_points": radar_points,
                "clusters": radar_points,
                "total_nearby": len(radar_points)
            })
            return

        # 0e. GET /api/users/export - 1-Click Platform Passport Portability
        if path == '/api/users/export':
            user_id = (query.get('user_id') and query.get('user_id')[0]) or self.get_current_user_id()
            user = resolve_user(cur, user_id)
            if not user:
                conn.close()
                self.send_json(404, {"error": "User not found for data export."})
                return

            u_dict = dict(user)
            u_dict.pop('password_hash', None)
            u_dict.pop('password_salt', None)

            cur.execute("SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC", (user['id'],))
            dispatches = [dict(r) for r in cur.fetchall()]

            cur.execute("""
            SELECT p.* FROM posts p
            JOIN saved_posts sp ON p.id = sp.post_id
            WHERE sp.user_id = ?
            """, (user['id'],))
            saved = [dict(r) for r in cur.fetchall()]

            cur.execute("SELECT * FROM commons_items WHERE author_id = ?", (user['id'],))
            aid_items = [dict(r) for r in cur.fetchall()]

            cur.execute("""
            SELECT u.id, u.handle, u.name, u.avatar
            FROM friendships f
            JOIN users u ON (f.friend_id = u.id AND f.user_id = ?) OR (f.user_id = u.id AND f.friend_id = ?)
            WHERE f.status = 'accepted'
            """, (user['id'], user['id']))
            friends = [dict(r) for r in cur.fetchall()]

            conn.close()

            passport = {
                "passport_format": "ThePlatform-Data-Passport-v1",
                "exported_at": int(time.time()),
                "user_profile": u_dict,
                "dispatches_count": len(dispatches),
                "dispatches": dispatches,
                "saved_bookmarks": saved,
                "mutual_aid_contributions": aid_items,
                "friends_network": friends,
                "karma_total": user['karma']
            }
            self.send_json(200, {"passport": passport})
            return

        # 1. GET /api/users - List all active users (quarantining bots)
        if path == '/api/users':
            cur.execute("""
            SELECT id, handle, name, bio, avatar, banner, privacy, is_admin, is_example, is_banned,
                   karma, aesthetic_name, font_heading, font_body, music_title, music_source,
                   passions, subtopics, avatars, youtube_url, location, dob, show_zodiac, zodiac_sign, commons_verified, motto
            FROM users WHERE is_banned = 0 AND bot_score < 0.70 ORDER BY is_example ASC, created_at DESC
            """)
            users = [dict(row) for row in cur.fetchall()]
            conn.close()
            self.send_json(200, {"users": users})
            return

        # 2. GET /api/users/:id - Get specific user profile with dispatches & guestbook
        user_match = re.match(r'^/api/users/([^/]+)$', path)
        if user_match:
            user_id = user_match.group(1)
            user = resolve_user(cur, user_id)
            if not user:
                conn.close()
                self.send_json(404, {"error": "User not found"})
                return

            user_dict = dict(user)
            user_dict.pop('password_hash', None)
            user_dict.pop('password_salt', None)
            user_dict.pop('registered_ip', None) # Redact IP for general public

            # Parse playlist JSON
            try:
                user_dict['playlist'] = json.loads(user_dict.get('playlist') or '[]')
            except:
                user_dict['playlist'] = []

            viewer_id = self.get_current_user_id()
            viewer = resolve_user(cur, viewer_id) if viewer_id else None
            viewer_actual_id = viewer['id'] if viewer else None
            is_host_or_admin = (viewer_actual_id == user['id']) or (viewer and viewer['is_admin'] == 1)
            is_friend_of_host = are_friends(cur, viewer_actual_id, user['id']) if viewer_actual_id else False

            # Get user's own dispatches with engagement and comment counts
            cur.execute("""
            SELECT p.*,
                   u.name as author_name, u.handle as author_handle, u.avatar as author_avatar, u.motto as author_motto,
                   (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) as comments_count
            FROM posts p JOIN users u ON p.author_id = u.id
            WHERE p.host_id = ? AND p.is_guestbook = 0
            ORDER BY p.created_at DESC
            """, (user['id'],))
            all_dispatches = [dict(row) for row in cur.fetchall()]

            dispatches = []
            for dp in all_dispatches:
                vis = dp.get('visibility') or 'public'
                if vis == 'friends':
                    if is_host_or_admin or is_friend_of_host or (viewer_actual_id and viewer_actual_id == dp['author_id']):
                        dispatches.append(dp)
                else:
                    dispatches.append(dp)

            # Get visitor posts (guestbook notes)
            cur.execute("""
            SELECT p.*,
                   u.name as author_name, u.handle as author_handle, u.avatar as author_avatar, u.motto as author_motto,
                   (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) as comments_count
            FROM posts p JOIN users u ON p.author_id = u.id
            WHERE p.host_id = ? AND p.is_guestbook = 1
            ORDER BY p.created_at DESC
            """, (user['id'],))
            all_guestbook = [dict(row) for row in cur.fetchall()]

            guestbook = []
            for gp in all_guestbook:
                vis = gp.get('visibility') or 'public'
                if vis == 'friends':
                    if is_host_or_admin or is_friend_of_host or (viewer_actual_id and viewer_actual_id == gp['author_id']):
                        guestbook.append(gp)
                else:
                    guestbook.append(gp)

            conn.close()
            self.send_json(200, {
                "user": user_dict,
                "dispatches": dispatches,
                "guestbook": guestbook
            })
            return

        # 3. GET /api/commons - The Mutual Aid Marketplace Items (With True Distances)
        if path == '/api/commons':
            viewer_id = (query.get('user_id') and query.get('user_id')[0]) or self.get_current_user_id()
            viewer_row = resolve_user(cur, viewer_id) if viewer_id else None
            viewer = dict(viewer_row) if viewer_row else None
            viewer_lat = None
            viewer_lon = None
            viewer_location_name = "Los Banos, CA"

            if viewer:
                if viewer.get('latitude') is not None and viewer.get('longitude') is not None:
                    viewer_lat = float(viewer['latitude'])
                    viewer_lon = float(viewer['longitude'])
                    viewer_location_name = viewer.get('location') or viewer.get('formatted_address') or "Home Location"
                elif viewer.get('location'):
                    g = geocode_location(viewer['location'], conn=conn)
                    if g:
                        viewer_lat, viewer_lon, viewer_location_name = g
                        cur.execute("UPDATE users SET latitude = ?, longitude = ?, formatted_address = ? WHERE id = ?", (viewer_lat, viewer_lon, viewer_location_name, viewer['id']))
                        conn.commit()

            # If guest or viewer without location, fallback to Adam in Los Banos
            if viewer_lat is None:
                cur.execute("SELECT latitude, longitude, location, formatted_address FROM users WHERE id = 'usr-adam' OR handle = '@adam'")
                adm_row = cur.fetchone()
                adm = dict(adm_row) if adm_row else None
                if adm and adm.get('latitude') is not None:
                    viewer_lat = float(adm['latitude'])
                    viewer_lon = float(adm['longitude'])
                    viewer_location_name = adm.get('location') or "Los Banos, CA"
                else:
                    viewer_lat = 37.0592
                    viewer_lon = -120.8505
                    viewer_location_name = "Los Banos, CA"

            cur.execute("""
            SELECT c.*, u.name as author_name, u.handle as author_handle, u.avatar as author_avatar, u.karma, u.motto
            FROM commons_items c JOIN users u ON c.author_id = u.id
            ORDER BY c.is_example ASC, c.created_at DESC
            """)
            items = [dict(row) for row in cur.fetchall()]

            for it in items:
                item_lat = it.get('latitude')
                item_lon = it.get('longitude')
                if (item_lat is None or item_lon is None) and it.get('location'):
                    g = geocode_location(it['location'], conn=conn)
                    if g:
                        item_lat, item_lon, it_addr = g
                        it['latitude'] = item_lat
                        it['longitude'] = item_lon
                        it['formatted_address'] = it_addr
                        cur.execute("UPDATE commons_items SET latitude = ?, longitude = ?, formatted_address = ? WHERE id = ?", (item_lat, item_lon, it_addr, it['id']))
                        conn.commit()

                if viewer_lat is not None and item_lat is not None:
                    geo = calculate_distance_and_bearing(viewer_lat, viewer_lon, item_lat, item_lon)
                    it['distance_miles'] = geo['distance_miles']
                    it['distance_km'] = geo['distance_km']
                    it['bearing_deg'] = geo['bearing_deg']
                    it['compass_dir'] = geo['compass_dir']
                else:
                    it['distance_miles'] = None
                    it['distance_km'] = None
                    it['bearing_deg'] = None
                    it['compass_dir'] = None

            conn.close()
            self.send_json(200, {
                "items": items,
                "viewer": {
                    "latitude": viewer_lat,
                    "longitude": viewer_lon,
                    "location": viewer_location_name
                }
            })
            return

        # 4. GET /api/admin/bot-monitor (Admin-Only)
        if path == '/api/admin/bot-monitor':
            requester_id = self.get_current_user_id()
            if not self.is_current_user_admin(requester_id):
                conn.close()
                self.send_json(403, {"error": "Forbidden: Requires Admin Privilege"})
                return

            # Retrieve all signups with bot metrics
            cur.execute("""
            SELECT id, handle, name, email, phone, registered_ip, bot_score, bot_flags,
                   entropy_score, is_banned, ban_reason, is_admin, is_example, created_at, motto
            FROM users ORDER BY created_at DESC
            """)
            signups = [dict(row) for row in cur.fetchall()]

            # Retrieve banned IPs
            cur.execute("SELECT * FROM banned_ips ORDER BY banned_at DESC")
            banned_ips = [dict(row) for row in cur.fetchall()]

            # Retrieve audit logs
            cur.execute("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50")
            audit_logs = [dict(row) for row in cur.fetchall()]

            conn.close()
            self.send_json(200, {
                "signups": signups,
                "banned_ips": banned_ips,
                "audit_logs": audit_logs
            })
            return

        # 5. GET /api/friends - Current user's friends & friend requests
        if path == '/api/friends':
            current_id = self.get_current_user_id() or (query.get('user_id') and query.get('user_id')[0])
            u = resolve_user(cur, current_id)
            if not u:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return
            uid = u['id']

            cur.execute("""
            SELECT u.id, u.handle, u.name, u.avatar, u.motto, u.karma, u.aesthetic_name,
                   f.id as friendship_id, f.created_at as became_friends_at
            FROM friendships f
            JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END) = u.id
            WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
            ORDER BY u.name ASC
            """, (uid, uid, uid))
            friends = [dict(row) for row in cur.fetchall()]

            cur.execute("""
            SELECT u.id, u.handle, u.name, u.avatar, u.motto, u.karma,
                   f.id as request_id, f.created_at
            FROM friendships f
            JOIN users u ON f.user_id = u.id
            WHERE f.friend_id = ? AND f.status = 'pending'
            ORDER BY f.created_at DESC
            """, (uid,))
            incoming = [dict(row) for row in cur.fetchall()]

            cur.execute("""
            SELECT u.id, u.handle, u.name, u.avatar, u.motto, u.karma,
                   f.id as request_id, f.created_at
            FROM friendships f
            JOIN users u ON f.friend_id = u.id
            WHERE f.user_id = ? AND f.status = 'pending'
            ORDER BY f.created_at DESC
            """, (uid,))
            outgoing = [dict(row) for row in cur.fetchall()]

            conn.close()
            self.send_json(200, {
                "friends": friends,
                "accepted": friends,
                "incoming": incoming,
                "outgoing": outgoing
            })
            return

        # 6. GET /api/friends/list/:id - Public friend list for any platform host
        friends_match = re.match(r'^/api/friends/list/([^/]+)$', path)
        if friends_match:
            target_ident = friends_match.group(1)
            u = resolve_user(cur, target_ident)
            if not u:
                conn.close()
                self.send_json(404, {"error": "User not found"})
                return
            uid = u['id']
            cur.execute("""
            SELECT u.id, u.handle, u.name, u.avatar, u.motto, u.karma, u.aesthetic_name,
                   f.created_at as became_friends_at
            FROM friendships f
            JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END) = u.id
            WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
            ORDER BY u.name ASC
            """, (uid, uid, uid))
            friends = [dict(row) for row in cur.fetchall()]
            conn.close()
            self.send_json(200, {"user_id": uid, "friends": friends})
            return

        # 7. GET /api/topics - Curated / Trending Topics & Passions Feed (Reddit-Style Social Ranking)
        if path == '/api/topics':
            current_user_id = self.get_current_user_id() or (query.get('user_id') and query.get('user_id')[0])
            interest_filter = query.get('interest', [None])[0]
            subtopic_filter = query.get('subtopic', [None])[0]
            saved_only = (query.get('saved_only', ['false'])[0].lower() in ['1', 'true', 'yes'])
            sort_by = query.get('sort', ['trending'])[0].lower()

            sql = """
            SELECT p.*,
                   u.name as author_name,
                   u.handle as author_handle,
                   u.avatar as author_avatar,
                   u.motto as author_motto,
                   (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) as comments_count,
                   EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = ?) as is_saved
            FROM posts p
            JOIN users u ON p.author_id = u.id
            WHERE p.interest IS NOT NULL 
              AND TRIM(p.interest) != '' 
              AND LOWER(TRIM(p.interest)) != 'thought' 
              AND LOWER(TRIM(p.interest)) != 'open thought (no topic)'
              AND (p.visibility IS NULL OR p.visibility = 'public')
            """
            params = [current_user_id or '']

            if interest_filter and interest_filter != 'all':
                if interest_filter == 'my-passions' and current_user_id:
                    cur.execute("SELECT passions FROM users WHERE id = ?", (current_user_id,))
                    prow = cur.fetchone()
                    try:
                        my_passions = json.loads(prow['passions'] or '[]') if prow else []
                    except:
                        my_passions = []
                    if my_passions:
                        placeholders = ','.join(['?'] * len(my_passions))
                        sql += f" AND LOWER(p.interest) IN ({placeholders})"
                        params.extend([mp.lower() for mp in my_passions])
                    else:
                        sql += " AND 1=0"
                else:
                    sql += " AND LOWER(p.interest) = LOWER(?)"
                    params.append(interest_filter)

            if subtopic_filter and subtopic_filter != 'all':
                sql += " AND LOWER(p.subtopic) = LOWER(?)"
                params.append(subtopic_filter)

            if saved_only and current_user_id:
                sql += " AND EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = ?)"
                params.append(current_user_id)

            cur.execute(sql, tuple(params))
            posts = [dict(row) for row in cur.fetchall()]

            now = int(time.time())
            for post in posts:
                post['body'] = post.get('text') or ''
                post['timestamp'] = post.get('created_at') or now
                likes = post.get('likes') or 0
                comments_count = post.get('comments_count') or 0
                mentions_count = post.get('mentions_count') or 0
                views = post.get('views') or 0
                raw_score = (likes * 3) + (comments_count * 4) + (mentions_count * 5) + (views * 1) + 1
                hours_ago = max(0.1, (now - (post.get('created_at') or now)) / 3600.0)
                # Reddit hot decay formula
                trending_score = round(raw_score / ((hours_ago + 2.0) ** 1.2), 4)
                post['engagement_score'] = raw_score
                post['trending_score'] = trending_score

            if sort_by in ['likes', 'top']:
                posts.sort(key=lambda p: (p.get('likes', 0), p.get('engagement_score', 0)), reverse=True)
            elif sort_by == 'views':
                posts.sort(key=lambda p: p.get('views', 0), reverse=True)
            elif sort_by in ['newest', 'new']:
                posts.sort(key=lambda p: p.get('created_at', 0), reverse=True)
            else: # 'trending' (hot)
                posts.sort(key=lambda p: (p.get('trending_score', 0), p.get('engagement_score', 0)), reverse=True)

            # Fetch distinct interests and subtopics (excluding blank or thought)
            cur.execute("""
            SELECT DISTINCT interest FROM posts 
            WHERE interest IS NOT NULL AND TRIM(interest) != '' AND LOWER(TRIM(interest)) != 'thought'
            UNION
            SELECT DISTINCT value FROM users, json_each(passions) WHERE value IS NOT NULL AND value != ''
            """)
            raw_interests = [row[0] for row in cur.fetchall() if row[0]]

            cur.execute("""
            SELECT DISTINCT subtopic FROM posts WHERE subtopic IS NOT NULL AND TRIM(subtopic) != ''
            """)
            raw_subtopics = [row[0] for row in cur.fetchall() if row[0]]

            conn.close()
            self.send_json(200, {
                "posts": posts,
                "interests": sorted(list(set(raw_interests))),
                "subtopics": sorted(list(set(raw_subtopics)))
            })
            return

        # 8. GET /api/posts/:id/comments - Comments on a topic post
        comments_match = re.match(r'^/api/posts/([^/]+)/comments$', path)
        if comments_match:
            post_id = comments_match.group(1)
            cur.execute("""
            SELECT pc.*, u.name as author_name, u.handle as author_handle, u.avatar as author_avatar, u.motto as author_motto
            FROM post_comments pc
            JOIN users u ON pc.author_id = u.id
            WHERE pc.post_id = ?
            ORDER BY pc.created_at ASC
            """, (post_id,))
            comments = [dict(row) for row in cur.fetchall()]
            conn.close()
            self.send_json(200, {"comments": comments})
            return

        # 9. GET /api/posts/saved - Current user's bookmarked posts
        if path == '/api/posts/saved':
            current_id = self.get_current_user_id() or (query.get('user_id') and query.get('user_id')[0])
            u = resolve_user(cur, current_id)
            if not u:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return
            uid = u['id']
            cur.execute("""
            SELECT p.*,
                   u.name as author_name,
                   u.handle as author_handle,
                   u.avatar as author_avatar,
                   u.motto as author_motto,
                   (p.likes * 2 + COALESCE(p.views, 0)) as engagement_score,
                   (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) as comments_count,
                   1 as is_saved,
                   sp.created_at as saved_at
            FROM saved_posts sp
            JOIN posts p ON sp.post_id = p.id
            JOIN users u ON p.author_id = u.id
            WHERE sp.user_id = ?
            ORDER BY sp.created_at DESC
            """, (uid,))
            saved = [dict(row) for row in cur.fetchall()]
            for p in saved:
                p['body'] = p.get('text') or ''
                p['timestamp'] = p.get('created_at') or int(time.time())
            conn.close()
            self.send_json(200, {"posts": saved})
            return

        # 10. GET /api/auth/verify-reset-token - Validate password reset token
        if path == '/api/auth/verify-reset-token':
            token = (query.get('token') and query.get('token')[0] or '').strip()
            if not token:
                conn.close()
                self.send_json(400, {"valid": False, "error": "Token is required."})
                return

            now = int(time.time())
            cur.execute("""
            SELECT r.*, u.name, u.handle, u.email as user_email
            FROM password_resets r
            JOIN users u ON r.user_id = u.id
            WHERE r.token = ? AND r.used = 0 AND r.expires_at > ?
            """, (token, now))
            row = cur.fetchone()
            if not row:
                conn.close()
                self.send_json(400, {"valid": False, "error": "This password reset link is invalid, expired, or has already been used."})
                return

            user_data = {
                "valid": True,
                "email": row['email'],
                "name": row['name'],
                "handle": row['handle']
            }
            conn.close()
            self.send_json(200, user_data)
            return

        # 11. GET /api/system/latest-email - View latest simulated email
        if path == '/api/system/latest-email':
            recipient = (query.get('email') and query.get('email')[0] or '').strip().lower()
            if recipient:
                cur.execute("""
                SELECT * FROM system_emails
                WHERE LOWER(recipient) = ?
                ORDER BY created_at DESC LIMIT 1
                """, (recipient,))
            else:
                cur.execute("""
                SELECT * FROM system_emails
                ORDER BY created_at DESC LIMIT 1
                """)
            row = cur.fetchone()
            conn.close()
            if not row:
                self.send_json(404, {"error": "No email found in outbox."})
                return
            self.send_json(200, {"email": dict(row)})
            return

        # 12. GET /api/messages - Retrieve private message history with a friend
        if path == '/api/messages':
            current_id = self.get_current_user_id() or (query.get('user_id') and query.get('user_id')[0])
            friend_id = (query.get('friend_id') and query.get('friend_id')[0] or query.get('with_user') and query.get('with_user')[0] or '').strip()

            cur_user = resolve_user(cur, current_id)
            if not cur_user:
                conn.close()
                self.send_json(401, {"error": "Authentication required to view messages."})
                return

            if not friend_id:
                conn.close()
                self.send_json(400, {"error": "friend_id or with_user parameter is required."})
                return

            friend_user = resolve_user(cur, friend_id)
            if not friend_user:
                conn.close()
                self.send_json(404, {"error": "Friend not found."})
                return

            # Check mutual friendship
            if not are_friends(cur, cur_user['id'], friend_user['id']):
                conn.close()
                self.send_json(403, {"error": "Private messaging is only permitted between mutual friends. Send a friend request first!"})
                return

            # Mark inbound messages from this friend as read
            cur.execute("""
            UPDATE direct_messages
            SET read = 1
            WHERE recipient_id = ? AND sender_id = ? AND read = 0
            """, (cur_user['id'], friend_user['id']))
            conn.commit()

            # Retrieve conversation
            cur.execute("""
            SELECT m.*,
                   s.name as sender_name, s.avatar as sender_avatar, s.handle as sender_handle,
                   r.name as recipient_name, r.avatar as recipient_avatar, r.handle as recipient_handle
            FROM direct_messages m
            JOIN users s ON m.sender_id = s.id
            JOIN users r ON m.recipient_id = r.id
            WHERE (m.sender_id = ? AND m.recipient_id = ?)
               OR (m.sender_id = ? AND m.recipient_id = ?)
            ORDER BY m.created_at ASC
            """, (cur_user['id'], friend_user['id'], friend_user['id'], cur_user['id']))
            messages = [dict(row) for row in cur.fetchall()]

            conn.close()
            self.send_json(200, {
                "friend": {
                    "id": friend_user['id'],
                    "name": friend_user['name'],
                    "handle": friend_user['handle'],
                    "avatar": friend_user['avatar'],
                    "motto": friend_user['motto']
                },
                "messages": messages
            })
            return

        # 13. GET /api/messages/conversations - List mutual friends with conversation snippets & unread counts
        if path == '/api/messages/conversations':
            current_id = self.get_current_user_id() or (query.get('user_id') and query.get('user_id')[0])
            cur_user = resolve_user(cur, current_id)
            if not cur_user:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return

            uid = cur_user['id']
            # Find all mutual friends
            cur.execute("""
            SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END as friend_id
            FROM friendships
            WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
            """, (uid, uid, uid))
            friend_ids = [row[0] for row in cur.fetchall()]

            conversations = []
            for fid in friend_ids:
                cur.execute("SELECT id, name, handle, avatar, motto FROM users WHERE id = ?", (fid,))
                fu = cur.fetchone()
                if not fu:
                    continue

                # Get latest message
                cur.execute("""
                SELECT text, media_url, media_type, created_at, sender_id
                FROM direct_messages
                WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
                ORDER BY created_at DESC LIMIT 1
                """, (uid, fid, fid, uid))
                latest = cur.fetchone()

                latest_snippet = 'Start conversation...'
                if latest:
                    if latest['text']:
                        latest_snippet = latest['text']
                    elif latest['media_type'] == 'audio':
                        latest_snippet = '🎤 Voice message'
                    elif latest['media_type'] == 'image':
                        latest_snippet = '📷 Photo'
                    elif latest['media_type'] == 'gif':
                        latest_snippet = '👾 GIF'

                # Get unread count
                cur.execute("""
                SELECT COUNT(*) as unread_count
                FROM direct_messages
                WHERE sender_id = ? AND recipient_id = ? AND read = 0
                """, (fid, uid))
                unread = cur.fetchone()['unread_count']

                conversations.append({
                    "id": fu['id'],
                    "name": fu['name'],
                    "handle": fu['handle'],
                    "avatar": fu['avatar'],
                    "motto": fu['motto'],
                    "friend": dict(fu),
                    "latest_message": latest_snippet,
                    "latest_time": latest['created_at'] if latest else None,
                    "latest_sender_id": latest['sender_id'] if latest else None,
                    "unread_count": unread
                })

            # Sort conversations: active with latest message first, then alphabetical
            conversations.sort(key=lambda c: (c['latest_time'] or 0), reverse=True)

            conn.close()
            self.send_json(200, {"conversations": conversations})
            return

        # 14. GET /api/messages/unread-count - Total unread message badge count
        if path == '/api/messages/unread-count':
            current_id = self.get_current_user_id() or (query.get('user_id') and query.get('user_id')[0])
            cur_user = resolve_user(cur, current_id)
            if not cur_user:
                conn.close()
                self.send_json(200, {"unread_count": 0})
                return

            cur.execute("SELECT COUNT(*) as total FROM direct_messages WHERE recipient_id = ? AND read = 0", (cur_user['id'],))
            total = cur.fetchone()['total']
            conn.close()
            self.send_json(200, {"unread_count": total})
            return

        # 15. GET /api/notifications - User notifications (mentions, post tags, friend activities)
        if path == '/api/notifications':
            current_id = self.get_current_user_id() or (query.get('user_id') and query.get('user_id')[0])
            u = resolve_user(cur, current_id)
            if not u:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return
            uid = u['id']
            cur.execute("""
            SELECT n.*, s.name as sender_name, s.handle as sender_handle, s.avatar as sender_avatar
            FROM notifications n
            JOIN users s ON n.sender_id = s.id
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC LIMIT 50
            """, (uid,))
            notifications = [dict(row) for row in cur.fetchall()]
            cur.execute("SELECT COUNT(*) as unread FROM notifications WHERE user_id = ? AND read = 0", (uid,))
            unread_count = cur.fetchone()['unread']
            conn.close()
            self.send_json(200, {"notifications": notifications, "unread_count": unread_count})
            return

        # 16. GET /api/posts/user-activity - Posts user has participated in (for # tagging autocomplete)
        if path == '/api/posts/user-activity':
            current_id = self.get_current_user_id() or (query.get('user_id') and query.get('user_id')[0])
            u = resolve_user(cur, current_id)
            if not u:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return
            uid = u['id']
            cur.execute("""
            SELECT DISTINCT p.id, p.text, p.interest, p.subtopic, p.likes, p.views, p.mentions_count, p.created_at,
                   u.name as author_name, u.handle as author_handle, u.avatar as author_avatar
            FROM posts p
            JOIN users u ON p.author_id = u.id
            LEFT JOIN post_comments pc ON pc.post_id = p.id
            WHERE p.author_id = ? OR p.host_id = ? OR pc.author_id = ?
            ORDER BY p.created_at DESC LIMIT 25
            """, (uid, uid, uid))
            posts = [dict(row) for row in cur.fetchall()]
            conn.close()
            self.send_json(200, {"posts": posts})
            return

        # 17. GET /api/admin/flagged-posts - Off-topic flagged posts moderation queue (Admin only)
        if path == '/api/admin/flagged-posts':
            admin_id = self.get_current_user_id()
            if not self.is_current_user_admin(admin_id):
                conn.close()
                self.send_json(403, {"error": "Admin privilege required."})
                return

            cur.execute("""
            SELECT p.*,
                   u.name as author_name, u.handle as author_handle, u.avatar as author_avatar,
                   h.name as host_name, h.handle as host_handle
            FROM posts p
            JOIN users u ON p.author_id = u.id
            JOIN users h ON p.host_id = h.id
            WHERE p.flag_count >= 3 OR p.flagged_for_admin = 1
            ORDER BY p.flag_count DESC, p.created_at DESC
            """)
            flagged = [dict(row) for row in cur.fetchall()]

            for item in flagged:
                cur.execute("""
                SELECT f.*, u.name as flagger_name, u.handle as flagger_handle
                FROM post_flags f JOIN users u ON f.user_id = u.id
                WHERE f.post_id = ?
                ORDER BY f.created_at DESC
                """, (item['id'],))
                item['flags'] = [dict(r) for r in cur.fetchall()]

            conn.close()
            self.send_json(200, {"flagged_posts": flagged})
            return

        conn.close()
        self.send_json(404, {"error": "Endpoint not found"})

    def handle_api_post(self, path, data):
        conn = get_db()
        cur = conn.cursor()
        client_ip = self.get_client_ip()

        # Check IP Ban
        cur.execute("SELECT reason FROM banned_ips WHERE ip = ?", (client_ip,))
        banned = cur.fetchone()
        if banned:
            conn.close()
            self.send_json(403, {"error": "Your IP has been permanently banned from The Platform.", "reason": banned['reason']})
            return

        # 0a. POST /api/crypto/public-key - Register E2EE Public Key
        if path == '/api/crypto/public-key':
            user = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not user:
                conn.close()
                self.send_json(401, {"error": "Authentication required to publish E2EE key."})
                return
            public_key = data.get('public_key')
            if not public_key:
                conn.close()
                self.send_json(400, {"error": "public_key string is required."})
                return
            now = int(time.time())
            cur.execute("""
            INSERT OR REPLACE INTO user_public_keys (user_id, public_key_spki, updated_at)
            VALUES (?, ?, ?)
            """, (user['id'], public_key, now))
            conn.commit()
            conn.close()
            self.send_json(200, {"message": "E2EE public key registered successfully 🔒", "user_id": user['id']})
            return

        # 0b. POST /api/collectives - Create a Democratic Collective or Guild
        if path == '/api/collectives':
            user = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not user:
                conn.close()
                self.send_json(401, {"error": "You must be logged in to create a collective."})
                return
            name = (data.get('name') or '').strip()
            description = (data.get('description') or '').strip()
            manifesto = (data.get('manifesto') or '').strip()
            category = data.get('category') or 'Mutual Aid'
            avatar_emoji = data.get('avatar_emoji') or '🏛️'

            if not name or not description:
                conn.close()
                self.send_json(400, {"error": "Collective name and description are required."})
                return

            cid = 'col-' + uuid.uuid4().hex[:10]
            now = int(time.time())

            try:
                cur.execute("""
                INSERT INTO collectives (id, name, description, manifesto, category, creator_id, karma_pool, members_count, avatar_emoji, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 10, 1, ?, ?)
                """, (cid, name, description, manifesto, category, user['id'], avatar_emoji, now))

                cur.execute("""
                INSERT INTO collective_members (collective_id, user_id, role, karma_contributed, joined_at)
                VALUES (?, ?, 'Founder', 10, ?)
                """, (cid, user['id'], now))

                conn.commit()
            except sqlite3.IntegrityError:
                conn.close()
                self.send_json(400, {"error": "A collective with this name already exists."})
                return

            conn.close()
            self.send_json(201, {"message": f"Collective '{name}' founded successfully! 🏛️", "collective_id": cid})
            return

        # 0c. POST /api/collectives/join - Join or Leave a Collective
        if path == '/api/collectives/join':
            user = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not user:
                conn.close()
                self.send_json(401, {"error": "You must be logged in."})
                return
            collective_id = data.get('collective_id')
            cur.execute("SELECT * FROM collectives WHERE id = ?", (collective_id,))
            col = cur.fetchone()
            if not col:
                conn.close()
                self.send_json(404, {"error": "Collective not found."})
                return

            cur.execute("SELECT * FROM collective_members WHERE collective_id = ? AND user_id = ?", (collective_id, user['id']))
            existing = cur.fetchone()
            now = int(time.time())

            if existing:
                cur.execute("DELETE FROM collective_members WHERE collective_id = ? AND user_id = ?", (collective_id, user['id']))
                cur.execute("UPDATE collectives SET members_count = MAX(1, members_count - 1) WHERE id = ?", (collective_id,))
                conn.commit()
                conn.close()
                self.send_json(200, {"message": f"Left collective '{col['name']}'", "joined": False})
                return
            else:
                cur.execute("""
                INSERT INTO collective_members (collective_id, user_id, role, karma_contributed, joined_at)
                VALUES (?, ?, 'Member', 0, ?)
                """, (collective_id, user['id'], now))
                cur.execute("UPDATE collectives SET members_count = members_count + 1 WHERE id = ?", (collective_id,))
                conn.commit()
                conn.close()
                self.send_json(200, {"message": f"Welcome to '{col['name']}'! 🤝", "joined": True})
                return

        # 0d. POST /api/collectives/donate-karma - Donate Karma to Collective Treasury
        if path == '/api/collectives/donate-karma':
            user = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not user:
                conn.close()
                self.send_json(401, {"error": "You must be logged in."})
                return
            collective_id = data.get('collective_id')
            amount = max(1, int(data.get('amount') or 5))

            cur.execute("SELECT karma FROM users WHERE id = ?", (user['id'],))
            urow = cur.fetchone()
            if not urow or urow['karma'] < amount:
                conn.close()
                self.send_json(400, {"error": f"Insufficient Mutual Aid Karma. You have {urow['karma'] if urow else 0} karma."})
                return

            cur.execute("UPDATE users SET karma = karma - ? WHERE id = ?", (amount, user['id']))
            cur.execute("UPDATE collectives SET karma_pool = karma_pool + ? WHERE id = ?", (amount, collective_id))
            cur.execute("UPDATE collective_members SET karma_contributed = karma_contributed + ? WHERE collective_id = ? AND user_id = ?", (amount, collective_id, user['id']))
            cur.execute("SELECT karma_pool FROM collectives WHERE id = ?", (collective_id,))
            new_pool = cur.fetchone()['karma_pool']
            conn.commit()
            conn.close()
            self.send_json(200, {"message": f"Contributed {amount} karma to the collective treasury! 🌟", "amount": amount, "treasury_karma": new_pool})
            return

        # 0e. POST /api/lounges/join - Join a Fireside Hearth Live Room
        if path == '/api/lounges/join':
            user = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not user:
                conn.close()
                self.send_json(401, {"error": "You must be logged in to join a Hearth."})
                return
            lounge_id = data.get('lounge_id') or 'hearth-solidarity'
            if lounge_id not in FIRESIDE_HEARTHS:
                conn.close()
                self.send_json(404, {"error": "Hearth room not found."})
                return

            for r in FIRESIDE_HEARTHS.values():
                r['occupants'].pop(user['id'], None)

            FIRESIDE_HEARTHS[lounge_id]['occupants'][user['id']] = {
                "id": user['id'],
                "name": user['name'],
                "handle": user['handle'],
                "avatar": user['avatar'],
                "is_speaking": False,
                "is_muted": True,
                "joined_at": int(time.time()),
                "last_reaction": "🔥"
            }
            conn.close()
            self.send_json(200, {
                "message": f"Joined {FIRESIDE_HEARTHS[lounge_id]['name']} 🔥",
                "lounge": {
                    **FIRESIDE_HEARTHS[lounge_id],
                    "occupants": list(FIRESIDE_HEARTHS[lounge_id]['occupants'].values())
                }
            })
            return

        # 0f. POST /api/lounges/leave - Leave a Hearth
        if path == '/api/lounges/leave':
            user = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if user:
                for r in FIRESIDE_HEARTHS.values():
                    r['occupants'].pop(user['id'], None)
            conn.close()
            self.send_json(200, {"message": "Left the hearth."})
            return

        # 0g. POST /api/lounges/speak - Toggle Mute / Speaking / Reaction in Hearth
        if path == '/api/lounges/speak':
            user = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not user:
                conn.close()
                self.send_json(401, {"error": "Unauthorized"})
                return
            lounge_id = data.get('lounge_id')
            target_room = FIRESIDE_HEARTHS.get(lounge_id)
            if target_room and user['id'] in target_room['occupants']:
                if 'is_muted' in data:
                    target_room['occupants'][user['id']]['is_muted'] = bool(data['is_muted'])
                if 'is_speaking' in data:
                    target_room['occupants'][user['id']]['is_speaking'] = bool(data['is_speaking'])
                if 'reaction' in data:
                    target_room['occupants'][user['id']]['last_reaction'] = data['reaction']
            conn.close()
            self.send_json(200, {"success": True})
            return

        # 0. POST /api/login - Secure Account Authentication
        if path == '/api/login':
            client_ip = self.get_client_ip()
            now = time.time()
            recent_attempts = [t for t in LOGIN_ATTEMPTS.get(client_ip, []) if now - t < LOGIN_LOCKOUT_WINDOW]
            LOGIN_ATTEMPTS[client_ip] = recent_attempts
            if len(recent_attempts) >= MAX_LOGIN_ATTEMPTS:
                conn.close()
                self.send_json(429, {"error": "Too many failed login attempts. Please wait 5 minutes before trying again."})
                return

            login_id = (data.get('email') or data.get('identifier') or data.get('handle') or '').strip().lower()
            password = data.get('password', '')

            if not login_id or not password:
                conn.close()
                self.send_json(400, {"error": "Email/Handle and password are required."})
                return

            cur.execute("""
            SELECT * FROM users
            WHERE LOWER(email) = ? OR LOWER(handle) = ?
            """, (login_id, login_id if login_id.startswith('@') else '@' + login_id))
            user = cur.fetchone()

            if not user:
                LOGIN_ATTEMPTS.setdefault(client_ip, []).append(time.time())
                conn.close()
                self.send_json(401, {"error": "No account found with this email or handle."})
                return

            if not user['password_hash'] or not user['password_salt']:
                LOGIN_ATTEMPTS.setdefault(client_ip, []).append(time.time())
                conn.close()
                self.send_json(401, {"error": "Account has no password set. Please register or contact admin."})
                return

            is_valid = verify_password(password, user['password_salt'], user['password_hash'])
            # Support both spelling variants for founder account (Jocelyn&Me2026 and Joecelyn&Me2026)
            if not is_valid and (user['email'].lower() == 'mracrawford@gmail.com' or user['id'] == 'usr-adam'):
                if password in ('Jocelyn&Me2026', 'Joecelyn&Me2026'):
                    is_valid = True
                    new_hash, new_salt = hash_password(password)
                    cur.execute("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?", (new_hash, new_salt, user['id']))
                    conn.commit()

            if not is_valid:
                LOGIN_ATTEMPTS.setdefault(client_ip, []).append(time.time())
                conn.close()
                self.send_json(401, {"error": "Incorrect password. Please verify your credentials."})
                return

            # Clear failed login attempts upon successful authentication
            LOGIN_ATTEMPTS.pop(client_ip, None)

            user_dict = dict(user)
            user_dict.pop('password_hash', None)
            user_dict.pop('password_salt', None)
            user_dict.pop('registered_ip', None)
            conn.close()

            self.send_json(200, {
                "message": "Login successful",
                "user": user_dict
            })
            return

        # 0b. POST /api/auth/forgot-password - Generate password reset token and dispatch email
        if path == '/api/auth/forgot-password':
            raw_email = (data.get('email') or '').strip().lower()
            if not raw_email:
                conn.close()
                self.send_json(400, {"error": "Please enter your email address."})
                return

            cur.execute("SELECT * FROM users WHERE LOWER(email) = ?", (raw_email,))
            user = cur.fetchone()

            if not user:
                # Return generic response for security to prevent user enumeration
                conn.close()
                self.send_json(200, {
                    "success": True,
                    "message": "If an account matches that email address, a password reset link has been dispatched."
                })
                return

            token = secrets.token_urlsafe(32)
            now = int(time.time())
            expires_at = now + 3600  # 1 hour
            reset_id = f"rst-{uuid.uuid4().hex[:10]}"

            cur.execute("""
            INSERT INTO password_resets (id, token, user_id, email, expires_at, used, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            """, (reset_id, token, user['id'], user['email'], expires_at, now))

            host_header = self.headers.get('Host', 'localhost:3000')
            reset_url = f"http://{host_header}/reset-password.html?token={token}"

            email_body_html = f"""
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #0f172a; color: #f8fafc; border: 1px solid #334155; border-radius: 16px; padding: 32px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; width: 56px; height: 56px; border-radius: 14px; background: linear-gradient(135deg, #38bdf8, #a855f7); line-height: 56px; text-align: center; font-size: 28px; font-weight: bold; color: white;">P</div>
                <h1 style="font-size: 22px; font-weight: 800; margin-top: 12px; margin-bottom: 4px; color: #ffffff;">The Platform</h1>
                <p style="color: #94a3b8; font-size: 14px; margin: 0;">Password Recovery Request</p>
              </div>

              <div style="background: rgba(30, 41, 59, 0.7); border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid rgba(255, 255, 255, 0.08);">
                <p style="margin: 0 0 12px; font-size: 15px; line-height: 1.6;">Hello <strong>{user['name']}</strong> (<em>{user['handle']}</em>),</p>
                <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                  We received a request to reset your password for your account on <strong>The Platform</strong>. Click the link below to choose a new password. This link will expire in 1 hour.
                </p>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="{reset_url}" style="background: linear-gradient(135deg, #a855f7, #6366f1); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);">
                    🔐 Reset Your Password
                  </a>
                </div>
                <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
                  Or copy and paste this link into your browser:<br>
                  <a href="{reset_url}" style="color: #38bdf8; word-break: break-all;">{reset_url}</a>
                </p>
              </div>

              <div style="font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #1e293b; padding-top: 16px;">
                If you did not request a password reset, you can safely ignore this email.<br>
                Protected by The Platform Bot Heuristics & Mutual Aid Protocol.
              </div>
            </div>
            """

            email_id = f"eml-{uuid.uuid4().hex[:10]}"
            cur.execute("""
            INSERT INTO system_emails (id, recipient, subject, body_html, action_url, created_at, read)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            """, (email_id, user['email'], "Reset your password for The Platform", email_body_html, reset_url, now))
            conn.commit()
            conn.close()

            print(f"[AUTH EMAIL] Password reset email queued for {user['email']}: {reset_url}")

            self.send_json(200, {
                "success": True,
                "message": "A password reset link has been dispatched to your email address.",
                "recipient": user['email'],
                "reset_url": reset_url,
                "token": token,
                "email_preview": {
                    "subject": "Reset your password for The Platform",
                    "recipient": user['email'],
                    "action_url": reset_url
                }
            })
            return

        # 0c. POST /api/auth/reset-password - Set new password using reset token
        if path == '/api/auth/reset-password':
            token = (data.get('token') or '').strip()
            new_password = data.get('password', '')

            if not token or not new_password:
                conn.close()
                self.send_json(400, {"error": "Token and new password are required."})
                return

            if len(new_password) < 6:
                conn.close()
                self.send_json(400, {"error": "Password must be at least 6 characters long."})
                return

            now = int(time.time())
            cur.execute("""
            SELECT r.*, u.name, u.handle, u.email as user_email
            FROM password_resets r
            JOIN users u ON r.user_id = u.id
            WHERE r.token = ? AND r.used = 0 AND r.expires_at > ?
            """, (token, now))
            row = cur.fetchone()

            if not row:
                conn.close()
                self.send_json(400, {"error": "This password reset link is invalid, expired, or has already been used."})
                return

            user_id = row['user_id']
            new_hash, new_salt = hash_password(new_password)

            cur.execute("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?", (new_hash, new_salt, user_id))
            cur.execute("UPDATE password_resets SET used = 1 WHERE token = ?", (token,))

            # Queue confirmation email
            email_id = f"eml-{uuid.uuid4().hex[:10]}"
            cur.execute("""
            INSERT INTO system_emails (id, recipient, subject, body_html, action_url, created_at, read)
            VALUES (?, ?, ?, ?, ?, ?, 0)
            """, (email_id, row['email'], "Your password for The Platform has been changed",
                  f"<p>Hello {row['name']},</p><p>Your password for The Platform has been successfully updated.</p>",
                  "/login.html", now))

            conn.commit()
            conn.close()

            print(f"[AUTH PASSWORD RESET] Password successfully updated for user {user_id} ({row['email']})")

            self.send_json(200, {
                "success": True,
                "message": "Your password has been successfully reset! You can now log in with your new password."
            })
            return

        # 1. POST /api/register - Real User Registration with Bot Assessment
        if path == '/api/register':
            handle = data.get('handle', '').strip()
            name = data.get('name', '').strip()
            email = data.get('email', '').strip().lower()
            password = data.get('password', '')
            phone = data.get('phone', '').strip()
            bio = data.get('bio', '').strip()
            location = data.get('location', '').strip()
            avatar = data.get('avatar') or 'assets/avatar-p-default.svg'
            banner = data.get('banner') or 'assets/maya-banner.jpg'
            music_title = data.get('music_title', 'Ambient Theme').strip()
            music_source = data.get('music_source', 'YouTube').strip()
            youtube_url = data.get('youtube_url', '').strip()
            privacy = data.get('privacy', 'public')
            aesthetic_name = data.get('aesthetic_name', 'Modernist')
            font_heading = data.get('font_heading', "'Plus Jakarta Sans', sans-serif")
            passions = data.get('passions', [])
            subtopics = data.get('subtopics', [])
            avatars = data.get('avatars', [avatar])

            dob = data.get('dob', '').strip()
            show_zodiac_val = data.get('show_zodiac', 1)
            show_zodiac = 1 if (show_zodiac_val is True or show_zodiac_val == 1 or show_zodiac_val == '1' or show_zodiac_val == 'true') else 0
            zodiac_sign = compute_zodiac_sign(dob) if dob else ""
            motto = sanitize_motto(data.get('motto', ''))

            if not handle or not name or not email:
                conn.close()
                self.send_json(400, {"error": "Handle, name, and email are required."})
                return

            if not handle.startswith('@'):
                handle = '@' + handle

            # Check handle/email uniqueness
            cur.execute("SELECT id FROM users WHERE handle = ? OR email = ?", (handle, email))
            if cur.fetchone():
                conn.close()
                self.send_json(409, {"error": "Handle or Email is already registered."})
                return

            # Check if this is the FIRST real human user or Adam -> automatically grant Root Admin!
            cur.execute("SELECT COUNT(*) as count FROM users WHERE is_example = 0 AND is_banned = 0 AND id NOT LIKE 'bot-%'")
            is_first_real_user = (cur.fetchone()['count'] == 0)
            is_admin = 1 if (is_first_real_user or handle.lower() == '@adam' or email == 'mracrawford@gmail.com') else 0

            # Run Anti-Bot Heuristics on Signup
            user_agent = self.headers.get('User-Agent', '')
            bot_score, bot_flags = analyze_bot_risk(client_ip, user_agent, data)

            user_id = 'usr-' + uuid.uuid4().hex[:10]
            now = int(time.time())
            entropy_score = float(data.get('entropy', 0.95))

            # Password hashing
            pwd_salt = None
            pwd_hash = None
            if password:
                pwd_hash, pwd_salt = hash_password(password)

            auto_banned = 0
            ban_reason = None
            if bot_score >= 0.95 and not is_first_real_user and handle.lower() != '@adam':
                auto_banned = 1
                ban_reason = "Automated Sybil Bot signature detected on registration"

            commons_verified = 1 if is_admin else 0

            # Geocode user input location strictly from their own text (Zero GPS Tracking)
            geo_res = geocode_location(location, conn=conn) if location else None
            lat = geo_res[0] if geo_res else None
            lon = geo_res[1] if geo_res else None
            fmt_addr = geo_res[2] if geo_res else (location or None)

            cur.execute("""
            INSERT INTO users (
                id, handle, name, email, phone, bio, avatar, banner,
                music_title, music_source, privacy, is_admin, is_example,
                is_banned, ban_reason, registered_ip, bot_score, bot_flags,
                entropy_score, karma, aesthetic_name, font_heading, font_body, created_at,
                password_hash, password_salt, passions, subtopics, avatars, youtube_url, location,
                latitude, longitude, formatted_address,
                dob, show_zodiac, zodiac_sign, commons_verified, motto
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 10, ?, ?, "'Inter', sans-serif", ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id, handle, name, email, phone, bio, avatar, banner,
                music_title, music_source, privacy, is_admin, auto_banned, ban_reason,
                client_ip, bot_score, json.dumps(bot_flags), entropy_score,
                aesthetic_name, font_heading, now,
                pwd_hash, pwd_salt, json.dumps(passions), json.dumps(subtopics), json.dumps(avatars), youtube_url, location,
                lat, lon, fmt_addr,
                dob, show_zodiac, zodiac_sign, commons_verified, motto
            ))

            # Audit log
            cur.execute("""
            INSERT INTO audit_logs (id, admin_id, action, target_id, target_ip, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                'log-' + uuid.uuid4().hex[:8],
                user_id if is_admin else 'SYSTEM',
                'USER_REGISTRATION',
                user_id,
                client_ip,
                f"Registered handle {handle}. Admin={is_admin}. Bot Score={bot_score:.2f} ({', '.join(bot_flags) or 'Clean'})",
                now
            ))

            conn.commit()

            # Return profile
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            created_user = dict(cur.fetchone())
            created_user.pop('password_hash', None)
            created_user.pop('password_salt', None)
            created_user.pop('registered_ip', None)
            conn.close()

            self.send_json(201, {
                "message": "User registered successfully!",
                "user": created_user,
                "is_admin": is_admin,
                "bot_flags": bot_flags,
                "bot_score": bot_score
            })
            return

        # 1b. POST /api/users/update - Edit Platform / Profile (Foolproof User Resolution)
        if path == '/api/users/update':
            current = resolve_user(
                cur,
                data.get('user_id'),
                data.get('id'),
                self.get_current_user_id(),
                data.get('email'),
                data.get('handle')
            )
            # Extra safety fallback: if user still not found, check if this is the only non-example user or Adam
            if not current:
                cur.execute("SELECT * FROM users WHERE LOWER(email) = 'mracrawford@gmail.com' OR id = 'usr-adam' OR LOWER(handle) = '@adam'")
                current = cur.fetchone()

            if not current:
                conn.close()
                self.send_json(404, {"error": "User not found."})
                return

            user_id = current['id']

            name = data.get('name')
            bio = data.get('bio')
            location = data.get('location')
            privacy = data.get('privacy')
            aesthetic_name = data.get('aesthetic_name')
            banner = data.get('banner')
            avatar = data.get('avatar')
            youtube_url = data.get('youtube_url')
            music_title = data.get('music_title')
            avatars = data.get('avatars') # list
            passions = data.get('passions') # list
            subtopics = data.get('subtopics') # list
            playlist = data.get('playlist') # list of up to 3 tracks
            dob = data.get('dob')
            show_zodiac = data.get('show_zodiac')
            if show_zodiac is not None:
                show_zodiac = 1 if (show_zodiac is True or show_zodiac == 1 or show_zodiac == '1' or show_zodiac == 'true') else 0
            zodiac_sign = compute_zodiac_sign(dob) if dob else None
            motto = sanitize_motto(data.get('motto')) if 'motto' in data else None

            # Geocode updated location strictly from user input (Zero GPS Tracking)
            lat = None
            lon = None
            fmt_addr = None
            if location is not None and location.strip():
                geo_res = geocode_location(location, conn=conn)
                if geo_res:
                    lat, lon, fmt_addr = geo_res

            cur.execute("""
            UPDATE users SET
                name = COALESCE(?, name),
                bio = COALESCE(?, bio),
                location = COALESCE(?, location),
                latitude = CASE WHEN ? IS NOT NULL THEN ? ELSE latitude END,
                longitude = CASE WHEN ? IS NOT NULL THEN ? ELSE longitude END,
                formatted_address = CASE WHEN ? IS NOT NULL THEN ? ELSE formatted_address END,
                privacy = COALESCE(?, privacy),
                aesthetic_name = COALESCE(?, aesthetic_name),
                banner = COALESCE(?, banner),
                avatar = COALESCE(?, avatar),
                youtube_url = COALESCE(?, youtube_url),
                music_title = COALESCE(?, music_title),
                dob = COALESCE(?, dob),
                show_zodiac = COALESCE(?, show_zodiac),
                zodiac_sign = COALESCE(?, zodiac_sign),
                motto = COALESCE(?, motto),
                passions = CASE WHEN ? IS NOT NULL THEN ? ELSE passions END,
                avatars = CASE WHEN ? IS NOT NULL THEN ? ELSE avatars END,
                subtopics = CASE WHEN ? IS NOT NULL THEN ? ELSE subtopics END,
                playlist = CASE WHEN ? IS NOT NULL THEN ? ELSE playlist END
            WHERE id = ?
            """, (
                name, bio, location,
                lat, lat, lon, lon, fmt_addr, fmt_addr,
                privacy, aesthetic_name,
                banner, avatar, youtube_url, music_title,
                dob, show_zodiac, zodiac_sign, motto,
                json.dumps(passions) if passions is not None else None,
                json.dumps(passions) if passions is not None else None,
                json.dumps(avatars) if avatars is not None else None,
                json.dumps(avatars) if avatars is not None else None,
                json.dumps(subtopics) if subtopics is not None else None,
                json.dumps(subtopics) if subtopics is not None else None,
                json.dumps(playlist) if playlist is not None else None,
                json.dumps(playlist) if playlist is not None else None,
                user_id
            ))

            conn.commit()
            cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            updated = dict(cur.fetchone())
            updated.pop('password_hash', None)
            updated.pop('password_salt', None)
            updated.pop('registered_ip', None)
            try:
                updated['playlist'] = json.loads(updated.get('playlist') or '[]')
            except:
                updated['playlist'] = []
            conn.close()

            self.send_json(200, {"message": "Profile updated successfully", "user": updated})
            return

        # 1c. POST /api/users/swap-avatar - Instant Profile Picture Swapping
        if path == '/api/users/swap-avatar':
            identifier = self.get_current_user_id() or data.get('user_id')
            new_avatar = data.get('avatar')
            if not identifier or not new_avatar:
                conn.close()
                self.send_json(400, {"error": "Missing user or avatar"})
                return

            u = resolve_user(cur, identifier)
            if not u:
                conn.close()
                self.send_json(404, {"error": "User not found"})
                return

            user_id = u['id']
            avatars_list = json.loads(u['avatars'] or '[]')
            if new_avatar not in avatars_list:
                avatars_list.append(new_avatar)

            cur.execute("UPDATE users SET avatar = ?, avatars = ? WHERE id = ?", (new_avatar, json.dumps(avatars_list), user_id))
            conn.commit()
            conn.close()
            self.send_json(200, {"message": "Active avatar swapped", "avatar": new_avatar, "avatars": avatars_list})
            return

        # 1d. POST /api/users/add-avatar - Upload/Add photo to avatar gallery
        if path == '/api/users/add-avatar':
            identifier = self.get_current_user_id() or data.get('user_id')
            avatar_url = data.get('avatar')
            if not identifier or not avatar_url:
                conn.close()
                self.send_json(400, {"error": "Missing user or avatar URL"})
                return

            u = resolve_user(cur, identifier, self.get_current_user_id(), data.get('user_id'))
            if not u:
                conn.close()
                self.send_json(404, {"error": "User not found"})
                return

            user_id = u['id']
            avatars_list = json.loads(u['avatars'] or '[]')
            if avatar_url not in avatars_list:
                avatars_list.append(avatar_url)

            cur.execute("UPDATE users SET avatar = ?, avatars = ? WHERE id = ?", (avatar_url, json.dumps(avatars_list), user_id))
            conn.commit()
            conn.close()
            self.send_json(200, {"message": "Avatar added and set as active", "avatar": avatar_url, "avatars": avatars_list})
            return

        # 1e. POST /api/users/verify-commons - Upload Selfie & ID for Commons Mutual Aid Posting
        if path == '/api/users/verify-commons':
            identifier = self.get_current_user_id() or data.get('user_id') or data.get('email')
            user = resolve_user(cur, identifier, self.get_current_user_id(), data.get('user_id'), data.get('email'), data.get('handle'))
            if not user:
                conn.close()
                self.send_json(404, {"error": "User account not found for verification."})
                return

            selfie = data.get('selfie')
            id_card = data.get('id_card')

            if not selfie or not id_card:
                conn.close()
                self.send_json(400, {"error": "Both a picture of yourself (selfie) and a picture of your ID are required to verify for The Commons."})
                return

            now = int(time.time())
            cur.execute("""
            UPDATE users SET
                commons_verified = 1,
                verification_selfie = ?,
                verification_id_card = ?,
                verified_at = ?
            WHERE id = ?
            """, (selfie, id_card, now, user['id']))

            # Audit log
            cur.execute("""
            INSERT INTO audit_logs (id, admin_id, action, target_id, target_ip, details, created_at)
            VALUES (?, ?, 'COMMONS_ID_VERIFIED', ?, ?, ?, ?)
            """, (
                'log-' + uuid.uuid4().hex[:8],
                user['id'],
                user['id'],
                client_ip,
                f"User {user['handle']} verified for The Commons with Selfie and ID Card",
                now
            ))

            conn.commit()
            cur.execute("SELECT * FROM users WHERE id = ?", (user['id'],))
            updated_user = dict(cur.fetchone())
            updated_user.pop('password_hash', None)
            updated_user.pop('password_salt', None)
            updated_user.pop('registered_ip', None)
            conn.close()

            self.send_json(200, {
                "message": "Human verification approved! You can now post mutual aid in The Commons.",
                "user": updated_user
            })
            return

        # 2. POST /api/posts - Create Dispatch or Guestbook Note with Sub-Topic Scraping
        if path == '/api/posts':
            author_ident = self.get_current_user_id() or data.get('author_id')
            author = resolve_user(cur, author_ident)
            if not author:
                conn.close()
                self.send_json(401, {"error": "Authentication required. Author account not found."})
                return

            author_id = author['id']
            host_ident = data.get('host_id')
            host = resolve_user(cur, host_ident) if host_ident else author
            host_id = host['id'] if host else author_id

            text = data.get('text', '').strip()
            raw_interest = data.get('interest', '').strip()
            # If user posted without topic or selected "Thought", it's an untopicked thought
            if not raw_interest or raw_interest.lower() in ['thought', 'open thought', 'open thought (no topic)', 'none']:
                interest = ''
            else:
                interest = raw_interest

            subtopic = data.get('subtopic', '').strip() if interest else ''
            media_url = data.get('media_url')
            media_type = data.get('media_type')
            is_guestbook = 1 if (host_id and host_id != author_id) else 0

            # Visibility: public or friends only
            visibility = 'friends' if str(data.get('visibility', 'public')).lower() == 'friends' else 'public'

            # Tagged post (# mention)
            mentioned_post_id = data.get('mentioned_post_id')
            if not mentioned_post_id:
                hash_match = re.search(r'#(post-[a-zA-Z0-9]+)', text)
                if hash_match:
                    mentioned_post_id = hash_match.group(1)

            if not text:
                conn.close()
                self.send_json(400, {"error": "Post text cannot be empty."})
                return

            # Auto-Moderation: Targeted Personal Attacks vs Idea Debate
            is_civil, flagged_snippet = check_civility(text)
            if not is_civil:
                conn.close()
                self.send_json(400, {
                    "error": f"Post blocked by Auto-Moderation: Targeted personal attack detected (\"{flagged_snippet}\"). Ideas and debates are freely allowed ('that's stupid', 'dumb idea'), but attacks on people are moderated away.",
                    "moderated": True,
                    "flagged_snippet": flagged_snippet
                })
                return

            post_id = 'post-' + uuid.uuid4().hex[:8]
            now = int(time.time())

            # Infer media_type if media_url given but media_type not specified
            if media_url and not media_type:
                if 'youtube.com' in media_url or 'youtu.be' in media_url:
                    media_type = 'video'
                elif any(media_url.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']):
                    media_type = 'image'
                else:
                    media_type = 'link'

            cur.execute("""
            INSERT INTO posts (
                id, host_id, author_id, text, interest, subtopic, media_url, media_type,
                is_guestbook, visibility, mentioned_post_id, mentions_count, flag_count, flagged_for_admin, likes, views, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?)
            """, (post_id, host_id, author_id, text, interest, subtopic, media_url, media_type, is_guestbook, visibility, mentioned_post_id, now))

            # If a post was tagged with #, increment its mentions_count and notify author
            if mentioned_post_id:
                cur.execute("UPDATE posts SET mentions_count = COALESCE(mentions_count, 0) + 1 WHERE id = ?", (mentioned_post_id,))
                cur.execute("SELECT author_id FROM posts WHERE id = ?", (mentioned_post_id,))
                tagged_row = cur.fetchone()
                if tagged_row and tagged_row['author_id'] != author_id:
                    nid = 'notif-' + uuid.uuid4().hex[:10]
                    cur.execute("""
                    INSERT INTO notifications (id, user_id, sender_id, type, title, text, target_id, read, created_at)
                    VALUES (?, ?, ?, 'post_mention', 'Post Tagged', ?, ?, 0, ?)
                    """, (nid, tagged_row['author_id'], author_id, f"{author['name']} tagged your post in a new dispatch.", post_id, now))

            # Check for @ friend mentions in text or passed directly
            mentioned_handles = set(re.findall(r'@([a-zA-Z0-9_\-\.]+)', text))
            passed_mentions = data.get('mentioned_user_ids', [])
            all_target_users = set()

            for h in mentioned_handles:
                cur.execute("SELECT id FROM users WHERE LOWER(handle) = ? OR LOWER(handle) = ?", (h.lower(), f"@{h.lower()}"))
                u_row = cur.fetchone()
                if u_row and u_row['id'] != author_id:
                    all_target_users.add(u_row['id'])

            for uid in passed_mentions:
                if uid and uid != author_id:
                    all_target_users.add(uid)

            for target_uid in all_target_users:
                nid = 'notif-' + uuid.uuid4().hex[:10]
                cur.execute("""
                INSERT INTO notifications (id, user_id, sender_id, type, title, text, target_id, read, created_at)
                VALUES (?, ?, ?, 'user_mention', 'Mentioned in a Post', ?, ?, 0, ?)
                """, (nid, target_uid, author_id, f"{author['name']} mentioned you in a post: \"{text[:60]}\"", post_id, now))

            # If guestbook post on someone else's platform, notify the host
            if is_guestbook and host_id != author_id:
                nid = 'notif-' + uuid.uuid4().hex[:10]
                cur.execute("""
                INSERT INTO notifications (id, user_id, sender_id, type, title, text, target_id, read, created_at)
                VALUES (?, ?, ?, 'guestbook_note', 'New Guestbook Entry', ?, ?, 0, ?)
                """, (nid, host_id, author_id, f"{author['name']} left a note on your platform.", post_id, now))

            # --- SUB-TOPIC SCRAPING ---
            user_subtopics = []
            try:
                user_subtopics = json.loads(author['subtopics'] or '[]')
            except:
                user_subtopics = []

            if subtopic and interest:
                exists = any(
                    (isinstance(s, dict) and s.get('subtopic', '').strip().lower() == subtopic.lower()) or
                    (isinstance(s, str) and s.strip().lower() == subtopic.lower())
                    for s in user_subtopics
                )
                if not exists:
                    user_subtopics.append({
                        "interest": interest,
                        "subtopic": subtopic.strip(),
                        "created_at": now
                    })
                    cur.execute("UPDATE users SET subtopics = ? WHERE id = ?", (json.dumps(user_subtopics), author_id))

            conn.commit()
            conn.close()

            self.send_json(201, {
                "message": "Post created",
                "post_id": post_id,
                "is_thought": not bool(interest),
                "visibility": visibility,
                "scraped_subtopic": subtopic or None,
                "subtopics": user_subtopics
            })
            return

        # 3. POST /api/commons - Publish a Mutual Aid Offer or Request (Requires Commons Verification!)
        if path == '/api/commons':
            author_ident = self.get_current_user_id() or data.get('author_id')
            author = resolve_user(cur, author_ident, self.get_current_user_id(), data.get('author_id'))
            if not author:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return

            # CHECK COMMONS VERIFICATION (Selfie + ID required)
            if author['commons_verified'] != 1 and author['is_admin'] != 1:
                conn.close()
                self.send_json(403, {
                    "error": "Verification required: To post in The Commons, please upload a picture of yourself along with a picture of your ID.",
                    "requires_verification": True
                })
                return

            author_id = author['id']
            item_type = data.get('type') # 'offer' or 'request'
            category = data.get('category', 'goods')
            title = data.get('title', '').strip()
            desc = data.get('desc', '').strip()
            location = data.get('location', '')
            image_url = data.get('image_url')

            # Check 1-Request Limit
            if item_type == 'request':
                cur.execute("SELECT COUNT(*) as count FROM commons_items WHERE author_id = ? AND type = 'request' AND status = 'active'", (author_id,))
                active_reqs = cur.fetchone()['count']
                if active_reqs >= 1:
                    conn.close()
                    self.send_json(429, {"error": "Request Quota Reached: Only 1 active request permitted per user."})
                    return

            # Determine item location (defaults to author profile location if blank)
            if not location:
                location = author.get('location') or ''

            # Geocode listing location from user text input (Zero GPS Tracking)
            geo_res = geocode_location(location, conn=conn) if location else None
            item_lat = geo_res[0] if geo_res else author.get('latitude')
            item_lon = geo_res[1] if geo_res else author.get('longitude')
            item_addr = geo_res[2] if geo_res else (location or author.get('formatted_address'))

            aid_id = 'aid-' + uuid.uuid4().hex[:8]
            now = int(time.time())

            cur.execute("""
            INSERT INTO commons_items (id, author_id, type, category, title, desc, image_url, location, latitude, longitude, formatted_address, status, is_example, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?)
            """, (aid_id, author_id, item_type, category, title, desc, image_url, location, item_lat, item_lon, item_addr, now))
            conn.commit()
            conn.close()

            self.send_json(201, {
                "message": "Mutual aid listing published",
                "item_id": aid_id,
                "latitude": item_lat,
                "longitude": item_lon,
                "formatted_address": item_addr
            })
            return

        # POST /api/geocode - Resolve raw user text address to true coords without GPS
        if path == '/api/geocode':
            query_str = (data.get('query') or data.get('location') or '').strip()
            if not query_str:
                conn.close()
                self.send_json(400, {"error": "Missing location query"})
                return
            
            res = geocode_location(query_str, conn=conn)
            conn.close()
            if res:
                self.send_json(200, {
                    "success": True,
                    "latitude": res[0],
                    "longitude": res[1],
                    "formatted_address": res[2]
                })
            else:
                self.send_json(404, {
                    "success": False,
                    "error": "Location could not be geocoded."
                })
            return

        # 4. POST /api/admin/insta-ban (ADMIN ONLY) - Perma-ban User & Insta-Ban IP
        if path == '/api/admin/insta-ban':
            admin_id = self.get_current_user_id()
            if not self.is_current_user_admin(admin_id):
                conn.close()
                self.send_json(403, {"error": "Admin privilege required."})
                return

            target_user_id = data.get('user_id')
            target_ip = data.get('ip')
            reason = data.get('reason', 'Bot swarm signature or abusive flaming violation')

            now = int(time.time())

            # 1. Perma-ban user account
            if target_user_id:
                cur.execute("UPDATE users SET is_banned = 1, ban_reason = ? WHERE id = ?", (reason, target_user_id))

            # 2. Insta-ban IP address
            if target_ip:
                cur.execute("""
                INSERT OR REPLACE INTO banned_ips (ip, reason, banned_by, banned_at)
                VALUES (?, ?, ?, ?)
                """, (target_ip, reason, admin_id, now))

            # 3. Log audit event
            cur.execute("""
            INSERT INTO audit_logs (id, admin_id, action, target_id, target_ip, details, created_at)
            VALUES (?, ?, 'INSTA_BAN_IP_AND_ACCOUNT', ?, ?, ?, ?)
            """, ('log-' + uuid.uuid4().hex[:8], admin_id, target_user_id, target_ip, reason, now))

            conn.commit()
            conn.close()

            self.send_json(200, {
                "message": f"Successfully Insta-Banned IP ({target_ip}) and Perma-Banned account ({target_user_id}).",
                "ip": target_ip,
                "user_id": target_user_id
            })
            return

        # 5. POST /api/admin/toggle-admin (ADMIN ONLY)
        if path == '/api/admin/toggle-admin':
            admin_id = self.get_current_user_id()
            if not self.is_current_user_admin(admin_id):
                conn.close()
                self.send_json(403, {"error": "Admin privilege required."})
                return

            target_user_id = data.get('user_id')
            cur.execute("SELECT is_admin, name FROM users WHERE id = ?", (target_user_id,))
            target = cur.fetchone()
            if not target:
                conn.close()
                self.send_json(404, {"error": "Target user not found"})
                return

            new_status = 0 if target['is_admin'] == 1 else 1
            cur.execute("UPDATE users SET is_admin = ? WHERE id = ?", (new_status, target_user_id))

            now = int(time.time())
            cur.execute("""
            INSERT INTO audit_logs (id, admin_id, action, target_id, details, created_at)
            VALUES (?, ?, 'TOGGLE_ADMIN', ?, ?, ?)
            """, ('log-' + uuid.uuid4().hex[:8], admin_id, target_user_id, f"Set is_admin to {new_status} for {target['name']}", now))

            conn.commit()
            conn.close()

            self.send_json(200, {
                "message": f"Admin status for {target['name']} updated to {bool(new_status)}.",
                "is_admin": new_status
            })
            return

        # 6. POST /api/admin/unban-ip (ADMIN ONLY)
        if path == '/api/admin/unban-ip':
            admin_id = self.get_current_user_id()
            if not self.is_current_user_admin(admin_id):
                conn.close()
                self.send_json(403, {"error": "Admin privilege required."})
                return

            ip_to_unban = data.get('ip')
            cur.execute("DELETE FROM banned_ips WHERE ip = ?", (ip_to_unban,))
            conn.commit()
            conn.close()
            self.send_json(200, {"message": f"IP {ip_to_unban} has been unbanned."})
            return

        # 7. POST /api/friends/request - Send Friend Request
        if path == '/api/friends/request':
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'), data.get('requester_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required to send friend request."})
                return
            target = resolve_user(cur, data.get('target_id'), data.get('friend_id'), data.get('handle'))
            if not target:
                conn.close()
                self.send_json(404, {"error": "Target user not found."})
                return
            if caller['id'] == target['id']:
                conn.close()
                self.send_json(400, {"error": "You cannot friend your own platform."})
                return

            cur.execute("SELECT id FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending'", (target['id'], caller['id']))
            reciprocal = cur.fetchone()
            now = int(time.time())
            if reciprocal:
                cur.execute("UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?", (now, reciprocal['id']))
                conn.commit()
                conn.close()
                self.send_json(200, {"message": f"You and {target['name']} are now friends! 🤝", "status": "accepted"})
                return

            cur.execute("SELECT id, status FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
                        (caller['id'], target['id'], target['id'], caller['id']))
            existing = cur.fetchone()
            if existing:
                if existing['status'] == 'accepted':
                    conn.close()
                    self.send_json(200, {"message": f"You are already friends with {target['name']}.", "status": "accepted"})
                    return
                elif existing['status'] == 'pending':
                    conn.close()
                    self.send_json(200, {"message": f"Friend request to {target['name']} is already pending.", "status": "pending"})
                    return
                else:
                    cur.execute("UPDATE friendships SET user_id = ?, friend_id = ?, status = 'pending', updated_at = ? WHERE id = ?",
                                (caller['id'], target['id'], now, existing['id']))
                    conn.commit()
                    conn.close()
                    self.send_json(200, {"message": f"Friend request sent to {target['name']}! 🤝", "status": "pending"})
                    return

            req_id = 'fr-' + uuid.uuid4().hex[:8]
            cur.execute("INSERT INTO friendships (id, user_id, friend_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)",
                        (req_id, caller['id'], target['id'], now, now))
            conn.commit()
            conn.close()
            self.send_json(201, {"message": f"Friend request sent to {target['name']}! 🤝", "status": "pending", "request_id": req_id})
            return

        # 8. POST /api/friends/respond - Accept or Decline Friend Request
        if path == '/api/friends/respond':
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return
            req_id = data.get('request_id')
            requester_id = data.get('requester_id')
            action = str(data.get('action', 'accept')).lower()
            now = int(time.time())

            if req_id:
                cur.execute("SELECT * FROM friendships WHERE id = ? AND friend_id = ?", (req_id, caller['id']))
            elif requester_id:
                cur.execute("SELECT * FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending'", (requester_id, caller['id']))
            else:
                conn.close()
                self.send_json(400, {"error": "Missing request_id or requester_id."})
                return

            req_row = cur.fetchone()
            if not req_row:
                conn.close()
                self.send_json(404, {"error": "Pending friend request not found."})
                return

            new_status = 'accepted' if action == 'accept' else 'declined'
            cur.execute("UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?", (new_status, now, req_row['id']))
            conn.commit()
            conn.close()
            self.send_json(200, {
                "message": f"Friend request {'accepted! You are now friends.' if action == 'accept' else 'declined.'}",
                "status": new_status,
                "request_id": req_row['id']
            })
            return

        # 9. POST /api/friends/remove - Unfriend / Cancel Friendship
        if path == '/api/friends/remove':
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return
            friend_id = data.get('friend_id')
            if not friend_id:
                conn.close()
                self.send_json(400, {"error": "Missing friend_id."})
                return
            target = resolve_user(cur, friend_id)
            target_id = target['id'] if target else friend_id
            cur.execute("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
                        (caller['id'], target_id, target_id, caller['id']))
            conn.commit()
            conn.close()
            self.send_json(200, {"message": "Friendship removed."})
            return

        # 10. POST /api/posts/like - Like a Post
        if path == '/api/posts/like':
            post_id = data.get('post_id')
            if not post_id:
                conn.close()
                self.send_json(400, {"error": "Missing post_id."})
                return
            cur.execute("UPDATE posts SET likes = likes + 1 WHERE id = ?", (post_id,))
            conn.commit()
            cur.execute("SELECT likes FROM posts WHERE id = ?", (post_id,))
            row = cur.fetchone()
            conn.close()
            self.send_json(200, {"message": "Post liked!", "likes": row['likes'] if row else 1})
            return

        # 11. POST /api/posts/view - Register View on Post
        if path == '/api/posts/view':
            post_id = data.get('post_id')
            if not post_id:
                conn.close()
                self.send_json(400, {"error": "Missing post_id."})
                return
            cur.execute("UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = ?", (post_id,))
            conn.commit()
            cur.execute("SELECT views FROM posts WHERE id = ?", (post_id,))
            row = cur.fetchone()
            conn.close()
            self.send_json(200, {"views": row['views'] if row else 1})
            return

        # 12. POST /api/posts/comments - Add Comment to a Topic Post
        if path in ['/api/posts/comments', '/api/posts/comment']:
            author = resolve_user(cur, self.get_current_user_id(), data.get('author_id'))
            if not author:
                conn.close()
                self.send_json(401, {"error": "Authentication required to post a comment."})
                return
            post_id = data.get('post_id')
            text = (data.get('text') or '').strip()
            if not post_id or not text:
                conn.close()
                self.send_json(400, {"error": "Post ID and comment text are required."})
                return

            # Auto-Moderation: Targeted Personal Attacks vs Idea Debate
            is_civil, flagged_snippet = check_civility(text)
            if not is_civil:
                conn.close()
                self.send_json(400, {
                    "error": f"Comment blocked by Auto-Moderation: Targeted personal attack detected (\"{flagged_snippet}\"). Ideas and debates are freely allowed ('that's stupid', 'dumb idea'), but personal attacks on members are moderated away.",
                    "moderated": True,
                    "flagged_snippet": flagged_snippet
                })
                return
            cid = 'cmt-' + uuid.uuid4().hex[:8]
            now = int(time.time())
            cur.execute("INSERT INTO post_comments (id, post_id, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)",
                        (cid, post_id, author['id'], text, now))
            conn.commit()
            cur.execute("""
            SELECT pc.*, u.name as author_name, u.handle as author_handle, u.avatar as author_avatar, u.motto as author_motto
            FROM post_comments pc JOIN users u ON pc.author_id = u.id
            WHERE pc.id = ?
            """, (cid,))
            comment_row = dict(cur.fetchone())
            conn.close()
            self.send_json(201, {"message": "Comment posted!", "comment": comment_row})
            return

        # 13. POST /api/posts/save - Bookmark / Save Post
        if path == '/api/posts/save':
            user = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not user:
                conn.close()
                self.send_json(401, {"error": "Authentication required to bookmark posts."})
                return
            post_id = data.get('post_id')
            if not post_id:
                conn.close()
                self.send_json(400, {"error": "Missing post_id."})
                return
            uid = user['id']
            cur.execute("SELECT id FROM saved_posts WHERE user_id = ? AND post_id = ?", (uid, post_id))
            saved = cur.fetchone()
            if saved:
                cur.execute("DELETE FROM saved_posts WHERE id = ?", (saved['id'],))
                is_saved = False
                msg = "Post removed from saved bookmarks."
            else:
                sid = 'save-' + uuid.uuid4().hex[:8]
                now = int(time.time())
                cur.execute("INSERT INTO saved_posts (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)", (sid, uid, post_id, now))
                is_saved = True
                msg = "Post saved to your bookmarks! 🔖"
            conn.commit()
            conn.close()
            self.send_json(200, {"message": msg, "is_saved": is_saved, "saved": is_saved, "post_id": post_id})
            return

        # 14. POST /api/messages - Send a private message to a mutual friend
        if path == '/api/messages':
            sender = resolve_user(cur, self.get_current_user_id(), data.get('sender_id'))
            if not sender:
                conn.close()
                self.send_json(401, {"error": "You must be logged in to send private messages."})
                return

            recipient_id = data.get('recipient_id')
            recipient = resolve_user(cur, recipient_id)
            if not recipient:
                conn.close()
                self.send_json(404, {"error": "Recipient user not found."})
                return

            # Enforce that messaging is strictly between mutual friends
            if not are_friends(cur, sender['id'], recipient['id']):
                conn.close()
                self.send_json(403, {"error": "Private messaging is only allowed between mutual friends. Send a friend request first!"})
                return

            text = (data.get('text') or '').strip()
            media_url = (data.get('media_url') or '').strip()
            media_type = (data.get('media_type') or '').strip()
            is_encrypted = 1 if (data.get('is_encrypted') or data.get('isEncrypted')) else 0
            iv = (data.get('iv') or '').strip()
            algo = (data.get('algo') or 'AES-GCM').strip()

            if not text and not media_url:
                conn.close()
                self.send_json(400, {"error": "Message content cannot be empty (provide text, voice note, photo, or GIF)."})
                return

            if text and not is_encrypted:
                is_civil, flagged_snippet = check_civility(text)
                if not is_civil:
                    conn.close()
                    self.send_json(400, {
                        "error": f"Message blocked by Auto-Moderation: Targeted personal attack detected (\"{flagged_snippet}\").",
                        "moderated": True,
                        "flagged_snippet": flagged_snippet
                    })
                    return

            msg_id = 'msg-' + uuid.uuid4().hex[:12]
            now = int(time.time())

            cur.execute("""
            INSERT INTO direct_messages (id, sender_id, recipient_id, text, media_url, media_type, is_encrypted, iv, algo, created_at, read)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """, (msg_id, sender['id'], recipient['id'], text, media_url, media_type, is_encrypted, iv, algo, now))

            # Trigger notification for recipient
            notif_id = 'notif-' + uuid.uuid4().hex[:12]
            if is_encrypted:
                notif_text = "Sent an end-to-end encrypted message 🔒"
            else:
                notif_text = text if text else ("Sent a voice message 🎤" if media_type == 'audio' else ("Sent an image 📷" if media_type == 'image' else "Sent a GIF 👾"))
            cur.execute("""
            INSERT INTO notifications (id, user_id, sender_id, type, title, text, target_id, created_at, read)
            VALUES (?, ?, ?, 'message', ?, ?, ?, ?, 0)
            """, (notif_id, recipient['id'], sender['id'], f"New message from {sender['name']}", notif_text, sender['id'], now))

            conn.commit()

            cur.execute("""
            SELECT m.*,
                   s.name as sender_name, s.avatar as sender_avatar, s.handle as sender_handle,
                   r.name as recipient_name, r.avatar as recipient_avatar, r.handle as recipient_handle
            FROM direct_messages m
            JOIN users s ON m.sender_id = s.id
            JOIN users r ON m.recipient_id = r.id
            WHERE m.id = ?
            """, (msg_id,))
            created_msg = dict(cur.fetchone())
            conn.close()

            self.send_json(201, {
                "message": "Message sent successfully",
                "data": created_msg
            })
            return

        # 15. POST /api/notifications/read - Mark notifications as read
        if path == '/api/notifications/read':
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return
            nid = data.get('notification_id')
            mark_all = data.get('mark_all', False)
            if mark_all:
                cur.execute("UPDATE notifications SET read = 1 WHERE user_id = ?", (caller['id'],))
            elif nid:
                cur.execute("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", (nid, caller['id']))
            conn.commit()
            conn.close()
            self.send_json(200, {"success": True})
            return

        # 16. POST /api/posts/edit - Edit post content, topic, or visibility (Author or Admin)
        if path == '/api/posts/edit':
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required to edit post."})
                return

            post_id = data.get('post_id')
            cur.execute("SELECT * FROM posts WHERE id = ?", (post_id,))
            post = cur.fetchone()
            if not post:
                conn.close()
                self.send_json(404, {"error": "Post not found."})
                return

            if post['author_id'] != caller['id'] and caller['is_admin'] != 1:
                conn.close()
                self.send_json(403, {"error": "Permission denied: Only the author or an admin can edit this post."})
                return

            new_text = data.get('text', post['text']).strip()
            raw_interest = data.get('interest', post['interest'] or '').strip()
            if not raw_interest or raw_interest.lower() in ['thought', 'open thought', 'open thought (no topic)', 'none']:
                new_interest = ''
            else:
                new_interest = raw_interest

            new_subtopic = data.get('subtopic', post['subtopic'] or '').strip() if new_interest else ''
            new_vis = str(data.get('visibility', dict(post).get('visibility') or 'public')).lower()
            if new_vis not in ['public', 'friends']:
                new_vis = 'public'

            cur.execute("""
            UPDATE posts SET text = ?, interest = ?, subtopic = ?, visibility = ?
            WHERE id = ?
            """, (new_text, new_interest, new_subtopic, new_vis, post_id))

            conn.commit()
            cur.execute("""
            SELECT p.*, u.name as author_name, u.handle as author_handle, u.avatar as author_avatar
            FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?
            """, (post_id,))
            updated_row = dict(cur.fetchone())
            conn.close()

            self.send_json(200, {
                "success": True,
                "message": "Post updated successfully.",
                "post": updated_row
            })
            return

        # 17. POST /api/posts/delete - Delete a post (Author, Platform Host, or Admin)
        if path == '/api/posts/delete':
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required to delete post."})
                return

            post_id = data.get('post_id')
            cur.execute("SELECT * FROM posts WHERE id = ?", (post_id,))
            post = cur.fetchone()
            if not post:
                conn.close()
                self.send_json(404, {"error": "Post not found."})
                return

            is_author = (post['author_id'] == caller['id'])
            is_host = (post['host_id'] == caller['id'])
            is_admin = (caller['is_admin'] == 1)

            if not (is_author or is_host or is_admin):
                conn.close()
                self.send_json(403, {"error": "Permission denied: You can only delete your own posts, posts on your platform, or moderate as an admin."})
                return

            # Cascade delete comments, saved bookmarks, flags, notifications
            cur.execute("DELETE FROM post_comments WHERE post_id = ?", (post_id,))
            cur.execute("DELETE FROM saved_posts WHERE post_id = ?", (post_id,))
            cur.execute("DELETE FROM post_flags WHERE post_id = ?", (post_id,))
            cur.execute("DELETE FROM notifications WHERE target_id = ?", (post_id,))
            cur.execute("DELETE FROM posts WHERE id = ?", (post_id,))

            conn.commit()
            conn.close()

            self.send_json(200, {
                "success": True,
                "message": "Post deleted successfully.",
                "deleted_post_id": post_id
            })
            return

        # 18. POST /api/posts/comments/delete - Delete comment (Author, Post Host, or Admin)
        if path in ['/api/posts/comments/delete', '/api/posts/comment/delete']:
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return

            comment_id = data.get('comment_id')
            cur.execute("SELECT c.*, p.host_id FROM post_comments c JOIN posts p ON c.post_id = p.id WHERE c.id = ?", (comment_id,))
            comment = cur.fetchone()
            if not comment:
                conn.close()
                self.send_json(404, {"error": "Comment not found."})
                return

            is_author = (comment['author_id'] == caller['id'])
            is_host = (comment['host_id'] == caller['id'])
            is_admin = (caller['is_admin'] == 1)

            if not (is_author or is_host or is_admin):
                conn.close()
                self.send_json(403, {"error": "Permission denied: You can only delete your own comments."})
                return

            cur.execute("DELETE FROM post_comments WHERE id = ?", (comment_id,))
            conn.commit()
            conn.close()

            self.send_json(200, {
                "success": True,
                "message": "Comment deleted successfully.",
                "deleted_comment_id": comment_id,
                "post_id": comment['post_id']
            })
            return

        # 19. POST /api/posts/flag - Flag post as off-topic (3 flags escalates to admin)
        if path == '/api/posts/flag':
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required to flag posts."})
                return

            post_id = data.get('post_id')
            reason = (data.get('reason') or 'Off-topic content').strip()

            cur.execute("SELECT * FROM posts WHERE id = ?", (post_id,))
            post = cur.fetchone()
            if not post:
                conn.close()
                self.send_json(404, {"error": "Post not found."})
                return

            # Check if caller already flagged this post
            cur.execute("SELECT id FROM post_flags WHERE post_id = ? AND user_id = ?", (post_id, caller['id']))
            existing = cur.fetchone()
            if existing:
                conn.close()
                self.send_json(200, {
                    "success": True,
                    "message": "You have already flagged this post as off-topic.",
                    "flag_count": post['flag_count'],
                    "flagged_for_admin": bool(post['flagged_for_admin']),
                    "already_flagged": True
                })
                return

            fid = 'flag-' + uuid.uuid4().hex[:8]
            now = int(time.time())
            cur.execute("INSERT INTO post_flags (id, post_id, user_id, reason, created_at) VALUES (?, ?, ?, ?, ?)",
                        (fid, post_id, caller['id'], reason, now))

            new_count = (post['flag_count'] or 0) + 1
            flagged_admin = 1 if new_count >= 3 else (post['flagged_for_admin'] or 0)

            cur.execute("UPDATE posts SET flag_count = ?, flagged_for_admin = ? WHERE id = ?", (new_count, flagged_admin, post_id))

            # If escalated to 3 flags, notify site admins
            if new_count >= 3 and not post['flagged_for_admin']:
                cur.execute("SELECT id FROM users WHERE is_admin = 1")
                admins = cur.fetchall()
                for adm in admins:
                    nid = 'notif-' + uuid.uuid4().hex[:10]
                    cur.execute("""
                    INSERT INTO notifications (id, user_id, sender_id, type, title, text, target_id, read, created_at)
                    VALUES (?, ?, ?, 'admin_flag_alert', 'Post Moderation Required', ?, ?, 0, ?)
                    """, (nid, adm['id'], caller['id'], f"Post '{post['text'][:40]}...' reached {new_count} off-topic flags and needs review.", post_id, now))

            conn.commit()
            conn.close()

            self.send_json(200, {
                "success": True,
                "message": f"Post flagged as off-topic ({new_count}/3 flags).",
                "flag_count": new_count,
                "flagged_for_admin": bool(flagged_admin),
                "post_id": post_id
            })
            return

        # 20. POST /api/posts/change-topic - Change post topic (Original Poster or Admin, clears flags)
        if path == '/api/posts/change-topic':
            caller = resolve_user(cur, self.get_current_user_id(), data.get('user_id'))
            if not caller:
                conn.close()
                self.send_json(401, {"error": "Authentication required."})
                return

            post_id = data.get('post_id')
            cur.execute("SELECT * FROM posts WHERE id = ?", (post_id,))
            post = cur.fetchone()
            if not post:
                conn.close()
                self.send_json(404, {"error": "Post not found."})
                return

            if post['author_id'] != caller['id'] and caller['is_admin'] != 1:
                conn.close()
                self.send_json(403, {"error": "Permission denied: Only the original author or an admin can change the topic."})
                return

            raw_interest = (data.get('interest') or '').strip()
            if not raw_interest or raw_interest.lower() in ['thought', 'open thought', 'open thought (no topic)', 'none']:
                interest = ''
            else:
                interest = raw_interest

            subtopic = (data.get('subtopic') or '').strip() if interest else ''

            # Update topic and reset moderation flags
            cur.execute("""
            UPDATE posts SET interest = ?, subtopic = ?, flag_count = 0, flagged_for_admin = 0
            WHERE id = ?
            """, (interest, subtopic, post_id))

            cur.execute("DELETE FROM post_flags WHERE post_id = ?", (post_id,))

            now = int(time.time())
            # Sub-topic scraping for author if valid topic
            if subtopic and interest:
                cur.execute("SELECT subtopics FROM users WHERE id = ?", (post['author_id'],))
                urow = cur.fetchone()
                try:
                    user_subtopics = json.loads(urow['subtopics'] or '[]') if urow else []
                except:
                    user_subtopics = []
                exists = any(
                    (isinstance(s, dict) and s.get('subtopic', '').strip().lower() == subtopic.lower()) or
                    (isinstance(s, str) and s.strip().lower() == subtopic.lower())
                    for s in user_subtopics
                )
                if not exists:
                    user_subtopics.append({
                        "interest": interest,
                        "subtopic": subtopic,
                        "created_at": now
                    })
                    cur.execute("UPDATE users SET subtopics = ? WHERE id = ?", (json.dumps(user_subtopics), post['author_id']))

            conn.commit()
            conn.close()

            self.send_json(200, {
                "success": True,
                "message": "Topic updated and off-topic flags have been cleared.",
                "post_id": post_id,
                "interest": interest,
                "subtopic": subtopic
            })
            return

        conn.close()
        self.send_json(404, {"error": "Endpoint not found"})


def run(port=None):
    if port is None:
        port = int(os.environ.get('PORT', 3000))
    init_db()
    lan_ip = get_lan_ip()
    server_address = ('0.0.0.0', port)
    # On Windows, keep SO_REUSEADDR disabled to enforce SO_EXCLUSIVEADDRUSE and prevent ghost port binding
    ThreadingHTTPServer.allow_reuse_address = (os.name != 'nt')
    httpd = ThreadingHTTPServer(server_address, PlatformServerHandler)
    print(f"The Platform server running with SQLite on http://localhost:{port}", flush=True)
    print(f"[LAN] Mobile Access URL: http://{lan_ip}:{port}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == '__main__':
    run()
