const DEBUG_MODE = true;
const MAX_ITEMS = 8;
const GITHUB_JSON_URL = 'https://raw.githubusercontent.com/guezito-dev/Ethos-gigachads/main/data/gigachads-ranking.json';

let gigachadsData = null;
const processedActivities = new Set();

function debug(message, data = null) {
    if (DEBUG_MODE) console.log('[VOUCHES]', message, data);
}
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
    debug(`Fetching activities for ${userkey}`);
    try {
        const response = await fetch('https://api.ethos.network/api/v2/activities/profile/all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                userkey,
                excludeHistorical: false,
                limit: 50,
                offset: 0
            })
        });
        if (response.ok) {
            const data = await response.json();
            return {
                activities: data.values || [],
                total: data.total || 0
            };
        } else {
            return { activities: [], total: 0 };
        }
    } catch (error) {
        return { activities: [], total: 0 };
    }
}
async function fetchRecentVouches() {
    debug('Starting vouches fetch...');
    if (!gigachadsData || !gigachadsData.ranking)
        throw new Error('Giga Chads data not available');
    const allVouches = [];
    const gigachadProfileIds = new Set(gigachadsData.ranking.map(u => u.user.profileId));
    const profileIdToUser = Object.fromEntries(gigachadsData.ranking.map(u => [u.user.profileId, u.user]));
    processedActivities.clear();

    const usersToCheck = gigachadsData.ranking.slice(0, 20); // Check top 20 by default
    for (const userRank of usersToCheck) {
        const userkey = `profileId:${userRank.user.profileId}`; // CRUCIAL!
        const result = await fetchUserActivities(userkey);
        if (result.activities.length > 0) {
            result.activities.forEach(activity => {
                const authorProfileId = activity.author?.profileId;
                const subjectProfileId = activity.subject?.profileId;
                if (activity.type?.toLowerCase() === 'vouch' && authorProfileId && subjectProfileId) {
                    const uniqueId = createUniqueId(activity);
                    if (!processedActivities.has(uniqueId)) {
                        processedActivities.add(uniqueId);
                        if (
                            gigachadProfileIds.has(subjectProfileId) &&
                            gigachadProfileIds.has(authorProfileId) &&
                            authorProfileId !== subjectProfileId
                        ) {
                            const subjectUser = profileIdToUser[subjectProfileId];
                            const authorUser = profileIdToUser[authorProfileId];
                            if (subjectUser && authorUser) {
                                allVouches.push({
                                    authorUser,
                                    subjectUser,
                                    stakedAmount: getStakedAmount(activity),
                                    createdAt: activity.createdAt || activity.timestamp
                                });
                            }
                        }
                    }
                }
            });
        }
    }
    debug('Total vouches fetched', { count: allVouches.length });
    allVouches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return allVouches.slice(0, MAX_ITEMS);
}
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
