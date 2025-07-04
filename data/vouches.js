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
    if (activity.data?.deposited) return weiToEth(activity.data.deposited);
    if (activity.content?.deposited) return weiToEth(activity.content.deposited);
    if (activity.data?.staked) return weiToEth(activity.data.staked);
    if (activity.content?.stakeAmount) return parseFloat(activity.content.stakeAmount).toFixed(3);
    if (activity.content?.staked) return weiToEth(activity.content.staked);
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
            headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
            body: JSON.stringify({
                userkey: userkey, excludeHistorical: false, limit: 50, offset: 0
            })
        });
        if (response.ok) {
            const data = await response.json();
            return { activities: data.values || [], total: data.total || 0 };
        } else {
            return { activities: [], total: 0 };
        }
    } catch (error) { return { activities: [], total: 0 }; }
}

async function fetchRecentVouches() {
    debug('Starting vouches fetch...');
    if (!gigachadsData || !gigachadsData.ranking) throw new Error('Giga Chads data not available');
    const allVouches = [];
    const gigachadProfileIds = new Set(gigachadsData.ranking.map(u => u.user.profileId));
    const profileIdToUser = new Map(gigachadsData.ranking.map(u => [u.user.profileId, u.user]));
    processedActivities.clear();

    const usersToCheck = gigachadsData.ranking.slice(0, 10);
    for (const userRank of usersToCheck) {
        try {
            const userkey = `profileId:${userRank.user.profileId}`;
            const result = await fetchUserActivities(userkey);
            if (result.activities.length > 0) {
                result.activities.forEach(activity => {
                    const authorProfileId = activity.author?.profileId;
                    const subjectProfileId = activity.subject?.profileId;
                    if (activity.type === 'vouch' && authorProfileId && subjectProfileId) {
                        const uniqueId = createUniqueId(activity);
                        if (!processedActivities.has(uniqueId)) {
                            processedActivities.add(uniqueId);

                            if (gigachadProfileIds.has(subjectProfileId) && gigachadProfileIds.has(authorProfileId) && authorProfileId !== subjectProfileId) {
                                const subjectUser = profileIdToUser.get(subjectProfileId);
                                const authorUser = profileIdToUser.get(authorProfileId);
                                if (subjectUser && authorUser) {
                                    const stakedAmount = getStakedAmount(activity);
                                    // => avatar url, vouch url
                                    allVouches.push({
                                        ...activity,
                                        authorUser: authorUser,
                                        subjectUser: subjectUser,
                                        stakedAmount,
                                        vouchText: (activity.translation?.translatedContent || activity.comment || ''),
                                        vouchUrl:
                                            (activity.data?.id ? `https://app.ethos.network/activity/vouch/${activity.data?.id}` :
                                            activity.content?.id ? `https://app.ethos.network/activity/vouch/${activity.content?.id}` : "#")
                                    });
                                }
                            }
                        }
                    }
                });
            }
        } catch(e) { debug('err',e); }
        await new Promise(res => setTimeout(res, 200));
    }
    allVouches.sort((a, b) =>
        new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp)
    );
    return allVouches.slice(0, MAX_ITEMS);
}

// --------- CARTE GROUPÉE ---------
function getUserAvatarUrl(userObj) {
    // Ethos avatar ou fallback
    return userObj.avatarUrl
      || userObj.avatar
      || `https://api.dicebear.com/7.x/adventurer/svg?radius=50&seed=${encodeURIComponent(userObj.username || userObj.displayName || "avatar")}`;
}
function makeVouchCard(vouch) {
    // tout groupé, lien clicable
    return `
    <a href="${vouch.vouchUrl}" target="_blank" class="vouch-card" title="Voir ce vouch">
      <img class="vouch-avatar" src="${getUserAvatarUrl(vouch.authorUser)}" alt="${vouch.authorUser.displayName||vouch.authorUser.username}">
      <span class="vouch-arrow">→</span>
      <img class="vouch-avatar" src="${getUserAvatarUrl(vouch.subjectUser)}" alt="${vouch.subjectUser.displayName||vouch.subjectUser.username}">
      <div class="vouch-row" style="flex:1;min-width:0;">
        <span class="vouch-user">${vouch.authorUser.displayName||vouch.authorUser.username}</span>
        <span class="vouch-verb">vouched</span>
        <span class="vouch-user">${vouch.subjectUser.displayName||vouch.subjectUser.username}</span>
        <span class="vouch-amount">${vouch.stakedAmount} ETH</span>
        <span class="vouch-time">${formatTimeAgo(vouch.createdAt||vouch.timestamp)}</span>
        ${vouch.vouchText && vouch.vouchText.length > 1
            ? `<span class="vouch-desc">${vouch.vouchText.replace(/"/g,'&quot;')}</span>` : ""}
      </div>
    </a>`;
}

function updateVouchesMarquee(vouches) {
    const marquee = document.getElementById('vouchesMarquee');
    if (!marquee) return;
    if (vouches.length > 0) {
        // On duplique pour effet infini
        const html = vouches.map(makeVouchCard).join('');
        marquee.innerHTML = html + html;
        setTimeout(() => {
            // adapte auto la durée selon la largeur du flux
            const width = marquee.scrollWidth / 2;
            const duration = Math.max(39, Math.floor(width/37));
            marquee.style.animationDuration = duration + 's';
            marquee.style.setProperty('--marquee-width', `-${width}px`);
            marquee.style.animationName = '';
            void marquee.offsetWidth;
            marquee.style.animationName = 'scroll-marquee';
        }, 120);
    } else marquee.innerHTML = "<div style='color:#ccc;padding:16px'>No vouch found.</div>";
}

// ========== Chargement principal ==========

async function loadFromGitHub() {
    debug('Load from github...');
    const response = await fetch(GITHUB_JSON_URL);
    if (response.ok) {
      gigachadsData = await response.json();
      return true;
    }
    return false;
}

document.addEventListener('DOMContentLoaded', async () => {
    const ok = await loadFromGitHub();
    if (ok) {
        const vouches = await fetchRecentVouches();
        updateVouchesMarquee(vouches);
    }
    // On bloque le scroll au hover/focus
    const marquee = document.getElementById('vouchesMarquee');
    if (!marquee) return;
    marquee.addEventListener('mouseenter', () => marquee.classList.add('marquee-paused'));
    marquee.addEventListener('mouseleave', () => marquee.classList.remove('marquee-paused'));
    marquee.addEventListener('focusin', () => marquee.classList.add('marquee-paused'));
    marquee.addEventListener('focusout', () => marquee.classList.remove('marquee-paused'));
});
