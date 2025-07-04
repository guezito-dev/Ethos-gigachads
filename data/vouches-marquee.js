const DEBUG_MODE = true;
const MAX_ITEMS = 8; // nombre de vouches à afficher dans le marquee
const GITHUB_JSON_URL = 'https://raw.githubusercontent.com/guezito-dev/Ethos-gigachads/main/data/gigachads-ranking.json';

let gigachadsData = null;

function debug(message, data = null) {
    if (DEBUG_MODE) console.log('[VOUCHES]', message, data);
}

// Utils
function formatTimeAgo(timestamp) {
    let t = parseInt(timestamp, 10);
    if (t < 1e12) t = t * 1000;
    const now = Date.now();
    const diff = Math.floor((now - t) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 2592000)}mo ago`;
}
function weiToEth(wei) {
    if (!wei || wei === '0') return '0.000';
    return (parseInt(wei) / 1e18).toFixed(3);
}
function getStakedAmount(activity) {
    if (activity.data?.deposited)      return weiToEth(activity.data.deposited);
    if (activity.content?.deposited)   return weiToEth(activity.content.deposited);
    if (activity.data?.staked)         return weiToEth(activity.data.staked);
    if (activity.content?.stakeAmount) return parseFloat(activity.content.stakeAmount).toFixed(3);
    if (activity.content?.staked)      return weiToEth(activity.content.staked);
    return '0.000';
}
function createUniqueId(activity) {
    const authorId = activity.author?.profileId || activity.authorUser?.profileId;
    const subjectId = activity.subject?.profileId || activity.subjectUser?.profileId;
    const timestamp = activity.createdAt || activity.timestamp;
    const type = activity.type;
    return `${type}-${authorId}-${subjectId}-${timestamp}`;
}
async function fetchUserActivities(userkey) {
    try {
        const response = await fetch('https://api.ethos.network/api/v2/activities/profile/all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ userkey: userkey, excludeHistorical: false, limit: 50, offset: 0 })
        });
        if (response.ok) {
            const data = await response.json();
            return data.values || [];
        } else {
            return [];
        }
    } catch (error) {
        return [];
    }
}

// Rendu visual du marquee
function vouchToMarqueeHTML(vouch) {
    const authorImg = vouch.authorUser?.avatar || "https://api.dicebear.com/7.x/adventurer/svg?radius=50&seed=" + encodeURIComponent(vouch.authorUser?.username || "avatar");
    const subjectImg = vouch.subjectUser?.avatar || "https://api.dicebear.com/7.x/adventurer/svg?radius=50&seed=" + encodeURIComponent(vouch.subjectUser?.username || "avatar");
    const author = `<img src="${authorImg}" class="vouch-avatar" loading="lazy" draggable="false">
      <span class="vouch-author">${vouch.authorUser.displayName || vouch.authorUser.username}</span>`;
    const subject = `<img src="${subjectImg}" class="vouch-avatar" loading="lazy" draggable="false">
      <span class="vouch-author">${vouch.subjectUser.displayName || vouch.subjectUser.username}</span>`;
    const staked = `<span class="vouch-amount">${vouch.stakedAmount} ETH</span>`;
    const timeAgo = `<span class="vouch-date">${formatTimeAgo(vouch.createdAt||vouch.timestamp)}</span>`;
    return `${author}
        <span style="font-weight:900;font-size:1.05em; color:#41c9fa">→</span>
        ${subject}
        ${staked}
        ${timeAgo}`;
}
function updateVouchesMarquee(vouches) {
    const span = document.getElementById('vouchesMarqueeContent');
    if (!span) return;
    if (vouches.length > 0) {
        span.innerHTML = vouches.map(vouchToMarqueeHTML).join('<span class="vouch-separator">|</span>');
    } else {
        span.innerHTML = '<span style="opacity:0.5">No recent vouches between Giga Chads</span>';
    }
}

// Composite fetch
async function fetchRecentVouches() {
    debug('Starting vouches fetch...');
    if (!gigachadsData || !gigachadsData.ranking) throw new Error('Giga Chads data not available');
    const allVouches = [];
    const gigachadProfileIds = new Set(gigachadsData.ranking.map(u => u.user.profileId));
    const processed = new Set();

    // Pour chaque participant
    for (let obj of gigachadsData.ranking) {
        const p = obj.user;
        if (!p.profileId) continue;
        debug('Fetching activities for profileId:' + p.profileId);
        const activities = await fetchUserActivities(p.profileId);
        activities.forEach(activity => {
            // Uniquement les vouches récentes entre gigachads
            if (activity.type?.includes("VOUCH") && activity.subjectUser && gigachadProfileIds.has(activity.subjectUser.profileId)) {
                const id = createUniqueId(activity);
                if (!processed.has(id)) {
                    processed.add(id);
                    allVouches.push({
                        authorUser: activity.authorUser || p,
                        subjectUser: activity.subjectUser,
                        stakedAmount: getStakedAmount(activity),
                        createdAt: activity.createdAt || activity.timestamp
                    });
                }
            }
        });
    }
    allVouches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    debug('Total vouches fetched', { count: allVouches.length });
    return allVouches.slice(0, MAX_ITEMS);
}

// Récupère JSON puis lance le fetch vouches
async function loadFromGitHub() {
    try {
        debug('Loading Gigachads from GitHub...');
        const response = await fetch(GITHUB_JSON_URL);
        if (response.ok) {
            gigachadsData = await response.json();
            debug('GitHub data loaded successfully');
            return true;
        } else {
            debug('GitHub file not found or not accessible');
            return false;
        }
    } catch (error) {
        debug('GitHub loading failed', error);
        return false;
    }
}

// Init au chargement page
document.addEventListener('DOMContentLoaded', async () => {
    debug('Initializing vouches marquee widget...');
    const githubSuccess = await loadFromGitHub();
    if (githubSuccess) {
        try {
            const vouches = await fetchRecentVouches();
            updateVouchesMarquee(vouches);
        } catch (e) {
            debug('Error loading vouches', e);
        }
    }
});
